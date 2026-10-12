import { config } from '../config.js';
import { getAccessToken } from '../clients/atlassianAuth.js';
import { requestWithRetry } from '../clients/http.js';
import { datasetLines, hasStepResults, metaLine, stepLines } from '../domain/caseFormat.js';

const API_HOST = 'https://api.atlassian.com';

/** Confluence storage format is XHTML, so every value must be escaped. */
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const section = (title, items, ordered) =>
  `<h3>${esc(title)}</h3><${ordered ? 'ol' : 'ul'}>` +
  items.map((i) => `<li>${esc(i)}</li>`).join('') +
  `</${ordered ? 'ol' : 'ul'}>`;

/**
 * Builds a Confluence storage-format page. The info panel at the top is a
 * structured macro -- the native way Confluence renders a callout.
 */
export function toStorageFormat(testCase) {
  const meta = metaLine(testCase);
  return (
    '<ac:structured-macro ac:name="info" ac:schema-version="1">' +
    '<ac:rich-text-body><p>' +
    `Generated test case for <strong>${esc(testCase.platformLabel)}</strong>. ` +
    `${testCase.steps.length} steps, ${testCase.expectedResults.length} assertions.` +
    (meta ? ` ${esc(meta)}.` : '') +
    '</p></ac:rich-text-body></ac:structured-macro>' +
    (testCase.description ? `<p>${esc(testCase.description)}</p>` : '') +
    section('Preconditions', testCase.preconditions, false) +
    section('Steps', stepLines(testCase), true) +
    // Per-step expectations are already inline in the steps above.
    (hasStepResults(testCase) ? '' : section('Expected results', testCase.expectedResults, false)) +
    (testCase.dataset ? section('Test data', datasetLines(testCase), false) : '') +
    section('Target environments', testCase.environments, false)
  );
}

function describe(status, messages) {
  const detail = messages.length ? ` (${messages.join('; ')})` : '';
  switch (status) {
    case 400:
      return `Confluence rejected the page${detail}. Check the space key and parent page id.`;
    case 403:
      return 'The authorized account lacks permission to add pages to this space.';
    case 404:
      return `Space not found${detail}. Verify CONFLUENCE_SPACE_KEY.`;
    default:
      return status >= 500
        ? 'Confluence is temporarily unavailable. Please retry.'
        : `Confluence returned an unexpected response (${status})${detail}.`;
  }
}

function extractMessages(body) {
  try {
    const parsed = JSON.parse(body);
    const errors = (parsed.errors ?? []).map((e) => e.title ?? e.detail).filter(Boolean);
    return [parsed.message, ...errors].filter(Boolean).slice(0, 4);
  } catch {
    return [];
  }
}

/**
 * Confluence requires page titles to be unique within a space, so the title
 * carries a timestamp to the second. Dating it to the day -- the obvious
 * choice -- makes a second run on the same day fail with a 400 that reads
 * like a payload problem.
 */
function pageTitle(testCase) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `${testCase.title} (${stamp})`;
}

export const confluenceExporter = {
  key: 'confluence',
  label: 'Confluence',
  kind: 'page',
  auth: 'atlassian',
  describeTarget: () => `Page in space ${config.confluence.spaceKey}`,

  describeRequest: (testCase) => ({
    method: 'POST',
    path: '/ex/confluence/{cloudId}/wiki/api/v2/pages',
    contentType: 'application/json',
    body: {
      spaceId: `{resolved from ${config.confluence.spaceKey}}`,
      status: 'current',
      title: pageTitle(testCase),
      ...(config.confluence.parentPageId && { parentId: config.confluence.parentPageId }),
      body: { representation: 'storage', value: toStorageFormat(testCase) },
    },
  }),

  async export(testCases, { sessionId }) {
    const { accessToken, cloudIds } = await getAccessToken(sessionId);
    const base = `${API_HOST}/ex/confluence/${cloudIds.confluence}/wiki/api/v2`;
    const headers = {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    };

    // v2 addresses spaces by numeric id, so the configured key is resolved first.
    const spaces = await requestWithRetry(
      `${base}/spaces?keys=${encodeURIComponent(config.confluence.spaceKey)}`,
      { system: 'Confluence', describe, extractMessages, method: 'GET', headers },
    );
    const spaceId = spaces?.results?.[0]?.id;
    if (!spaceId) {
      throw new Error(`Confluence space ${config.confluence.spaceKey} was not found.`);
    }

    const siteBase = config.confluence.baseUrl.replace(/\/$/, '');
    const items = [];

    for (const testCase of testCases) {
      const page = await requestWithRetry(`${base}/pages`, {
        system: 'Confluence',
        describe,
        extractMessages,
        method: 'POST',
        headers,
        body: JSON.stringify({
          spaceId,
          status: 'current',
          title: pageTitle(testCase),
          ...(config.confluence.parentPageId && { parentId: config.confluence.parentPageId }),
          body: { representation: 'storage', value: toStorageFormat(testCase) },
        }),
      });

      items.push({
        ref: page.id,
        url: page._links?.webui ? `${siteBase}/wiki${page._links.webui}` : `${siteBase}/wiki`,
        title: testCase.title,
      });
    }
    return { kind: 'page', items };
  },
};
