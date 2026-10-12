/**
 * Every error crossing the HTTP boundary carries two separate payloads:
 * `message`, which is safe to show a user, and `details`, which is
 * diagnostic and only ever logged.
 */
export class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors, message = 'One or more fields are invalid.') {
    super(message, { status: 422, code: 'validation_failed' });
    this.fieldErrors = fieldErrors;
  }
}

/** The requested destination is unknown or not configured on this deployment. */
export class DestinationError extends AppError {
  constructor(message, { code = 'destination_unavailable' } = {}) {
    super(message, { status: 400, code });
  }
}

/** No usable Atlassian session -- the caller must run the OAuth consent flow. */
export class NotConnectedError extends AppError {
  constructor(system = 'Jira') {
    super(`Not connected to ${system}. Authorize the app and try again.`, {
      status: 401,
      code: 'not_connected',
    });
  }
}

/** Credentials exist but the token exchange failed (revoked, rotated, expired). */
export class AuthError extends AppError {
  constructor(details) {
    super('Authorization has expired. Please reconnect.', {
      status: 401,
      code: 'reauth_required',
      details,
    });
  }
}

/**
 * An upstream tracker rejected the request. Named for the operation rather
 * than the vendor, since every destination adapter raises it.
 */
export class ExportError extends AppError {
  constructor(message, { status = 502, code = 'export_failed', details } = {}) {
    super(message, { status, code, details });
  }
}

/** Retained so existing imports keep working; Jira is one export target. */
export const JiraError = ExportError;
