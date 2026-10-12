/**
 * Client-side mirror of the server's bounds. It exists so the form can give
 * immediate feedback; the server re-validates every request and remains the
 * authority.
 *
 * Platforms and test types are NOT mirrored -- they are served from
 * /api/options, which is what lets a QA lead add a platform by editing
 * config/generation.json without a front-end change.
 */
export const LIMITS = {
  name: { min: 5, max: 120 },
  description: { min: 10, max: 2000 },
  expectedResult: { min: 5, max: 1000 },
};

/** Mirrors SOURCE_LIMITS in server/src/domain/requirementSources.js. */
export const SOURCE_LIMITS = { content: 100_000 };

/**
 * `mode` picks where the note comes from: typed by hand, or imported from a
 * document as a list of `requirements` the user selects from.
 */
export const EMPTY_FORM = {
  destination: 'jira',
  platform: 'web',
  testType: 'regression',
  negativeVariants: false,
  parameters: { columns: [], rows: [] },
  mode: 'note',
  name: '',
  description: '',
  expectedResult: '',
  sourceType: 'testPlan',
  sourceContent: '',
  requirements: [],
};

/** The extracted requirements the user has kept ticked. */
export const selectedRequirements = (form) => (form.requirements ?? []).filter((r) => r.selected);

const LABELS = {
  name: 'Test case name',
  description: 'Description',
  expectedResult: 'Expected result',
};

function checkField(key, value) {
  const { min, max } = LIMITS[key];
  const text = (value ?? '').trim();
  if (!text) return `${LABELS[key]} is required.`;
  if (text.length < min) return `${LABELS[key]} must be at least ${min} characters.`;
  if (text.length > max) return `${LABELS[key]} must be at most ${max} characters.`;
  return null;
}

/** @returns {Record<string, string>} field -> first error message */
export function validateTestCase(form) {
  const errors = {};

  if (form.mode === 'import') {
    if (selectedRequirements(form).length === 0) {
      errors.requirements = form.requirements?.length
        ? 'Select at least one requirement.'
        : 'Extract requirements from a document first.';
    }
  } else {
    for (const key of Object.keys(LIMITS)) {
      const message = checkField(key, form[key]);
      if (message) errors[key] = message;
    }
  }

  const { columns = [], rows = [] } = form.parameters ?? {};
  if (columns.length > 0) {
    if (columns.some((c) => !c.trim())) {
      errors.parameters = 'Every parameter needs a name.';
    } else if (rows.length === 0) {
      errors.parameters = 'Add at least one data row, or remove the parameters.';
    }
  }
  return errors;
}

/**
 * Drops an empty parameter table so the server sees no `parameters` key at
 * all rather than an empty one it would have to special-case.
 */
export function toRequest(form) {
  const {
    parameters, mode, sourceType, sourceContent, requirements,
    name, description, expectedResult, ...options
  } = form;

  // The server picks its schema by shape, so send exactly one of: the three
  // note fields, or the selected requirements.
  const rest =
    mode === 'import'
      ? {
          ...options,
          requirements: selectedRequirements(form).map(({ ref, name: n, description: d, expectedResult: e }) => ({
            ref, name: n, description: d, expectedResult: e,
          })),
        }
      : { ...options, name, description, expectedResult };

  const columns = (parameters?.columns ?? []).filter((c) => c.trim());

  if (columns.length === 0 || (parameters?.rows ?? []).length === 0) return rest;
  return { ...rest, parameters: { columns, rows: parameters.rows } };
}

/** Character counter helper for the form's helper text. */
export function counter(key, value) {
  return `${(value ?? '').trim().length} / ${LIMITS[key].max}`;
}

/** How many cases the current options will produce, for the submit button. */
export function expectedCaseCount(form, testTypes, variantCount) {
  const rows = Math.max((form.parameters?.rows ?? []).length, 1);
  const type = testTypes.find((t) => t.key === form.testType);
  const variants = form.negativeVariants || type?.impliesNegativeVariants ? variantCount : 0;
  const notes = form.mode === 'import' ? selectedRequirements(form).length : 1;
  return notes * rows * (1 + variants);
}
