import { generationConfig } from './generationConfig.js';

/**
 * Expands the fields a user types into one or more structured test cases:
 * title, preconditions, numbered steps, expected results, environments.
 *
 * Three multipliers can apply, in this order:
 *   parameters        one case per data row, with {{placeholder}} substitution
 *   negative variants one extra case per standard failure mode
 *   (test type)       shapes the steps and assertions of every case produced
 *
 * Deliberately deterministic and dependency-free -- the same input always
 * yields the same cases, which keeps it unit-testable and means no user
 * content leaves the deployment. `llmGenerator.js` implements the same
 * `generate(input)` signature for teams that would rather trade that away.
 */

/** Splits prose into sentence-sized actions, dropping empties. */
function toActions(description) {
  return (
    description
      // Explicit line breaks win; sentence splitting is the fallback, and is
      // deliberately conservative about abbreviations like "e.g.".
      .split(/\r?\n+/)
      .flatMap((line) =>
        line.includes('\n') ? [line] : line.split(/(?<=[.!?])\s+(?=[A-Z])/),
      )
      .map((s) => s.trim().replace(/^[-*\d.)\s]+/, '').trim())
      .filter((s) => s.length > 2)
  );
}

/** Normalises a sentence into an imperative step with terminal punctuation. */
function toStep(action) {
  const text = action.charAt(0).toUpperCase() + action.slice(1);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** Replaces {{column}} with the row's value for that column. */
function substitute(text, row) {
  if (!row) return text;
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(row, key) ? String(row[key]) : match,
  );
}

/** "[Web] Login works [browser=Chrome, role=admin]" */
function buildTitle({ platform, name, row, variantLabel }) {
  const parts = [`[${platform.label}] ${name}`];
  if (row) {
    const pairs = Object.entries(row).map(([k, v]) => `${k}=${v}`);
    parts.push(`[${pairs.join(', ')}]`);
  }
  if (variantLabel) parts.push(`— ${variantLabel}`);
  return parts.join(' ');
}

/**
 * Builds one test case. `variant` is null for the happy path, or one of the
 * configured negative variants.
 */
function buildCase({ platformKey, testTypeKey, name, description, expectedResult, row, variant }) {
  const platform = generationConfig.platforms[platformKey];
  const testType = generationConfig.testTypes[testTypeKey];

  const actions = toActions(substitute(description, row)).map(toStep);

  // A negative variant replays the same actions, but the last one is
  // performed under the failure condition the variant describes.
  const bodySteps = variant
    ? actions.map((step, i) =>
        i === actions.length - 1 ? `${step.replace(/\.$/, '')} ${variant.stepSuffix}.` : step,
      )
    : actions;

  const steps = [
    platform.launchStep,
    ...bodySteps,
    ...testType.extraSteps,
    'Observe the component state after the final action.',
  ];

  const expectedResults = variant
    ? [...variant.assertions, ...testType.assertions]
    : [
        toStep(substitute(expectedResult, row)),
        ...(testType.includePlatformChecks ? platform.checks : []),
        ...testType.assertions,
      ];

  return {
    title: buildTitle({ platform, name: substitute(name, row), row, variantLabel: variant?.label }),
    platform: platformKey,
    platformLabel: platform.label,
    testType: testTypeKey,
    testTypeLabel: testType.label,
    variant: variant ? variant.key : 'happy-path',
    parameters: row ?? null,
    preconditions: platform.preconditions,
    steps,
    expectedResults,
    environments: platform.environments,
  };
}

/**
 * Expands `parameters` into one row object per case, or a single null row
 * when the input is not parameterised.
 *
 * @param {{columns: string[], rows: string[][]}|null|undefined} parameters
 */
function toRows(parameters) {
  if (!parameters?.columns?.length || !parameters?.rows?.length) return [null];
  return parameters.rows.map((values) =>
    Object.fromEntries(parameters.columns.map((column, i) => [column, values[i] ?? ''])),
  );
}

/**
 * @returns {object[]} one or more test cases, happy paths first.
 */
export function generate(input) {
  const {
    platform: platformKey,
    testType: testTypeKey = 'regression',
    name,
    description,
    expectedResult,
    parameters,
    negativeVariants = false,
  } = input;

  if (!generationConfig.platforms[platformKey]) {
    throw new Error(`Unknown platform: ${platformKey}`);
  }
  const testType = generationConfig.testTypes[testTypeKey];
  if (!testType) throw new Error(`Unknown test type: ${testTypeKey}`);

  // Choosing the "negative" test type is itself a request for the variants;
  // the explicit flag stays available for the other types.
  const wantVariants = negativeVariants || testType.impliesNegativeVariants;

  const cases = [];
  for (const row of toRows(parameters)) {
    const base = { platformKey, testTypeKey, name, description, expectedResult, row };
    cases.push(buildCase({ ...base, variant: null }));

    if (wantVariants) {
      for (const variant of generationConfig.negativeVariants) {
        cases.push(buildCase({ ...base, variant }));
      }
    }
  }
  return cases;
}

/**
 * How many cases `generate(input)` will return, without generating them --
 * so a caller can refuse an oversized batch before spending LLM calls on it.
 */
export function countCases({ testType: testTypeKey = 'regression', parameters, negativeVariants = false }) {
  const testType = generationConfig.testTypes[testTypeKey];
  const rows = toRows(parameters).length;
  const variants =
    negativeVariants || testType?.impliesNegativeVariants ? generationConfig.negativeVariants.length : 0;
  return rows * (1 + variants);
}

/** Convenience for callers that only ever want the primary case. */
export const generateOne = (input) => generate(input)[0];
