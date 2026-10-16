// HTTP-level tests. Requires `npm install` (Express etc.). Run with: npm test --workspace server
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { initDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server;
let base;

before(async () => {
  initDb(':memory:');
  server = createApp().listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/** Tiny cookie-aware client – each call to client() is an independent browser session. */
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* csv etc. */ }
    return { status: res.status, json, text, headers: res.headers };
  };
}

/** Registers a shop and signs in as its owner (registration alone does not sign in). */
async function signup(c, email, extra = {}) {
  const r = await c('POST', '/api/auth/register', reg(email, extra));
  assert.equal(r.status, 201);
  const l = await c('POST', '/api/auth/login', { email, password: 'correct-horse-9' });
  assert.equal(l.status, 200);
  return l.json;
}

const reg = (email, extra = {}) => ({
  owner_name: 'Test Owner', shop_name: 'Shop', email, password: 'correct-horse-9', ...extra,
});

describe('auth', () => {
  test('private endpoints require a session', async () => {
    const c = client();
    assert.equal((await c('GET', '/api/products')).status, 401);
    assert.equal((await c('GET', '/api/auth/me')).status, 401);
  });

  test('register does NOT sign in; login does; logout ends the session', async () => {
    const c = client();
    const r = await c('POST', '/api/auth/register', reg('a@example.com'));
    assert.equal(r.status, 201);
    assert.equal(r.json.email, 'a@example.com');
    assert.equal(r.headers.getSetCookie().length, 0, 'registration must not set a session cookie');
    assert.equal((await c('GET', '/api/auth/me')).status, 401);

    assert.equal((await c('POST', '/api/auth/login', { email: 'a@example.com', password: 'nope-nope' })).status, 401);
    const l = await c('POST', '/api/auth/login', { email: 'A@Example.com', password: 'correct-horse-9' });
    assert.equal(l.status, 200);
    assert.equal(l.json.user.role, 'owner');
    assert.equal(l.json.user.password_hash, undefined);
    assert.ok(l.json.permissions.includes('team.manage'));
    assert.equal((await c('GET', '/api/auth/me')).json.account.shop_name, 'Shop');

    await c('POST', '/api/auth/logout');
    assert.equal((await c('GET', '/api/auth/me')).status, 401);
  });

  test('validation errors name the fields; duplicates are rejected', async () => {
    const c = client();
    const bad = await c('POST', '/api/auth/register', reg('not-an-email', { password: 'short' }));
    assert.equal(bad.status, 400);
    assert.ok(bad.json.details.fields.email);
    assert.ok(bad.json.details.fields.password);
    await c('POST', '/api/auth/register', reg('dup@example.com'));
    assert.equal((await client()('POST', '/api/auth/register', reg('dup@example.com'))).status, 409);
  });
});

describe('tenant isolation over HTTP', () => {
  test('a second shop cannot read or change the first shop’s records', async () => {
    const a = client();
    const b = client();
    await signup(a, 'shop-a@example.com');
    await signup(b, 'shop-b@example.com');

    const p = await a('POST', '/api/products', {
      name: 'Glyphosate', unit: 'L', buying_price: 100, selling_price: 150,
      opening_stock: { quantity: 10 },
    });
    assert.equal(p.status, 201);
    const id = p.json.id;

    assert.equal((await b('GET', `/api/products/${id}`)).status, 404);
    assert.equal((await b('PATCH', `/api/products/${id}`, { name: 'Hacked' })).status, 404);
    assert.equal((await b('DELETE', `/api/products/${id}`)).status, 404);
    assert.equal((await b('GET', '/api/products')).json.total, 0);
    assert.equal((await a('GET', '/api/products')).json.total, 1);
    assert.equal((await b('POST', '/api/sales', { items: [{ product_id: id, quantity: 1 }], payment_method: 'cash' })).status, 400);
  });
});

describe('core flow', () => {
  test('stock a product, sell it, void it, export CSV', async () => {
    const c = client();
    await signup(c, 'flow@example.com');
    const p = (await c('POST', '/api/products', { name: 'Urea', unit: 'bag', buying_price: 50, selling_price: 80, opening_stock: { quantity: 5 } })).json;

    const sale = await c('POST', '/api/sales', { items: [{ product_id: p.id, quantity: 2 }], payment_method: 'cash' });
    assert.equal(sale.status, 201);
    assert.equal(sale.json.total, 160);

    assert.equal((await c('GET', `/api/products/${p.id}`)).json.stock, 3);
    const over = await c('POST', '/api/sales', { items: [{ product_id: p.id, quantity: 99 }], payment_method: 'cash' });
    assert.equal(over.status, 409);

    assert.equal((await c('POST', `/api/sales/${sale.json.id}/void`, { reason: 'test' })).json.status, 'voided');
    assert.equal((await c('GET', `/api/products/${p.id}`)).json.stock, 5);

    const dash = await c('GET', '/api/dashboard');
    assert.equal(dash.status, 200);
    assert.equal(dash.json.stock.products, 1);

    const csv = await c('GET', '/api/export/products.csv');
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.text, /Urea/);
  });

  test('hostile query strings do not crash the API', async () => {
    const c = client();
    await signup(c, 'qs@example.com');
    assert.equal((await c('GET', '/api/products?search[a]=1&ids=abc&sort=;drop')).status, 200);
    assert.equal((await c('GET', '/api/sales?from=garbage')).status, 200);
    assert.equal((await c('GET', '/api/products/abc')).status, 404);
  });
});

describe('roles over HTTP', () => {
  test('a cashier can sell but cannot see costs, manage, void or open reports', async () => {
    const owner = client();
    const cashier = client();
    await signup(owner, 'boss@example.com');
    const p = (await owner('POST', '/api/products', { name: 'Urea', unit: 'bag', buying_price: 50, selling_price: 80, opening_stock: { quantity: 10 } })).json;

    const made = await owner('POST', '/api/team', { name: 'Asha', email: 'asha@example.com', password: 'cashier-pass-1', role: 'cashier' });
    assert.equal(made.status, 201);
    assert.equal((await cashier('POST', '/api/auth/login', { email: 'asha@example.com', password: 'cashier-pass-1' })).status, 200);

    // Can look up products, but without cost fields.
    const list = (await cashier('GET', '/api/products')).json.items[0];
    assert.equal(list.selling_price, 80);
    assert.equal(list.buying_price, undefined);
    assert.equal(list.cost_value, undefined);
    assert.equal((await cashier('GET', `/api/products/${p.id}`)).json.buying_price, undefined);
    assert.equal((await cashier('GET', '/api/alerts')).json.stock_cost_value, undefined);

    // Can sell; receipt hides cost and profit.
    const sale = await cashier('POST', '/api/sales', { items: [{ product_id: p.id, quantity: 2 }], payment_method: 'cash' });
    assert.equal(sale.status, 201);
    assert.equal(sale.json.cost_total, undefined);
    assert.equal(sale.json.profit, undefined);
    assert.equal(sale.json.served_by, 'Asha');

    // Cannot do manager/owner things.
    for (const [m, path, body] of [
      ['POST', '/api/products', { name: 'X' }], ['PATCH', `/api/products/${p.id}`, { name: 'X' }], ['DELETE', `/api/products/${p.id}`],
      ['GET', '/api/dashboard'], ['GET', '/api/reports/sales'], ['GET', '/api/expenses'], ['GET', '/api/purchases'],
      ['GET', '/api/stock/batches'], ['GET', '/api/team'], ['PATCH', '/api/account', { shop_name: 'Hacked' }],
      ['GET', '/api/export/products.csv'], ['GET', '/api/suppliers'], ['POST', `/api/sales/${sale.json.id}/void`, {}],
    ]) {
      assert.equal((await cashier(m, path, body)).status, 403, `${m} ${path} should be forbidden`);
    }

    // Cashiers only see their own sales; the owner sees them with profit.
    await owner('POST', '/api/sales', { items: [{ product_id: p.id, quantity: 1 }], payment_method: 'cash' });
    const mine = (await cashier('GET', '/api/sales')).json;
    assert.equal(mine.total, 1);
    assert.equal(mine.totals.profit, undefined);
    const all = (await owner('GET', '/api/sales')).json;
    assert.equal(all.total, 2);
    assert.equal(all.totals.profit, 90);
    const ownSale = (await owner('POST', '/api/sales', { items: [{ product_id: p.id, quantity: 1 }], payment_method: 'cash' })).json;
    assert.equal((await cashier('GET', `/api/sales/${ownSale.id}`)).status, 404);
  });

  test('deactivating or demoting a member signs them out at once; resets work', async () => {
    const owner = client();
    const staff = client();
    await signup(owner, 'owner2@example.com');
    const m = (await owner('POST', '/api/team', { name: 'Juma', email: 'juma@example.com', password: 'first-password', role: 'manager' })).json;
    await staff('POST', '/api/auth/login', { email: 'juma@example.com', password: 'first-password' });
    assert.equal((await staff('GET', '/api/dashboard')).status, 200);

    await owner('PATCH', `/api/team/${m.id}`, { role: 'cashier' });
    assert.equal((await staff('GET', '/api/dashboard')).status, 401, 'role change revokes the session');

    await staff('POST', '/api/auth/login', { email: 'juma@example.com', password: 'first-password' });
    assert.equal((await staff('GET', '/api/dashboard')).status, 403, 'now a cashier');

    await owner('PATCH', `/api/team/${m.id}`, { is_active: false });
    assert.equal((await staff('GET', '/api/auth/me')).status, 401);
    assert.equal((await client()('POST', '/api/auth/login', { email: 'juma@example.com', password: 'first-password' })).status, 401);

    await owner('PATCH', `/api/team/${m.id}`, { is_active: true, password: 'brand-new-pass' });
    assert.equal((await client()('POST', '/api/auth/login', { email: 'juma@example.com', password: 'brand-new-pass' })).status, 200);
  });

  test('team members of one shop are invisible to another shop', async () => {
    const a = client();
    const b = client();
    await signup(a, 'iso-a@example.com');
    await signup(b, 'iso-b@example.com');
    const m = (await a('POST', '/api/team', { name: 'Zed', email: 'zed@example.com', password: 'zed-password-1', role: 'cashier' })).json;
    assert.equal((await b('PATCH', `/api/team/${m.id}`, { role: 'manager' })).status, 404);
    assert.equal((await b('DELETE', `/api/team/${m.id}`)).status, 404);
    assert.equal((await b('GET', '/api/team')).json.items.length, 1);
  });
});
