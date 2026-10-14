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

const reg = (email, extra = {}) => ({
  owner_name: 'Test Owner', shop_name: 'Shop', email, password: 'correct-horse-9', ...extra,
});

describe('auth', () => {
  test('private endpoints require a session', async () => {
    const c = client();
    assert.equal((await c('GET', '/api/products')).status, 401);
    assert.equal((await c('GET', '/api/auth/me')).status, 401);
  });

  test('register → me → logout → login', async () => {
    const c = client();
    const r = await c('POST', '/api/auth/register', reg('a@example.com'));
    assert.equal(r.status, 201);
    assert.equal(r.json.account.email, 'a@example.com');
    assert.equal(r.json.account.password_hash, undefined);
    assert.equal((await c('GET', '/api/auth/me')).json.account.shop_name, 'Shop');

    await c('POST', '/api/auth/logout');
    assert.equal((await c('GET', '/api/auth/me')).status, 401);

    assert.equal((await c('POST', '/api/auth/login', { email: 'a@example.com', password: 'nope-nope' })).status, 401);
    assert.equal((await c('POST', '/api/auth/login', { email: 'A@Example.com', password: 'correct-horse-9' })).status, 200);
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
    await a('POST', '/api/auth/register', reg('shop-a@example.com'));
    await b('POST', '/api/auth/register', reg('shop-b@example.com'));

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
    await c('POST', '/api/auth/register', reg('flow@example.com'));
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
    await c('POST', '/api/auth/register', reg('qs@example.com'));
    assert.equal((await c('GET', '/api/products?search[a]=1&ids=abc&sort=;drop')).status, 200);
    assert.equal((await c('GET', '/api/sales?from=garbage')).status, 200);
    assert.equal((await c('GET', '/api/products/abc')).status, 404);
  });
});
