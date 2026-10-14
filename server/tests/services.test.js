import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, makeAccount } from './helpers.js';
import { createAccount } from '../src/services/accounts.js';
import { createProduct, getProductDetail, listProducts, deleteProduct, alternatives, searchProducts, stockSummary } from '../src/services/products.js';
import { createPurchase, voidPurchase, adjustStock, listBatches, listMovements } from '../src/services/stock.js';
import { createSale, voidSale, listSales } from '../src/services/sales.js';
import { createCustomer, recordPayment, getCustomer, deleteCustomer } from '../src/services/customers.js';
import { createCategory, deleteCategory, listCategories } from '../src/services/categories.js';
import { createExpense } from '../src/services/expenses.js';
import { dashboard, salesReport, inventoryReport } from '../src/services/reports.js';
import { seedDemoData } from '../src/services/demo.js';
import { addDays, todayIn } from '../src/utils.js';

let acct;
let today;
beforeEach(() => {
  freshDb();
  acct = makeAccount();
  today = todayIn(acct.timezone);
});

const product = (over = {}) =>
  createProduct(acct, { name: 'Glyphosate', unit: 'L', buying_price: 100, selling_price: 150, reorder_level: 5, ...over });

describe('accounts', () => {
  test('registration seeds default categories and rejects duplicate emails', () => {
    assert.ok(listCategories(acct).length >= 10);
    assert.throws(() => createAccount({ email: 'OWNER@example.com', passwordHash: 'x', ownerName: 'A', shopName: 'B' }), /already exists/);
  });
});

describe('multi-tenancy', () => {
  test('one account can never see or touch another account’s data', () => {
    const p = product({ opening_stock: { quantity: 10, cost_price: 100 } });
    const other = makeAccount('other@example.com');
    assert.equal(listProducts(other).total, 0);
    assert.throws(() => getProductDetail(other, p.id), /not found/);
    assert.throws(() => createSale(other, { items: [{ product_id: p.id, quantity: 1 }], payment_method: 'cash' }), /Unknown product/);
    assert.throws(() => createProduct(other, { name: 'X', category_id: listCategories(acct)[0].id }), /Unknown category/);
    assert.equal(listProducts(acct).total, 1);
  });
});

describe('products & stock', () => {
  test('opening stock creates a batch + ledger row; stock is derived from batches', () => {
    const p = product({ opening_stock: { quantity: 20, cost_price: 100, batch_number: 'A1', expiry_date: addDays(today, 200) } });
    assert.equal(p.stock, 20);
    assert.equal(p.sellable, 20);
    assert.equal(p.stock_status, 'ok');
    const d = getProductDetail(acct, p.id);
    assert.equal(d.batches.length, 1);
    assert.equal(d.movements[0].type, 'opening');
  });

  test('stock status: out → low → ok', () => {
    const p = product({ reorder_level: 10 });
    assert.equal(listProducts(acct).items[0].stock_status, 'out');
    createPurchase(acct, { items: [{ product_id: p.id, quantity: 4, unit_cost: 100 }] });
    assert.equal(listProducts(acct).items[0].stock_status, 'low');
    createPurchase(acct, { items: [{ product_id: p.id, quantity: 20, unit_cost: 100 }] });
    assert.equal(listProducts(acct).items[0].stock_status, 'ok');
  });

  test('SKU auto-generates and duplicates are rejected', () => {
    const a = product({ name: 'A' });
    const b = product({ name: 'B' });
    assert.equal(a.sku, 'SKU-00001');
    assert.equal(b.sku, 'SKU-00002');
    assert.throws(() => product({ name: 'C', sku: 'SKU-00001' }), /SKU/);
  });

  test('search matches name, sku and ingredient; alternatives share an active ingredient', () => {
    const a = product({ name: 'Roundup-type 480', active_ingredients: ['Glyphosate'] });
    const b = product({ name: 'Weedkill 360', active_ingredients: ['glyphosate', 'Surfactant'] });
    product({ name: 'Unrelated', active_ingredients: ['Atrazine'] });
    assert.equal(listProducts(acct, { search: 'glyph' }).total, 2);
    assert.deepEqual(alternatives(acct, a.id).map((x) => x.id), [b.id]);
    const res = searchProducts(acct, 'Roundup');
    assert.equal(res.matches.length, 1);
    assert.deepEqual(res.alternatives.map((x) => x.id), [b.id]);
  });

  test('search treats % and _ literally', () => {
    product({ name: '100% Organic' });
    product({ name: 'Plain' });
    assert.equal(listProducts(acct, { search: '100%' }).total, 1);
    assert.equal(listProducts(acct, { search: '%' }).total, 1);
  });

  test('delete archives products with history and hard-deletes untouched ones', () => {
    const fresh = product({ name: 'Never used' });
    assert.deepEqual(deleteProduct(acct, fresh.id), { deleted: true, archived: false });
    const used = product({ name: 'Used', opening_stock: { quantity: 5, cost_price: 100 } });
    createSale(acct, { items: [{ product_id: used.id, quantity: 1 }], payment_method: 'cash' });
    assert.deepEqual(deleteProduct(acct, used.id), { deleted: false, archived: true });
    assert.equal(listProducts(acct).total, 0);
    assert.equal(listProducts(acct, { archived: 'only' }).total, 1);
  });
});

describe('sales (FEFO)', () => {
  test('sells earliest-expiring batch first and spans batches', () => {
    const p = product();
    createPurchase(acct, { items: [
      { product_id: p.id, quantity: 5, unit_cost: 100, batch_number: 'LATE', expiry_date: addDays(today, 300) },
      { product_id: p.id, quantity: 5, unit_cost: 120, batch_number: 'SOON', expiry_date: addDays(today, 60) },
    ] });
    const sale = createSale(acct, { items: [{ product_id: p.id, quantity: 7 }], payment_method: 'cash' });
    const batches = Object.fromEntries(getProductDetail(acct, p.id).batches.map((b) => [b.batch_number, b.quantity]));
    assert.equal(batches.SOON, 0);
    assert.equal(batches.LATE, 3);
    // cost: 5 × 120 + 2 × 100 = 800
    assert.equal(sale.cost_total, 800);
    assert.equal(sale.total, 1050);
    assert.equal(sale.profit, 250);
    assert.equal(sale.receipt_no, 'R-000001');
  });

  test('expired stock is never sold', () => {
    const p = product({ opening_stock: { quantity: 10, cost_price: 100, expiry_date: addDays(today, -1) } });
    assert.equal(p.stock, 10);
    assert.equal(p.sellable, 0);
    assert.throws(() => createSale(acct, { items: [{ product_id: p.id, quantity: 1 }], payment_method: 'cash' }), /Not enough stock/);
  });

  test('refuses to oversell and rolls back completely', () => {
    const a = product({ name: 'A', opening_stock: { quantity: 5, cost_price: 100 } });
    const b = product({ name: 'B', opening_stock: { quantity: 1, cost_price: 100 } });
    assert.throws(
      () => createSale(acct, { items: [{ product_id: a.id, quantity: 2 }, { product_id: b.id, quantity: 3 }], payment_method: 'cash' }),
      /Not enough stock for "B"/,
    );
    assert.equal(getProductDetail(acct, a.id).stock, 5); // untouched
    assert.equal(listSales(acct).total, 0);
  });

  test('duplicate lines for one product cannot double-spend stock', () => {
    const p = product({ opening_stock: { quantity: 5, cost_price: 100 } });
    assert.throws(() => createSale(acct, { items: [
      { product_id: p.id, quantity: 4 }, { product_id: p.id, quantity: 4, unit_price: 99 },
    ], payment_method: 'cash' }), /Not enough stock/);
  });

  test('discount, price override and fractional quantities', () => {
    const p = product({ unit: 'kg', opening_stock: { quantity: 10, cost_price: 100 } });
    const s = createSale(acct, { items: [{ product_id: p.id, quantity: 2.5, unit_price: 200 }], discount: 50, payment_method: 'mobile_money' });
    assert.equal(s.subtotal, 500);
    assert.equal(s.total, 450);
    assert.equal(getProductDetail(acct, p.id).stock, 7.5);
  });

  test('void restores stock to the original batches and is idempotent-safe', () => {
    const p = product({ opening_stock: { quantity: 10, cost_price: 100 } });
    const s = createSale(acct, { items: [{ product_id: p.id, quantity: 4 }], payment_method: 'cash' });
    assert.equal(getProductDetail(acct, p.id).stock, 6);
    const v = voidSale(acct, s.id, 'Customer returned');
    assert.equal(v.status, 'voided');
    assert.equal(getProductDetail(acct, p.id).stock, 10);
    assert.throws(() => voidSale(acct, s.id), /already voided/);
    assert.equal(salesReport(acct, today, today).summary.revenue, 0);
  });

  test('credit sales need a customer; payments settle oldest first', () => {
    const p = product({ opening_stock: { quantity: 50, cost_price: 100 } });
    assert.throws(() => createSale(acct, { items: [{ product_id: p.id, quantity: 1 }], payment_method: 'credit' }), /customer/i);
    const c = createCustomer(acct, { name: 'Neema' });
    const s1 = createSale(acct, { items: [{ product_id: p.id, quantity: 2 }], customer_id: c.id, payment_method: 'credit' }); // 300 owed
    const s2 = createSale(acct, { items: [{ product_id: p.id, quantity: 4 }], customer_id: c.id, payment_method: 'cash', amount_paid: 100 }); // 500 owed
    assert.equal(getCustomer(acct, c.id).balance, 800);
    assert.throws(() => deleteCustomer(acct, c.id), /owes/);
    assert.throws(() => recordPayment(acct, c.id, { amount: 900 }), /exceeds/);
    const after = recordPayment(acct, c.id, { amount: 400 });
    assert.equal(after.balance, 400);
    const rows = Object.fromEntries(after.sales.map((r) => [r.id, r.amount_paid]));
    assert.equal(rows[s1.id], 300); // oldest fully settled first
    assert.equal(rows[s2.id], 200);
  });
});

describe('purchases, adjustments, expiry', () => {
  test('purchase creates batches, updates last cost, and can be voided only if untouched', () => {
    const p = product();
    const pu = createPurchase(acct, { reference: 'INV-9', items: [{ product_id: p.id, quantity: 10, unit_cost: 130, expiry_date: addDays(today, 90) }] });
    assert.equal(pu.total, 1300);
    assert.equal(getProductDetail(acct, p.id).buying_price, 130);
    createSale(acct, { items: [{ product_id: p.id, quantity: 1 }], payment_method: 'cash' });
    assert.throws(() => voidPurchase(acct, pu.id), /already been sold/);

    const p2 = product({ name: 'Other' });
    const pu2 = createPurchase(acct, { items: [{ product_id: p2.id, quantity: 3, unit_cost: 10 }] });
    assert.equal(voidPurchase(acct, pu2.id).status, 'voided');
    assert.equal(getProductDetail(acct, p2.id).stock, 0);
  });

  test('stock count and write-off write to the ledger', () => {
    const p = product({ opening_stock: { quantity: 10, cost_price: 100 } });
    const batch = getProductDetail(acct, p.id).batches[0];
    adjustStock(acct, { batch_id: batch.id, type: 'count', counted: 8, reason: 'Stock take' });
    assert.equal(getProductDetail(acct, p.id).stock, 8);
    adjustStock(acct, { batch_id: batch.id, type: 'write_off', quantity: 3, reason: 'Damaged' });
    assert.equal(getProductDetail(acct, p.id).stock, 5);
    assert.throws(() => adjustStock(acct, { batch_id: batch.id, type: 'write_off', quantity: 99 }), /left in this batch/);
    const types = listMovements(acct, { product_id: p.id }).items.map((m) => m.type);
    assert.deepEqual(types, ['write_off', 'adjustment', 'opening']);
  });

  test('expiring / expired classification honours the account warning window', () => {
    const p = product();
    createPurchase(acct, { items: [
      { product_id: p.id, quantity: 1, unit_cost: 1, batch_number: 'E', expiry_date: addDays(today, -3) },
      { product_id: p.id, quantity: 1, unit_cost: 1, batch_number: 'S', expiry_date: addDays(today, 10) },
      { product_id: p.id, quantity: 1, unit_cost: 1, batch_number: 'F', expiry_date: addDays(today, 200) },
      { product_id: p.id, quantity: 1, unit_cost: 1, batch_number: 'N' },
    ] });
    assert.deepEqual(listBatches(acct, { status: 'expired' }).items.map((b) => b.batch_number), ['E']);
    assert.deepEqual(listBatches(acct, { status: 'expiring' }).items.map((b) => b.batch_number), ['S']);
    assert.equal(listBatches(acct, { status: 'active' }).total, 3);
    const s = stockSummary(acct);
    assert.equal(s.expired, 1);
    assert.equal(s.expiring, 1);
  });
});

describe('categories', () => {
  test('cannot delete a category with products unless they are moved', () => {
    const c1 = createCategory(acct, { name: 'Test A' });
    const c2 = createCategory(acct, { name: 'Test B' });
    product({ category_id: c1.id });
    assert.throws(() => createCategory(acct, { name: 'test a' }), /already exists/);
    assert.throws(() => deleteCategory(acct, c1.id), /still has 1 product/);
    deleteCategory(acct, c1.id, { reassignTo: c2.id });
    assert.equal(listProducts(acct, { category_id: c2.id }).total, 1);
  });
});

describe('reports', () => {
  test('profit & loss: revenue − COGS − expenses', () => {
    const p = product({ opening_stock: { quantity: 100, cost_price: 100 } });
    createSale(acct, { items: [{ product_id: p.id, quantity: 10 }], payment_method: 'cash' }); // 1500 rev, 1000 cogs
    createExpense(acct, { category: 'Rent', amount: 200 });
    const r = salesReport(acct, today, today).summary;
    assert.equal(r.revenue, 1500);
    assert.equal(r.cogs, 1000);
    assert.equal(r.gross_profit, 500);
    assert.equal(r.expenses, 200);
    assert.equal(r.net_profit, 300);
    assert.equal(r.gross_margin, 33.3);
    const d = dashboard(acct);
    assert.equal(d.kpis.sales_today, 1500);
    assert.equal(d.kpis.net_profit_month, 300);
    assert.equal(d.trend.length, 30);
    assert.equal(inventoryReport(acct).totals.cost_value, 9000);
  });
});

describe('demo data', () => {
  test('seeds a coherent, explorable account', () => {
    seedDemoData(acct);
    const d = dashboard(acct);
    assert.ok(d.stock.products >= 15);
    assert.ok(d.kpis.revenue_month > 0 || d.trend.some((t) => t.revenue > 0));
    assert.ok(d.stock.expired >= 1, 'has an expired batch');
    assert.ok(d.stock.expiring >= 1, 'has an expiring batch');
    assert.ok(d.receivables.owed > 0);
    assert.ok(listSales(acct).total > 30);
    // Ledger integrity: sum of movements per batch == remaining quantity.
    // (checked via product stock = sum of signed movements)
    for (const p of listProducts(acct, { limit: 100 }).items) {
      const det = getProductDetail(acct, p.id);
      const ledger = listMovements(acct, { product_id: p.id, limit: 500 }).items.reduce((s, m) => s + m.quantity, 0);
      assert.ok(Math.abs(ledger - det.stock) < 1e-6, `${p.name}: ledger ${ledger} vs stock ${det.stock}`);
    }
  });
});
