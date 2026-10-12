import { test } from 'node:test';
import assert from 'node:assert/strict';

// Covers importing requirements from the four supported sources -- test
// plan, requirements document, backlog, existing suite -- and generating
// from the result. Config is set before the first import because config.js
// validates the environment at import time.
process.env.DESTINATIONS = 'excel';
process.env.LOG_LEVEL = 'silent';

const { parseRequirements, requirementTitle, SOURCE_LIMITS } = await import('../src/domain/requirementSources.js');
const { createFromRequirementsSchema, importRequirementsSchema, LIMITS } = await import('../src/domain/testCase.js');
const { importRequirements, previewTestCase } = await import('../src/services/testCaseService.js');

const withinLimits = (r) =>
  ['name', 'description', 'expectedResult'].every(
    (k) => r[k].length >= LIMITS[k].min && r[k].length <= LIMITS[k].max,
  );

/* ---------------- test plan ---------------- */

const TEST_PLAN = `# Checkout Test Plan

## 1. Introduction
This plan covers the checkout flow for release 4.2.

## 2. Scope
Cart, payment and confirmation.

## 3. Features to be tested
- Guest checkout with a saved address
- Apply a discount code at payment

## 4. Test Scenarios

### 4.1 Pay with a saved card
Open the cart. Click Checkout. Choose the saved Visa card. Click Pay.
Expected: The order confirmation page shows the order number.

### 4.2 Declined card
Steps:
1. Choose a card that the gateway declines
2. Click Pay
Expected result:
- An inline error explains the card was declined
- The cart is unchanged

## 5. Schedule
Two weeks starting 1 November.

## 6. Exit Criteria
No open P1 defects.
`;

test('test plan: one requirement per testable section, planning sections skipped', () => {
  const { requirements, format } = parseRequirements('testPlan', TEST_PLAN);
  assert.equal(format, 'text');
  assert.deepEqual(
    requirements.map((r) => r.name),
    [
      'Guest checkout with a saved address',
      'Apply a discount code at payment',
      'Pay with a saved card',
      'Declined card',
    ],
  );
  assert.ok(requirements.every(withinLimits));
});

test('test plan: steps and expected results are separated by their labels', () => {
  const { requirements } = parseRequirements('testPlan', TEST_PLAN);
  const saved = requirements.find((r) => r.name === 'Pay with a saved card');
  assert.match(saved.description, /Choose the saved Visa card/);
  assert.equal(saved.expectedResult, 'The order confirmation page shows the order number.');

  const declined = requirements.find((r) => r.name === 'Declined card');
  assert.equal(declined.description, 'Choose a card that the gateway declines\nClick Pay');
  assert.equal(declined.expectedResult, 'An inline error explains the card was declined\nThe cart is unchanged');
});

/* ---------------- requirements document ---------------- */

const SPEC = `3 Functional requirements
3.1 Authentication

REQ-101: The system shall lock an account after five consecutive failed sign-in attempts.
  Acceptance criteria: the sixth attempt shows "Account locked" and no session is created.
REQ-102 The system shall send a password reset link that expires after 30 minutes.

3.2 Audit
FR-7.1 - Every sign-in must be written to the audit log with the client IP.
`;

test('requirements doc: one requirement per ID, chapter headings ignored', () => {
  const { requirements } = parseRequirements('requirements', SPEC);
  assert.deepEqual(requirements.map((r) => r.ref), ['REQ-101', 'REQ-102', 'FR-7.1']);

  const [lock, reset] = requirements;
  assert.match(lock.name, /^The system shall lock an account/);
  assert.match(lock.expectedResult, /sixth attempt shows "Account locked"/);
  // No acceptance criteria: the statement itself is what must hold.
  assert.match(reset.expectedResult, /as required by REQ-102/);
  assert.ok(requirements.every(withinLimits));
});

test('requirements doc without IDs: every normative sentence is a requirement', () => {
  const prose = `The export must include every visible column. Users like exports.
The file should be named after the report. Large reports will be emailed when ready.`;
  const { requirements } = parseRequirements('requirements', prose);
  assert.equal(requirements.length, 3);
  assert.ok(requirements.every((r) => r.ref === null));
  assert.ok(!requirements.some((r) => /Users like exports/.test(r.name)));
});

/* ---------------- backlog ---------------- */

test('backlog: Jira CSV export with quoted multi-line cells', () => {
  const csv = [
    'Issue key,Issue Type,Summary,Description,Acceptance Criteria',
    'SHOP-12,Story,Save cart between sessions,"Sign in. Add two items.',
    'Sign out and sign back in.","Both items are still in the cart"',
    'SHOP-13,Story,"Show stock, per size","Open a product page, pick a size",',
  ].join('\n');

  const { requirements, format } = parseRequirements('backlog', csv);
  assert.equal(format, 'csv');
  assert.equal(requirements.length, 2);

  const [save, stock] = requirements;
  assert.equal(save.ref, 'SHOP-12');
  assert.equal(save.description, 'Sign in. Add two items.\nSign out and sign back in.');
  assert.equal(save.expectedResult, 'Both items are still in the cart');
  assert.equal(stock.name, 'Show stock, per size');
  assert.ok(stock.expectedResult.length >= LIMITS.expectedResult.min); // fell back
});

test('backlog: pasted user stories with keys and acceptance criteria', () => {
  const text = `SHOP-20 As a shopper I want to filter by price so that I find affordable items
Acceptance criteria:
- Results only include items inside the range
- The filter survives a page refresh

SHOP-21: As an admin I need to export orders as CSV`;

  const { requirements } = parseRequirements('backlog', text);
  assert.deepEqual(requirements.map((r) => r.ref), ['SHOP-20', 'SHOP-21']);
  assert.equal(requirements[0].name, 'Filter by price');
  assert.match(requirements[0].description, /^As a shopper/);
  assert.equal(
    requirements[0].expectedResult,
    'Results only include items inside the range\nThe filter survives a page refresh',
  );
  assert.equal(requirements[1].name, 'Export orders as CSV');
});

test('backlog: keyless stories split on blank lines', () => {
  const text = 'As a user I want to reset my password\n\nAs a user I want to change my email';
  const { requirements } = parseRequirements('backlog', text);
  assert.equal(requirements.length, 2);
});

/* ---------------- existing suite / acceptance criteria ---------------- */

const FEATURE = `Feature: Sign in

  Background:
    Given the sign-in page is open

  @TC-31
  Scenario: Valid credentials
    When I enter a valid email and password
    And I click Sign in
    Then the dashboard is shown
    And my name appears in the header

  Scenario Outline: Rejected credentials
    When I sign in as "<email>"
    Then the error "<message>" is shown

    Examples:
      | email        | message          |
      | bad@x.io     | Unknown account  |
      | locked@x.io  | Account locked   |
`;

test('test suite: Gherkin scenarios become requirements, Then becomes the expectation', () => {
  const { requirements, format } = parseRequirements('testSuite', FEATURE);
  assert.equal(format, 'gherkin');
  assert.equal(requirements.length, 3); // 1 scenario + 2 outline rows

  const [valid] = requirements;
  assert.equal(valid.ref, 'TC-31');
  assert.equal(
    valid.description,
    'Ensure the sign-in page is open\nI enter a valid email and password\nI click Sign in',
  );
  assert.equal(valid.expectedResult, 'the dashboard is shown\nmy name appears in the header');
});

test('test suite: a Scenario Outline expands one requirement per Examples row', () => {
  const [, bad, locked] = parseRequirements('testSuite', FEATURE).requirements;
  assert.equal(bad.name, 'Rejected credentials [email=bad@x.io, message=Unknown account]');
  assert.match(bad.description, /sign in as "bad@x.io"/);
  assert.equal(locked.expectedResult, 'the error "Account locked" is shown');
});

test('test suite: a test-management CSV export maps steps and expected columns', () => {
  const csv = 'Test Case ID;Title;Steps;Expected Result\nTC-1;Exit;Open the menu. Click Log out.;The sign-in page is shown';
  const [only] = parseRequirements('testSuite', csv).requirements;
  assert.deepEqual(only, {
    ref: 'TC-1',
    name: 'Verify Exit', // padded up to the 5-character minimum
    description: 'Open the menu. Click Log out.',
    expectedResult: 'The sign-in page is shown',
  });
});

/* ---------------- limits and the generate path ---------------- */

test('extraction is capped and duplicates are dropped', () => {
  const many = Array.from({ length: 60 }, (_, i) => `REQ-${i}: The system shall do thing ${i}.`).join('\n');
  const { requirements, truncated } = parseRequirements('requirements', `${many}\nREQ-1: The system shall do thing 1.`);
  assert.equal(requirements.length, SOURCE_LIMITS.requirements);
  assert.equal(truncated, true);
});

test('import schema rejects an unknown source and an empty document', () => {
  assert.equal(importRequirementsSchema.safeParse({ sourceType: 'email', content: TEST_PLAN }).success, false);
  assert.equal(importRequirementsSchema.safeParse({ sourceType: 'testPlan', content: '   ' }).success, false);
});

test('importRequirements reports a document with nothing recognisable as a field error', () => {
  assert.throws(
    () => importRequirements({ sourceType: 'requirements', content: 'Nothing normative in here at all.' }),
    (err) => err.status === 422 && /No requirements were found/.test(err.fieldErrors.content),
  );
});

test('every imported requirement passes the generate schema unchanged', () => {
  for (const [sourceType, content] of [['testPlan', TEST_PLAN], ['requirements', SPEC], ['testSuite', FEATURE]]) {
    const { requirements } = importRequirements({ sourceType, content });
    const parsed = createFromRequirementsSchema.safeParse({ platform: 'web', destination: 'excel', requirements });
    assert.equal(parsed.success, true, `${sourceType}: ${JSON.stringify(parsed.error?.issues)}`);
  }
});

test('preview generates per requirement, ref leading the title, in document order', async () => {
  const { requirements } = importRequirements({ sourceType: 'requirements', content: SPEC });
  const cases = await previewTestCase({ platform: 'web', destination: 'excel', requirements });

  assert.equal(cases.length, 3);
  assert.match(cases[0].title, /^\[Web\] REQ-101 The system shall lock/);
  assert.match(cases[2].title, /^\[Web\] FR-7\.1 /);
  assert.equal(requirementTitle({ ref: null, name: 'Plain' }), 'Plain');
});

test('a batch that would exceed the case limit is refused before generating', async () => {
  const requirements = Array.from({ length: 30 }, (_, i) => ({
    ref: `R-${i}`,
    name: `Requirement number ${i}`,
    description: 'Do the thing the requirement describes.',
    expectedResult: 'The thing happens',
  }));
  // 30 x (1 happy path + 3 variants) = 120 > 100
  await assert.rejects(
    previewTestCase({ platform: 'web', destination: 'excel', negativeVariants: true, requirements }),
    (err) => err.status === 422 && /would produce 120 cases/.test(err.fieldErrors.requirements),
  );
});
