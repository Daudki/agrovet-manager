import { db, tx } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { addDays, escapeLike, isoNow, pageMeta, paging, round, todayIn } from '../utils.js';
import { insertBatch, recordMovement } from './ledger.js';

/* ───────────────────────── Purchases (receiving stock) ───────────────────────── */

export function createPurchase(acct, data) {
  return tx(() => {
    if (data.supplier_id) {
      const ok = db.prepare('SELECT 1 FROM suppliers WHERE id = ? AND account_id = ?').get(data.supplier_id, acct.id);
      if (!ok) throw badRequest('Unknown supplier');
    }
    const on = data.purchased_on || todayIn(acct.timezone);
    const purchaseId = Number(
      db
        .prepare(
          `INSERT INTO purchases (account_id, supplier_id, reference, purchased_on, total, note, created_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(acct.id, data.supplier_id ?? null, data.reference ?? '', on, data.note ?? '', isoNow()).lastInsertRowid,
    );
    let total = 0;
    for (const it of data.items) {
      const p = db
        .prepare('SELECT id, name, unit FROM products WHERE id = ? AND account_id = ?')
        .get(it.product_id, acct.id);
      if (!p) throw badRequest(`Unknown product (id ${it.product_id})`);
      const batchId = insertBatch(acct, {
        productId: p.id,
        quantity: it.quantity,
        costPrice: it.unit_cost,
        batchNumber: it.batch_number,
        expiryDate: it.expiry_date,
        supplierId: data.supplier_id,
        purchaseId,
        receivedOn: on,
        refType: 'purchase',
        refId: purchaseId,
        note: data.reference ? `Purchase ${data.reference}` : 'Purchase',
      });
      const batch = db.prepare('SELECT batch_number FROM batches WHERE id = ?').get(batchId);
      db.prepare(
        `INSERT INTO purchase_items (purchase_id, product_id, product_name, unit, quantity, unit_cost, batch_number, expiry_date, batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(purchaseId, p.id, p.name, p.unit, it.quantity, round(it.unit_cost), batch.batch_number, it.expiry_date || null, batchId);
      // Keep the product's "last cost" current.
      db.prepare('UPDATE products SET buying_price = ?, updated_at = ? WHERE id = ?').run(round(it.unit_cost), isoNow(), p.id);
      total += it.quantity * it.unit_cost;
    }
    db.prepare('UPDATE purchases SET total = ? WHERE id = ?').run(round(total), purchaseId);
    return getPurchase(acct, purchaseId);
  });
}

export function getPurchase(acct, id) {
  const p = db
    .prepare(
      `SELECT pu.*, s.name AS supplier_name FROM purchases pu LEFT JOIN suppliers s ON s.id = pu.supplier_id
       WHERE pu.id = ? AND pu.account_id = ?`,
    )
    .get(id, acct.id);
  if (!p) throw notFound('Purchase');
  p.items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id').all(id);
  return p;
}

export function listPurchases(acct, q = {}) {
  const params = [acct.id];
  let where = 'WHERE pu.account_id = ?';
  if (q.supplier_id) { where += ' AND pu.supplier_id = ?'; params.push(Number(q.supplier_id)); }
  if (q.from) { where += ' AND pu.purchased_on >= ?'; params.push(q.from); }
  if (q.to) { where += ' AND pu.purchased_on <= ?'; params.push(q.to); }
  if (q.status) { where += ' AND pu.status = ?'; params.push(q.status); }
  if (q.search) {
    where += " AND (pu.reference LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')";
    const t = `%${escapeLike(q.search)}%`;
    params.push(t, t);
  }
  const pg = paging(q, 25);
  const from = `FROM purchases pu LEFT JOIN suppliers s ON s.id = pu.supplier_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params).n;
  const items = db
    .prepare(
      `SELECT pu.*, s.name AS supplier_name,
         (SELECT COUNT(*) FROM purchase_items i WHERE i.purchase_id = pu.id) AS item_count
       ${from} ORDER BY pu.purchased_on DESC, pu.id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`,
    )
    .all(...params);
  return { items, ...pageMeta(total, pg) };
}

/** A purchase can be voided only while none of its stock has been sold or adjusted. */
export function voidPurchase(acct, id) {
  return tx(() => {
    const p = getPurchase(acct, id);
    if (p.status === 'voided') throw conflict('This purchase is already voided');
    const batches = db.prepare('SELECT * FROM batches WHERE purchase_id = ? AND account_id = ?').all(id, acct.id);
    if (batches.some((b) => round(b.quantity, 3) !== round(b.initial_quantity, 3))) {
      throw conflict('Some stock from this purchase has already been sold or adjusted, so it cannot be voided.');
    }
    for (const b of batches) {
      db.prepare('UPDATE batches SET quantity = 0 WHERE id = ?').run(b.id);
      recordMovement(acct, {
        productId: b.product_id, batchId: b.id, type: 'adjustment', quantity: -b.quantity,
        unitCost: b.cost_price, refType: 'purchase', refId: id, note: `Purchase #${id} voided`,
      });
    }
    db.prepare("UPDATE purchases SET status = 'voided' WHERE id = ?").run(id);
    return getPurchase(acct, id);
  });
}

/* ───────────────────────── Batches & expiry ───────────────────────── */

export function listBatches(acct, q = {}) {
  const today = todayIn(acct.timezone);
  const soon = addDays(today, acct.expiry_warning_days);
  const params = [acct.id];
  let where = 'WHERE b.account_id = ?';
  if (!q.include_empty) where += ' AND b.quantity > 0';
  switch (q.status) {
    case 'expired': where += ' AND b.expiry_date < ?'; params.push(today); break;
    case 'expiring': where += ' AND b.expiry_date >= ? AND b.expiry_date <= ?'; params.push(today, soon); break;
    case 'active': where += ' AND (b.expiry_date IS NULL OR b.expiry_date >= ?)'; params.push(today); break;
    default:
  }
  if (q.product_id) { where += ' AND b.product_id = ?'; params.push(Number(q.product_id)); }
  if (q.search) {
    where += " AND (p.name LIKE ? ESCAPE '\\' OR b.batch_number LIKE ? ESCAPE '\\')";
    const t = `%${escapeLike(q.search)}%`;
    params.push(t, t);
  }
  const pg = paging(q, 25);
  const from = `FROM batches b JOIN products p ON p.id = b.product_id LEFT JOIN suppliers s ON s.id = b.supplier_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT b.*, p.name AS product_name, p.unit, p.selling_price, s.name AS supplier_name
       ${from} ORDER BY b.expiry_date IS NULL, b.expiry_date, b.id LIMIT ${pg.limit} OFFSET ${pg.offset}`,
    )
    .all(...params);
  const items = rows.map((b) => ({
    ...b,
    days_left: b.expiry_date ? Math.round((Date.parse(b.expiry_date) - Date.parse(today)) / 86400000) : null,
    expiry_status: !b.expiry_date ? 'none' : b.expiry_date < today ? 'expired' : b.expiry_date <= soon ? 'expiring' : 'ok',
  }));
  return { items, ...pageMeta(total, pg) };
}

/* ───────────────────────── Adjustments & write-offs ───────────────────────── */

export function adjustStock(acct, data) {
  return tx(() => {
    const b = db
      .prepare('SELECT * FROM batches WHERE id = ? AND account_id = ?')
      .get(data.batch_id, acct.id);
    if (!b) throw notFound('Batch');
    let delta;
    let type;
    if (data.type === 'count') {
      if (data.counted === undefined) throw badRequest('Provide the counted quantity');
      delta = round(data.counted - b.quantity, 3);
      type = 'adjustment';
    } else {
      if (!data.quantity || data.quantity <= 0) throw badRequest('Provide a quantity greater than zero');
      if (data.quantity > b.quantity + 1e-9) throw badRequest(`Only ${b.quantity} left in this batch`);
      delta = -round(data.quantity, 3);
      type = 'write_off';
    }
    if (delta === 0) return { changed: false, batch: b };
    db.prepare('UPDATE batches SET quantity = ? WHERE id = ?').run(round(b.quantity + delta, 3), b.id);
    recordMovement(acct, {
      productId: b.product_id, batchId: b.id, type, quantity: delta, unitCost: b.cost_price,
      note: [data.reason, data.note].filter(Boolean).join(' – '),
    });
    return { changed: true, delta, batch: db.prepare('SELECT * FROM batches WHERE id = ?').get(b.id) };
  });
}

/* ───────────────────────── Ledger ───────────────────────── */

export function listMovements(acct, q = {}) {
  const params = [acct.id];
  let where = 'WHERE m.account_id = ?';
  if (q.product_id) { where += ' AND m.product_id = ?'; params.push(Number(q.product_id)); }
  if (q.type) { where += ' AND m.type = ?'; params.push(q.type); }
  if (q.from) { where += ' AND m.created_on >= ?'; params.push(q.from); }
  if (q.to) { where += ' AND m.created_on <= ?'; params.push(q.to); }
  const pg = paging(q, 30);
  const from = `FROM stock_movements m JOIN products p ON p.id = m.product_id LEFT JOIN batches b ON b.id = m.batch_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params).n;
  const items = db
    .prepare(
      `SELECT m.*, p.name AS product_name, p.unit, b.batch_number
       ${from} ORDER BY m.id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`,
    )
    .all(...params);
  return { items, ...pageMeta(total, pg) };
}
