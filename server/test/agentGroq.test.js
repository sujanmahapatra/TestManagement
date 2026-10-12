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

/** An OpenAI-style event stream: reasoning first, then the answer in pieces. */
function sse(reasoning, content, finish = 'stop') {
  const chunks = [
    ...reasoning.map((r) => ({ model: 'openai/gpt-oss-120b', choices: [{ delta: { reasoning: r } }] })),
    ...content.match(/.{1,40}/gs).map((c) => ({ model: 'openai/gpt-oss-120b', choices: [{ delta: { content: c } }] })),
    { choices: [{ delta: {}, finish_reason: finish }], x_groq: { usage: { prompt_tokens: 900, completion_tokens: 700 } } },
  ];
  return new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

test('the reply streams live reasoning and drafted cases, and becomes fileable cases', async (t) => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return sse(['Reading the requirement. ', 'Links expire after 30 minutes.'], JSON.stringify(SUITE));
  });

  const events = [];
  const result = await runAgent(BASE, (e) => events.push(e));
  const [tc] = result.testCases;
  assert.equal(tc.title, 'Expired link is rejected');
  assert.deepEqual(tc.stepResults, ['An expiry error']);
  assert.equal(editedTestCaseSchema.safeParse(tc).success, true);
  assert.deepEqual(events.filter((e) => e.type === 'stage').map((e) => e.stage), ['analyze', 'scan', 'summary', 'write']);
  assert.equal(events.filter((e) => e.type === 'reasoning').map((e) => e.text).join(''), 'Reading the requirement. Links expire after 30 minutes.');
  assert.equal(events.find((e) => e.type === 'context').scanned >= 0, true);

  assert.equal(sent.length, 1);
  const [{ url, headers, body }] = sent;
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(headers.authorization, 'Bearer gsk_test_key_for_the_suite_only');
  assert.equal(body.stream, true);
  assert.equal(body.include_reasoning, true);
  assert.equal(body.response_format, undefined);
  assert.equal(body.max_completion_tokens, 6000);
  assert.match(body.messages[1].content, /Reply with only one JSON object/);
});

test('an unreadable streamed answer is retried once with the strict schema', async (t) => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    return body.stream
      ? sse([], 'Here are your tests: none, sorry')
      : reply(200, { model: 'openai/gpt-oss-120b', choices: [{ message: { content: JSON.stringify(SUITE) }, finish_reason: 'stop' }], usage: {} });
  });
  const result = await runAgent(BASE, () => {});
  assert.equal(result.testCases.length, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].response_format.type, 'json_schema');
  assert.equal(sent[1].response_format.json_schema.strict, true);
  assert.equal(sent[1].response_format.json_schema.schema.additionalProperties, false);
});

test('with a written requirement, screenshots are skipped with a notice', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => sse([], JSON.stringify(SUITE)));
  const events = [];
  const input = agentRequestSchema.parse({ platform: 'web', prompt: 'Password reset', files: [{ name: 'mock.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' }] });
  const result = await runAgent(input, (e) => events.push(e));
  assert.equal(result.testCases.length, 1);
  assert.match(events.find((e) => e.type === 'notice').message, /1 image was skipped/);
});

test('strict schemas require every property and forbid extras, all the way down', () => {
  const schema = toStrictSchema({ type: 'object', properties: { a: { type: 'array', items: { type: 'object', properties: { b: { type: 'string' } } } } } });
  assert.deepEqual(schema.required, ['a']);
  assert.equal(schema.properties.a.items.additionalProperties, false);
  assert.deepEqual(schema.properties.a.items.required, ['b']);
});

test('images alone are refused for a text-only model before any call', async (t) => {
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
  t.mock.method(globalThis, 'fetch', async () => sse([], '{"summary":"', 'length'));
  await assert.rejects(runAgent(BASE, () => {}), /too large to finish/);
});
