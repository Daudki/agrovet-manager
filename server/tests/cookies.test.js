import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSession, cookieBase, issueSession } from '../src/middleware/auth.js';
import { config } from '../src/config.js';

const fakeRes = () => {
  const calls = [];
  return { calls, cookie: (...a) => calls.push(['cookie', ...a]), clearCookie: (...a) => calls.push(['clearCookie', ...a]) };
};

test('the session cookie is httpOnly, lax, path=/ and expires after the configured days', () => {
  const res = fakeRes();
  issueSession(res, { id: 7, token_version: 2 });
  const [, name, token, opts] = res.calls[0];
  assert.equal(name, config.cookieName);
  assert.ok(token.split('.').length === 3, 'a signed JWT');
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.path, '/');
  assert.equal(opts.maxAge, config.sessionDays * 86400 * 1000);
});

test('clearing the cookie matches its attributes but never passes maxAge (deprecated in Express 5)', () => {
  const res = fakeRes();
  clearSession(res);
  const [method, name, opts] = res.calls[0];
  assert.equal(method, 'clearCookie');
  assert.equal(name, config.cookieName);
  assert.equal('maxAge' in opts, false);
  assert.deepEqual(opts, cookieBase());
});
