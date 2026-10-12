import { config } from '../config.js';

export const SESSION_COOKIE = 'tcg_sid';

/**
 * The cookie carries only an opaque session id -- never a token. Tokens stay
 * in the server's memory, keyed by this id.
 */
export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax', // must survive the redirect back from Atlassian
    secure: config.isProduction,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  };
}

/** Lifts the session id off the cookie onto the request. */
export function session(req, _res, next) {
  req.sessionId = req.cookies?.[SESSION_COOKIE] ?? null;
  next();
}
