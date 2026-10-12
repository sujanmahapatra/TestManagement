import { logger, scrubText } from '../logger.js';
import { ExportError } from '../utils/errors.js';

/**
 * One retry policy, shared by every destination adapter. Previously each
 * client carried its own copy; centralising it means a change to the backoff
 * rules applies everywhere and cannot drift between trackers.
 */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 10_000;
const TIMEOUT_MS = 15_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} url
 * @param {object} options
 * @param {string} options.system        Human name used in error messages ("Jira", "Azure DevOps").
 * @param {(status: number, messages: string[]) => string} options.describe
 *        Maps an upstream status onto a message the user can act on.
 */
export async function requestWithRetry(url, { system, describe, extractMessages, ...init }, attempt = 1) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      return requestWithRetry(url, { system, describe, extractMessages, ...init }, attempt + 1);
    }
    throw new ExportError(`Could not reach ${system}. Check connectivity and retry.`, {
      status: 504,
      details: err.message,
    });
  }

  if (res.status === 204) return null;

  if (res.ok) {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const raw = await res.text();
  const retryable = res.status === 429 || res.status >= 500;

  if (retryable && attempt < MAX_ATTEMPTS) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_BACKOFF_MS)
        : BASE_BACKOFF_MS * 2 ** attempt;

    logger.warn({ system, status: res.status, attempt, waitMs }, 'upstream request retrying');
    await sleep(waitMs);
    return requestWithRetry(url, { system, describe, extractMessages, ...init }, attempt + 1);
  }

  throw new ExportError(describe(res.status, extractMessages?.(raw) ?? []), {
    status: retryable ? 503 : 502,
    details: scrubText(raw).slice(0, 1000),
  });
}

/** Basic auth header for personal access tokens (Azure DevOps, TFS). */
export function patHeader(token) {
  return `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
}
