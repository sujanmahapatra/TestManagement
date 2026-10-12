import { Router } from 'express';
import { buildConsentUrl, exchangeCode, isConnected } from '../clients/atlassianAuth.js';
import { config } from '../config.js';
import { listDestinations, needsAtlassianAuth } from '../exporters/index.js';
import * as store from '../clients/tokenStore.js';
import { logger } from '../logger.js';
import { SESSION_COOKIE, cookieOptions } from '../middleware/session.js';

export const authRoutes = Router();

/**
 * GET /auth/status -- tells the UI which destinations exist and whether the
 * Atlassian session needed by some of them is live. Destinations using a PAT
 * or no auth at all are always ready.
 */
authRoutes.get('/status', (req, res) => {
  res.json({
    connected: isConnected(req.sessionId),
    authRequired: needsAtlassianAuth(),
    destinations: listDestinations(),
  });
});

/** GET /auth/login -- step 1: redirect the browser to Atlassian consent. */
authRoutes.get('/login', (req, res) => {
  // Mint a session id now if the browser does not have one yet, so the
  // callback can be tied back to this browser.
  let sessionId = req.sessionId;
  if (!sessionId) {
    sessionId = store.newId();
    res.cookie(SESSION_COOKIE, sessionId, cookieOptions());
  }

  const state = store.newId();
  store.rememberState(state, sessionId);
  res.redirect(buildConsentUrl(state));
});

/** GET /auth/callback -- step 2: exchange the code, then return to the app. */
authRoutes.get('/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  const back = (status) => res.redirect(`${config.corsOrigin}/?auth=${status}`);

  if (error) {
    // Atlassian denial (user declined consent, bad client config).
    logger.warn({ error, errorDescription }, 'consent denied');
    return back('denied');
  }
  if (typeof code !== 'string' || typeof state !== 'string') {
    return back('invalid');
  }

  // Single-use state: blocks CSRF and replay of a captured callback URL.
  const pending = store.consumeState(state);
  if (!pending) {
    logger.warn('callback with unknown or expired state');
    return back('invalid');
  }

  try {
    await exchangeCode(code, pending.sessionId);
    res.cookie(SESSION_COOKIE, pending.sessionId, cookieOptions());
    return back('success');
  } catch (err) {
    logger.error({ err }, 'code exchange failed');
    return back('failed');
  }
});

/** POST /auth/logout -- forget the in-memory tokens for this browser. */
authRoutes.post('/logout', (req, res) => {
  if (req.sessionId) store.clear(req.sessionId);
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.json({ success: true });
});
