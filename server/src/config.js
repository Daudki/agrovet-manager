import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

// Load <repo>/.env if present (Node >= 20.12). Real environment variables win.
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* no .env file – fine */
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) {
    throw new Error('JWT_SECRET must be set in production. Generate one with: openssl rand -hex 32');
  }
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET not set – using a random one. Sessions reset on every restart.');
}

const adminEmail = (env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const adminPasswordHash = (env.ADMIN_PASSWORD_HASH ?? '').trim();
if (Boolean(adminEmail) !== Boolean(adminPasswordHash)) {
  throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD_HASH, or neither.');
}
if (adminPasswordHash && !/^\$2[aby]\$\d{2}\$.{53}$/.test(adminPasswordHash)) {
  throw new Error('ADMIN_PASSWORD_HASH must be a bcrypt hash. Generate one with: npm run admin:hash');
}

export const config = {
  isProd,
  port: Number(env.PORT) || 4000,
  databasePath: env.DATABASE_PATH
    ? path.resolve(root, env.DATABASE_PATH)
    : path.join(root, 'server', 'data', 'agrovet.db'),
  jwtSecret,
  cookieName: 'avm_session',
  sessionDays: Number(env.SESSION_DAYS) || 7,
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
  trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) : isProd ? 1 : 0,
  adminEmail,
  adminPasswordHash,
  adminEnabled: Boolean(adminEmail),
  adminCookieName: 'avm_admin',
  adminSessionHours: Number(env.ADMIN_SESSION_HOURS) || 12,
  clientDist: path.join(root, 'client', 'dist'),
};
