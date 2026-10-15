import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { config } from '../config.js';
import { logger, scrubText } from '../logger.js';
import { agentFeedbackSchema, agentRequestSchema, agentSourceSchema, toFieldErrors } from '../domain/testCase.js';
import { feedbackSummary, saveFeedback } from '../domain/feedback.js';
import { runAgent } from '../domain/testCaseAgent.js';
import { fetchSource, listFigmaFrames } from '../domain/agentSources.js';
import { AppError, ValidationError } from '../utils/errors.js';

export const agentRoutes = Router();

// Each run is a long, paid model call; cap it harder than filing.
const agentLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many generation requests. Please wait a moment and retry.' },
});

/**
 * POST /api/agent/sources -- fetches a Jira issue, Confluence page or Figma
 * design as attachments for the agent. Generates nothing; the UI lists what
 * came back so the reviewer can drop any of it before generating.
 *
 * Body: { type: 'jira' | 'confluence' | 'figma', ref }   (ref: key, link or id)
 * 200 -> { success, label, attachments: [{ name, mediaType, data, size }], skipped? }
 */
agentRoutes.post('/sources', agentLimiter, async (req, res, next) => {
  try {
    const parsed = agentSourceSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(toFieldErrors(parsed.error));
    const result = await fetchSource(req.sessionId, parsed.data);
    logger.info({ type: parsed.data.type, files: result.attachments.length }, 'agent source fetched');
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/sources/figma/frames { ref } -> { fileName, maxSelect, frames: [{ id, name, width, height, preview }] }
 * The frames a Figma link offers, for the picker; imports nothing.
 */
agentRoutes.post('/sources/figma/frames', agentLimiter, async (req, res, next) => {
  try {
    const ref = typeof req.body?.ref === 'string' ? req.body.ref.trim().slice(0, 2000) : '';
    if (!ref) throw new ValidationError({ ref: 'Paste a Figma link.' });
    res.json({ success: true, ...(await listFigmaFrames(ref)) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/agent/feedback { rating: 'up' | 'down', comment?, prompt?, summary?, cases?, scenarios? } -> { success } */
agentRoutes.post('/feedback', async (req, res, next) => {
  try {
    const parsed = agentFeedbackSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(toFieldErrors(parsed.error));
    await saveFeedback(parsed.data, { model: config.generator.model });
    logger.info({ rating: parsed.data.rating }, 'agent feedback');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** GET /api/agent/feedback -> { up, down, recentDown: [{ at, prompt, comment, cases }] } */
agentRoutes.get('/feedback', async (_req, res, next) => {
  try {
    res.json({ success: true, ...(await feedbackSummary()) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/generate
 * Body: { platform, testType, prompt?, files?: [{ name, mediaType, data }],
 *         template?, categories?, priority?,
 *         instruction?, history?, current?, selectedIds? }   (the last four refine)
 *
 * Validation and availability failures answer with the usual JSON envelope.
 * Once accepted, the response is NDJSON -- one event per line:
 *   { type: 'stage', stage: 'analyze' | 'scan' | 'summary' | 'write' }
 *   { type: 'progress', drafted }
 *   { type: 'result', summary, assumptions, changeSummary, testCases, removed, truncated }
 *   { type: 'error', code, error }
 * so the UI can show what the agent is doing during a run that takes a while.
 */
agentRoutes.post('/generate', agentLimiter, async (req, res, next) => {
  if (!config.agent.enabled) {
    return next(
      new AppError('The test case agent needs ANTHROPIC_API_KEY to be set on the server.', {
        status: 503,
        code: 'agent_unavailable',
      }),
    );
  }

  const parsed = agentRequestSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError(toFieldErrors(parsed.error)));

  // Closing the tab cancels the model call rather than paying for an answer
  // nobody will read.
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  res.status(200);
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('x-accel-buffering', 'no'); // keep reverse proxies from buffering the stream
  res.flushHeaders();

  const emit = (event) => res.write(`${JSON.stringify(event)}\n`);

  try {
    const result = await runAgent(parsed.data, emit, controller.signal);
    emit({ type: 'result', ...result });
  } catch (err) {
    // Headers are already sent, so the error travels as the last event.
    // Only AppErrors describe themselves; `details` stays in the log.
    logger[err.status >= 500 ? 'error' : 'warn']({ err, code: err.code, details: scrubText(err.details) }, 'agent run failed');
    if (!controller.signal.aborted) {
      emit({
        type: 'error',
        code: err instanceof AppError ? err.code : 'agent_failed',
        error: err instanceof AppError ? err.message : 'Test case generation failed. Please try again.',
      });
    }
  }
  res.end();
});
