import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

/**
 * A shared password in front of the whole API (APP_PASSWORD). Signing in
 * sets a cookie holding an expiry and an HMAC of it, keyed by the password --
 * so the password itself is never stored or sent back, and changing it signs
 * everyone out. Without APP_PASSWORD the app stays open.
 */

export const LOGIN_COOKIE = 'tm_auth';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const sha256 = (text) => createHash('sha256').update(text).digest();
const key = () => sha256(`tm-login:${config.appPassword}`);
const sign = (expires) => createHmac('sha256', key()).update(String(expires)).digest('base64url');

const sameBytes = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Compared as digests, so the check takes as long for any wrong guess. */
const passwordMatches = (given) => timingSafeEqual(sha256(given), sha256(config.appPassword));

export const loginRequired = () => Boolean(config.appPassword);

/** A login cookie is "<expiry>.<signature>"; valid while unexpired and correctly signed. */
export function validLogin(cookie) {
  if (typeof cookie !== 'string') return false;
  const [expires, mac] = cookie.split('.');
  if (!expires || !mac || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return sameBytes(mac, sign(expires));
}

export const isLoggedIn = (req) => !loginRequired() || validLogin(req.cookies?.[LOGIN_COOKIE]);

export function requireLogin(req, _res, next) {
  if (isLoggedIn(req)) return next();
  next(new AppError('Sign in to use the app.', { status: 401, code: 'login_required' }));
}

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction,
  path: '/',
  maxAge: MAX_AGE_MS,
});

export const loginRoutes = Router();

// Only failed attempts count, so a typo or two never locks anyone out.
const attempts = rateLimit({
  windowMs: 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, code: 'too_many_attempts', error: 'Too many attempts. Wait a minute and try again.' },
});

/** GET /api/session -> { required, loggedIn } */
loginRoutes.get('/session', (req, res) => {
  res.json({ success: true, required: loginRequired(), loggedIn: isLoggedIn(req) });
});

/** POST /api/login { password } -> sets the login cookie */
loginRoutes.post('/login', attempts, (req, res, next) => {
  if (!loginRequired()) return res.json({ success: true, loggedIn: true });
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || !passwordMatches(password)) {
    return next(new AppError('That password is not right.', { status: 401, code: 'wrong_password' }));
  }
  const expires = Date.now() + MAX_AGE_MS;
  res.cookie(LOGIN_COOKIE, `${expires}.${sign(expires)}`, cookieOptions());
  res.json({ success: true, loggedIn: true });
});

/** POST /api/logout -> clears the login cookie */
loginRoutes.post('/logout', (_req, res) => {
  res.clearCookie(LOGIN_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ success: true });
});
