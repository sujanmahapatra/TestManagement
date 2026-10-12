/**
 * Client-side rules for the test case agent. The server re-validates all of
 * it; these exist so a wrong file is refused before it is uploaded.
 */

const MB = 1024 * 1024;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Mirrors AGENT_FILE_TYPES in server/src/domain/testCase.js. */
const TYPES = {
  'image/png': { label: 'image', maxBytes: 5 * MB },
  'image/jpeg': { label: 'image', maxBytes: 5 * MB },
  'image/gif': { label: 'image', maxBytes: 5 * MB },
  'image/webp': { label: 'image', maxBytes: 5 * MB },
  'application/pdf': { label: 'PDF', maxBytes: 25 * MB },
  'text/plain': { label: 'text', maxBytes: 1 * MB },
  'text/markdown': { label: 'Markdown', maxBytes: 1 * MB },
  'text/csv': { label: 'CSV', maxBytes: 1 * MB },
  [DOCX]: { label: 'Word document', maxBytes: 25 * MB },
  [PPTX]: { label: 'presentation', maxBytes: 10 * MB },
  [XLSX]: { label: 'workbook', maxBytes: 10 * MB },
};

/** Browsers report no type for some text formats, so the extension decides. */
const BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  text: 'text/plain',
  feature: 'text/plain',
  gherkin: 'text/plain',
  json: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/csv',
  docx: DOCX,
  pptx: PPTX,
  xlsx: XLSX,
};

export const AGENT_ACCEPT = Object.keys(BY_EXTENSION).map((e) => `.${e}`).join(',');
/** Uploads per run. Linked sources add to this, up to the server's total. */
export const AGENT_MAX_FILES = 5;
export const AGENT_MAX_TOTAL_FILES = 25;
export const AGENT_PROMPT_MAX = 20_000;

/** Older binary Office formats; the server reads only the XML-based ones. */
const LEGACY = /\.(doc|ppt|xls|odt|odp|ods|rtf)$/i;

/** Short badge for an attachment in the list. */
export function fileBadge(file) {
  if (file.origin && file.origin !== 'upload') return file.origin.toUpperCase();
  return { [DOCX]: 'DOCX', [PPTX]: 'PPTX', [XLSX]: 'XLSX' }[file.mediaType] ?? file.mediaType.split('/')[1].toUpperCase();
}

/** Where else a requirement can come from, as the UI offers them. */
export const LINK_SOURCES = [
  {
    key: 'jira',
    label: 'Jira issue',
    placeholder: 'QA-123, QA-124 or an issue link',
    hint: 'Fetches the description, acceptance criteria, and image or PDF attachments.',
  },
  {
    key: 'confluence',
    label: 'Confluence page',
    placeholder: 'https://…/wiki/spaces/…/pages/12345/…',
    hint: 'Fetches the page text.',
  },
  {
    key: 'figma',
    label: 'Figma design',
    placeholder: 'https://www.figma.com/design/…?node-id=…',
    hint: 'Renders the linked frame, or up to 10 frames on the linked page.',
  },
];

export const formatBytes = (n) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Reads a chosen file into the shape the server expects.
 * @returns {Promise<{name, mediaType, data, size}>}
 * @throws {Error} with a message fit to show when the file cannot be used
 */
export async function toAttachment(file) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (LEGACY.test(file.name)) {
    throw new Error(`${file.name}: save it as .docx, .pptx, .xlsx or PDF and attach that.`);
  }
  const mediaType = TYPES[file.type] ? file.type : BY_EXTENSION[extension];
  if (!mediaType) {
    throw new Error(
      `${file.name}: attach a PDF, Word, PowerPoint or Excel file, an image (PNG, JPEG, GIF, WebP), or a text, Markdown or CSV file.`,
    );
  }
  const { maxBytes, label } = TYPES[mediaType];
  if (file.size > maxBytes) {
    throw new Error(`${file.name} is ${formatBytes(file.size)}; the limit for a ${label} is ${formatBytes(maxBytes)}.`);
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.readAsDataURL(file);
  });
  return { name: file.name, mediaType, size: file.size, origin: 'upload', data: String(dataUrl).split(',')[1] ?? '' };
}

/**
 * Jira, Confluence and Figma links in pasted text, so they can be fetched as
 * context. Bare issue keys are left alone: "ISO-9001" is not always an issue.
 */
export function detectLinks(text) {
  const links = [];
  for (const match of String(text ?? '').matchAll(/https?:\/\/[^\s<>"')]+/g)) {
    const url = match[0].replace(/[.,;]+$/, '');
    if (/figma\.com\/(file|design|proto|board)\//.test(url)) links.push({ type: 'figma', url });
    else if (/\/wiki\/.*(\/pages\/\d+|pageId=\d+)/.test(url)) links.push({ type: 'confluence', url });
    else if (/\/browse\/[A-Z][A-Z0-9_]+-\d+|selectedIssue=[A-Z][A-Z0-9_]+-\d+/.test(url)) links.push({ type: 'jira', url });
  }
  return links;
}

/** The agent's progress, in order, as the UI names it. */
export const AGENT_STAGES = [
  { key: 'analyze', label: 'Analyze your requirement' },
  { key: 'scan', label: 'Scan for context' },
  { key: 'summary', label: 'Generate a summary' },
  { key: 'write', label: 'Write test cases' },
];

/** Starting points for a refinement; `<…>` marks the part to fill in. */
export const REFINE_SUGGESTIONS = [
  'Add edge and negative test cases for <feature>.',
  'Remove all negative test cases. Keep only happy path and boundary.',
  'Group test cases by feature name. Create one scenario per feature.',
  'Combine overlapping test cases. Preserve the coverage of each.',
  'Update only the expected results to mention the exact validation message.',
  'Add accessibility checks for keyboard navigation and screen readers.',
];

export const PRIORITY_TONE = { critical: 'bad', high: 'warn', medium: 'accent', low: 'plain' };

/** Scenario name -> cases, keeping the order scenarios first appear in. */
export function groupByScenario(cases) {
  const groups = new Map();
  for (const tc of cases) {
    const name = tc.scenario || 'Ungrouped';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(tc);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}

/** What gets filed: the case as the trackers know it, without review-only state. */
export function toFileable({ id, kind, source, change, generatedBy, ...testCase }) {
  return testCase;
}
