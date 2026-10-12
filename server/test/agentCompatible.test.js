import { test } from 'node:test';
import assert from 'node:assert/strict';

// Covers the agent against an Anthropic-compatible endpoint (DeepSeek):
// documents travel as text, the suite comes back through a required tool
// call, Claude-only options are not sent, and a loose answer still parses.
// Config is set before the first import because config.js reads it once.
process.env.DESTINATIONS = 'excel';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic';
process.env.LOG_LEVEL = 'silent';

const { runAgent, setAgentClient } = await import('../src/domain/testCaseAgent.js');
const { agentRequestSchema, editedTestCaseSchema } = await import('../src/domain/testCase.js');
const { config } = await import('../src/config.js');

/** Replays a tool call streamed as input_json_delta, the way the endpoint answers. */
function stubClient(toolInput, { asText = false } = {}) {
  const calls = [];
  const client = {
    messages: {
      stream(params) {
        calls.push(params);
        const handlers = [];
        return {
          on(event, handler) {
            if (event === 'streamEvent') handlers.push(handler);
            return this;
          },
          async finalMessage() {
            const send = (e) => handlers.forEach((h) => h(e, {}));
            const json = JSON.stringify(toolInput);
            send({ type: 'message_start', message: {} });
            send({ type: 'content_block_start', index: 0, content_block: { type: asText ? 'text' : 'tool_use' } });
            for (let i = 0; i < json.length; i += 50) {
              const piece = json.slice(i, i + 50);
              send({ type: 'content_block_delta', index: 0, delta: asText ? { type: 'text_delta', text: piece } : { type: 'input_json_delta', partial_json: piece } });
            }
            return {
              model: 'deepseek-v4-pro',
              stop_reason: asText ? 'end_turn' : 'tool_use',
              usage: { input_tokens: 1, output_tokens: 1 },
              content: asText
                ? [{ type: 'text', text: `Here you go:\n${json}` }]
                : [{ type: 'tool_use', id: 't1', name: 'submit_test_cases', input: toolInput }],
            };
          },
        };
      },
    },
    beta: { messages: { stream: () => assert.fail('the beta endpoint must not be used for a compatible provider') } },
  };
  return { client, calls };
}

// A deliberately loose answer: missing fields, string steps.
const LOOSE = {
  summary: 'Covers password reset.',
  scenarios: [
    {
      name: 'Password reset',
      testCases: [
        { title: 'Reset link expires after 30 minutes', priority: 'High', steps: ['Request a reset', { action: 'Open the link after 31 minutes', expected: 'The link is rejected' }] },
      ],
    },
  ],
};

test('a DeepSeek base URL selects the compatible provider and a DeepSeek model', () => {
  assert.equal(config.generator.provider, 'compatible');
  assert.equal(config.generator.model, 'deepseek-v4-pro');
  assert.equal(config.agent.maxTokens, 32000);
});

test('the suite comes back through a required tool call, and a loose answer still parses', async () => {
  const { client, calls } = stubClient(LOOSE);
  setAgentClient(client);
  const events = [];
  const result = await runAgent(agentRequestSchema.parse({ platform: 'web', prompt: 'Users reset passwords by email link.' }), (e) => events.push(e));

  const [tc] = result.testCases;
  assert.equal(tc.title, 'Reset link expires after 30 minutes');
  assert.equal(tc.priority, 'high');
  assert.deepEqual(tc.steps, ['Request a reset', 'Open the link after 31 minutes']);
  assert.deepEqual(tc.stepResults, ['', 'The link is rejected']);
  assert.equal(editedTestCaseSchema.safeParse(tc).success, true);
  assert.deepEqual(events.filter((e) => e.type === 'stage').map((e) => e.stage), ['analyze', 'scan', 'summary', 'write']);

  const [params] = calls;
  assert.equal(params.tool_choice.name, 'submit_test_cases');
  assert.equal(params.tools[0].input_schema.type, 'object');
  assert.equal(params.tools[0].input_schema.$schema, undefined);
  for (const key of ['betas', 'fallbacks', 'output_config']) assert.equal(params[key], undefined, key);
});

test('attachments are sent as text, never as document blocks', async () => {
  const { client, calls } = stubClient(LOOSE);
  setAgentClient(client);
  const input = agentRequestSchema.parse({
    platform: 'web',
    files: [
      { name: 'story.md', mediaType: 'text/markdown', data: Buffer.from('As a user I reset my password').toString('base64') },
      { name: 'mock.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
    ],
  });
  await runAgent(input, () => {});
  const content = calls[0].messages[0].content;
  assert.ok(content.every((b) => b.type !== 'document'));
  assert.match(content[0].text, /<document name="story.md">\nAs a user I reset my password/);
  assert.deepEqual(content.map((b) => b.type), ['text', 'text', 'image', 'text', 'text', 'text']);
  assert.match(content.at(-1).text, /calling the submit_test_cases tool/);
  assert.ok(content.every((b) => !b.cache_control));
});

test('JSON written as text instead of a tool call is still accepted', async () => {
  setAgentClient(stubClient(LOOSE, { asText: true }).client);
  const result = await runAgent(agentRequestSchema.parse({ platform: 'web', prompt: 'Password reset' }), () => {});
  assert.equal(result.testCases.length, 1);
});

test('an unreadable PDF is refused with a message naming it', async () => {
  setAgentClient(stubClient(LOOSE).client);
  const input = agentRequestSchema.parse({ platform: 'web', files: [{ name: 'prd.pdf', mediaType: 'application/pdf', data: 'JVBERi0xLjQK' }] });
  await assert.rejects(runAgent(input, () => {}), /prd\.pdf has no readable text/);
});
