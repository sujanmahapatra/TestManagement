import { test } from 'node:test';
import assert from 'node:assert/strict';

// Covers the generation options added on top of the base expansion: test
// types, negative variants, parameterised cases, and the per-destination
// extra-field mapping. Config is set before the first import because
// config.js validates the environment at import time.
process.env.DESTINATIONS = 'jira,excel,ado';
process.env.CLIENT_ID = 'test-client-id';
process.env.CLIENT_SECRET = 'test-client-secret';
process.env.REDIRECT_URI = 'http://localhost:4000/auth/callback';
process.env.JIRA_BASE_URL = 'https://example.atlassian.net';
process.env.JIRA_PROJECT_KEY = 'QA';
process.env.JIRA_EXTRA_FIELDS =
  '{"priority":{"name":"High"},"components":[{"name":"Checkout"}],"summary":"HIJACK"}';
process.env.ADO_ORG_URL = 'https://dev.azure.com/contoso';
process.env.ADO_PROJECT = 'Payments';
process.env.ADO_PAT = 'test-pat';
process.env.ADO_AREA_PATH = 'Payments\\Checkout';
process.env.ADO_ITERATION_PATH = 'Payments\\Sprint 12';
process.env.ADO_EXTRA_FIELDS = '{"System.AssignedTo":"qa@example.com","System.Title":"HIJACK"}';
process.env.LOG_LEVEL = 'silent';

const { generate } = await import('../src/domain/generator.js');
const { createTestCaseSchema, toFieldErrors } = await import('../src/domain/testCase.js');
const { toIssuePayload } = await import('../src/exporters/jiraExporter.js');
const { toPatchDocument } = await import('../src/exporters/workItemExporter.js');
const { buildWorkbook, toFilename } = await import('../src/exporters/excelExporter.js');
const { config } = await import('../src/config.js');

const VALID = {
  platform: 'web',
  name: 'Login button shows a spinner while credentials verify',
  description: 'Enter a valid email and password. Click the login button.',
  expectedResult: 'A spinner replaces the button label until the response arrives',
};

const CASE = generate(VALID)[0];

/* ---------------- test types ---------------- */

test('smoke omits the platform checks that regression includes', () => {
  const smoke = generate({ ...VALID, testType: 'smoke' })[0];
  const regression = generate({ ...VALID, testType: 'regression' })[0];

  assert.ok(regression.expectedResults.length > smoke.expectedResults.length);
  assert.ok(regression.expectedResults.some((r) => /keyboard navigation/.test(r)));
  assert.ok(!smoke.expectedResults.some((r) => /keyboard navigation/.test(r)));
});

test('boundary adds limit steps and limit assertions', () => {
  const boundary = generate({ ...VALID, testType: 'boundary' })[0];
  assert.ok(boundary.steps.some((s) => /minimum permitted value/.test(s)));
  assert.ok(boundary.expectedResults.some((r) => /beyond the limit are rejected/.test(r)));
  assert.equal(boundary.testTypeLabel, 'Boundary');
});

test('an unknown test type is rejected by both the generator and the schema', () => {
  assert.throws(() => generate({ ...VALID, testType: 'chaos' }), /Unknown test type/);
  assert.equal(createTestCaseSchema.safeParse({ ...VALID, testType: 'chaos' }).success, false);
});

test('platforms and test types come from the config file, not hardcoded enums', () => {
  // `tablet` and `api` exist only because generation.json defines them.
  assert.equal(generate({ ...VALID, platform: 'api' })[0].platformLabel, 'API');
  assert.match(generate({ ...VALID, platform: 'tablet' })[0].steps[0], /tablet/i);
});

/* ---------------- negative variants ---------------- */

test('negative variants produce one extra case per configured failure mode', () => {
  const cases = generate({ ...VALID, negativeVariants: true });
  assert.equal(cases.length, 4); // happy path + 3 configured variants

  assert.equal(cases[0].variant, 'happy-path');
  assert.deepEqual(
    cases.slice(1).map((c) => c.variant),
    ['invalid-input', 'interrupted', 'backend-failure'],
  );
});

test('a negative variant alters the last action and asserts on the failure', () => {
  const [, invalid] = generate({ ...VALID, negativeVariants: true });

  assert.match(invalid.title, /invalid input$/);
  // The failure condition attaches to the last body step, not the launch step.
  assert.match(invalid.steps[2], /using invalid data that fails validation/);
  assert.ok(!invalid.steps[0].includes('invalid data'));
  assert.ok(invalid.expectedResults.some((r) => /not submitted and no partial state/.test(r)));
});

test('the negative test type implies the variants without the flag', () => {
  assert.equal(generate({ ...VALID, testType: 'negative' }).length, 4);
});

/* ---------------- parameterised cases ---------------- */

const PARAMETERISED = {
  ...VALID,
  name: 'Login works for {{role}}',
  description: 'Sign in as {{role}} using {{browser}}. Click the login button.',
  expectedResult: 'The {{role}} dashboard is shown',
  parameters: {
    columns: ['role', 'browser'],
    rows: [
      ['admin', 'Chrome'],
      ['viewer', 'Firefox'],
    ],
  },
};

test('each data row becomes its own case with substitutions applied', () => {
  const cases = generate(PARAMETERISED);
  assert.equal(cases.length, 2);

  assert.equal(cases[0].title, '[Web] Login works for admin [role=admin, browser=Chrome]');
  assert.equal(cases[1].title, '[Web] Login works for viewer [role=viewer, browser=Firefox]');

  assert.ok(cases[0].steps.some((s) => s.includes('Sign in as admin using Chrome')));
  assert.ok(cases[0].expectedResults[0].includes('admin dashboard'));
  assert.deepEqual(cases[0].parameters, { role: 'admin', browser: 'Chrome' });
});

test('parameters multiply with negative variants', () => {
  // 2 rows x (1 happy path + 3 variants)
  assert.equal(generate({ ...PARAMETERISED, negativeVariants: true }).length, 8);
});

test('an unknown placeholder is left intact rather than silently blanked', () => {
  const [only] = generate({
    ...VALID,
    description: 'Sign in as {{missing}}. Click login.',
    parameters: { columns: ['role'], rows: [['admin']] },
  });
  assert.ok(only.steps.some((s) => s.includes('{{missing}}')));
});

test('schema rejects a ragged parameter table', () => {
  const parsed = createTestCaseSchema.safeParse({
    ...VALID,
    parameters: { columns: ['role', 'browser'], rows: [['admin']] },
  });
  assert.equal(parsed.success, false);
});

/* ---------------- extra field mapping ---------------- */

test('jira merges the configured extra fields', () => {
  const { fields } = toIssuePayload(CASE);
  assert.deepEqual(fields.priority, { name: 'High' });
  assert.deepEqual(fields.components, [{ name: 'Checkout' }]);
});

test('jira extra fields cannot hijack the fields the tool owns', () => {
  const { fields } = toIssuePayload(CASE);
  assert.equal(fields.summary, CASE.title);
  assert.notEqual(fields.summary, 'HIJACK');
});

test('the test type travels to the tracker as a label', () => {
  assert.ok(toIssuePayload(CASE).fields.labels.includes('type-regression'));
});

test('work item adds area path, iteration path and extra fields', () => {
  const byPath = Object.fromEntries(toPatchDocument(CASE, config.ado).map((o) => [o.path, o.value]));

  assert.equal(byPath['/fields/System.AreaPath'], 'Payments\\Checkout');
  assert.equal(byPath['/fields/System.IterationPath'], 'Payments\\Sprint 12');
  assert.equal(byPath['/fields/System.AssignedTo'], 'qa@example.com');
  assert.equal(byPath['/fields/System.Title'], CASE.title, 'title must not be overridden');
});

/* ---------------- edited test cases ---------------- */

test('an edited test case is accepted and re-validated', () => {
  const edited = { ...CASE, steps: ['Open the page.', 'Click login.'] };
  const parsed = createTestCaseSchema.safeParse({ ...VALID, testCases: [edited] });

  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data.testCases[0].steps, ['Open the page.', 'Click login.']);
});

test('an edited test case with no steps is rejected', () => {
  const parsed = createTestCaseSchema.safeParse({ ...VALID, testCases: [{ ...CASE, steps: [] }] });
  assert.equal(parsed.success, false);
  assert.ok(toFieldErrors(parsed.error).testCases);
});

test('an edited test case cannot smuggle in an unknown platform', () => {
  const parsed = createTestCaseSchema.safeParse({
    ...VALID,
    testCases: [{ ...CASE, platform: 'watch' }],
  });
  assert.equal(parsed.success, false);
});

/* ---------------- excel, multiple cases ---------------- */

test('each generated case becomes its own sheet, with legal unique names', async () => {
  const cases = generate({ ...VALID, negativeVariants: true });
  const workbook = await buildWorkbook(cases);

  assert.equal(workbook.worksheets.length, 4);

  const names = workbook.worksheets.map((s) => s.name);
  assert.equal(new Set(names).size, names.length, 'sheet names must be unique');
  assert.ok(names.every((n) => n.length <= 31), 'excel caps sheet names at 31 chars');
  assert.ok(names.every((n) => !/[[\]:*?/\\]/.test(n)), 'excel rejects these characters');
});

test('the filename reports how many cases are in the workbook', () => {
  assert.match(toFilename(generate({ ...VALID, negativeVariants: true })), /-and-3-more\.xlsx$/);
});
