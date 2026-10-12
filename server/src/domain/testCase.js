import { z } from 'zod';
import { PLATFORM_KEYS, TEST_TYPE_KEYS } from './generationConfig.js';
import { LIMITS } from './limits.js';
import { SOURCE_KEYS, SOURCE_LIMITS } from './requirementSources.js';

/**
 * The source of truth for what a valid request looks like.
 * `web/src/domain/testCase.js` mirrors these bounds for instant client-side
 * feedback; this module is the authority and re-validates every request.
 */
export { LIMITS };

/** Bounds for an edited test case coming back from the UI. */
export const EDIT_LIMITS = {
  line: { min: 1, max: 600 },
  steps: { min: 1, max: 60 },
  list: { max: 40 },
  cases: { max: 100 },
};

export const PARAMETER_LIMITS = { columns: 10, rows: 25, value: 200 };

const trimmed = (field, { min, max }) =>
  z
    .string({ required_error: `${field} is required.`, invalid_type_error: `${field} must be text.` })
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(min, `${field} must be at least ${min} characters.`)
        .max(max, `${field} must be at most ${max} characters.`),
    );

const platformField = z
  .string({ required_error: 'Platform is required.' })
  .refine((v) => PLATFORM_KEYS.includes(v), {
    message: `Platform must be one of: ${PLATFORM_KEYS.join(', ')}.`,
  });

const testTypeField = z
  .string()
  .default('regression')
  .refine((v) => TEST_TYPE_KEYS.includes(v), {
    message: `Test type must be one of: ${TEST_TYPE_KEYS.join(', ')}.`,
  });

/**
 * A data table that multiplies one note into several cases. Columns name the
 * {{placeholders}} used in the free-text fields.
 */
const parametersSchema = z
  .object({
    columns: z
      .array(z.string().regex(/^[\w.-]+$/, 'Parameter names may use letters, digits, dot, dash and underscore.'))
      .max(PARAMETER_LIMITS.columns, `At most ${PARAMETER_LIMITS.columns} parameters are supported.`),
    rows: z
      .array(z.array(z.string().max(PARAMETER_LIMITS.value)))
      .max(PARAMETER_LIMITS.rows, `At most ${PARAMETER_LIMITS.rows} data rows are supported.`),
  })
  .refine((p) => p.rows.every((r) => r.length === p.columns.length), {
    message: 'Every data row must have one value per parameter.',
  })
  .optional();

const line = z.string().trim().min(EDIT_LIMITS.line.min).max(EDIT_LIMITS.line.max);

/** Severity buckets the agent assigns and the trackers can show. */
export const PRIORITIES = ['critical', 'high', 'medium', 'low'];

export const DATASET_LIMITS = { columns: 10, rows: 25, value: 200 };

const datasetSchema = z
  .object({
    columns: z.array(z.string().trim().min(1).max(40)).min(1).max(DATASET_LIMITS.columns),
    rows: z.array(z.array(z.string().max(DATASET_LIMITS.value))).min(1).max(DATASET_LIMITS.rows),
  })
  .refine((d) => d.rows.every((r) => r.length === d.columns.length), {
    message: 'Every dataset row must have one value per column.',
  });

/**
 * An edited test case posted back by the UI. Every string is re-validated --
 * the client may have changed any of it, so none of it is trusted because
 * the generator originally produced it.
 */
export const editedTestCaseSchema = z.object({
  title: line,
  platform: platformField,
  platformLabel: z.string().trim().min(1).max(60),
  testType: testTypeField,
  testTypeLabel: z.string().trim().min(1).max(60).default('Regression'),
  variant: z.string().trim().max(60).default('happy-path'),
  parameters: z.record(z.string().max(PARAMETER_LIMITS.value)).nullable().default(null),
  preconditions: z.array(line).max(EDIT_LIMITS.list.max),
  steps: z.array(line).min(EDIT_LIMITS.steps.min, 'A test case needs at least one step.').max(EDIT_LIMITS.steps.max),
  expectedResults: z.array(line).min(1, 'A test case needs at least one expected result.').max(EDIT_LIMITS.list.max),
  environments: z.array(line).max(EDIT_LIMITS.list.max),

  // Written by the test case agent; absent on template-generated cases, so
  // every one defaults to "not set" and the exporters skip it.
  description: z.string().trim().max(LIMITS.description.max).default(''),
  priority: z.enum(PRIORITIES).nullable().default(null),
  category: z.string().trim().max(40).nullable().default(null),
  scenario: z.string().trim().max(160).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  // The expected result of each step, index-aligned with `steps`. Empty
  // strings are allowed: not every step asserts something.
  stepResults: z.array(z.string().trim().max(EDIT_LIMITS.line.max)).max(EDIT_LIMITS.steps.max).default([]),
  // Test data the case runs with, one run per row ("Include datasets").
  dataset: datasetSchema.nullable().default(null),
  // Jira issues this case tests (the stories it was generated from); filing
  // to Jira links the new issue to each.
  links: z.array(z.string().trim().regex(/^[A-Z][A-Z0-9_]+-\d+$/, 'Links must be Jira issue keys such as QA-12.')).max(10).default([]),
});

/**
 * `destination` is validated here only as a well-formed key; whether that
 * destination is enabled on this deployment is the registry's decision.
 *
 * `testCases` is the edit-before-file path: when present it replaces
 * generation entirely, so what the user reviewed is exactly what is filed.
 */
export const createTestCaseSchema = z.object({
  platform: platformField,
  testType: testTypeField,
  destination: z
    .string()
    .regex(/^[a-z][a-z0-9_-]*$/, 'Destination is not a valid key.')
    .default('jira'),
  negativeVariants: z.coerce.boolean().default(false),
  parameters: parametersSchema,
  name: trimmed('Test case name', LIMITS.name),
  description: trimmed('Description', LIMITS.description),
  expectedResult: trimmed('Expected result', LIMITS.expectedResult),
  testCases: z.array(editedTestCaseSchema).min(1).max(EDIT_LIMITS.cases.max).optional(),
});

/** POST /api/import-requirements: a document to extract requirements from. */
export const importRequirementsSchema = z.object({
  sourceType: z
    .string({ required_error: 'Source type is required.' })
    .refine((v) => SOURCE_KEYS.includes(v), {
      message: `Source type must be one of: ${SOURCE_KEYS.join(', ')}.`,
    }),
  content: z
    .string({ required_error: 'Paste or upload the document content.' })
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(10, 'The document is empty or too short to contain a requirement.')
        .max(SOURCE_LIMITS.content, `The document must be at most ${SOURCE_LIMITS.content.toLocaleString('en')} characters.`),
    ),
});

/**
 * One imported requirement, as the UI posts it back after the user picks
 * which to keep. Re-validated like any typed note -- the user may have
 * edited it, and nothing is trusted because the importer produced it.
 */
const requirementSchema = z.object({
  ref: z.string().trim().max(40).nullable().default(null),
  name: trimmed('Requirement name', LIMITS.name),
  description: trimmed('Requirement description', LIMITS.description),
  expectedResult: trimmed('Requirement expected result', LIMITS.expectedResult),
});

/**
 * The import path: the same options as a single note, but the note fields
 * are replaced by a list of requirements, each generated in turn.
 */
export const createFromRequirementsSchema = createTestCaseSchema
  .omit({ name: true, description: true, expectedResult: true })
  .extend({
    requirements: z
      .array(requirementSchema)
      .min(1, 'Select at least one requirement.')
      .max(SOURCE_LIMITS.requirements, `At most ${SOURCE_LIMITS.requirements} requirements per request.`),
  });

/**
 * The agent path: cases the agent wrote and the reviewer approved, filed as
 * they are. There is no note to generate from, so none is required.
 */
export const fileCasesSchema = createTestCaseSchema
  .pick({ destination: true })
  .extend({
    testCases: z.array(editedTestCaseSchema).min(1, 'Select at least one test case.').max(EDIT_LIMITS.cases.max),
  });

/**
 * Picks the schema by request shape: a `requirements` list means the import
 * path, and `testCases` with no note means the agent's approved cases.
 */
export function requestSchemaFor(input) {
  if (!input || typeof input !== 'object') return createTestCaseSchema;
  if ('requirements' in input) return createFromRequirementsSchema;
  if ('testCases' in input && !('name' in input)) return fileCasesSchema;
  return createTestCaseSchema;
}

/** Maps a ZodError onto `{ field: message }` for the form to consume. */
export function toFieldErrors(zodError) {
  const flat = zodError.flatten().fieldErrors;
  const fields = Object.fromEntries(
    Object.entries(flat)
      .filter(([, messages]) => messages?.length)
      .map(([field, messages]) => [field, messages[0]]),
  );

  // Nested issues (a bad step inside testCases[2]) have no top-level field,
  // so surface them against the array they came from rather than losing them.
  for (const issue of zodError.issues) {
    const [head] = issue.path;
    if (head && !fields[head]) fields[head] = issue.message;
  }
  return fields;
}

/* ---------------- the test case agent ---------------- */

/** What kind of quality a case checks -- independent of smoke/regression. */
export const CATEGORIES = ['Functional', 'UI/UX', 'Security', 'Performance', 'Compatibility', 'Accessibility'];

/** Output shapes the agent can write in. */
export const TEMPLATES = ['steps', 'text', 'bdd'];

/** Languages the agent writes test cases in. The requirement may be in any language. */
export const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Polish',
  'Japanese', 'Korean', 'Chinese (Simplified)', 'Hindi', 'Arabic', 'Turkish',
];

/**
 * Attachments travel base64-encoded in JSON. Claude reads images and PDFs
 * natively; text formats are decoded and passed as plain-text documents.
 */
export const AGENT_FILE_TYPES = {
  'image/png': { kind: 'image', maxBytes: 5 * 1024 * 1024 },
  'image/jpeg': { kind: 'image', maxBytes: 5 * 1024 * 1024 },
  'image/gif': { kind: 'image', maxBytes: 5 * 1024 * 1024 },
  'image/webp': { kind: 'image', maxBytes: 5 * 1024 * 1024 },
  'application/pdf': { kind: 'pdf', maxBytes: 25 * 1024 * 1024 },
  'text/plain': { kind: 'text', maxBytes: 1024 * 1024 },
  'text/markdown': { kind: 'text', maxBytes: 1024 * 1024 },
  'text/csv': { kind: 'text', maxBytes: 1024 * 1024 },
  // Office formats are converted to text on the server (officeText.js).
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'docx', maxBytes: 25 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'pptx', maxBytes: 10 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'xlsx', maxBytes: 10 * 1024 * 1024 },
};

export const AGENT_LIMITS = {
  // Uploads are capped at 5 in the UI; Jira attachments and Figma frames
  // fetched as context count toward this larger total.
  files: 25,
  prompt: 20_000,
  instruction: 2_000,
  // Under the API's 32 MB request cap once the prompt and cases are added.
  totalBytes: 28 * 1024 * 1024,
};

/** Decoded size of a base64 string, without decoding it. */
const base64Bytes = (data) => Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);

const agentFileSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mediaType: z.string().refine((t) => t in AGENT_FILE_TYPES, {
      message: 'Supported files are PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), PNG, JPEG, GIF, WebP, plain text, Markdown and CSV.',
    }),
    data: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'File data must be base64.'),
  })
  .superRefine((file, ctx) => {
    const limit = AGENT_FILE_TYPES[file.mediaType]?.maxBytes;
    if (limit && base64Bytes(file.data) > limit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${file.name} is larger than ${Math.round(limit / 1024 / 1024)} MB.`,
      });
    }
  });

/** A case as the agent returned it and the reviewer may have edited it. */
export const agentCaseSchema = editedTestCaseSchema.extend({
  id: z.string().trim().min(1).max(40),
  kind: z.enum(['positive', 'negative', 'edge']).default('positive'),
  source: z
    .object({ name: z.string().max(200), excerpt: z.string().max(600) })
    .nullable()
    .default(null),
});

/**
 * POST /api/agent/generate. A first run sends `prompt` and/or `files`; a
 * refinement also sends the `current` cases and an `instruction`, scoped to
 * `selectedIds` when the reviewer ticked some.
 */
export const agentRequestSchema = z
  .object({
    platform: platformField,
    testType: testTypeField,
    prompt: z.string().trim().max(AGENT_LIMITS.prompt, `The prompt must be at most ${AGENT_LIMITS.prompt.toLocaleString('en')} characters.`).default(''),
    files: z.array(agentFileSchema).max(AGENT_LIMITS.files, `Attach at most ${AGENT_LIMITS.files} files.`).default([]),
    template: z.enum(TEMPLATES).default('steps'),
    categories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length).default([]),
    // The priorities the agent may use; all four (the default) means it chooses.
    priorities: z.array(z.enum(PRIORITIES)).min(1, 'Select at least one priority.').max(PRIORITIES.length).default(PRIORITIES),
    language: z.enum(LANGUAGES).default('English'),
    datasets: z.boolean().default(false),
    // Repository folders whose cases the agent should know about, so it does not repeat them.
    contextFolderIds: z.array(z.string().max(40)).max(20).default([]),
    // Look through every saved case for related ones, as extra context.
    scanRepository: z.boolean().default(true),
    // Refinement: accepted cases are kept as they are; rejected ones must not come back.
    lockedIds: z.array(z.string().max(40)).max(EDIT_LIMITS.cases.max).default([]),
    rejectedTitles: z.array(z.string().max(600)).max(200).default([]),
    instruction: z.string().trim().min(3, 'Describe how to refine the cases.').max(AGENT_LIMITS.instruction).optional(),
    history: z.array(z.string().max(AGENT_LIMITS.instruction)).max(20).default([]),
    current: z.array(agentCaseSchema).max(EDIT_LIMITS.cases.max).optional(),
    selectedIds: z.array(z.string().max(40)).max(EDIT_LIMITS.cases.max).default([]),
  })
  .superRefine((input, ctx) => {
    if (!input.prompt && input.files.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prompt'], message: 'Describe the requirement or attach a file.' });
    }
    if (Boolean(input.instruction) !== Boolean(input.current?.length)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['instruction'], message: 'A refinement needs both the current cases and an instruction.' });
    }
    const total = input.files.reduce((sum, f) => sum + base64Bytes(f.data), 0);
    if (total > AGENT_LIMITS.totalBytes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['files'], message: `Attachments total more than ${AGENT_LIMITS.totalBytes / 1024 / 1024} MB.` });
    }
  });

/* ---------------- the repository ---------------- */

const folderName = z.string({ required_error: 'Name the folder.' }).trim().min(1, 'Name the folder.').max(120);

/** A case as the repository keeps it: a fileable case plus where it came from. */
export const repositoryCaseSchema = editedTestCaseSchema.extend({
  kind: z.enum(['positive', 'negative', 'edge']).default('positive'),
  source: z.object({ name: z.string().max(200), excerpt: z.string().max(600) }).nullable().default(null),
  generatedBy: z.string().max(40).optional(),
});

export const createFolderSchema = z.object({ name: folderName, parentId: z.string().max(40).nullable().default(null) });
export const renameFolderSchema = z.object({ name: folderName });

export const addCasesSchema = z.object({
  folderId: z.string({ required_error: 'Choose a destination folder.' }).max(40),
  subfolders: z.boolean().default(false),
  testCases: z.array(repositoryCaseSchema).min(1, 'Select at least one test case.').max(EDIT_LIMITS.cases.max),
});

export const updateCaseSchema = z.object({ testCase: repositoryCaseSchema });
export const caseIdsSchema = z.object({ ids: z.array(z.string().max(40)).min(1, 'Select at least one test case.').max(5000) });
export const moveCasesSchema = caseIdsSchema.extend({ folderId: z.string().max(40) });

/** POST /api/agent/sources: where to fetch a requirement from. */
export const agentSourceSchema = z.object({
  type: z.enum(['jira', 'confluence', 'figma'], { errorMap: () => ({ message: 'Choose Jira, Confluence or Figma.' }) }),
  ref: z.string({ required_error: 'Enter a key or paste a link.' }).trim().min(1, 'Enter a key or paste a link.').max(2000),
});

/** POST /api/payload-preview: one case and the destination to render it for. */
export const payloadPreviewSchema = z.object({
  destination: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'Destination is not a valid key.'),
  testCase: editedTestCaseSchema,
});
