import { test } from 'node:test';
import assert from 'node:assert/strict';

// config.js validates the environment at import time and the exporters read
// it. Enable every destination so each adapter is exercised.
process.env.DESTINATIONS = 'jira,confluence,excel,ado,tfs';
process.env.CLIENT_ID = 'test-client-id';
process.env.CLIENT_SECRET = 'test-client-secret';
process.env.REDIRECT_URI = 'http://localhost:4000/auth/callback';
process.env.JIRA_BASE_URL = 'https://example.atlassian.net';
process.env.JIRA_PROJECT_KEY = 'QA';
process.env.JIRA_ISSUE_TYPE = 'Test';
process.env.JIRA_DEFAULT_LABELS = 'generated,needs triage';
process.env.CONFLUENCE_SPACE_KEY = 'QADOCS';
process.env.ADO_ORG_URL = 'https://dev.azure.com/contoso';
process.env.ADO_PROJECT = 'Payments';
process.env.ADO_PAT = 'test-pat';
process.env.TFS_COLLECTION_URL = 'https://tfs.local/tfs/DefaultCollection';
process.env.TFS_PROJECT = 'Legacy';
process.env.TFS_PAT = 'test-pat';
process.env.ADO_AREA_PATH = 'Payments\\Checkout';
process.env.JIRA_EXTRA_FIELDS = '{"priority":{"name":"High"},"components":[{"name":"Checkout"}],"summary":"HIJACK"}';
process.env.ADO_EXTRA_FIELDS = '{"System.AssignedTo":"qa@example.com","System.Title":"HIJACK"}';
process.env.LOG_LEVEL = 'silent';

const { generate } = await import('../src/domain/generator.js');
const { createTestCaseSchema, toFieldErrors } = await import('../src/domain/testCase.js');
const { toIssuePayload, toAdf } = await import('../src/exporters/jiraExporter.js');
const { toStorageFormat } = await import('../src/exporters/confluenceExporter.js');
const { toStepsXml, toPatchDocument } = await import('../src/exporters/workItemExporter.js');
const { config } = await import('../src/config.js');
const { buildWorkbook, toFilename } = await import('../src/exporters/excelExporter.js');
const { listDestinations, getExporter, enabledKeys } = await import('../src/exporters/index.js');

const VALID = {
  platform: 'web',
  name: 'Login button shows a spinner while credentials verify',
  description: 'Enter a valid email and password. Click the login button.',
  expectedResult: 'A spinner replaces the button label until the response arrives',
};

const CASE = generate(VALID)[0];

/* ---------------- generator ---------------- */

test('generate turns each description sentence into a numbered step', () => {
  // launch + 2 sentences + observe
  assert.equal(CASE.steps.length, 4);
  assert.match(CASE.steps[0], /^Open the application URL/);
  assert.equal(CASE.steps[1], 'Enter a valid email and password.');
  assert.equal(CASE.steps[2], 'Click the login button.');
});

test('generate prefixes the title with the platform label', () => {
  assert.equal(generate({ ...VALID, platform: 'mobile' })[0].title, `[Mobile] ${VALID.name}`);
  assert.equal(generate({ ...VALID, platform: 'desktop' })[0].title, `[Desktop] ${VALID.name}`);
});

test('generate applies platform-specific preconditions and environments', () => {
  const mobile = generate({ ...VALID, platform: 'mobile' })[0];
  assert.match(mobile.preconditions[0], /device or emulator/);
  assert.match(CASE.preconditions[0], /deployed to the target environment/);
  assert.notDeepEqual(mobile.environments, CASE.environments);
});

test('generate is deterministic', () => {
  assert.deepEqual(generate(VALID), generate(VALID));
});

/* ---------------- validation ---------------- */

test('schema rejects an unknown platform', () => {
  const result = createTestCaseSchema.safeParse({ ...VALID, platform: 'watch' });
  assert.equal(result.success, false);
  assert.match(toFieldErrors(result.error).platform, /Platform must be one of/);
});

test('schema rejects short and whitespace-only fields', () => {
  const result = createTestCaseSchema.safeParse({ ...VALID, name: '   ', description: 'tiny' });
  assert.equal(result.success, false);

  const errors = toFieldErrors(result.error);
  assert.match(errors.name, /at least 5 characters/);
  assert.match(errors.description, /at least 10 characters/);
});

test('destination defaults to jira when omitted', () => {
  const result = createTestCaseSchema.safeParse(VALID);
  assert.equal(result.success, true);
  assert.equal(result.data.destination, 'jira');
});

/* ---------------- registry ---------------- */

test('registry exposes every enabled destination', () => {
  assert.deepEqual(enabledKeys(), ['jira', 'confluence', 'excel', 'ado', 'tfs']);

  const byKey = Object.fromEntries(listDestinations().map((d) => [d.key, d]));
  assert.equal(byKey.jira.auth, 'atlassian');
  assert.equal(byKey.confluence.auth, 'atlassian');
  assert.equal(byKey.ado.auth, 'pat');
  assert.equal(byKey.excel.auth, 'none');
  assert.equal(byKey.ado.label, 'Azure DevOps');
});

test('every exporter satisfies the destination contract', () => {
  for (const key of enabledKeys()) {
    const e = getExporter(key);
    assert.equal(typeof e.export, 'function', `${key} must export()`);
    assert.equal(typeof e.describeTarget(), 'string', `${key} must describe its target`);
    assert.ok(['issue', 'page', 'workitem', 'file'].includes(e.kind), `${key} kind`);

    // The payload view shows exactly what export would send, built by the
    // same code -- a request body for trackers, the case itself for a file.
    const request = e.describeRequest(CASE);
    assert.ok(request.method && request.path && request.contentType, `${key} describes its request`);
    assert.ok(request.body ?? request.sheet, `${key} request has a body or sheet`);
  }

  assert.deepEqual(getExporter('jira').describeRequest(CASE).body, toIssuePayload(CASE));
  assert.match(getExporter('ado').describeRequest(CASE).path, /_apis\/wit\/workitems\/\$Test%20Case\?api-version=7\.0$/);
});

test('an unknown destination is rejected, not silently defaulted', () => {
  assert.throws(() => getExporter('rally'), /not enabled/);
});

/* ---------------- jira ---------------- */

test('jira payload carries project, type, summary and platform label', () => {
  const payload = toIssuePayload(CASE);
  assert.equal(payload.fields.project.key, 'QA');
  assert.equal(payload.fields.issuetype.name, 'Test');
  assert.equal(payload.fields.summary, `[Web] ${VALID.name}`);
  assert.ok(payload.fields.labels.includes('platform-web'));
});

test('jira labels never contain whitespace and are deduplicated', () => {
  const { labels } = toIssuePayload(CASE).fields;
  assert.ok(labels.includes('needs-triage'), 'whitespace should become a hyphen');
  assert.equal(new Set(labels).size, labels.length);
});

test('jira description is ADF, not a plain string', () => {
  const adf = toAdf(CASE);
  assert.equal(adf.type, 'doc');
  assert.equal(adf.version, 1);

  const headings = adf.content.filter((n) => n.type === 'heading').map((n) => n.content[0].text);
  assert.deepEqual(headings, ['Preconditions', 'Steps', 'Expected results', 'Target environments']);
  assert.ok(adf.content.some((n) => n.type === 'orderedList'));
});

/* ---------------- confluence ---------------- */

test('confluence body is storage format with all four sections', () => {
  const html = toStorageFormat(CASE);
  for (const section of ['Preconditions', 'Steps', 'Expected results', 'Target environments']) {
    assert.ok(html.includes(`<h3>${section}</h3>`), `missing ${section}`);
  }
  assert.ok(html.includes('<ol>'), 'steps should be an ordered list');
  assert.ok(html.includes('ac:structured-macro'), 'should use a native info macro');
});

test('confluence escapes markup in user content', () => {
  const nasty = generate({ ...VALID, expectedResult: 'Shows <script>alert(1)</script> & stops' })[0];
  const html = toStorageFormat(nasty);
  assert.ok(!html.includes('<script>'), 'raw script tag must not survive');
  assert.ok(html.includes('&lt;script&gt;'));
});

/* ---------------- azure devops / tfs ---------------- */

test('work item steps XML is well formed and counts correctly', () => {
  const xml = toStepsXml(CASE);
  assert.match(xml, /^<steps id="0" last="5">/);
  assert.equal((xml.match(/<step /g) ?? []).length, CASE.steps.length);
  // Step ids start at 2; id 1 is reserved by the editor.
  assert.ok(xml.includes('<step id="2"'));
  // The final step is the one that asserts.
  assert.ok(xml.includes('type="ValidateStep"'));
  assert.equal((xml.match(/ValidateStep/g) ?? []).length, 1);
});

test('work item patch document targets the real TCM fields', () => {
  const paths = toPatchDocument(CASE).map((op) => op.path);
  assert.deepEqual(paths, [
    '/fields/System.Title',
    '/fields/System.Description',
    '/fields/Microsoft.VSTS.TCM.Steps',
    '/fields/System.Tags',
  ]);
  assert.ok(toPatchDocument(CASE).every((op) => op.op === 'add'));
});

test('ado and tfs share the adapter but differ in target', () => {
  assert.notEqual(getExporter('ado').describeTarget(), getExporter('tfs').describeTarget());
  assert.match(getExporter('ado').describeTarget(), /Payments/);
  assert.match(getExporter('tfs').describeTarget(), /Legacy/);
});

/* ---------------- excel ---------------- */

test('excel workbook has a header row and one row per step', async () => {
  const workbook = await buildWorkbook([CASE]);
  const sheet = workbook.worksheets[0];

  // Locate the header rather than assuming a row index -- the metadata rows
  // above it vary with the test case.
  let headerRow = null;
  sheet.eachRow((row) => {
    if (row.getCell(1).value === 'Step' && row.getCell(3).value === 'Expected result') headerRow = row;
  });
  assert.ok(headerRow, 'a Step/Action/Expected result header must exist');
  assert.equal(sheet.rowCount, headerRow.number + CASE.steps.length);
  assert.equal(sheet.getRow(headerRow.number + 1).getCell(2).value, CASE.steps[0]);
});

test('excel writes a real xlsx container', async () => {
  const workbook = await buildWorkbook(CASE);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  // xlsx is a zip; "PK" is the local file header signature.
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  assert.ok(buffer.length > 1000);
});

test('excel filename is slugified and safe', () => {
  assert.equal(toFilename(CASE), 'web-login-button-shows-a-spinner-while-credentials-verify.xlsx');
  assert.ok(!/[^a-z0-9.-]/.test(toFilename(CASE)));
});
