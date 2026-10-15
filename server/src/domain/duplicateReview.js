import Anthropic from '@anthropic-ai/sdk';

import { config } from '../config.js';
import { logger } from '../logger.js';
import { groqChat } from '../clients/groq.js';
import { candidatePairs, findDuplicates, groupPairs } from './duplicates.js';

/**
 * "Review duplicates": candidate pairs come from a cheap word comparison, and
 * the AI verifies each one -- duplicates check the same behaviour, not just
 * similar words. Without an AI provider the stricter word comparison alone is
 * used, and the result says it was not verified.
 */

const SYSTEM = `You review a QA test case repository for duplicates.

Two test cases are DUPLICATES only if they verify the same behaviour: the same feature, the same conditions and inputs, the same actor, and the same expected outcome -- even when worded differently or with steps in a different order.

They are NOT duplicates when any of these differ: a condition or boundary (within a time window vs after it vs exactly at it), the actor or permission (sender vs non-sender), the data or quantity (one message vs several), the platform or environment, the expected result, or the kind of test (functional vs performance vs security).

For each candidate pair, decide duplicate true or false and give a one-sentence reason a tester would accept. Reply with JSON only:
{"pairs":[{"a":"<key>","b":"<key>","duplicate":true|false,"reason":"<one sentence>"}]}`;

const MAX_STEPS = 8;

/** One case, compactly, as the model reads it. */
const describe = (c) =>
  [
    `${c.key}: ${c.title}`,
    c.preconditions?.length ? `  Preconditions: ${c.preconditions.join('; ')}` : '',
    ...(c.steps ?? []).slice(0, MAX_STEPS).map((s, i) => `  ${i + 1}. ${s}${c.stepResults?.[i] ? ` -> ${c.stepResults[i]}` : ''}`),
    c.expectedResults?.length ? `  Expected: ${c.expectedResults.slice(0, 4).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

/** The reply's JSON, tolerating a code fence around it. */
function parseReply(text) {
  const body = String(text ?? '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  const parsed = JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body);
  return Array.isArray(parsed?.pairs) ? parsed.pairs : [];
}

async function askModel(user) {
  const g = config.generator;
  if (g.provider === 'groq') {
    const reply = await groqChat({ apiKey: g.groqApiKey ?? g.apiKey, model: g.model, system: SYSTEM, user, maxTokens: 3000 });
    return reply.text;
  }
  const client = new Anthropic({ apiKey: g.apiKey, baseURL: g.baseUrl });
  const message = await client.messages.create({
    model: g.model,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  });
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/**
 * @returns {Promise<{ verified: boolean, scanned: number, checked: number,
 *   groups: { id, similarity, keepId, caseIds, reason }[] }>}
 */
export async function reviewDuplicates(cases) {
  if (cases.length < 2) return { verified: Boolean(config.agent.enabled), scanned: cases.length, checked: 0, groups: [] };

  if (!config.agent.enabled) {
    const groups = findDuplicates(cases).map((g) => ({ ...g, reason: 'Very similar title, steps and expected results.' }));
    return { verified: false, scanned: cases.length, checked: 0, groups };
  }

  const pairs = candidatePairs(cases);
  if (pairs.length === 0) return { verified: true, scanned: cases.length, checked: 0, groups: [] };

  const involved = [...new Map(pairs.flatMap((p) => [[p.a.id, p.a], [p.b.id, p.b]])).values()];
  const user = [
    'Test cases:',
    involved.map(describe).join('\n\n'),
    '',
    'Candidate pairs to verify:',
    pairs.map((p) => `- ${p.a.key} vs ${p.b.key}`).join('\n'),
  ].join('\n');

  const verdicts = parseReply(await askModel(user));
  const byKey = new Map(pairs.map((p) => [`${p.a.key}|${p.b.key}`, p]));
  const confirmed = verdicts
    .filter((v) => v?.duplicate === true)
    .map((v) => {
      const pair = byKey.get(`${v.a}|${v.b}`) ?? byKey.get(`${v.b}|${v.a}`);
      return pair && { ...pair, reason: String(v.reason ?? '').slice(0, 400) };
    })
    .filter(Boolean);

  logger.info({ scanned: cases.length, checked: pairs.length, confirmed: confirmed.length }, 'duplicate review');
  return { verified: true, scanned: cases.length, checked: pairs.length, groups: groupPairs(confirmed) };
}
