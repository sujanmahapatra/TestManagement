import { config } from '../config.js';
import { getAccessToken } from '../clients/atlassianAuth.js';
import { requestWithRetry } from '../clients/http.js';
import { datasetLines, hasStepResults, metaLine, stepLines } from '../domain/caseFormat.js';

const API_HOST = 'https://api.atlassian.com';

const text = (value) => ({ type: 'text', text: value });
const paragraph = (value) => ({ type: 'paragraph', content: [text(value)] });
const heading = (value) => ({ type: 'heading', attrs: { level: 3 }, content: [text(value)] });
const list = (items, ordered) => ({
  type: ordered ? 'orderedList' : 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
});

/**
 * Jira Cloud REST v3 requires Atlassian Document Format for rich text
 * fields. Sending a plain string is the most common cause of a 400 here.
 */
export function toAdf(testCase) {
  const meta = metaLine(testCase);
  // ADF rejects an empty list, so optional sections are dropped, not emptied.
  const section = (title, items, ordered) => (items.length ? [heading(title), list(items, ordered)] : []);

  return {
    type: 'doc',
    version: 1,
    content: [
      ...(testCase.description ? [paragraph(testCase.description)] : []),
      ...(meta ? [paragraph(meta)] : []),
      ...section('Preconditions', testCase.preconditions, false),
      heading('Steps'), list(stepLines(testCase), true),
      // Per-step expectations are already inline in the steps above.
      ...(hasStepResults(testCase) ? [] : [heading('Expected results'), list(testCase.expectedResults, false)]),
      ...section('Test data', datasetLines(testCase), false),
      ...section('Target environments', testCase.environments, false),
    ],
  };
}

/** Core fields the tool owns; extras may not silently redefine them. */
const RESERVED = ['project', 'issuetype', 'summary', 'description'];

export function toIssuePayload(testCase) {
  const labels = [
    ...config.jira.defaultLabels,
    `platform-${testCase.platform}`,
    `type-${testCase.testType}`,
    ...(testCase.priority ? [`priority-${testCase.priority}`] : []),
    ...(testCase.tags ?? []),
  ];

  const fields = {
    project: { key: config.jira.projectKey },
    issuetype: { name: config.jira.issueType },
    summary: testCase.title,
    description: toAdf(testCase),
    // Jira rejects labels containing whitespace.
    labels: [...new Set(labels)].map((l) => l.replace(/\s+/g, '-')),
  };

  if (config.jira.platformField) {
    fields[config.jira.platformField] = testCase.platformLabel;
  }

  // Projects with a strict create screen need priority, components, fix
  // version and so on. They are merged last, but cannot overwrite the four
  // fields that define what this tool is filing.
  for (const [key, value] of Object.entries(config.jira.extraFields)) {
    if (RESERVED.includes(key)) continue;
    fields[key] = value;
  }
  return { fields };
}

function describe(status, messages) {
  const detail = messages.length ? ` (${messages.join('; ')})` : '';
  switch (status) {
    case 400:
      return `Jira rejected the issue${detail}. Check the project key, issue type and any required custom fields.`;
    case 403:
      return 'The authorized Jira account lacks permission to create issues in this project.';
    case 404:
      return `Project not found${detail}. Verify JIRA_PROJECT_KEY and that the account can see it.`;
    case 429:
      return 'Jira is rate limiting requests. Please retry in a moment.';
    default:
      return status >= 500
        ? 'Jira is temporarily unavailable. Please retry.'
        : `Jira returned an unexpected response (${status})${detail}.`;
  }
}

function extractMessages(body) {
  try {
    const parsed = JSON.parse(body);
    const errors = Object.entries(parsed.errors ?? {}).map(([k, v]) => `${k}: ${v}`);
    return [...(parsed.errorMessages ?? []), ...errors].slice(0, 4);
  } catch {
    return [];
  }
}

export const jiraExporter = {
  key: 'jira',
  label: 'Jira',
  kind: 'issue',
  auth: 'atlassian',
  /** What the UI shows under the destination dropdown. */
  describeTarget: () => `${config.jira.issueType} issue in ${config.jira.projectKey}`,

  /** The request `export` would send for one case -- for the UI's payload view. */
  describeRequest: (testCase) => ({
    method: 'POST',
    path: '/ex/jira/{cloudId}/rest/api/3/issue',
    contentType: 'application/json',
    body: toIssuePayload(testCase),
  }),

  async export(testCases, { sessionId }) {
    const { accessToken, cloudIds } = await getAccessToken(sessionId);
    const url = `${API_HOST}/ex/jira/${cloudIds.jira}/rest/api/3/issue`;
    const base = config.jira.baseUrl.replace(/\/$/, '');
    const items = [];

    // Sequential on purpose: a burst of parallel creates is the quickest way
    // to hit Jira's rate limit, and a partial failure is easier to report
    // when the keys created so far are known.
    for (const testCase of testCases) {
      const result = await requestWithRetry(url, {
        system: 'Jira',
        describe,
        extractMessages,
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(toIssuePayload(testCase)),
      });

      items.push({ ref: result.key, url: `${base}/browse/${result.key}`, title: testCase.title });
    }
    return { kind: 'issue', items };
  },
};
