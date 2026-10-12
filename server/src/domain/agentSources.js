import { config } from '../config.js';
import { logger } from '../logger.js';
import { getAccessToken } from '../clients/atlassianAuth.js';
import { requestWithRetry } from '../clients/http.js';
import { AppError } from '../utils/errors.js';
import { AGENT_FILE_TYPES } from './testCase.js';
import { htmlToText } from './officeText.js';

/**
 * Pulls requirements from where teams keep them -- Jira issues, Confluence
 * pages, Figma designs -- and hands them back as attachments in the same
 * shape as an uploaded file. The agent therefore never knows where a
 * requirement came from, and the reviewer sees each one listed and can
 * remove it before generating.
 *
 * Jira and Confluence reuse the Atlassian OAuth session the exporters use;
 * Figma needs FIGMA_TOKEN.
 */

const API_HOST = 'https://api.atlassian.com';
const FIGMA_API = 'https://api.figma.com/v1';
const DOWNLOAD_TIMEOUT_MS = 30_000;

export const SOURCE_LIMITS = { issues: 10, attachmentsPerIssue: 3, frames: 10 };

const badRef = (message) => new AppError(message, { status: 422, code: 'validation_failed' });

const textAttachment = (name, text) => {
  const data = Buffer.from(text, 'utf8').toString('base64');
  return { name, mediaType: 'text/plain', data, size: Buffer.byteLength(text) };
};

/** Downloads a binary within the size limit for its type, or returns null. */
async function download(url, headers, mediaType, name) {
  const limit = AGENT_FILE_TYPES[mediaType]?.maxBytes;
  if (!limit) return null;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > limit) return null;
    return { name, mediaType, data: buffer.toString('base64'), size: buffer.length };
  } catch (err) {
    logger.warn({ err: err.message, name }, 'source attachment download failed');
    return null;
  }
}

const atlassianDescribe = (system) => (status, messages) => {
  const detail = messages.length ? ` (${messages.join('; ')})` : '';
  if (status === 404) return `${system} could not find that item${detail}. Check the link and that your account can see it.`;
  if (status === 401 || status === 403) return `Your Atlassian account cannot read this ${system} item${detail}. Reconnect, or ask for access.`;
  return `${system} returned an error (${status})${detail}.`;
};

const atlassianMessages = (body) => {
  try {
    const parsed = JSON.parse(body);
    return [...(parsed.errorMessages ?? []), parsed.message].filter(Boolean).slice(0, 3);
  } catch {
    return [];
  }
};

/* ---------------- Jira ---------------- */

/** "PROJ-1, PROJ-2" or issue URLs (…/browse/PROJ-1, …?selectedIssue=PROJ-1) -> keys. */
export function parseJiraKeys(ref) {
  const keys = [...String(ref).toUpperCase().matchAll(/\b([A-Z][A-Z0-9_]+-\d+)\b/g)].map((m) => m[1]);
  return [...new Set(keys)];
}

export async function fetchJiraIssues(sessionId, ref) {
  if (!config.jira) throw badRef('Jira is not enabled on this server. Add jira to DESTINATIONS.');
  const keys = parseJiraKeys(ref);
  if (keys.length === 0) throw badRef('Enter a Jira issue key such as QA-123, or paste the issue link.');
  if (keys.length > SOURCE_LIMITS.issues) throw badRef(`Import at most ${SOURCE_LIMITS.issues} issues at a time.`);

  const { accessToken, cloudIds } = await getAccessToken(sessionId);
  const base = `${API_HOST}/ex/jira/${cloudIds.jira}/rest/api/3`;
  const headers = { authorization: `Bearer ${accessToken}`, accept: 'application/json' };
  const attachments = [];

  for (const key of keys) {
    const issue = await requestWithRetry(
      `${base}/issue/${encodeURIComponent(key)}?fields=*all&expand=renderedFields,names`,
      { system: 'Jira', describe: atlassianDescribe('Jira'), extractMessages: atlassianMessages, headers },
    );
    const f = issue.fields ?? {};
    const rendered = issue.renderedFields ?? {};

    // Acceptance criteria usually live in a custom field; find it by name.
    const criteria = Object.entries(issue.names ?? {})
      .filter(([id, name]) => /acceptance|criteria|requirement/i.test(name) && rendered[id])
      .map(([id, name]) => `${name}:\n${htmlToText(rendered[id])}`);

    const text = [
      `${issue.key}: ${f.summary ?? ''}`,
      [f.issuetype?.name, f.status?.name, f.priority?.name && `priority ${f.priority.name}`].filter(Boolean).join(' · '),
      f.labels?.length ? `Labels: ${f.labels.join(', ')}` : '',
      '',
      'Description:',
      htmlToText(rendered.description) || '(none)',
      ...criteria.map((c) => `\n${c}`),
      f.subtasks?.length ? `\nSubtasks:\n${f.subtasks.map((s) => `- ${s.key}: ${s.fields?.summary}`).join('\n')}` : '',
    ].join('\n');
    attachments.push(textAttachment(`${issue.key}.txt`, text));

    // Mockups and specs attached to the story are part of the requirement.
    const files = (f.attachment ?? [])
      .filter((a) => ['image', 'pdf'].includes(AGENT_FILE_TYPES[a.mimeType]?.kind) && a.size <= AGENT_FILE_TYPES[a.mimeType].maxBytes)
      .slice(0, SOURCE_LIMITS.attachmentsPerIssue);
    for (const a of files) {
      const file = await download(
        `${base}/attachment/content/${a.id}`,
        { authorization: `Bearer ${accessToken}` },
        a.mimeType,
        `${issue.key} – ${a.filename}`,
      );
      if (file) attachments.push(file);
    }
  }

  return { label: keys.join(', '), attachments };
}

/* ---------------- Confluence ---------------- */

/** A page link (…/pages/12345/Title, ?pageId=12345) or a bare id -> page id. */
export function parseConfluencePageId(ref) {
  const text = String(ref).trim();
  return text.match(/\/pages\/(\d+)/)?.[1] ?? text.match(/[?&]pageId=(\d+)/)?.[1] ?? text.match(/^(\d+)$/)?.[1] ?? null;
}

export async function fetchConfluencePage(sessionId, ref) {
  if (!config.confluence) throw badRef('Confluence is not enabled on this server. Add confluence to DESTINATIONS.');
  const id = parseConfluencePageId(ref);
  if (!id) throw badRef('Paste a Confluence page link (…/pages/12345/…) or the page id.');

  const { accessToken, cloudIds } = await getAccessToken(sessionId);
  const page = await requestWithRetry(
    `${API_HOST}/ex/confluence/${cloudIds.confluence}/wiki/rest/api/content/${id}?expand=body.storage,space`,
    {
      system: 'Confluence',
      describe: atlassianDescribe('Confluence'),
      extractMessages: atlassianMessages,
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    },
  );

  const text = `${page.title}\nSpace: ${page.space?.name ?? page.space?.key ?? ''}\n\n${htmlToText(page.body?.storage?.value)}`;
  const safeTitle = page.title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80);
  return { label: page.title, attachments: [textAttachment(`${safeTitle}.txt`, text)] };
}

/* ---------------- Figma ---------------- */

/** figma.com/design/<key>/Name?node-id=12-34 -> { key, nodeId: "12:34" }. */
export function parseFigmaUrl(ref) {
  const url = String(ref).trim();
  const key = url.match(/figma\.com\/(?:file|design|proto|board)\/([A-Za-z0-9]+)/)?.[1];
  const node = url.match(/[?&]node-id=([^&#]+)/)?.[1];
  return key ? { key, nodeId: node ? decodeURIComponent(node).replace('-', ':') : null } : null;
}

const FRAME_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION']);

export async function fetchFigmaFrames(ref) {
  const token = config.agent.figmaToken;
  if (!token) throw badRef('Figma import needs FIGMA_TOKEN on the server.');
  const parsed = parseFigmaUrl(ref);
  if (!parsed) throw badRef('Paste a Figma design link (figma.com/design/…).');

  const headers = { 'x-figma-token': token, accept: 'application/json' };
  const figma = (path) =>
    requestWithRetry(`${FIGMA_API}${path}`, {
      system: 'Figma',
      describe: (status) =>
        status === 403
          ? 'The Figma token cannot open this file. Check it has file read access and the file is shared with its owner.'
          : status === 404
            ? 'Figma could not find that file or frame. Check the link.'
            : `Figma returned an error (${status}).`,
      headers,
    });

  // A link to one frame renders that frame; a link to a page, section or the
  // whole file renders the frames inside it.
  let fileName;
  let frames;
  if (parsed.nodeId) {
    const res = await figma(`/files/${parsed.key}/nodes?ids=${encodeURIComponent(parsed.nodeId)}&depth=1`);
    fileName = res.name;
    const node = res.nodes?.[parsed.nodeId]?.document;
    if (!node) throw badRef('That frame was not found in the Figma file.');
    frames = FRAME_TYPES.has(node.type) && node.type !== 'SECTION' ? [node] : (node.children ?? []).filter((c) => FRAME_TYPES.has(c.type));
  } else {
    const res = await figma(`/files/${parsed.key}?depth=2`);
    fileName = res.name;
    frames = (res.document?.children?.[0]?.children ?? []).filter((c) => FRAME_TYPES.has(c.type));
  }
  if (frames.length === 0) throw badRef('No frames were found there. Link to a frame or a page that contains frames.');

  const chosen = frames.slice(0, SOURCE_LIMITS.frames);
  const ids = chosen.map((f) => f.id).join(',');
  const images = await figma(`/images/${parsed.key}?ids=${encodeURIComponent(ids)}&format=png&scale=1`);

  const attachments = [];
  for (const frame of chosen) {
    const url = images.images?.[frame.id];
    if (!url) continue;
    const file = await download(url, {}, 'image/png', `Figma – ${frame.name}.png`.replace(/[\\/:*?"<>|]+/g, ' '));
    if (file) attachments.push(file);
  }
  if (attachments.length === 0) throw badRef('Figma did not render any of the frames. Try linking a single frame.');

  return {
    label: `${fileName} (${attachments.length} ${attachments.length === 1 ? 'frame' : 'frames'})`,
    attachments,
    skipped: frames.length - chosen.length,
  };
}

/** Which link sources this deployment can use, for the UI. */
export const availableSources = () => ({
  jira: Boolean(config.jira),
  confluence: Boolean(config.confluence),
  figma: Boolean(config.agent.figmaToken),
});

export async function fetchSource(sessionId, { type, ref }) {
  if (type === 'jira') return fetchJiraIssues(sessionId, ref);
  if (type === 'confluence') return fetchConfluencePage(sessionId, ref);
  if (type === 'figma') return fetchFigmaFrames(ref);
  throw badRef('Unknown source type.');
}
