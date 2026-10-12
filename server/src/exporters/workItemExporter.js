import { config } from '../config.js';
import { requestWithRetry, patHeader } from '../clients/http.js';
import { datasetLines, expectedForStep, metaLine } from '../domain/caseFormat.js';

/**
 * Azure DevOps and on-prem TFS expose the same work-item REST API; TFS is
 * its ancestor and pins an older api-version. One adapter is therefore
 * parameterised by config key rather than duplicated per product.
 */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The steps grid stores HTML-in-XML, so step text is escaped twice. */
const cell = (html) => `<parameterizedString isformatted="true">${esc(`<P>${esc(html)}</P>`)}</parameterizedString>`;

/**
 * Builds the `Microsoft.VSTS.TCM.Steps` payload -- the XML document behind
 * the Steps grid on a Test Case work item. Step ids start at 2; id 1 is
 * reserved by the editor.
 */
export function toStepsXml(testCase) {
  const steps = testCase.steps
    .map((action, index) => {
      // The grid pairs each action with its own expected result. A step with
      // nothing to assert is an ActionStep; one that checks something validates.
      const expected = expectedForStep(testCase, index);
      return (
        `<step id="${index + 2}" type="${expected ? 'ValidateStep' : 'ActionStep'}">` +
        cell(action) +
        cell(expected) +
        '<description/>' +
        '</step>'
      );
    })
    .join('');

  return `<steps id="0" last="${testCase.steps.length + 1}">${steps}</steps>`;
}

/** Core paths the tool owns; extras may not silently redefine them. */
const RESERVED_PATHS = [
  '/fields/System.Title',
  '/fields/System.Description',
  '/fields/Microsoft.VSTS.TCM.Steps',
];

export function toPatchDocument(testCase, settings = {}) {
  const meta = metaLine(testCase);
  const description =
    (testCase.description ? `<p>${esc(testCase.description)}</p>` : '') +
    `<p><strong>Platform:</strong> ${esc(testCase.platformLabel)}</p>` +
    (meta ? `<p>${esc(meta)}</p>` : '') +
    '<p><strong>Preconditions</strong></p><ul>' +
    testCase.preconditions.map((p) => `<li>${esc(p)}</li>`).join('') +
    '</ul><p><strong>Target environments</strong></p><ul>' +
    testCase.environments.map((e) => `<li>${esc(e)}</li>`).join('') +
    '</ul>' +
    (testCase.dataset
      ? `<p><strong>Test data</strong></p><ul>${datasetLines(testCase).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
      : '');

  const ops = [
    { op: 'add', path: '/fields/System.Title', value: testCase.title },
    { op: 'add', path: '/fields/System.Description', value: description },
    { op: 'add', path: '/fields/Microsoft.VSTS.TCM.Steps', value: toStepsXml(testCase) },
    {
      op: 'add',
      path: '/fields/System.Tags',
      value: ['generated', `platform-${testCase.platform}`, `type-${testCase.testType}`, ...(testCase.tags ?? [])].join('; '),
    },
  ];

  // Microsoft.VSTS.Common.Priority is 1 (highest) to 4 on every process template.
  if (testCase.priority) {
    const rank = { critical: 1, high: 2, medium: 3, low: 4 }[testCase.priority];
    ops.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: rank });
  }

  // Most projects reject a work item without these two, which is the single
  // most common cause of a 400 on a first Azure DevOps integration.
  if (settings.areaPath) ops.push({ op: 'add', path: '/fields/System.AreaPath', value: settings.areaPath });
  if (settings.iterationPath) {
    ops.push({ op: 'add', path: '/fields/System.IterationPath', value: settings.iterationPath });
  }

  for (const [field, value] of Object.entries(settings.extraFields ?? {})) {
    const path = field.startsWith('/fields/') ? field : `/fields/${field}`;
    if (RESERVED_PATHS.includes(path)) continue;
    ops.push({ op: 'add', path, value });
  }
  return ops;
}

function makeDescribe(system) {
  return (status, messages) => {
    const detail = messages.length ? ` (${messages.join('; ')})` : '';
    switch (status) {
      case 400:
        return `${system} rejected the work item${detail}. Check the work item type and required fields.`;
      case 401:
        return `${system} rejected the personal access token. Check that it is valid and has Work Items (write) scope.`;
      case 403:
        return `The token's account lacks permission to create work items in this project.`;
      case 404:
        return `Project not found${detail}. Verify the organization URL and project name.`;
      default:
        return status >= 500
          ? `${system} is temporarily unavailable. Please retry.`
          : `${system} returned an unexpected response (${status})${detail}.`;
    }
  };
}

function extractMessages(body) {
  try {
    const parsed = JSON.parse(body);
    return [parsed.message].filter(Boolean).slice(0, 2);
  } catch {
    return [];
  }
}

/**
 * @param {'ado'|'tfs'} key
 * @param {string} label  Display name for the destination dropdown.
 */
const workItemUrl = (settings) =>
  `${settings.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(settings.project)}/_apis/wit/workitems/` +
  `$${encodeURIComponent(settings.workItemType)}?api-version=${settings.apiVersion}`;

export function createWorkItemExporter(key, label) {
  return {
    key,
    label,
    kind: 'workitem',
    auth: 'pat',
    describeTarget: () => `${config[key].workItemType} in ${config[key].project}`,

    describeRequest(testCase) {
      const settings = config[key];
      return {
        method: 'POST',
        path: workItemUrl(settings),
        contentType: 'application/json-patch+json',
        body: toPatchDocument(testCase, settings),
      };
    },

    async export(testCases) {
      const settings = config[key];
      const base = settings.baseUrl.replace(/\/$/, '');
      const url = workItemUrl(settings);

      const items = [];
      for (const testCase of testCases) {
        const result = await requestWithRetry(url, {
          system: label,
          describe: makeDescribe(label),
          extractMessages,
          method: 'POST',
          headers: {
            authorization: patHeader(settings.pat),
            // The work-item API takes JSON Patch, not plain JSON.
            'content-type': 'application/json-patch+json',
            accept: 'application/json',
          },
          body: JSON.stringify(toPatchDocument(testCase, settings)),
        });

        items.push({
          ref: String(result.id),
          url: result._links?.html?.href ?? `${base}/${settings.project}/_workitems/edit/${result.id}`,
          title: testCase.title,
        });
      }
      return { kind: 'workitem', items };
    },
  };
}
