import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { unauthorized } from '../errors.js';
import { getAccount } from '../services/accounts.js';

function readCookie(req, name) {
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

export function issueSession(res, account) {
  const token = jwt.sign({ tv: account.token_version }, config.jwtSecret, {
    subject: String(account.id),
    expiresIn: `${config.sessionDays}d`,
  });
  res.cookie(config.cookieName, token, cookieOptions());
}

export const clearSession = (res) => res.clearCookie(config.cookieName, cookieOptions());

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
  maxAge: config.sessionDays * 86400 * 1000,
});

/** Resolves the logged-in account into req.acct. Every service call is scoped by it. */
export function requireAuth(req, _res, next) {
  const token = readCookie(req, config.cookieName);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const acct = getAccount(Number(payload.sub));
    if (!acct || acct.token_version !== payload.tv) return next(unauthorized('Session expired. Please sign in again.'));
    req.acct = acct;
    next();
  } catch {
    next(unauthorized('Session expired. Please sign in again.'));
  }
}
