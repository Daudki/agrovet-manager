import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../errors.js';
import { can } from '../permissions.js';
import { getAccount, getUser } from '../services/accounts.js';

export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export const SUSPENDED = 'This shop has been suspended. Please contact support.';

// Attributes that must match between setting and clearing a cookie, or the browser keeps the old one.
export const cookieBase = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
});

export function issueSession(res, user) {
  const token = jwt.sign({ tv: user.token_version }, config.jwtSecret, {
    subject: String(user.id),
    expiresIn: `${config.sessionDays}d`,
  });
  res.cookie(config.cookieName, token, { ...cookieBase(), maxAge: config.sessionDays * 86400 * 1000 });
}

// No maxAge here: Express expires the cookie itself (passing maxAge is deprecated and ignored in Express 5).
export const clearSession = (res) => res.clearCookie(config.cookieName, cookieBase());

/** Resolves the signed-in login into req.user and its shop into req.acct. Every service call is scoped by req.acct. */
export function requireAuth(req, _res, next) {
  const token = readCookie(req, config.cookieName);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = getUser(Number(payload.sub));
    if (!user || !user.is_active || user.token_version !== payload.tv) {
      return next(unauthorized('Session expired. Please sign in again.'));
    }
    const acct = getAccount(user.account_id);
    if (!acct) return next(unauthorized());
    if (acct.suspended_at) return next(unauthorized(SUSPENDED));
    req.user = user;
    req.acct = acct;
    next();
  } catch {
    next(unauthorized('Session expired. Please sign in again.'));
  }
}

/** Route guard: `need('sales.void')`. */
export const need = (perm) => (req, _res, next) =>
  can(req.user.role, perm) ? next() : next(forbidden());
