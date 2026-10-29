import ExcelJS from 'exceljs';
import { config } from '../config.js';
import { hasStepResults } from '../domain/caseFormat.js';

/**
 * Produces a real .xlsx workbook rather than a CSV, so the steps grid keeps
 * its column widths, wrapping and header styling when QA opens it.
 *
 * Unlike every other destination this one needs no credentials and performs
 * no network call -- the result is a file handed straight back to the
 * browser, which is why the service distinguishes `kind: 'file'`.
 *
 * Every case goes on one "Test Cases" sheet, one row per step, the layout
 * test management tools import (Jira/Xray, TestRail, Zephyr): the case's
 * fields fill its first row, and cases are banded so each reads as a block.
 * Datasets, when any case has one, go on a "Test Data" sheet.
 */

const HEADER_FILL = 'FF1F5FA8';
const BAND_FILL = 'FFF3F6FA';

const COLUMNS = [
  { header: 'ID', key: 'id', width: 10 },
  { header: 'Title', key: 'title', width: 42 },
  { header: 'Scenario', key: 'scenario', width: 26 },
  { header: 'Description', key: 'description', width: 40 },
  { header: 'Preconditions', key: 'preconditions', width: 36 },
  { header: 'Step #', key: 'step', width: 7 },
  { header: 'Step', key: 'action', width: 52 },
  { header: 'Expected result', key: 'expected', width: 48 },
  { header: 'Priority', key: 'priority', width: 10 },
  { header: 'Type', key: 'category', width: 14 },
  { header: 'Platform', key: 'platform', width: 12 },
  { header: 'Environments', key: 'environments', width: 26 },
  { header: 'Linked issues', key: 'links', width: 16 },
];

const styleHeader = (row) => {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 22;
};

const numbered = (items) => (items ?? []).map((p, i) => `${i + 1}. ${p}`).join('\n');

/** The expected result shown beside each step. */
function expectedFor(testCase, i) {
  // Agent cases expect something per step. Template cases assert only at the
  // final step, matching how a tester reads the grid: act, act, verify.
  if (hasStepResults(testCase)) return testCase.stepResults[i] ?? '';
  return i === testCase.steps.length - 1 ? numbered(testCase.expectedResults) : '';
}

function addCaseRows(sheet, testCase, id, banded) {
  const steps = testCase.steps.length ? testCase.steps : [''];
  steps.forEach((action, i) => {
    const first = i === 0;
    const row = sheet.addRow({
      id: first ? id : '',
      title: first ? testCase.title : '',
      scenario: first ? testCase.scenario ?? '' : '',
      description: first ? testCase.description ?? '' : '',
      preconditions: first ? numbered(testCase.preconditions) : '',
      step: testCase.steps.length ? i + 1 : '',
      action,
      expected: expectedFor(testCase, i),
      priority: first ? testCase.priority ?? '' : '',
      category: first ? testCase.category ?? testCase.testTypeLabel ?? '' : '',
      platform: first ? testCase.platformLabel ?? '' : '',
      environments: first ? (testCase.environments ?? []).join('\n') : '',
      links: first ? (testCase.links ?? []).join(', ') : '',
    });
    row.alignment = { wrapText: true, vertical: 'top' };
    row.getCell('step').alignment = { horizontal: 'center', vertical: 'top' };
    if (first) row.getCell('title').font = { bold: true };
    if (banded) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } };
  });
}

function addDataSheet(workbook, cases, ids) {
  const withData = cases.map((tc, i) => [tc, ids[i]]).filter(([tc]) => tc.dataset?.columns?.length);
  if (!withData.length) return;
  const sheet = workbook.addWorksheet('Test Data');
  sheet.columns = [{ width: 10 }, { width: 42 }, { width: 8 }, { width: 60 }];
  styleHeader(sheet.addRow(['ID', 'Title', 'Run', 'Values']));
  for (const [tc, id] of withData) {
    tc.dataset.rows.forEach((values, r) => {
      const row = sheet.addRow([
        r === 0 ? id : '',
        r === 0 ? tc.title : '',
        r + 1,
        tc.dataset.columns.map((c, n) => `${c} = ${values[n] ?? ''}`).join('\n'),
      ]);
      row.alignment = { wrapText: true, vertical: 'top' };
    });
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function buildWorkbook(testCases) {
  const cases = Array.isArray(testCases) ? testCases : [testCases];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Testcase Generator';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(config.excel?.sheetName || 'Test Cases');
  sheet.columns = COLUMNS;
  styleHeader(sheet.getRow(1));

  // Saved cases keep their repository key; fresh ones are numbered in order.
  const ids = cases.map((tc, i) => tc.key ?? `TC-${i + 1}`);
  cases.forEach((tc, i) => addCaseRows(sheet, tc, ids[i], i % 2 === 1));

  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  addDataSheet(workbook, cases, ids);
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
