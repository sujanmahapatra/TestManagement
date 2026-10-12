import { config } from '../config.js';
import { generate as templateGenerate } from './generator.js';

/**
 * Selects the generation strategy once, at boot. Both strategies satisfy the
 * same `generate(input) -> testCase[]` contract, so nothing downstream --
 * the service, the exporters, the UI -- knows which one is in use.
 *
 * The LLM module is imported lazily so a template-only deployment never
 * loads the Anthropic SDK or needs an API key present.
 */
let llmGenerate;

async function resolve() {
  if (config.generator.strategy !== 'llm') return templateGenerate;
  if (!llmGenerate) {
    ({ generate: llmGenerate } = await import('./llmGenerator.js'));
  }
  return llmGenerate;
}

/** @returns {Promise<object[]>} one or more generated test cases. */
export async function generateTestCases(input) {
  const generate = await resolve();
  return generate(input);
}

export const activeStrategy = () => config.generator.strategy;
