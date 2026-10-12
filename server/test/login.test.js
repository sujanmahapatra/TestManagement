import { test, after } from 'node:test';
import assert from 'node:assert/strict';

// Covers the shared password: the API refuses without signing in, a wrong
// password is refused, the right one sets a cookie that opens the API, a
// forged or expired cookie does not, and repeated failures are throttled.
process.env.DESTINATIONS = 'excel';
process.env.APP_PASSWORD = 'correct horse battery';
process.env.LOG_LEVEL = 'silent';

const express = (await import('express')).default;
const cookieParser = (await import('cookie-parser')).default;
const { loginRoutes, requireLogin, validLogin, LOGIN_COOKIE } = await import('../src/middleware/login.js');
const { errorHandler } = await import('../src/middleware/errorHandler.js');

// The same order as index.js: sign-in routes open, everything after guarded.
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', loginRoutes);
app.use('/api', requireLogin);
app.get('/api/options', (_req, res) => res.json({ success: true, secret: 'the test cases' }));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

const login = (password) =>
  fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
const cookieFrom = (res) => res.headers.get('set-cookie')?.split(';')[0];

test('the API refuses until signed in, and says a login is needed', async () => {
  const res = await fetch(`${base}/api/options`);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'login_required');

  const session = await (await fetch(`${base}/api/session`)).json();
  assert.deepEqual({ required: session.required, loggedIn: session.loggedIn }, { required: true, loggedIn: false });
});

test('the right password sets a cookie that opens the API', async () => {
  const res = await login('correct horse battery');
  assert.equal(res.status, 200);
  const cookie = cookieFrom(res);
  assert.match(cookie, new RegExp(`^${LOGIN_COOKIE}=\\d+\\.`));
  assert.match(res.headers.get('set-cookie'), /HttpOnly/i);
  assert.doesNotMatch(cookie, /correct/); // the password itself is never in the cookie

  const options = await fetch(`${base}/api/options`, { headers: { cookie } });
  assert.equal(options.status, 200);
  const session = await (await fetch(`${base}/api/session`, { headers: { cookie } })).json();
  assert.equal(session.loggedIn, true);
});

test('a forged or expired cookie is refused', () => {
  assert.equal(validLogin(`${Date.now() + 60_000}.forged-signature`), false);
  assert.equal(validLogin('1000.anything'), false); // long expired
  assert.equal(validLogin(''), false);
  assert.equal(validLogin(undefined), false);
});

test('a wrong password is refused, and repeated failures are throttled', async () => {
  const first = await login('guess one');
  assert.equal(first.status, 401);
  assert.equal((await first.json()).code, 'wrong_password');
  assert.equal(cookieFrom(first), undefined);

  let last;
  for (let i = 0; i < 6; i += 1) last = await login(`guess ${i}`);
  assert.equal(last.status, 429);
  assert.match((await last.json()).error, /Too many attempts/);
});
