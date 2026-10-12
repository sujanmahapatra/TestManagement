import { test } from 'node:test';
import assert from 'node:assert/strict';

// Covers the agent on Groq's OpenAI-style API with a stubbed fetch: the
// strict JSON schema sent, the answer parsed into fileable cases, images
// refused for a text-only model, and Groq's errors turned into advice.
process.env.DESTINATIONS = 'excel';
process.env.GROQ_API_KEY = 'gsk_test_key_for_the_suite_only';
process.env.LOG_LEVEL = 'silent';

const { runAgent } = await import('../src/domain/testCaseAgent.js');
const { agentRequestSchema, editedTestCaseSchema } = await import('../src/domain/testCase.js');
const { toStrictSchema } = await import('../src/clients/groq.js');
const { config } = await import('../src/config.js');

const SUITE = {
  summary: 'Covers password reset.',
  assumptions: [],
  changeSummary: '',
  scenarios: [
    {
      name: 'Reset',
      testCases: [
        {
          ref: '', change: 'new', title: 'Expired link is rejected', description: 'Links last 30 minutes.', kind: 'negative',
          priority: 'high', category: 'Functional', tags: ['reset'], preconditions: ['An account exists'],
          steps: [{ action: 'Open a 31-minute-old link', expected: 'An expiry error' }],
          source: { name: 'Prompt', excerpt: 'valid for 30 minutes' }, dataset: { columns: [], rows: [] },
        },
      ],
    },
  ],
};

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const BASE = agentRequestSchema.parse({ platform: 'web', prompt: 'Users reset passwords by email link valid for 30 minutes.' });

test('a Groq key selects Groq with its free-tier defaults', () => {
  assert.equal(config.generator.provider, 'groq');
  assert.equal(config.generator.model, 'openai/gpt-oss-120b');
  assert.equal(config.agent.maxTokens, 6000);
  assert.equal(config.agent.enabled, true);
});

test('a strict-schema model gets the suite schema and its answer becomes cases', async (t) => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return reply(200, { model: 'openai/gpt-oss-120b', choices: [{ message: { content: JSON.stringify(SUITE) }, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: 700 } });
  });

  const events = [];
  const result = await runAgent(BASE, (e) => events.push(e));
  const [tc] = result.testCases;
  assert.equal(tc.title, 'Expired link is rejected');
  assert.deepEqual(tc.stepResults, ['An expiry error']);
  assert.equal(editedTestCaseSchema.safeParse(tc).success, true);
  assert.deepEqual(events.filter((e) => e.type === 'stage').map((e) => e.stage), ['analyze', 'scan', 'summary', 'write']);

  const [{ url, headers, body }] = sent;
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(headers.authorization, 'Bearer gsk_test_key_for_the_suite_only');
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.max_completion_tokens, 6000);
  assert.match(body.messages[1].content, /JSON/);
});

test('strict schemas require every property and forbid extras, all the way down', () => {
  const schema = toStrictSchema({ type: 'object', properties: { a: { type: 'array', items: { type: 'object', properties: { b: { type: 'string' } } } } } });
  assert.deepEqual(schema.required, ['a']);
  assert.equal(schema.properties.a.items.additionalProperties, false);
  assert.deepEqual(schema.properties.a.items.required, ['b']);
});

test('images are refused for a text-only model before any call', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => assert.fail('no request should be sent'));
  const input = agentRequestSchema.parse({ platform: 'web', files: [{ name: 'mock.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' }] });
  await assert.rejects(runAgent(input, () => {}), /reads text only/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("Groq's limits and errors become advice", async (t) => {
  const cases = [
    [429, { error: { message: 'Rate limit reached for model. Please try again in 7.5s.' } }, /Try again in 7\.5s/],
    [413, { error: { message: 'Request too large for model in organization on tokens per minute (TPM)' } }, /too large for Groq's free tier/],
    [401, { error: { message: 'Invalid API Key' } }, /rejected the API key/],
  ];
  for (const [status, body, expected] of cases) {
    t.mock.method(globalThis, 'fetch', async () => reply(status, body));
    await assert.rejects(runAgent(BASE, () => {}), expected);
    t.mock.restoreAll();
  }
});

test('a cut-off answer reports the suite as too long', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => reply(200, { model: 'm', choices: [{ message: { content: '{"summary":"' }, finish_reason: 'length' }], usage: {} }));
  await assert.rejects(runAgent(BASE, () => {}), /too large to finish/);
});
