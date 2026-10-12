/**
 * How a case's steps pair with expected results, shared by every exporter so
 * the trackers cannot disagree about it.
 *
 * Template cases assert only at the end: every expected result belongs to
 * the final step. Agent cases carry `stepResults`, one expectation per step,
 * and those win whenever any is present.
 */

export const hasStepResults = (testCase) => (testCase.stepResults ?? []).some((r) => r && r.trim());

/** The expected result for step `index`, or '' when that step asserts nothing. */
export function expectedForStep(testCase, index) {
  if (hasStepResults(testCase)) return testCase.stepResults[index] ?? '';
  return index === testCase.steps.length - 1 ? testCase.expectedResults.join(' ') : '';
}

/** "Action — Expected: result" for list-shaped destinations (Jira, Confluence). */
export function stepLines(testCase) {
  if (!hasStepResults(testCase)) return testCase.steps;
  return testCase.steps.map((step, i) => {
    const expected = testCase.stepResults[i];
    return expected ? `${step} — Expected: ${expected}` : step;
  });
}

/** One line per dataset row: "email = a@b.com · role = admin". Empty without a dataset. */
export function datasetLines(testCase) {
  const { columns, rows } = testCase.dataset ?? { columns: [], rows: [] };
  return rows.map((row, i) => `Run ${i + 1}: ${columns.map((c, j) => `${c} = ${row[j] ?? ''}`).join(' · ')}`);
}

/** "Priority: High · Category: Functional · Scenario: Login", or null when none are set. */
export function metaLine(testCase) {
  const parts = [
    testCase.priority && `Priority: ${testCase.priority.charAt(0).toUpperCase()}${testCase.priority.slice(1)}`,
    testCase.category && `Category: ${testCase.category}`,
    testCase.scenario && `Scenario: ${testCase.scenario}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
