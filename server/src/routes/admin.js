import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { snapshotTo } from '../db.js';
import { notFound, unauthorized } from '../errors.js';
import { clearAdminSession, issueAdminSession, requireAdmin } from '../middleware/adminAuth.js';
import { getShop, listShops, platformStats, resetShopUserPassword, setSuspended } from '../services/admin.js';
import * as S from './schemas.js';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 10 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const intParam = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

const audit = (action, detail = {}) => console.info(`[admin] ${action} ${JSON.stringify(detail)}`);

export const adminRouter = Router();

adminRouter.post('/login', limiter, ah(async (req, res) => {
  if (!config.adminEnabled) throw notFound();
  const data = S.parse(S.login, req.body);
  const passwordOk = await bcrypt.compare(data.password, config.adminPasswordHash || DUMMY_HASH);
  if (data.email !== config.adminEmail || !passwordOk) {
    audit('login_failed');
    throw unauthorized('Invalid email or password');
  }
  issueAdminSession(res);
  audit('login');
  res.json({ email: config.adminEmail });
}));

adminRouter.post('/logout', (_req, res) => {
  clearAdminSession(res);
  res.json({ ok: true });
});

adminRouter.use(requireAdmin);

adminRouter.get('/me', (_req, res) => res.json({ email: config.adminEmail }));

adminRouter.get('/overview', (_req, res) => res.json(platformStats()));

adminRouter.get('/shops', (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 80);
  const status = ['active', 'suspended'].includes(req.query.status) ? req.query.status : 'all';
  res.json({ items: listShops({ q, status }) });
});

adminRouter.get('/shops/:id', (req, res) => res.json(getShop(intParam(req.params.id))));

adminRouter.post('/shops/:id/suspend', (req, res) => {
  const shop = setSuspended(intParam(req.params.id), true);
  audit('suspend', { shop: shop.id });
  res.json(shop);
});

adminRouter.post('/shops/:id/unsuspend', (req, res) => {
  const shop = setSuspended(intParam(req.params.id), false);
  audit('unsuspend', { shop: shop.id });
  res.json(shop);
});

adminRouter.post('/shops/:id/users/:userId/reset-password', ah(async (req, res) => {
  const password = crypto.randomBytes(9).toString('base64url');
  const shopId = intParam(req.params.id);
  const userId = intParam(req.params.userId);
  resetShopUserPassword(shopId, userId, await bcrypt.hash(password, 10));
  audit('reset_password', { shop: shopId, user: userId });
  res.json({ password });
}));

adminRouter.post('/backup', (req, res, next) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrovet-backup-'));
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  const file = path.join(dir, 'agrovet.db');
  try {
    snapshotTo(file);
  } catch (err) {
    cleanup();
    return next(err);
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  audit('backup_download');
  res.download(file, `agrovet-${stamp}.db`, (err) => {
    cleanup();
    if (err && !res.headersSent) next(err);
  });
});
