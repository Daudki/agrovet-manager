import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { freshDb, makeAccount } from './helpers.js';
import { MIGRATIONS } from '../src/schema.js';
import { can, permissionsFor } from '../src/permissions.js';
import * as redact from '../src/redact.js';
import {
  createTeamMember, deleteTeamMember, getUserByEmail, listTeam, updateTeamMember, publicUser,
} from '../src/services/accounts.js';
import { createProduct } from '../src/services/products.js';
import { createSale, getSale, listSales } from '../src/services/sales.js';

let acct;
beforeEach(() => { freshDb(); acct = makeAccount(); });

describe('permission matrix', () => {
  test('owner > manager > cashier', () => {
    assert.ok(can('owner', 'team.manage') && can('owner', 'settings.manage'));
    assert.ok(can('manager', 'reports.view') && can('manager', 'sales.void') && can('manager', 'costs.view'));
    assert.ok(!can('manager', 'team.manage') && !can('manager', 'settings.manage'));
    assert.deepEqual(permissionsFor('cashier').sort(), ['customers.manage', 'products.view', 'sales.view', 'sell']);
    assert.ok(!can('cashier', 'costs.view') && !can('cashier', 'sales.void') && !can('cashier', 'stock.manage'));
    assert.ok(!can('nonsense', 'sell'));
  });
});

describe('team service', () => {
  test('registration creates an owner login; members are created, edited and removed', () => {
    const owner = getUserByEmail('owner@example.com');
    assert.equal(owner.role, 'owner');
    const m = createTeamMember(acct, { name: 'Asha', email: 'asha@example.com', passwordHash: 'h', role: 'cashier' });
    assert.equal(m.role, 'cashier');
    assert.equal(listTeam(acct).length, 2);
    assert.equal(listTeam(acct)[0].role, 'owner');
    assert.throws(() => createTeamMember(acct, { name: 'Dup', email: 'ASHA@example.com', passwordHash: 'h', role: 'manager' }), /already used/);
    assert.throws(() => createTeamMember(acct, { name: 'X', email: 'x@example.com', passwordHash: 'h', role: 'owner' }), /manager or cashier/);

    const before = getUserByEmail('asha@example.com').token_version;
    assert.equal(updateTeamMember(acct, m.id, { role: 'manager' }).role, 'manager');
    assert.equal(getUserByEmail('asha@example.com').token_version, before + 1, 'role change revokes sessions');
    updateTeamMember(acct, m.id, { name: 'Asha M' });
    assert.equal(getUserByEmail('asha@example.com').token_version, before + 1, 'a rename does not');

    assert.throws(() => updateTeamMember(acct, owner.id, { role: 'cashier' }), /owner account cannot/);
    assert.throws(() => deleteTeamMember(acct, owner.id), /owner account cannot/);
    deleteTeamMember(acct, m.id);
    assert.equal(listTeam(acct).length, 1);
  });

  test('cannot touch another shop’s members', () => {
    const other = makeAccount('other@example.com');
    const m = createTeamMember(other, { name: 'Zed', email: 'zed@example.com', passwordHash: 'h', role: 'cashier' });
    assert.throws(() => updateTeamMember(acct, m.id, { role: 'manager' }), /not found/);
    assert.throws(() => deleteTeamMember(acct, m.id), /not found/);
  });

  test('sales record who served; deleting the member keeps the sale', () => {
    const m = createTeamMember(acct, { name: 'Asha', email: 'asha@example.com', passwordHash: 'h', role: 'cashier' });
    const p = createProduct(acct, { name: 'Urea', unit: 'bag', buying_price: 50, selling_price: 80, opening_stock: { quantity: 5 } });
    const sale = createSale(acct, { items: [{ product_id: p.id, quantity: 1 }], payment_method: 'cash' }, { userId: m.id });
    assert.equal(getSale(acct, sale.id).served_by, 'Asha');
    assert.equal(listSales(acct, { user_id: m.id }).total, 1);
    assert.equal(listSales(acct, { user_id: 999 }).total, 0);
    deleteTeamMember(acct, m.id);
    assert.equal(getSale(acct, sale.id).served_by, null);
    assert.equal(listSales(acct).total, 1);
  });
});

describe('redaction', () => {
  test('cashiers lose cost and profit fields; managers keep everything', () => {
    const p = createProduct(acct, { name: 'Urea', unit: 'bag', buying_price: 50, selling_price: 80, opening_stock: { quantity: 5 } });
    const sale = createSale(acct, { items: [{ product_id: p.id, quantity: 2 }], payment_method: 'cash' });
    const c = redact.sale('cashier', sale);
    assert.equal(c.cost_total, undefined);
    assert.equal(c.profit, undefined);
    assert.equal(c.items[0].unit_cost, undefined);
    assert.equal(c.total, 160);
    assert.equal(redact.sale('manager', sale).profit, 60);
    const rp = redact.product('cashier', { ...p, batches: [{ cost_price: 1, quantity: 3 }], movements: [{ unit_cost: 1 }], sales_summary: { profit: 5, qty: 1 } });
    assert.equal(rp.buying_price, undefined);
    assert.equal(rp.batches[0].cost_price, undefined);
    assert.equal(rp.batches[0].quantity, 3);
    assert.equal(rp.sales_summary.profit, undefined);
    assert.equal(redact.product('owner', p).buying_price, 50);
    assert.equal(publicUser(getUserByEmail('owner@example.com')).password_hash, undefined);
  });
});

describe('migration 2', () => {
  test('existing shops get an owner login with their original credentials', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(MIGRATIONS[0]);
    db.prepare("INSERT INTO accounts (email, password_hash, owner_name, shop_name, token_version, created_at) VALUES ('old@shop.com', 'HASH', 'Old Owner', 'Old Shop', 3, 'now')").run();
    db.exec(MIGRATIONS[1]);
    const u = db.prepare('SELECT * FROM users').get();
    assert.equal(u.email, 'old@shop.com');
    assert.equal(u.password_hash, 'HASH');
    assert.equal(u.role, 'owner');
    assert.equal(u.name, 'Old Owner');
    assert.equal(u.token_version, 3);
  });
});
