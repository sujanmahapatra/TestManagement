import { test } from 'node:test';
import assert from 'node:assert/strict';

// Covers the agent against a model on this machine (Ollama): no tools are
// sent, the prompt carries the JSON shape, and a JSON answer -- fenced in
// markdown, with fields missing -- still becomes fileable cases.
process.env.DESTINATIONS = 'excel';
process.env.ANTHROPIC_API_KEY = 'ollama';
process.env.ANTHROPIC_BASE_URL = 'http://localhost:11434';
process.env.GENERATOR_MODEL = 'qwen2.5-testgen';
process.env.LOG_LEVEL = 'silent';

const { runAgent, setAgentClient } = await import('../src/domain/testCaseAgent.js');
const { agentRequestSchema, editedTestCaseSchema } = await import('../src/domain/testCase.js');
const { config } = await import('../src/config.js');

const ANSWER = {
  summary: 'Covers password reset.',
  scenarios: [{ name: 'Reset', testCases: [{ title: 'Expired link is rejected', priority: 'high', steps: [{ action: 'Open a 31-minute-old link', expected: 'An expiry error' }] }] }],
};

function stubClient(text) {
  const calls = [];
  return {
    calls,
    client: {
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
              handlers.forEach((h) => h({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }, {}));
              handlers.forEach((h) => h({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, {}));
              return { model: 'qwen2.5-testgen', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text }] };
            },
          };
        },
      },
    },
  };
}

test('a localhost base URL is treated as a local model', () => {
  assert.equal(config.generator.provider, 'compatible');
  assert.equal(config.generator.local, true);
  assert.equal(config.generator.model, 'qwen2.5-testgen');
});

test('a local model gets no tools, the JSON shape in the prompt, and a fenced JSON answer parses', async () => {
  const { client, calls } = stubClient(`Sure!\n\`\`\`json\n${JSON.stringify(ANSWER)}\n\`\`\``);
  setAgentClient(client);
  const result = await runAgent(agentRequestSchema.parse({ platform: 'web', prompt: 'Password reset by email link' }), () => {});

  assert.equal(calls[0].tools, undefined);
  assert.equal(calls[0].tool_choice, undefined);
  assert.match(calls[0].messages[0].content.at(-1).text, /Reply with only one JSON object/);

  const [tc] = result.testCases;
  assert.equal(tc.title, 'Expired link is rejected');
  assert.deepEqual(tc.stepResults, ['An expiry error']);
  assert.equal(editedTestCaseSchema.safeParse(tc).success, true);
});
