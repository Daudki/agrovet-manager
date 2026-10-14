import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { unauthorized } from '../errors.js';
import { clearSession, issueSession, requireAuth } from '../middleware/auth.js';
import {
  createAccount, getAccountByEmail, publicAccount, revokeSessions, setPasswordHash, updateAccount,
} from '../services/accounts.js';
import { seedDemoData } from '../services/demo.js';
import { conflict } from '../errors.js';
import { listProducts } from '../services/products.js';
import * as S from './schemas.js';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 25 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Express 4 does not catch rejections from async handlers – forward them to the error middleware.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const authRouter = Router();

authRouter.post('/register', limiter, ah(async (req, res) => {
  const data = S.parse(S.register, req.body);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const acct = createAccount({
    email: data.email, passwordHash, ownerName: data.owner_name, shopName: data.shop_name, phone: data.phone ?? '',
  });
  if (data.load_sample_data) seedDemoData(acct);
  issueSession(res, acct);
  res.status(201).json({ account: publicAccount(acct) });
}));

authRouter.post('/login', limiter, ah(async (req, res) => {
  const data = S.parse(S.login, req.body);
  const acct = getAccountByEmail(data.email);
  const ok = await bcrypt.compare(data.password, acct?.password_hash ?? DUMMY_HASH);
  if (!acct || !ok) throw unauthorized('Invalid email or password');
  issueSession(res, acct);
  res.json({ account: publicAccount(acct) });
}));

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => res.json({ account: publicAccount(req.acct) }));

/* Account settings (authenticated) */
export const accountRouter = Router();

accountRouter.patch('/', (req, res) => {
  const acct = updateAccount(req.acct.id, S.parse(S.accountPatch, req.body));
  res.json({ account: publicAccount(acct) });
});

accountRouter.post('/password', limiter, ah(async (req, res) => {
  const data = S.parse(S.passwordChange, req.body);
  const ok = await bcrypt.compare(data.current_password, req.acct.password_hash);
  if (!ok) throw unauthorized('Your current password is incorrect');
  const acct = setPasswordHash(req.acct.id, await bcrypt.hash(data.new_password, 10));
  issueSession(res, acct); // keep this device signed in; all others are revoked
  res.json({ ok: true });
}));

accountRouter.post('/demo-data', (req, res) => {
  if (listProducts(req.acct, { archived: 'all', limit: 1 }).total > 0) {
    throw conflict('Sample data can only be loaded into an empty account');
  }
  seedDemoData(req.acct);
  res.status(201).json({ ok: true });
});

accountRouter.post('/sign-out-everywhere', (req, res) => {
  revokeSessions(req.acct.id);
  clearSession(res);
  res.json({ ok: true });
});
