/**
 * Transport layer: knows about HTTP and the service's error envelope, and
 * nothing about test cases or any particular tracker. Everything above it
 * deals in plain objects and thrown `ApiError`s.
 */

export class ApiError extends Error {
  constructor(message, { code, fieldErrors, status } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.fieldErrors = fieldErrors ?? {};
    this.status = status;
  }

  /** True when the user needs to (re)authorize Atlassian. */
  get needsAuth() {
    return this.code === 'not_connected' || this.code === 'reauth_required';
  }
}

async function send(path, { method = 'GET', body } = {}) {
  try {
    return await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin', // carries the session cookie
    });
  } catch {
    throw new ApiError('Could not reach the server. Is the API running?', {
      code: 'network_error',
    });
  }
}

/** Turns a non-2xx response into an ApiError using the service's envelope. */
async function raise(res) {
  const payload = await res.json().catch(() => ({}));
  // Signed out (or the login expired): the app swaps to the sign-in page.
  if (payload.code === 'login_required') window.dispatchEvent(new Event('tm:login-required'));
  throw new ApiError(payload.error ?? `Request failed (${res.status}).`, {
    code: payload.code,
    fieldErrors: payload.fieldErrors,
    status: res.status,
  });
}

async function request(path, options) {
  const res = await send(path, options);
  if (!res.ok) await raise(res);

  const payload = await res.json().catch(() => ({}));
  if (payload.success === false) await raise(res);
  return payload;
}

/** Saves a blob response to the user's disk via a temporary object URL. */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const filenameFrom = (disposition, fallback) =>
  disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? fallback;

/**
 * File destinations (Excel) answer with the document itself rather than
 * JSON, so this call inspects the content type instead of assuming.
 */
async function createTestCase(form) {
  const res = await send('/api/create-test-case', { method: 'POST', body: form });
  if (!res.ok) await raise(res);

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json();
  }

  const blob = await res.blob();
  const filename = filenameFrom(res.headers.get('content-disposition'), 'test-case.xlsx');
  triggerDownload(blob, filename);

  return {
    success: true,
    kind: 'file',
    issueKey: filename,
    downloaded: true,
    title: decodeURIComponent(res.headers.get('x-test-case-title') ?? ''),
    count: Number(res.headers.get('x-test-case-count')) || 0,
  };
}

/**
 * The agent answers with NDJSON: progress events while it works, then one
 * `result` or `error` event. A rejection before streaming starts (validation,
 * no API key) arrives as the usual JSON envelope and is raised the same way
 * as any other call.
 *
 * @param {(event: object) => void} onEvent  called for each stage/progress event
 * @returns {Promise<object>} the `result` event
 */
async function runAgent(body, onEvent, signal) {
  let res;
  try {
    res = await fetch('/api/agent/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError('Generation was cancelled.', { code: 'agent_cancelled' });
    throw new ApiError('Could not reach the server. Is the API running?', { code: 'network_error' });
  }
  if (!res.ok) await raise(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let outcome = null;

  const handle = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'result' || event.type === 'error') outcome = event;
    else onEvent(event);
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(handle);
    }
    handle(buffer);
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError('Generation was cancelled.', { code: 'agent_cancelled' });
    throw new ApiError('The connection dropped before the agent finished. Please try again.', { code: 'network_error' });
  }

  if (!outcome) throw new ApiError('The agent stopped without an answer. Please try again.', { code: 'agent_failed' });
  if (outcome.type === 'error') throw new ApiError(outcome.error, { code: outcome.code });
  return outcome;
}

/** The saved test case repository: folders and cases. */
const repository = {
  get: (projectId) => request(`/api/repository${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
  createProject: (name) => request('/api/repository/projects', { method: 'POST', body: { name } }),
  renameProject: (id, name) => request(`/api/repository/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } }),
  deleteProject: (id) => request(`/api/repository/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createFolder: (name, parentId = null, projectId) =>
    request('/api/repository/folders', { method: 'POST', body: { name, parentId, ...(projectId && { projectId }) } }),
  renameFolder: (id, name) => request(`/api/repository/folders/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } }),
  deleteFolder: (id) => request(`/api/repository/folders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addCases: ({ folderId, subfolders, testCases }) =>
    request('/api/repository/cases', { method: 'POST', body: { folderId, subfolders, testCases } }),
  updateCase: (id, testCase) => request(`/api/repository/cases/${encodeURIComponent(id)}`, { method: 'PATCH', body: { testCase } }),
  deleteCases: (ids) => request('/api/repository/cases/delete', { method: 'POST', body: { ids } }),
  moveCases: (ids, folderId) => request('/api/repository/cases/move', { method: 'POST', body: { ids, folderId } }),
};

export const api = {
  session: () => request('/api/session'),
  login: (password) => request('/api/login', { method: 'POST', body: { password } }),
  signOut: () => request('/api/logout', { method: 'POST' }),
  repository,
  checkJira: () => request('/api/integrations/jira'),
  runAgent,
  fetchAgentSource: ({ type, ref, frameIds }) => request('/api/agent/sources', { method: 'POST', body: { type, ref, frameIds } }),
  listFigmaFrames: (ref) => request('/api/agent/sources/figma/frames', { method: 'POST', body: { ref } }),
  getAuthStatus: () => request('/auth/status'),
  getOptions: () => request('/api/options'),
  getDestinations: () => request('/api/destinations'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  previewTestCase: (form) => request('/api/preview-test-case', { method: 'POST', body: form }),
  payloadPreview: ({ destination, testCase }) =>
    request('/api/payload-preview', { method: 'POST', body: { destination, testCase } }),
  importRequirements: (source) => request('/api/import-requirements', { method: 'POST', body: source }),
  createTestCase,
};

/** Full-page redirect: the OAuth consent screen cannot run in an iframe. */
export function startJiraLogin() {
  window.location.href = '/auth/login';
}
