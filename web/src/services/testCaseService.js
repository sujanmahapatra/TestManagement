import { api, ApiError } from '../api/client';
import { SOURCE_LIMITS, validateTestCase, toRequest } from '../domain/testCase';
import { toFileable } from '../domain/agent';

/**
 * Business logic for the form: validate first, then submit. Components call
 * this and never touch the API module directly, so the validate-then-send
 * rule cannot be bypassed by a new caller.
 */

export class FormInvalidError extends Error {
  constructor(fieldErrors) {
    super('Please correct the highlighted fields.');
    this.name = 'FormInvalidError';
    this.fieldErrors = fieldErrors;
  }
}

async function guarded(form, call) {
  const fieldErrors = validateTestCase(form);
  if (Object.keys(fieldErrors).length > 0) {
    throw new FormInvalidError(fieldErrors);
  }
  return call(toRequest(form));
}

/** @returns {Promise<{issueKey: string, url: string, testCase: object}>} */
export const submitTestCase = (form) => guarded(form, api.createTestCase);

/** Expands the form into a structured test case without filing an issue. */
export const previewTestCase = (form) =>
  guarded(form, api.previewTestCase).then((r) => r.testCases);

/**
 * Extracts requirements from a pasted or uploaded document. Each comes back
 * ticked, so the default is "generate from all of them".
 */
export async function importRequirements({ sourceType, sourceContent }) {
  if (!sourceContent.trim()) {
    throw new FormInvalidError({ sourceContent: 'Paste the document or choose a file first.' });
  }
  if (sourceContent.length > SOURCE_LIMITS.content) {
    throw new FormInvalidError({
      sourceContent: `The document must be at most ${SOURCE_LIMITS.content.toLocaleString()} characters.`,
    });
  }
  const result = await api.importRequirements({ sourceType, content: sourceContent }).catch((err) => {
    // The wire field is `content`; the form calls it `sourceContent`.
    if (err instanceof ApiError && err.fieldErrors.content) {
      const { content, ...others } = err.fieldErrors;
      err.fieldErrors = { ...others, sourceContent: content };
    }
    throw err;
  });
  return { ...result, requirements: result.requirements.map((r) => ({ ...r, selected: true })) };
}

/**
 * Files the agent's cases the reviewer approved. There is no note to
 * validate -- only that something was selected; the server re-validates
 * every field of every case.
 */
export async function fileApprovedCases({ destination, testCases }) {
  if (!testCases?.length) {
    throw new FormInvalidError({ testCases: 'Select at least one test case to add.' });
  }
  return api.createTestCase({ destination, testCases: testCases.map(toFileable) });
}

export { ApiError };
