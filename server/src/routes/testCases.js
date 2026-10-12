import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createTestCase,
  describeRequest,
  importRequirements,
  previewTestCase,
} from '../services/testCaseService.js';
import { listDestinations } from '../exporters/index.js';
import { listPlatforms, listTestTypes, listNegativeVariants } from '../domain/generationConfig.js';
import { activeStrategy } from '../domain/generatorStrategy.js';
import { listRequirementSources } from '../domain/requirementSources.js';
import { AGENT_FILE_TYPES, AGENT_LIMITS, CATEGORIES, LANGUAGES, PRIORITIES } from '../domain/testCase.js';
import { config } from '../config.js';
import { availableSources } from '../domain/agentSources.js';
import { checkJira } from '../domain/jiraCheck.js';

export const testCaseRoutes = Router();

// Creating issues is the expensive, side-effecting path; cap it per client.
const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please wait a moment and retry.' },
});

/**
 * GET /api/options -- everything the UI needs to build its dropdowns.
 * Serving this from the server is what lets a QA lead add a platform by
 * editing config/generation.json, with no front-end change.
 */
testCaseRoutes.get('/options', (_req, res) => {
  res.json({
    success: true,
    destinations: listDestinations(),
    platforms: listPlatforms(),
    testTypes: listTestTypes(),
    negativeVariants: listNegativeVariants(),
    requirementSources: listRequirementSources(),
    generator: activeStrategy(),
    agent: {
      enabled: config.agent.enabled,
      templates: [
        { key: 'steps', label: 'Test cases (steps)' },
        { key: 'text', label: 'Test cases (text)' },
        { key: 'bdd', label: 'BDD test cases (Gherkin)' },
      ],
      categories: CATEGORIES,
      priorities: PRIORITIES,
      languages: LANGUAGES,
      fileTypes: Object.keys(AGENT_FILE_TYPES),
      maxFiles: AGENT_LIMITS.files,
      sources: availableSources(),
    },
  });
});

/**
 * GET /api/integrations/jira -- checks sign-in, project, issue type and link
 * type, and says what to fix. Sends nothing to Jira beyond reads.
 */
testCaseRoutes.get('/integrations/jira', async (req, res, next) => {
  try {
    res.json({ success: true, ...(await checkJira(req.sessionId)) });
  } catch (err) {
    next(err);
  }
});

/** Kept for compatibility with the earlier single-purpose endpoint. */
testCaseRoutes.get('/destinations', (_req, res) => {
  res.json({ success: true, destinations: listDestinations() });
});

/**
 * POST /api/create-test-case
 * Body: { platform, testType, destination, name, description, expectedResult,
 *         negativeVariants?, parameters?, testCases? }
 *   or the same with `requirements: [{ ref, name, description, expectedResult }]`
 *   in place of the three note fields (as returned by /api/import-requirements).
 *
 * 201 -> { success, destination, kind, items: [{ ref, url, title }], testCases }
 * File destinations (Excel) respond with the workbook as an attachment.
 * 4xx/5xx -> { success: false, error, code, fieldErrors? }
 */
testCaseRoutes.post('/create-test-case', writeLimiter, async (req, res, next) => {
  try {
    // No session pre-check here on purpose: the service validates the body
    // first, so a malformed request returns field errors rather than a 401
    // that hides them. A missing session surfaces from the exporter once the
    // input is known good -- and only for destinations that need one.
    const { destination, label, result, testCases } = await createTestCase(req.sessionId, req.body);

    if (result.kind === 'file') {
      // The workbook is the response body, so what was generated travels in
      // headers for the UI to report alongside the download.
      res.setHeader('content-type', result.contentType);
      res.setHeader('content-disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('x-test-case-count', String(testCases.length));
      res.setHeader('x-test-case-title', encodeURIComponent(testCases[0].title));
      res.setHeader(
        'access-control-expose-headers',
        'content-disposition, x-test-case-count, x-test-case-title',
      );
      return res.status(201).send(result.buffer);
    }

    res.status(201).json({
      success: true,
      destination,
      label,
      kind: result.kind,
      items: result.items,
      // The first reference, for the common single-case case.
      issueKey: result.items[0]?.ref,
      url: result.items[0]?.url,
      testCases,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/preview-test-case -- expands the input without exporting it. */
testCaseRoutes.post('/preview-test-case', async (req, res, next) => {
  try {
    res.json({ success: true, testCases: await previewTestCase(req.body) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/import-requirements -- extracts requirements from a test plan,
 * requirements document, backlog export or existing suite. Generates and
 * exports nothing; the UI posts the chosen ones back as `requirements`.
 *
 * Body: { sourceType, content }
 * 200 -> { success, sourceType, format, requirements: [...], truncated }
 */
testCaseRoutes.post('/import-requirements', (req, res, next) => {
  try {
    res.json({ success: true, ...importRequirements(req.body) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payload-preview -- the request a destination would send for one
 * case. Needs no credentials and sends nothing.
 *
 * Body: { destination, testCase }
 * 200 -> { success, method, path, contentType, body? , sheet? }
 */
testCaseRoutes.post('/payload-preview', (req, res, next) => {
  try {
    res.json({ success: true, ...describeRequest(req.body) });
  } catch (err) {
    next(err);
  }
});
