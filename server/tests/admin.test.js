import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';

const ADMIN_PASSWORD = 'correct horse battery';
process.env.ADMIN_EMAIL = 'Boss@Example.com';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 4).replace(/^\$2a\$/, '$2b$');
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';

const { initDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');

let server;
let base;

before(async () => {
  initDb(':memory:');
  server = createApp().listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function client() {
  const jar = new Map();
  return async (method, path, body) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const expired = attrs.some((a) => /^\s*expires=/i.test(a) && new Date(a.split('=')[1]) < new Date());
      if (expired || pair.slice(i + 1) === '') jar.delete(pair.slice(0, i));
      else jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    let json = null;
    try { json = JSON.parse(bytes.toString('utf8')); } catch { json = null; }
    return { status: res.status, json, headers: res.headers, bytes };
  };
}

async function shop(email, shopName) {
  const c = client();
  const r = await c('POST', '/api/auth/register', {
    email, password: 'password123', owner_name: 'Owner', shop_name: shopName, load_sample_data: false,
  });
  assert.equal(r.status, 201);
  const login = await c('POST', '/api/auth/login', { email, password: 'password123' });
  assert.equal(login.status, 200);
  return c;
}

async function adminClient() {
  const c = client();
  const r = await c('POST', '/api/admin/login', { email: 'boss@example.com', password: ADMIN_PASSWORD });
  assert.equal(r.status, 200);
  return c;
}

describe('platform admin', () => {
  test('login accepts only the configured credentials', async () => {
    const c = client();
    assert.equal((await c('POST', '/api/admin/login', { email: 'boss@example.com', password: 'wrong password' })).status, 401);
    assert.equal((await c('POST', '/api/admin/login', { email: 'other@example.com', password: ADMIN_PASSWORD })).status, 401);
    assert.equal((await c('GET', '/api/admin/me')).status, 401);
    const ok = await c('POST', '/api/admin/login', { email: 'BOSS@example.com', password: ADMIN_PASSWORD });
    assert.equal(ok.status, 200);
    assert.equal((await c('GET', '/api/admin/me')).json.email, 'boss@example.com');
  });

  test('admin cookie is path-scoped, strict and http-only', async () => {
    const res = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'boss@example.com', password: ADMIN_PASSWORD }),
    });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('avm_admin='));
    assert.match(cookie, /Path=\/api\/admin/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /HttpOnly/);
  });

  test('a shop owner session cannot reach admin routes and vice versa', async () => {
    const owner = await shop('own1@example.com', 'Owner One');
    assert.equal((await owner('GET', '/api/admin/shops')).status, 401);
    const admin = await adminClient();
    assert.equal((await admin('GET', '/api/auth/me')).status, 401);
    assert.equal((await admin('GET', '/api/dashboard')).status, 401);
  });

  test('logout clears the admin session', async () => {
    const admin = await adminClient();
    assert.equal((await admin('GET', '/api/admin/me')).status, 200);
    await admin('POST', '/api/admin/logout');
    assert.equal((await admin('GET', '/api/admin/me')).status, 401);
  });

  test('lists shops with stats and filters by search and status', async () => {
    await shop('alpha@example.com', 'Alpha Agrovet');
    await shop('beta@example.com', 'Beta Seeds');
    const admin = await adminClient();
    const all = (await admin('GET', '/api/admin/shops')).json.items;
    assert.ok(all.length >= 2);
    const alpha = all.find((s) => s.shop_name === 'Alpha Agrovet');
    assert.equal(alpha.owner_email, 'alpha@example.com');
    assert.equal(alpha.sales_count, 0);
    assert.equal(alpha.suspended, false);
    assert.equal((await admin('GET', '/api/admin/shops?q=beta%40example')).json.items.length, 1);
    assert.equal((await admin('GET', '/api/admin/shops?q=%25')).json.items.length, 0);
    assert.equal((await admin('GET', '/api/admin/shops?status=suspended')).json.items.length, 0);
    const stats = (await admin('GET', '/api/admin/overview')).json;
    assert.ok(stats.shops >= 2 && stats.db_bytes > 0);
  });

  test('suspending a shop signs its users out and blocks login; unsuspending restores access', async () => {
    const owner = await shop('gamma@example.com', 'Gamma Agrovet');
    const admin = await adminClient();
    const id = (await admin('GET', '/api/admin/shops?q=gamma')).json.items[0].id;

    assert.equal((await owner('GET', '/api/auth/me')).status, 200);
    const sus = await admin('POST', `/api/admin/shops/${id}/suspend`);
    assert.equal(sus.json.suspended, true);

    assert.equal((await owner('GET', '/api/auth/me')).status, 401);
    const blocked = await client()('POST', '/api/auth/login', { email: 'gamma@example.com', password: 'password123' });
    assert.equal(blocked.status, 401);
    assert.match(blocked.json.error, /suspended/i);
    assert.equal((await admin('GET', '/api/admin/shops?status=suspended')).json.items.length, 1);

    await admin('POST', `/api/admin/shops/${id}/unsuspend`);
    const back = await client()('POST', '/api/auth/login', { email: 'gamma@example.com', password: 'password123' });
    assert.equal(back.status, 200);
    assert.equal(back.json.account.suspended_at, undefined);
  });

  test('resets a shop user password, returns it once and revokes their sessions', async () => {
    const owner = await shop('delta@example.com', 'Delta Agrovet');
    const admin = await adminClient();
    const id = (await admin('GET', '/api/admin/shops?q=delta')).json.items[0].id;
    const detail = (await admin('GET', `/api/admin/shops/${id}`)).json;
    assert.equal(detail.team.length, 1);
    assert.equal(detail.team[0].password_hash, undefined);

    const reset = await admin('POST', `/api/admin/shops/${id}/users/${detail.team[0].id}/reset-password`);
    assert.equal(reset.status, 200);
    assert.ok(reset.json.password.length >= 12);

    assert.equal((await owner('GET', '/api/auth/me')).status, 401);
    const old = await client()('POST', '/api/auth/login', { email: 'delta@example.com', password: 'password123' });
    assert.equal(old.status, 401);
    const fresh = await client()('POST', '/api/auth/login', { email: 'delta@example.com', password: reset.json.password });
    assert.equal(fresh.status, 200);
  });

  test('cannot reset a user through the wrong shop', async () => {
    await shop('eps1@example.com', 'Eps One');
    await shop('eps2@example.com', 'Eps Two');
    const admin = await adminClient();
    const one = (await admin('GET', '/api/admin/shops?q=eps1')).json.items[0].id;
    const two = (await admin('GET', '/api/admin/shops?q=eps2')).json.items[0].id;
    const userOfTwo = (await admin('GET', `/api/admin/shops/${two}`)).json.team[0].id;
    assert.equal((await admin('POST', `/api/admin/shops/${one}/users/${userOfTwo}/reset-password`)).status, 404);
    assert.equal((await admin('POST', '/api/admin/shops/99999/suspend')).status, 404);
  });

  test('downloads a consistent database backup', async () => {
    const admin = await adminClient();
    const res = await admin('POST', '/api/admin/backup');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /agrovet-\d{8}-\d{6}\.db/);
    assert.equal(res.bytes.subarray(0, 15).toString(), 'SQLite format 3');
    assert.equal((await client()('POST', '/api/admin/backup')).status, 401);
  });
});
