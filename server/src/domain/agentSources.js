import { config } from '../config.js';
import { logger } from '../logger.js';
import { atlassianTarget } from '../clients/atlassian.js';
import { patHeader, requestWithRetry } from '../clients/http.js';
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

const FIGMA_API = 'https://api.figma.com/v1';
const DOWNLOAD_TIMEOUT_MS = 30_000;

export const SOURCE_LIMITS = { issues: 10, attachmentsPerIssue: 3, frames: 20 };

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

  const target = await atlassianTarget('jira', sessionId);
  const base = target.jiraApi;
  const headers = { authorization: target.auth, accept: 'application/json' };
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
        { authorization: target.auth },
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

  const target = await atlassianTarget('confluence', sessionId);
  const page = await requestWithRetry(
    `${target.wiki}/rest/api/content/${id}?expand=body.storage,space`,
    {
      system: 'Confluence',
      describe: atlassianDescribe('Confluence'),
      extractMessages: atlassianMessages,
      headers: { authorization: target.auth, accept: 'application/json' },
    },
  );

  const text = `${page.title}\nSpace: ${page.space?.name ?? page.space?.key ?? ''}\n\n${htmlToText(page.body?.storage?.value)}`;
  const safeTitle = page.title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80);
  return { label: page.title, attachments: [textAttachment(`${safeTitle}.txt`, text)] };
}

/* ---------------- Azure DevOps ---------------- */

/**
 * "123, 456", "#123" or work item links
 * (dev.azure.com/org/project/_workitems/edit/123, org.visualstudio.com/…) -> ids.
 */
export function parseAdoIds(ref) {
  const text = String(ref);
  const fromLinks = [...text.matchAll(/_workitems\/(?:edit\/)?(\d+)/gi)].map((m) => m[1]);
  const ids = fromLinks.length ? fromLinks : [...text.matchAll(/(?:^|[\s,;#])(\d{1,9})(?=$|[\s,;])/g)].map((m) => m[1]);
  return [...new Set(ids.map(Number))];
}

const ADO_SYSTEM = 'Azure DevOps';
const adoDescribe = (status, messages) => {
  const detail = messages.length ? ` (${messages.join('; ')})` : '';
  if (status === 401) return 'Azure DevOps rejected the personal access token. Check ADO_PAT is valid and has Work Items (Read) scope.';
  if (status === 403) return `The token's account cannot read these work items${detail}.`;
  if (status === 404) return `Azure DevOps could not find that work item${detail}. Check the id and ADO_ORG_URL.`;
  return `Azure DevOps returned an error (${status})${detail}.`;
};
const adoMessages = (body) => {
  try {
    return [JSON.parse(body).message].filter(Boolean);
  } catch {
    return [];
  }
};

const MEDIA_BY_EXTENSION = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };

export async function fetchAdoWorkItems(ref) {
  const ado = config.adoSource;
  if (!ado) throw badRef('Azure DevOps import needs ADO_ORG_URL and ADO_PAT on the server.');
  const ids = parseAdoIds(ref);
  if (ids.length === 0) throw badRef('Enter a work item id such as 123, or paste the work item link.');
  if (ids.length > SOURCE_LIMITS.issues) throw badRef(`Import at most ${SOURCE_LIMITS.issues} work items at a time.`);

  const base = ado.baseUrl.replace(/\/$/, '');
  // Without the suppress header a bad token gets a 203 sign-in page, not a 401.
  const headers = { authorization: patHeader(ado.pat), accept: 'application/json', 'x-tfs-fedauthredirect': 'Suppress' };
  let res;
  try {
    res = await requestWithRetry(`${base}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=all&errorPolicy=omit&api-version=${ado.apiVersion}`, {
      system: ADO_SYSTEM,
      describe: adoDescribe,
      extractMessages: adoMessages,
      headers,
    });
  } catch (err) {
    if (err instanceof SyntaxError) throw badRef(adoDescribe(401, []));
    throw err;
  }

  const items = (res?.value ?? []).filter(Boolean);
  if (items.length === 0) throw badRef(adoDescribe(404, []));
  const attachments = [];

  for (const item of items) {
    const f = item.fields ?? {};
    const children = (item.relations ?? [])
      .filter((r) => r.rel === 'System.LinkTypes.Hierarchy-Forward')
      .map((r) => `#${r.url.split('/').pop()}`);
    const text = [
      `#${item.id}: ${f['System.Title'] ?? ''}`,
      [f['System.WorkItemType'], f['System.State'], f['Microsoft.VSTS.Common.Priority'] && `priority ${f['Microsoft.VSTS.Common.Priority']}`]
        .filter(Boolean)
        .join(' · '),
      f['System.AreaPath'] ? `Area: ${f['System.AreaPath']}` : '',
      f['System.Tags'] ? `Tags: ${f['System.Tags']}` : '',
      '',
      'Description:',
      htmlToText(f['System.Description']) || '(none)',
      f['Microsoft.VSTS.Common.AcceptanceCriteria'] ? `\nAcceptance criteria:\n${htmlToText(f['Microsoft.VSTS.Common.AcceptanceCriteria'])}` : '',
      f['Microsoft.VSTS.TCM.ReproSteps'] ? `\nRepro steps:\n${htmlToText(f['Microsoft.VSTS.TCM.ReproSteps'])}` : '',
      children.length ? `\nChild work items: ${children.join(', ')}` : '',
    ].join('\n');
    attachments.push(textAttachment(`ADO-${item.id}.txt`, text));

    // Mockups and specs attached to the work item are part of the requirement.
    const files = (item.relations ?? [])
      .filter((r) => r.rel === 'AttachedFile')
      .map((r) => ({ url: r.url, name: r.attributes?.name ?? 'attachment', size: r.attributes?.resourceSize ?? 0 }))
      .map((a) => ({ ...a, mediaType: MEDIA_BY_EXTENSION[a.name.split('.').pop()?.toLowerCase()] }))
      .filter((a) => a.mediaType && a.size <= AGENT_FILE_TYPES[a.mediaType].maxBytes)
      .slice(0, SOURCE_LIMITS.attachmentsPerIssue);
    for (const a of files) {
      const file = await download(`${a.url}?api-version=${ado.apiVersion}`, { authorization: headers.authorization }, a.mediaType, `ADO-${item.id} – ${a.name}`);
      if (file) attachments.push(file);
    }
  }

  const missing = ids.length - items.length;
  return { label: items.map((i) => `#${i.id}`).join(', '), attachments, ...(missing > 0 && { skipped: missing }) };
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
const STRUCTURE_LIMIT = 30_000;

/** A component's properties as "Variant=Primary, Disabled=false". */
const propsOf = (node) =>
  Object.entries(node.componentProperties ?? {})
    .map(([key, p]) => `${key.replace(/#[\d:]+$/, '')}=${p?.value}`)
    .join(', ');

/** Prototype interactions: "on click → navigate to Dashboard". */
function interactionsOf(node, names) {
  const out = [];
  for (const it of node.interactions ?? []) {
    for (const a of it.actions ?? []) {
      const target = a?.destinationId ? names.get(a.destinationId) ?? a.destinationId : null;
      const what = a?.type === 'NODE' ? `${(a.navigation ?? 'navigate').toLowerCase()} to "${target}"` : (a?.type ?? '').toLowerCase().replace(/_/g, ' ');
      if (what) out.push(`on ${(it.trigger?.type ?? 'interaction').toLowerCase().replace(/_/g, ' ')} → ${what}`);
    }
  }
  for (const r of node.reactions ?? []) {
    const a = r.action;
    if (a?.type === 'NODE' && a.destinationId) out.push(`on ${(r.trigger?.type ?? 'click').toLowerCase().replace(/_/g, ' ')} → navigate to "${names.get(a.destinationId) ?? a.destinationId}"`);
  }
  return [...new Set(out)];
}

/**
 * A design's structure as text: per frame, its visible text, components with
 * their properties, and prototype interactions -- what a tester reads to
 * understand the intended flows, and what a text-only model can use.
 */
export function figmaStructure(fileName, frameNodes) {
  const names = new Map();
  const index = (n) => {
    if (n?.id) names.set(n.id, n.name);
    (n?.children ?? []).forEach(index);
  };
  frameNodes.forEach(index);

  const lines = [`# Figma design: ${fileName}`];
  for (const frame of frameNodes) {
    lines.push('', `## Screen: ${frame.name}`);
    const walk = (n, depth) => {
      if (!n || n.visible === false || depth > 12) return;
      const pad = '  '.repeat(Math.max(depth - 1, 0));
      const acts = interactionsOf(n, names);
      if (n.type === 'TEXT' && n.characters?.trim()) {
        const text = n.characters.replace(/\s+/g, ' ').trim();
        lines.push(`${pad}- Text${n.name && n.name !== text ? ` "${n.name}"` : ''}: ${text}`);
      } else if (n.type === 'INSTANCE' || n.type === 'COMPONENT') {
        const props = propsOf(n);
        lines.push(`${pad}- Component ${n.name}${props ? ` (${props})` : ''}`);
      } else if (depth > 0 && (n.type === 'FRAME' || n.type === 'GROUP') && (acts.length || n.name)) {
        lines.push(`${pad}- ${n.type === 'FRAME' ? 'Section' : 'Group'} ${n.name}`);
      }
      for (const a of acts) lines.push(`${pad}  · ${a}`);
      (n.children ?? []).forEach((c) => walk(c, depth + 1));
    };
    walk(frame, 0);
    for (const a of interactionsOf(frame, names)) lines.push(`· Screen ${a}`);
  }
  const text = lines.join('\n');
  return text.length > STRUCTURE_LIMIT ? `${text.slice(0, STRUCTURE_LIMIT)}\n… (structure truncated)` : text;
}

export async function fetchFigmaFrames(ref, frameIds = null) {
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

  const chosen = frameIds?.length
    ? frames.filter((f) => frameIds.includes(f.id)).slice(0, SOURCE_LIMITS.frames)
    : frames.slice(0, SOURCE_LIMITS.frames);
  if (chosen.length === 0) throw badRef('None of the chosen frames were found. Choose them again.');
  const ids = chosen.map((f) => f.id).join(',');
  const images = await figma(`/images/${parsed.key}?ids=${encodeURIComponent(ids)}&format=png&scale=1`);

  const pictures = [];
  for (const frame of chosen) {
    const url = images.images?.[frame.id];
    if (!url) continue;
    const file = await download(url, {}, 'image/png', `Figma – ${frame.name}.png`.replace(/[\\/:*?"<>|]+/g, ' '));
    if (file) pictures.push(file);
  }

  // The frames' full layer trees: text, components, properties, interactions.
  let structure = null;
  try {
    const full = await figma(`/files/${parsed.key}/nodes?ids=${encodeURIComponent(ids)}`);
    const nodes = chosen.map((f) => full.nodes?.[f.id]?.document).filter(Boolean);
    if (nodes.length) structure = figmaStructure(fileName, nodes);
  } catch (err) {
    logger.warn({ err: err.message }, 'figma structure fetch failed; using images only');
  }

  if (pictures.length === 0 && !structure) throw badRef('Figma did not render any of the frames. Try linking a single frame.');
  const safe = fileName.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80);
  const attachments = [...(structure ? [textAttachment(`Figma – ${safe} – structure.txt`, structure)] : []), ...pictures];

  return {
    label: `${fileName} (${chosen.length} ${chosen.length === 1 ? 'frame' : 'frames'})`,
    attachments,
    skipped: frames.length - chosen.length,
  };
}

/** Which link sources this deployment can use, for the UI. */
export const availableSources = () => ({
  jira: Boolean(config.jira),
  confluence: Boolean(config.confluence),
  ado: Boolean(config.adoSource),
  figma: Boolean(config.agent.figmaToken),
});

/**
 * The frames a Figma link offers, with small previews, for the picker. The
 * first 50 are listed; previews are Figma-hosted images that expire.
 */
export async function listFigmaFrames(ref) {
  const token = config.agent.figmaToken;
  if (!token) throw badRef('Figma import needs FIGMA_TOKEN on the server.');
  const parsed = parseFigmaUrl(ref);
  if (!parsed) throw badRef('Paste a Figma design link (figma.com/design/…).');
  const headers = { 'x-figma-token': token, accept: 'application/json' };
  const figma = (p) =>
    requestWithRetry(`${FIGMA_API}${p}`, {
      system: 'Figma',
      describe: (status) =>
        status === 403
          ? 'The Figma token cannot open this file. Check it has file read access.'
          : status === 404
            ? 'Figma could not find that file or frame. Check the link.'
            : `Figma returned an error (${status}).`,
      headers,
    });

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
  frames = frames.slice(0, 50);
  if (frames.length === 0) throw badRef('No frames were found there. Link to a frame or a page that contains frames.');

  let previews = {};
  try {
    const ids = frames.map((f) => f.id).join(',');
    previews = (await figma(`/images/${parsed.key}?ids=${encodeURIComponent(ids)}&format=png&scale=0.25`)).images ?? {};
  } catch {
    // Previews are a convenience; the list works without them.
  }
  return {
    fileName,
    maxSelect: SOURCE_LIMITS.frames,
    frames: frames.map((f) => ({
      id: f.id,
      name: f.name,
      width: Math.round(f.absoluteBoundingBox?.width ?? 0) || null,
      height: Math.round(f.absoluteBoundingBox?.height ?? 0) || null,
      preview: previews[f.id] ?? null,
    })),
  };
}

export async function fetchSource(sessionId, { type, ref, frameIds }) {
  if (type === 'jira') return fetchJiraIssues(sessionId, ref);
  if (type === 'confluence') return fetchConfluencePage(sessionId, ref);
  if (type === 'ado') return fetchAdoWorkItems(ref);
  if (type === 'figma') return fetchFigmaFrames(ref, frameIds);
  throw badRef('Unknown source type.');
}
