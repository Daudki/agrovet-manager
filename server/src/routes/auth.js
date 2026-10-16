import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { conflict, unauthorized } from '../errors.js';
import { clearSession, issueSession, need, requireAuth } from '../middleware/auth.js';
import { permissionsFor } from '../permissions.js';
import {
  createAccount, createTeamMember, deleteTeamMember, getAccount, getUserByEmail, listTeam, publicAccount, publicUser,
  revokeUserSessions, setUserPassword, updateAccount, updateTeamMember,
} from '../services/accounts.js';
import { seedDemoData } from '../services/demo.js';
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

const session = (req) => ({
  account: publicAccount(req.acct),
  user: publicUser(req.user),
  permissions: permissionsFor(req.user.role),
});

export const authRouter = Router();

/** Registering creates the shop + owner login but does NOT sign in – the client sends the user to the login page. */
authRouter.post('/register', limiter, ah(async (req, res) => {
  const data = S.parse(S.register, req.body);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const acct = createAccount({
    email: data.email, passwordHash, ownerName: data.owner_name, shopName: data.shop_name, phone: data.phone ?? '',
  });
  if (data.load_sample_data) seedDemoData(acct);
  res.status(201).json({ ok: true, email: data.email });
}));

authRouter.post('/login', limiter, ah(async (req, res) => {
  const data = S.parse(S.login, req.body);
  const user = getUserByEmail(data.email);
  const ok = await bcrypt.compare(data.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');
  if (!user.is_active) throw unauthorized('This login has been deactivated. Ask the shop owner.');
  issueSession(res, user);
  res.json(session({ user, acct: getAccount(user.account_id) }));
}));

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => res.json(session(req)));

/* Account settings & team (authenticated) */
export const accountRouter = Router();

accountRouter.patch('/', need('settings.manage'), (req, res) => {
  const acct = updateAccount(req.acct.id, S.parse(S.accountPatch, req.body));
  res.json({ account: publicAccount(acct) });
});

accountRouter.post('/password', limiter, ah(async (req, res) => {
  const data = S.parse(S.passwordChange, req.body);
  const ok = await bcrypt.compare(data.current_password, req.user.password_hash);
  if (!ok) throw unauthorized('Your current password is incorrect');
  const user = setUserPassword(req.user.id, await bcrypt.hash(data.new_password, 10));
  issueSession(res, user); // keep this device signed in; all others are revoked
  res.json({ ok: true });
}));

accountRouter.post('/sign-out-everywhere', (req, res) => {
  revokeUserSessions(req.user.id);
  clearSession(res);
  res.json({ ok: true });
});

accountRouter.post('/demo-data', need('settings.manage'), (req, res) => {
  if (listProducts(req.acct, { archived: 'all', limit: 1 }).total > 0) {
    throw conflict('Sample data can only be loaded into an empty account');
  }
  seedDemoData(req.acct);
  res.status(201).json({ ok: true });
});

export const teamRouter = Router();
teamRouter.use(need('team.manage'));
teamRouter.get('/', (req, res) => res.json({ items: listTeam(req.acct) }));
teamRouter.post('/', ah(async (req, res) => {
  const d = S.parse(S.teamMember, req.body);
  const member = createTeamMember(req.acct, { name: d.name, email: d.email, role: d.role, passwordHash: await bcrypt.hash(d.password, 10) });
  res.status(201).json(member);
}));
teamRouter.patch('/:id', ah(async (req, res) => {
  const d = S.parse(S.teamPatch, req.body);
  const { password, ...rest } = d;
  const patch = { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) };
  res.json(updateTeamMember(req.acct, Number(req.params.id) || 0, patch));
}));
teamRouter.delete('/:id', (req, res) => res.json(deleteTeamMember(req.acct, Number(req.params.id) || 0)));
