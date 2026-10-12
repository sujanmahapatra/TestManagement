import { test } from 'node:test';
import assert from 'node:assert/strict';

// Covers linking with Jira through an API token, against a stubbed Jira:
// sign-in with Basic auth on the site itself (no OAuth app), filing a case
// and linking it to its story, and the connection check's plain-language
// answers. Config is set before the first import because config.js reads it once.
process.env.DESTINATIONS = 'jira';
process.env.JIRA_BASE_URL = 'https://acme.atlassian.net';
process.env.JIRA_PROJECT_KEY = 'QA';
process.env.JIRA_ISSUE_TYPE = 'Task';
process.env.ATLASSIAN_EMAIL = 'qa.lead@acme.test';
process.env.ATLASSIAN_API_TOKEN = 'ATATT-test-token-for-the-suite';
process.env.LOG_LEVEL = 'silent';
delete process.env.CLIENT_ID;
delete process.env.CLIENT_SECRET;

const { config } = await import('../src/config.js');
const { jiraExporter } = await import('../src/exporters/jiraExporter.js');
const { checkJira } = await import('../src/domain/jiraCheck.js');
const { listDestinations } = await import('../src/exporters/index.js');

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const BASIC = `Basic ${Buffer.from('qa.lead@acme.test:ATATT-test-token-for-the-suite').toString('base64')}`;

const CASE = {
  title: 'Delete for everyone within 2 days',
  platform: 'web',
  platformLabel: 'Web',
  testType: 'regression',
  preconditions: [],
  steps: ['Open a chat', 'Delete a message for everyone'],
  stepResults: ['', 'Recipients see "This message was deleted"'],
  expectedResults: ['Recipients see "This message was deleted"'],
  environments: [],
  links: ['QA-7'],
};

test('an API token needs no OAuth app and no browser connection', () => {
  assert.equal(config.atlassian, undefined);
  assert.equal(config.atlassianToken.email, 'qa.lead@acme.test');
  assert.equal(listDestinations().find((d) => d.key === 'jira').auth, 'token');
});

test('filing signs in with the token on the site and links the case to its story', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), auth: init.headers.authorization, body: init.body && JSON.parse(init.body) });
    if (String(url).endsWith('/rest/api/3/issue')) return json(201, { key: 'QA-42' });
    if (String(url).endsWith('/rest/api/3/issueLink')) return new Response(null, { status: 201 });
    return json(404, {});
  });

  const result = await jiraExporter.export([CASE], { sessionId: null });
  assert.equal(result.items[0].ref, 'QA-42');
  assert.equal(result.items[0].url, 'https://acme.atlassian.net/browse/QA-42');
  assert.deepEqual(result.items[0].linked, ['QA-7']);

  const [create, link] = calls;
  assert.equal(create.url, 'https://acme.atlassian.net/rest/api/3/issue');
  assert.equal(create.auth, BASIC);
  assert.equal(create.body.fields.issuetype.name, 'Task');
  assert.deepEqual(link.body, { type: { name: 'Relates' }, inwardIssue: { key: 'QA-42' }, outwardIssue: { key: 'QA-7' } });
});

test('a failed link is reported without undoing the filed case', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    String(url).endsWith('/issueLink') ? json(404, { errorMessages: ['Issue does not exist'] }) : json(201, { key: 'QA-43' }),
  );
  const result = await jiraExporter.export([CASE], { sessionId: null });
  assert.equal(result.items[0].ref, 'QA-43');
  assert.deepEqual(result.items[0].failed, ['QA-7']);
});

/** A stub Jira answering the check's four reads. */
function jira({ me = 200, project = 200, types = ['Task', 'Bug', 'Story'], links = ['Relates', 'Blocks'] } = {}) {
  return async (url) => {
    const u = String(url);
    if (u.endsWith('/myself')) return json(me, { displayName: 'QA Lead' });
    if (u.includes('/project/QA')) return json(project, { key: 'QA', name: 'Quality' });
    if (u.includes('/issuetypes')) return json(200, { issueTypes: types.map((name) => ({ name })) });
    if (u.endsWith('/issueLinkType')) return json(200, { issueLinkTypes: links.map((name) => ({ name })) });
    return json(404, {});
  };
}

test('the connection check confirms sign-in, project and issue type', async (t) => {
  t.mock.method(globalThis, 'fetch', jira());
  const result = await checkJira(null);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'api-token');
  assert.match(result.message, /Connected as QA Lead to Quality \(QA\)\. Test cases are filed as Task issues\./);
});

test('the connection check says what to fix', async (t) => {
  t.mock.method(globalThis, 'fetch', jira({ me: 401 }));
  assert.match((await checkJira(null)).message, /rejected the sign-in.*ATLASSIAN_API_TOKEN/);
  t.mock.restoreAll();

  t.mock.method(globalThis, 'fetch', jira({ project: 404 }));
  assert.match((await checkJira(null)).message, /Project QA was not found/);
  t.mock.restoreAll();

  t.mock.method(globalThis, 'fetch', jira({ types: ['Bug', 'Story'] }));
  assert.match((await checkJira(null)).message, /no "Task" issue type\. Set JIRA_ISSUE_TYPE to one of: Bug, Story/);
  t.mock.restoreAll();

  t.mock.method(globalThis, 'fetch', jira({ links: ['Blocks'] }));
  const noLink = await checkJira(null);
  assert.equal(noLink.ok, true);
  assert.match(noLink.message, /"Relates" link type does not exist/);
});
