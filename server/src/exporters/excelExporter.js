import ExcelJS from 'exceljs';
import { config } from '../config.js';
import { hasStepResults } from '../domain/caseFormat.js';

/**
 * Produces a real .xlsx workbook rather than a CSV, so the steps grid keeps
 * its column widths, wrapping and header styling when QA opens it.
 *
 * Unlike every other destination this one needs no credentials and performs
 * no network call -- the result is a file handed straight back to the
 * browser, which is why the service distinguishes `kind: 'file'`. Multiple
 * generated cases become multiple sheets in one workbook.
 */

const HEADER_FILL = 'FF1F5FA8';

/** Excel sheet names are capped at 31 chars and reject []:*?/\ */
function toSheetName(testCase, index, taken) {
  const cleaned = testCase.title.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim();
  let name = cleaned.slice(0, 28) || `Case ${index + 1}`;

  // Variants of one case often share a title prefix, so collisions are the
  // norm rather than the exception.
  let suffix = 2;
  const base = name;
  while (taken.has(name.toLowerCase())) {
    name = `${base.slice(0, 28 - String(suffix).length - 1)} ${suffix}`;
    suffix += 1;
  }
  taken.add(name.toLowerCase());
  return name;
}

function addMetaRow(sheet, label, value) {
  const row = sheet.addRow([label, value]);
  row.getCell(1).font = { bold: true, color: { argb: 'FF5E6A7A' } };
  row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  return row;
}

function addSheet(workbook, testCase, index, taken) {
  const sheet = workbook.addWorksheet(toSheetName(testCase, index, taken));

  sheet.columns = [
    { key: 'a', width: 16 },
    { key: 'b', width: 72 },
    { key: 'c', width: 56 },
  ];

  addMetaRow(sheet, 'Title', testCase.title);
  if (testCase.description) addMetaRow(sheet, 'Description', testCase.description);
  if (testCase.scenario) addMetaRow(sheet, 'Scenario', testCase.scenario);
  if (testCase.priority) addMetaRow(sheet, 'Priority', testCase.priority);
  if (testCase.category) addMetaRow(sheet, 'Category', testCase.category);
  if (testCase.tags?.length) addMetaRow(sheet, 'Tags', testCase.tags.join(', '));
  addMetaRow(sheet, 'Platform', testCase.platformLabel);
  addMetaRow(sheet, 'Test type', testCase.testTypeLabel ?? '');
  addMetaRow(sheet, 'Variant', testCase.variant ?? 'happy-path');
  if (testCase.parameters) {
    addMetaRow(
      sheet,
      'Parameters',
      Object.entries(testCase.parameters).map(([k, v]) => `${k} = ${v}`).join('\n'),
    );
  }
  addMetaRow(sheet, 'Environments', testCase.environments.join('\n'));
  addMetaRow(sheet, 'Preconditions', testCase.preconditions.map((p, i) => `${i + 1}. ${p}`).join('\n'));
  sheet.addRow([]);

  const header = sheet.addRow(['Step', 'Action', 'Expected result']);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;

  testCase.steps.forEach((action, i) => {
    // Agent cases expect something per step. Template cases assert only at
    // the final step, matching how a tester reads the grid: act, act, verify.
    const isLast = i === testCase.steps.length - 1;
    const expected = hasStepResults(testCase)
      ? testCase.stepResults[i] ?? ''
      : isLast
        ? testCase.expectedResults.map((r, n) => `${n + 1}. ${r}`).join('\n')
        : '';
    const row = sheet.addRow([i + 1, action, expected]);
    row.alignment = { wrapText: true, vertical: 'top' };
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
  });

  if (testCase.dataset) {
    sheet.addRow([]);
    const dataHeader = sheet.addRow(['Run', ...testCase.dataset.columns]);
    dataHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dataHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    testCase.dataset.rows.forEach((row, i) => sheet.addRow([`Run ${i + 1}`, ...row]));
  }

  // Freeze the header so long step lists stay readable while scrolling.
  sheet.views = [{ state: 'frozen', ySplit: header.number }];
  return sheet;
}

export async function buildWorkbook(testCases) {
  const cases = Array.isArray(testCases) ? testCases : [testCases];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Test Case Generator';
  workbook.created = new Date();

  const taken = new Set();
  cases.forEach((testCase, index) => addSheet(workbook, testCase, index, taken));
  return workbook;
}

/** Filesystem-safe, readable filename derived from the first test case. */
export function toFilename(testCases) {
  const cases = Array.isArray(testCases) ? testCases : [testCases];
  const slug = cases[0].title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  const base = slug || 'test-case';
  return cases.length > 1 ? `${base}-and-${cases.length - 1}-more.xlsx` : `${base}.xlsx`;
}

export const excelExporter = {
  key: 'excel',
  label: 'Excel',
  kind: 'file',
  auth: 'none',
  describeTarget: () => 'Downloaded .xlsx workbook',

  /** A file, not a request: the UI renders the sheet grid from the case itself. */
  describeRequest: (testCase) => ({
    method: 'FILE',
    path: `${toFilename([testCase])} — generated server-side, streamed to the browser`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sheet: testCase,
  }),

  async export(testCases) {
    const workbook = await buildWorkbook(testCases);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = toFilename(testCases);

    return {
      kind: 'file',
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
      items: testCases.map((tc) => ({ ref: filename, title: tc.title })),
    };
  },
};
