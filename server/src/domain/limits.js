/**
 * Length bounds for a note. Shared by the request schema and the requirement
 * importer -- an imported requirement must satisfy exactly what a typed one
 * would -- and kept apart so neither module has to import the other.
 * `web/src/domain/testCase.js` mirrors these for instant feedback.
 */
export const LIMITS = {
  name: { min: 5, max: 120 },
  description: { min: 10, max: 2000 },
  expectedResult: { min: 5, max: 1000 },
};
