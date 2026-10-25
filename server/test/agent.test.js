import { test } from 'node:test';
import assert from 'node:assert/strict';

// Covers the test case agent without a network call: a stub client replays
// a scripted stream, so the request shape, progress events, conversion into
// fileable cases, scoped refinement and the exporters' handling of per-step
// expectations are all checked. Config is set before the first import
// because config.js validates the environment at import time.
process.env.DESTINATIONS = 'jira,excel,ado';
process.env.CLIENT_ID = 'test-client-id';
process.env.CLIENT_SECRET = 'test-client-secret';
process.env.REDIRECT_URI = 'http://localhost:4000/auth/callback';
process.env.JIRA_BASE_URL = 'https://example.atlassian.net';
process.env.JIRA_PROJECT_KEY = 'QA';
process.env.ADO_ORG_URL = 'https://dev.azure.com/contoso';
process.env.ADO_PROJECT = 'Payments';
process.env.ADO_PAT = 'test-pat';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.LOG_LEVEL = 'silent';

const { runAgent, setAgentClient } = await import('../src/domain/testCaseAgent.js');
const { agentRequestSchema, requestSchemaFor, editedTestCaseSchema } = await import('../src/domain/testCase.js');
const { toAdf } = await import('../src/exporters/jiraExporter.js');
const { toPatchDocument, toStepsXml } = await import('../src/exporters/workItemExporter.js');
const { buildWorkbook } = await import('../src/exporters/excelExporter.js');
const { config } = await import('../src/config.js');

/* ---------------- a scripted stand-in for the SDK ---------------- */

/**
 * Records the request and replays a thinking block, then the answer as text
 * deltas, then resolves `finalMessage` -- the shape the agent consumes.
 */
function stubClient(answer, { stopReason = 'end_turn' } = {}) {
  const calls = [];
  const client = {
    beta: {
      messages: {
        stream(params, options) {
          calls.push({ params, options });
          const handlers = [];
          return {
            on(event, handler) {
              if (event === 'streamEvent') handlers.push(handler);
              return this;
            },
            async finalMessage() {
              const send = (e) => handlers.forEach((h) => h(e, {}));
              send({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } });
              send({ type: 'content_block_start', index: 1, content_block: { type: 'text' } });
              const json = JSON.stringify(answer);
              for (let i = 0; i < json.length; i += 40) {
                send({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: json.slice(i, i + 40) } });
              }
              return {
                model: 'claude-opus-5-5',
                stop_reason: stopReason,
                stop_details: null,
                usage: { input_tokens: 1, output_tokens: 1 },
                parsed_output: stopReason === 'end_turn' ? answer : null,
              };
            },
          };
        },
      },
    },
  };
  return { client, calls };
}

const modelCase = (overrides = {}) => ({
  ref: '',
  change: 'new',
  title: 'Login succeeds with valid credentials',
  description: 'A registered user can sign in.',
  kind: 'positive',
  priority: 'critical',
  category: 'Functional',
  tags: ['Login', 'happy path'],
  preconditions: ['A registered account exists'],
  steps: [
    { action: 'Open the login page', expected: '' },
    { action: 'Enter a valid email and password', expected: 'The fields accept the input' },
    { action: 'Click Sign in', expected: 'The dashboard is shown' },
  ],
  source: { name: 'Prompt', excerpt: 'Users sign in with email and password.' },
  dataset: { columns: [], rows: [] },
  ...overrides,
});

const answer = (scenarios, extra = {}) => ({
  summary: 'Covers sign-in.',
  assumptions: ['Accounts are pre-provisioned.'],
  changeSummary: '',
  scenarios,
  ...extra,
});

const BASE = agentRequestSchema.parse({
  platform: 'web',
  prompt: 'Users sign in with email and password. Five failed attempts lock the account.',
});

/* ---------------- request validation ---------------- */

test('agent request needs a prompt or an attachment', () => {
  const parsed = agentRequestSchema.safeParse({ platform: 'web' });
  assert.equal(parsed.success, false);
  assert.ok(parsed.error.issues.some((i) => i.path[0] === 'prompt'));
});

test('agent request rejects unsupported and oversized attachments', () => {
  const docx = agentRequestSchema.safeParse({
    platform: 'web',
    files: [{ name: 'spec.docx', mediaType: 'application/msword', data: 'AAAA' }],
  });
  assert.equal(docx.success, false);

  const big = 'A'.repeat(Math.ceil((6 * 1024 * 1024 * 4) / 3)); // ~6 MB decoded
  const image = agentRequestSchema.safeParse({
    platform: 'web',
    files: [{ name: 'mock.png', mediaType: 'image/png', data: big }],
  });
  assert.equal(image.success, false);
  assert.match(image.error.issues[0].message, /larger than 5 MB/);
});

test('a refinement needs both the current cases and an instruction', () => {
  const parsed = agentRequestSchema.safeParse({ platform: 'web', prompt: 'Login page', instruction: 'Add edge cases' });
  assert.equal(parsed.success, false);
  assert.ok(parsed.error.issues.some((i) => i.path[0] === 'instruction'));
});

/* ---------------- a first run ---------------- */

test('a first run streams the stages and returns fileable cases grouped by scenario', async () => {
  const { client, calls } = stubClient(
    answer([
      { name: 'Sign in', testCases: [modelCase()] },
      {
        name: 'Lockout',
        testCases: [
          modelCase({
            title: 'Account locks after five failed attempts',
            kind: 'negative',
            priority: 'high',
            category: 'Security',
            steps: [
              { action: 'Enter a wrong password five times', expected: 'An error is shown each time' },
              { action: 'Enter the correct password', expected: 'The account is reported as locked' },
            ],
          }),
        ],
      },
    ]),
  );
  setAgentClient(client);

  const events = [];
  const result = await runAgent(BASE, (e) => events.push(e));

  const stages = events.filter((e) => e.type === 'stage').map((e) => e.stage);
  assert.deepEqual(stages, ['analyze', 'scan', 'summary', 'write']);
  assert.equal(events.filter((e) => e.type === 'progress').at(-1).drafted, 2);

  assert.equal(result.summary, 'Covers sign-in.');
  assert.equal(result.testCases.length, 2);

  const [login, lockout] = result.testCases;
  assert.match(login.id, /^tc-[0-9a-f]{8}$/);
  assert.equal(login.scenario, 'Sign in');
  assert.equal(login.priority, 'critical');
  assert.deepEqual(login.tags, ['login', 'happy-path']);
  assert.deepEqual(login.steps, ['Open the login page', 'Enter a valid email and password', 'Click Sign in']);
  assert.deepEqual(login.stepResults, ['', 'The fields accept the input', 'The dashboard is shown']);
  assert.deepEqual(login.expectedResults, ['The fields accept the input', 'The dashboard is shown']);
  assert.equal(login.change, null);
  assert.equal(lockout.variant, 'negative');
  assert.equal(lockout.category, 'Security');

  // Every case the agent writes must pass the same validation as a filed case.
  for (const tc of result.testCases) assert.equal(editedTestCaseSchema.safeParse(tc).success, true);

  const { params } = calls[0];
  assert.equal(params.model, config.generator.model);
  assert.equal(params.fallbacks, 'default');
  assert.ok(params.output_config.format);
  const blocks = params.messages[0].content;
  assert.deepEqual(blocks.at(-2).cache_control, { type: 'ephemeral' });
  assert.match(blocks.at(-2).text, /Five failed attempts/);
});

test('attachments become document and image blocks ahead of the requirement', async () => {
  const { client, calls } = stubClient(answer([{ name: 'Sign in', testCases: [modelCase()] }]));
  setAgentClient(client);

  const input = agentRequestSchema.parse({
    platform: 'web',
    files: [
      { name: 'prd.pdf', mediaType: 'application/pdf', data: 'JVBERi0xLjQ=' },
      { name: 'login.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
      { name: 'story.md', mediaType: 'text/markdown', data: Buffer.from('As a user I can sign in').toString('base64') },
    ],
  });
  await runAgent(input, () => {});

  const types = calls[0].params.messages[0].content.map((b) => b.type);
  assert.deepEqual(types, ['document', 'text', 'image', 'document', 'text', 'text']);
  const text = calls[0].params.messages[0].content[3];
  assert.equal(text.source.type, 'text');
  assert.equal(text.source.data, 'As a user I can sign in');
});

test('cases generated from a Jira story are linked to it', async () => {
  setAgentClient(stubClient(answer([{ name: 'Delete', testCases: [modelCase({ source: { name: 'Prompt', excerpt: 'x' } }), modelCase({ source: { name: 'PAY-9 – spec.pdf', excerpt: 'y' } })] }])).client);
  const input = agentRequestSchema.parse({
    platform: 'web',
    files: [{ name: 'QA-7.txt', mediaType: 'text/plain', data: Buffer.from('QA-7: Delete messages').toString('base64') }],
  });
  const { testCases } = await runAgent(input, () => {});
  assert.deepEqual(testCases[0].links, ['QA-7']); // the run's only Jira issue
  assert.deepEqual(testCases[1].links, ['PAY-9']); // the issue its source names
  for (const tc of testCases) assert.equal(editedTestCaseSchema.safeParse(tc).success, true);
});

test('the analysis behind the suite comes back for the thinking steps', async () => {
  const analysis = {
    artifacts: [{ name: 'prd.pdf', findings: ['Delete for everyone within 2 hours', 'Deletion syncs across devices within 5 s'] }],
    coreRequirements: ['Delete for me and for everyone', 'Placeholder shown to recipients'],
  };
  setAgentClient(stubClient(answer([{ name: 'Delete', testCases: [modelCase()] }], { analysis })).client);
  const result = await runAgent(BASE, () => {});
  assert.deepEqual(result.analysis, analysis);
});

test('BDD cases take their assertions from the Then lines', async () => {
  const { client } = stubClient(
    answer([
      {
        name: 'Sign in',
        testCases: [
          modelCase({
            title: 'Successful sign in',
            steps: [
              { action: 'Given a registered user', expected: '' },
              { action: 'When they sign in with valid credentials', expected: '' },
              { action: 'Then the dashboard is shown', expected: '' },
              { action: 'And a welcome message names them', expected: '' },
            ],
          }),
        ],
      },
    ]),
  );
  setAgentClient(client);

  const { testCases } = await runAgent({ ...BASE, template: 'bdd' }, () => {});
  assert.deepEqual(testCases[0].stepResults, []);
  assert.deepEqual(testCases[0].expectedResults, ['Then the dashboard is shown', 'And a welcome message names them']);
});

test('near-miss enum values are normalised rather than failing the run', async () => {
  setAgentClient(
    stubClient(
      answer([{ name: 'Sign in', testCases: [modelCase({ priority: 'High', category: 'ui/ux', kind: 'Negative' }), modelCase({ priority: 'Highest', category: 'Usability' })] }]),
    ).client,
  );
  const { testCases } = await runAgent(BASE, () => {});
  assert.equal(testCases[0].priority, 'high');
  assert.equal(testCases[0].category, 'UI/UX');
  assert.equal(testCases[0].variant, 'negative');
  assert.equal(testCases[1].priority, 'medium');
  assert.equal(testCases[1].category, 'Functional');
});

test('a priority outside the chosen ones falls back to an allowed one', async () => {
  const { client, calls } = stubClient(answer([{ name: 'Sign in', testCases: [modelCase({ priority: 'critical' })] }]));
  setAgentClient(client);
  const { testCases } = await runAgent({ ...BASE, priorities: ['high', 'low'] }, () => {});
  assert.equal(testCases[0].priority, 'high');
  assert.match(calls[0].params.messages[0].content.at(-1).text, /priority is one of: high, low/);
});

test('language, datasets and repository context reach the prompt; datasets come back trimmed', async () => {
  const { client, calls } = stubClient(
    answer([
      {
        name: 'Sign in',
        testCases: [
          modelCase({ dataset: { columns: ['email', ' '], rows: [['a@b.co', 'x'], ['', ''], ['c@d.co']] } }),
          modelCase({ title: 'No data', dataset: { columns: [], rows: [] } }),
        ],
      },
    ]),
  );
  setAgentClient(client);
  const { testCases } = await runAgent({ ...BASE, language: 'French', datasets: true }, () => {});
  assert.deepEqual(testCases[0].dataset, { columns: ['email'], rows: [['a@b.co'], ['c@d.co']] });
  assert.equal(testCases[1].dataset, null);
  for (const tc of testCases) assert.equal(editedTestCaseSchema.safeParse(tc).success, true);
  const sent = calls[0].params.messages[0].content.at(-1).text;
  assert.match(sent, /in French/);
  assert.match(sent, /Datasets are on/);
});

/* ---------------- refinement ---------------- */

test('a scoped refinement only touches the selected cases', async () => {
  // A first run, with one case then edited by hand.
  setAgentClient(
    stubClient(
      answer([
        {
          name: 'Sign in',
          testCases: [
            modelCase({ title: 'Login succeeds' }),
            modelCase({ title: 'Login fails with a wrong password', kind: 'negative' }),
            modelCase({ title: 'Password field masks input', category: 'UI/UX' }),
          ],
        },
      ]),
    ).client,
  );
  const first = await runAgent(BASE, () => {});
  const [ok, wrong, masked] = first.testCases;
  const current = [{ ...ok, title: 'Login succeeds (edited by hand)' }, wrong, masked];

  // Refine only the first two: keep one, revise one, add one. The third is out of scope.
  const { client, calls } = stubClient(
    answer(
      [
        {
          name: 'Sign in',
          testCases: [
            modelCase({ ref: ok.id, change: 'unchanged', title: 'Login succeeds' }),
            modelCase({ ref: wrong.id, change: 'edited', title: 'Login fails with a wrong password and shows an error' }),
            modelCase({ ref: '', change: 'new', title: 'Login fails with an empty email', kind: 'edge' }),
          ],
        },
      ],
      { changeSummary: 'Sharpened one case and added an empty-email case.' },
    ),
  );
  setAgentClient(client);

  const input = agentRequestSchema.parse({
    platform: 'web',
    prompt: BASE.prompt,
    instruction: 'Add edge cases for the email field.',
    current,
    selectedIds: [ok.id, wrong.id],
  });
  const result = await runAgent(input, () => {});

  assert.equal(result.changeSummary, 'Sharpened one case and added an empty-email case.');
  const byTitle = Object.fromEntries(result.testCases.map((tc) => [tc.title, tc]));

  // "unchanged" keeps the reviewer's edit, not the model's restatement.
  assert.equal(byTitle['Login succeeds (edited by hand)'].change, 'unchanged');
  assert.equal(byTitle['Login fails with a wrong password and shows an error'].id, wrong.id);
  assert.equal(byTitle['Login fails with a wrong password and shows an error'].change, 'edited');
  assert.equal(byTitle['Login fails with an empty email'].change, 'new');
  assert.notEqual(byTitle['Login fails with an empty email'].id, ok.id);
  assert.equal(byTitle['Password field masks input'].id, masked.id);
  assert.equal(result.testCases.length, 4);

  // The model sees only the in-scope cases in full.
  const sent = calls[0].params.messages[0].content.at(-1).text;
  assert.match(sent, new RegExp(ok.id));
  assert.doesNotMatch(sent, new RegExp(masked.id));
  assert.match(sent, /- Password field masks input/);
});

test('accepted cases are kept out of a refinement, and rejected ones are named to the model', async () => {
  setAgentClient(stubClient(answer([{ name: 'Sign in', testCases: [modelCase({ title: 'Keep me' }), modelCase({ title: 'Rework me' })] }])).client);
  const first = await runAgent(BASE, () => {});
  const [keep, rework] = first.testCases;

  const { client, calls } = stubClient(answer([{ name: 'Sign in', testCases: [modelCase({ ref: rework.id, change: 'edited', title: 'Reworked' })] }]));
  setAgentClient(client);
  const result = await runAgent(
    agentRequestSchema.parse({
      platform: 'web',
      prompt: BASE.prompt,
      instruction: 'Sharpen the titles.',
      current: first.testCases,
      lockedIds: [keep.id],
      rejectedTitles: ['Login works on a fax machine'],
    }),
    () => {},
  );

  const sent = calls[0].params.messages[0].content.at(-1).text;
  assert.doesNotMatch(sent, new RegExp(keep.id)); // not offered for editing
  assert.match(sent, /- Keep me/); // listed as kept
  assert.match(sent, /rejected these test cases[\s\S]*Login works on a fax machine/);
  assert.deepEqual(result.testCases.map((c) => c.title).sort(), ['Keep me', 'Reworked']);
  assert.equal(result.testCases.find((c) => c.title === 'Keep me').id, keep.id);
});

test('live reasoning from summarized thinking is passed on', async () => {
  const { client, calls } = stubClient(answer([{ name: 'Sign in', testCases: [modelCase()] }]));
  const original = client.beta.messages.stream;
  client.beta.messages.stream = (params, options) => {
    const s = original(params, options);
    const finalMessage = s.finalMessage.bind(s);
    const handlers = [];
    const on = s.on.bind(s);
    s.on = (ev, h) => {
      if (ev === 'streamEvent') handlers.push(h);
      return on(ev, h);
    };
    s.finalMessage = async () => {
      handlers.forEach((h) => h({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'The PRD covers deleting sent messages.' } }, {}));
      return finalMessage();
    };
    return s;
  };
  setAgentClient(client);
  const events = [];
  await runAgent(BASE, (e) => events.push(e));
  assert.equal(calls[0].params.thinking.display, 'summarized');
  assert.equal(events.filter((e) => e.type === 'reasoning').map((e) => e.text).join(''), 'The PRD covers deleting sent messages.');
});

test('a refinement that drops a case reports it as removed', async () => {
  setAgentClient(stubClient(answer([{ name: 'Sign in', testCases: [modelCase(), modelCase({ title: 'Duplicate login' })] }])).client);
  const first = await runAgent(BASE, () => {});

  setAgentClient(
    stubClient(answer([{ name: 'Sign in', testCases: [modelCase({ ref: first.testCases[0].id, change: 'unchanged' })] }])).client,
  );
  const result = await runAgent(
    agentRequestSchema.parse({ platform: 'web', prompt: BASE.prompt, instruction: 'Remove duplicates.', current: first.testCases }),
    () => {},
  );
  assert.deepEqual(result.removed, ['Duplicate login']);
  assert.equal(result.testCases.length, 1);
});

test('a declined request surfaces as agent_declined', async () => {
  setAgentClient(stubClient(answer([]), { stopReason: 'refusal' }).client);
  await assert.rejects(runAgent(BASE, () => {}), (err) => err.code === 'agent_declined');
});

/* ---------------- filing agent cases ---------------- */

const AGENT_CASE = {
  title: 'Login succeeds',
  platform: 'web',
  platformLabel: 'Web',
  testType: 'regression',
  preconditions: ['A registered account exists'],
  steps: ['Open the login page', 'Click Sign in'],
  stepResults: ['', 'The dashboard is shown'],
  expectedResults: ['The dashboard is shown'],
  environments: ['Chrome'],
  description: 'A registered user can sign in.',
  priority: 'high',
  category: 'Functional',
  scenario: 'Sign in',
  tags: ['login'],
};

test('approved agent cases file without a note', () => {
  const body = { destination: 'excel', testCases: [AGENT_CASE] };
  const parsed = requestSchemaFor(body).safeParse(body);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.testCases[0].priority, 'high');
});

test('work items carry per-step expectations and the priority', () => {
  const xml = toStepsXml(AGENT_CASE);
  assert.match(xml, /<step id="2" type="ActionStep">/);
  assert.match(xml, /<step id="3" type="ValidateStep">/);
  const ops = toPatchDocument(AGENT_CASE);
  assert.deepEqual(ops.find((o) => o.path === '/fields/Microsoft.VSTS.Common.Priority').value, 2);
  assert.match(ops.find((o) => o.path === '/fields/System.Tags').value, /login/);
});

test('Jira inlines per-step expectations instead of a separate list', () => {
  const adf = toAdf(AGENT_CASE);
  const headings = adf.content.filter((n) => n.type === 'heading').map((n) => n.content[0].text);
  assert.ok(!headings.includes('Expected results'));
  assert.ok(JSON.stringify(adf).includes('Click Sign in — Expected: The dashboard is shown'));
  assert.ok(JSON.stringify(adf).includes('Priority: High · Category: Functional · Scenario: Sign in'));
});

test('Excel puts each expectation on its own step row', async () => {
  const workbook = await buildWorkbook([AGENT_CASE]);
  const sheet = workbook.worksheets[0];
  const rows = [];
  sheet.eachRow((row) => rows.push(row.values.slice(1)));
  const stepRows = rows.filter((r) => typeof r[0] === 'number');
  assert.deepEqual(stepRows.map((r) => r[2] ?? ''), ['', 'The dashboard is shown']);
  assert.ok(rows.some((r) => r[0] === 'Priority' && r[1] === 'high'));
});

test('choosing Regression, Sanity or Unit tells the agent what each means; the default lets it choose', async () => {
  const { client, calls } = stubClient(answer([{ name: 'Sign in', testCases: [modelCase({ category: 'Unit' })] }]));
  setAgentClient(client);
  const promptOf = (call) => call.params.messages[0].content.map((b) => b.text ?? '').join('\n');

  const result = await runAgent(agentRequestSchema.parse({ platform: 'web', prompt: 'Sign in with email', categories: ['Unit', 'Sanity'] }), () => {});
  const picked = promptOf(calls[0]);
  assert.match(picked, /Write only cases in these categories: Unit, Sanity/);
  assert.match(picked, /Unit -- checks of one function, rule or component in isolation/);
  assert.match(picked, /Sanity -- a few quick, narrow checks/);
  assert.doesNotMatch(picked, /Regression --/);
  assert.equal(result.testCases[0].category, 'Unit');

  await runAgent(agentRequestSchema.parse({ platform: 'web', prompt: 'Sign in with email' }), () => {});
  assert.match(promptOf(calls[1]), /from Functional, UI\/UX, Security, Performance, Compatibility, Accessibility; most will be Functional/);
});
