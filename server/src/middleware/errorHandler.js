import { AppError } from '../utils/errors.js';
import { logger, scrubText } from '../logger.js';

/**
 * body-parser rejects a request before any route runs. Those errors are not
 * AppErrors but still carry a meaningful status, so they are translated here
 * instead of collapsing into a misleading 500.
 */
function fromBodyParser(err) {
  if (err.type === 'entity.too.large') {
    return { status: 413, code: 'payload_too_large', message: 'The request body is too large.' };
  }
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return { status: 400, code: 'malformed_json', message: 'The request body is not valid JSON.' };
  }
  return null;
}

/**
 * The single place where an error becomes an HTTP response. Centralising it
 * guarantees the shape of every failure and that no route can accidentally
 * return a stack trace or an upstream body to the browser.
 */
export function errorHandler(err, _req, res, _next) {
  const isAppError = err instanceof AppError;
  const parserError = isAppError ? null : fromBodyParser(err);
  const status = isAppError ? err.status : (parserError?.status ?? 500);

  // Diagnostics go to the log; `details` never crosses the wire.
  logger[status >= 500 ? 'error' : 'warn'](
    { err, code: err.code, status, details: scrubText(err.details) },
    'request failed',
  );

  // Only our own error types and recognised parser errors describe
  // themselves to the client. Anything else becomes a generic 500, so an
  // internal code like ECONNREFUSED never reaches the browser.
  const safe = isAppError
    ? { code: err.code, message: err.message }
    : (parserError ?? {
        code: 'internal_error',
        message: 'An unexpected error occurred. Please try again.',
      });

  const body = { success: false, code: safe.code, error: safe.message };
  if (err.fieldErrors) body.fieldErrors = err.fieldErrors;

  res.status(status).json(body);
}

/** 404 for anything that reached the end of the router stack. */
export function notFound(_req, res) {
  res.status(404).json({ success: false, code: 'not_found', error: 'Route not found.' });
}
