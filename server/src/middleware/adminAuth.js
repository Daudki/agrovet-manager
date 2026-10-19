import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { notFound, unauthorized } from '../errors.js';
import { readCookie } from './auth.js';

const AUDIENCE = 'platform-admin';

const signingKey = () => crypto.createHmac('sha256', config.jwtSecret).update(AUDIENCE).digest();
const passwordStamp = () => crypto.createHash('sha256').update(config.adminPasswordHash).digest('hex').slice(0, 16);

const cookieBase = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.cookieSecure,
  path: '/api/admin',
});

export function issueAdminSession(res) {
  const token = jwt.sign({ pv: passwordStamp() }, signingKey(), {
    audience: AUDIENCE,
    subject: 'admin',
    expiresIn: `${config.adminSessionHours}h`,
  });
  res.cookie(config.adminCookieName, token, { ...cookieBase(), maxAge: config.adminSessionHours * 3600 * 1000 });
}

export const clearAdminSession = (res) => res.clearCookie(config.adminCookieName, cookieBase());

export function requireAdmin(req, _res, next) {
  if (!config.adminEnabled) return next(notFound());
  const token = readCookie(req, config.adminCookieName);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, signingKey(), { audience: AUDIENCE });
    if (payload.pv !== passwordStamp()) throw new Error('password changed');
    next();
  } catch {
    next(unauthorized('Session expired. Please sign in again.'));
  }
}
