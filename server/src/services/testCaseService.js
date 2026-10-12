import {
  EDIT_LIMITS,
  importRequirementsSchema,
  payloadPreviewSchema,
  requestSchemaFor,
  toFieldErrors,
} from '../domain/testCase.js';
import { generateTestCases } from '../domain/generatorStrategy.js';
import { countCases } from '../domain/generator.js';
import { parseRequirements, requirementTitle } from '../domain/requirementSources.js';
import { getExporter } from '../exporters/index.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../logger.js';

/**
 * The business-logic layer. It owns the sequence -- validate, generate (or
 * accept what the user edited), dispatch to a destination -- and knows
 * nothing about HTTP or about any particular tracker.
 */

function validate(input) {
  const parsed = requestSchemaFor(input).safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(toFieldErrors(parsed.error));
  }
  return parsed.data;
}

/** LLM calls per batch in flight at once -- enough to hide latency, not to trip a rate limit. */
const CONCURRENCY = 4;

/**
 * A single note generates directly. Imported requirements each generate as
 * their own note with the shared options, in document order -- the
 * generator never knows which path the note came from.
 */
async function generate(input) {
  const { requirements, ...shared } = input;
  if (!requirements) return generateTestCases(input);

  const total = requirements.length * countCases(shared);
  if (total > EDIT_LIMITS.cases.max) {
    throw new ValidationError({
      requirements: `${requirements.length} requirements with these options would produce ${total} cases; the limit is ${EDIT_LIMITS.cases.max}. Select fewer requirements, or turn off failure cases or parameters.`,
    });
  }

  const notes = requirements.map((r) => ({
    ...shared,
    name: requirementTitle(r),
    description: r.description,
    expectedResult: r.expectedResult,
  }));

  const results = [];
  for (let i = 0; i < notes.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(notes.slice(i, i + CONCURRENCY).map(generateTestCases))));
  }
  return results.flat();
}

export async function createTestCase(sessionId, input) {
  const { destination, testCases: edited, ...generationInput } = validate(input);
  const exporter = getExporter(destination);

  // The edit-before-file path: what the user reviewed is exactly what gets
  // filed. The payload was still re-validated field by field above, so
  // nothing is trusted merely because the generator first produced it.
  const testCases = edited ?? (await generate(generationInput));

  const result = await exporter.export(testCases, { sessionId });

  logger.info(
    {
      destination,
      kind: result.kind,
      count: testCases.length,
      edited: Boolean(edited),
      requirements: generationInput.requirements?.length,
      refs: result.items.map((i) => i.ref).slice(0, 10),
      platform: generationInput.platform,
      testType: generationInput.testType,
    },
    'test cases exported',
  );

  return { destination, label: exporter.label, result, testCases };
}

/**
 * Generates without exporting, so the UI can review and edit the cases
 * before anything is filed.
 */
export async function previewTestCase(input) {
  const { destination, testCases, ...generationInput } = validate(input);
  return generate(generationInput);
}

/**
 * Extracts requirements from a document without generating anything, so the
 * user can choose which to turn into test cases.
 */
export function importRequirements(input) {
  const parsed = importRequirementsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(toFieldErrors(parsed.error));
  }

  const { sourceType, content } = parsed.data;
  const result = parseRequirements(sourceType, content);

  if (result.requirements.length === 0) {
    throw new ValidationError({
      content: 'No requirements were found. Check the source type matches the document, or add IDs or headings to separate items.',
    });
  }

  logger.info(
    { sourceType, format: result.format, count: result.requirements.length, truncated: result.truncated },
    'requirements imported',
  );
  return { sourceType, ...result };
}

/**
 * The request a destination would send for one (possibly edited) case,
 * built by the exporter's own payload code -- so the UI's payload view can
 * never drift from what is actually filed. Sends nothing.
 */
export function describeRequest(input) {
  const parsed = payloadPreviewSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(toFieldErrors(parsed.error));
  }
  const { destination, testCase } = parsed.data;
  return getExporter(destination).describeRequest(testCase);
}
