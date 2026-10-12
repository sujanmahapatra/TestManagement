import { config } from '../config.js';
import { logger, scrubText } from '../logger.js';
import { AuthError, NotConnectedError } from '../utils/errors.js';
import * as store from './tokenStore.js';

const AUTH_HOST = 'https://auth.atlassian.com';
const API_HOST = 'https://api.atlassian.com';

/** Refresh this many ms before the token actually expires. */
const EXPIRY_SKEW_MS = 60_000;

/** Step 1 of the authorization code grant: where to send the user's browser. */
export function buildConsentUrl(state) {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: config.atlassian.clientId,
    scope: config.atlassian.scopes.join(' '),
    redirect_uri: config.atlassian.redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
  });
  return `${AUTH_HOST}/authorize?${params}`;
}

async function postToken(payload) {
  const res = await fetch(`${AUTH_HOST}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.atlassian.clientId,
      client_secret: config.atlassian.clientSecret,
      ...payload,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    // The body can echo request parameters; scrub before it reaches a log.
    throw new AuthError(`token endpoint ${res.status}: ${scrubText(text).slice(0, 300)}`);
  }
  return JSON.parse(text);
}

/**
 * Resolves the cloudId per Atlassian product. Jira and Confluence are
 * separate entries in accessible-resources even on one site, and the REST
 * host differs (`/ex/jira/...` vs `/ex/confluence/...`), so both are stored.
 */
async function resolveCloudIds(accessToken) {
  const res = await fetch(`${API_HOST}/oauth/token/accessible-resources`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (!res.ok) throw new AuthError(`accessible-resources ${res.status}`);

  const sites = await res.json();
  if (!Array.isArray(sites) || sites.length === 0) {
    throw new AuthError('the authorizing account has no accessible Atlassian sites');
  }

  const configuredUrl = config.jira?.baseUrl ?? config.confluence?.baseUrl;
  const configured = configuredUrl ? new URL(configuredUrl).origin : null;

  const pick = (scopePrefix) => {
    const grants = sites.filter((s) => s.scopes?.some((sc) => sc.includes(scopePrefix)));
    const pool = grants.length ? grants : sites;
    const match = pool.find((s) => {
      try {
        return new URL(s.url).origin === configured;
      } catch {
        return false;
      }
    });
    return (match ?? pool[0]).id;
  };

  return { jira: pick('jira'), confluence: pick('confluence') };
}

/** Step 2: exchange the one-time code for tokens and persist them in memory. */
export async function exchangeCode(code, sessionId) {
  const token = await postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.atlassian.redirectUri,
  });

  const cloudIds = await resolveCloudIds(token.access_token);

  store.save(sessionId, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    cloudIds,
  });

  logger.info({ sessionId: sessionId.slice(0, 8) }, 'atlassian session established');
  return { cloudIds };
}

/**
 * Returns a valid access token for the session, refreshing it first if it is
 * at or near expiry. Atlassian rotates refresh tokens, so the new one is
 * always written back.
 */
export async function getAccessToken(sessionId) {
  const session = store.get(sessionId);
  if (!session) throw new NotConnectedError('Atlassian');

  if (session.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return { accessToken: session.accessToken, cloudIds: session.cloudIds };
  }

  try {
    const token = await postToken({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    });

    store.save(sessionId, {
      ...session,
      accessToken: token.access_token,
      // Rotating refresh token: Atlassian invalidates the one just used.
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
    });
    logger.debug({ sessionId: sessionId.slice(0, 8) }, 'access token refreshed');

    return { accessToken: token.access_token, cloudIds: session.cloudIds };
  } catch (err) {
    // A failed refresh is terminal: drop the session so the UI prompts a
    // reconnect rather than retrying with a dead token.
    store.clear(sessionId);
    logger.warn({ err }, 'refresh failed, session cleared');
    throw new AuthError(err.details ?? err.message);
  }
}

export function isConnected(sessionId) {
  return Boolean(store.get(sessionId));
}
