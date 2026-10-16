import { db, tx } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { escapeLike, isoNow, pageMeta, paging, round, todayIn } from '../utils.js';
import { nextReceiptNo } from './accounts.js';
import { recordMovement } from './ledger.js';

/**
 * Creates a sale. Stock is taken first-expiry-first-out (FEFO) from non-expired batches,
 * so the oldest-dated stock always leaves the shelf first and expired stock is never sold.
 * `opts.date` is only used by the demo seeder to back-date sales.
 */
export function createSale(acct, input, opts = {}) {
  return tx(() => {
    const today = todayIn(acct.timezone);
    const soldOn = opts.date ?? today;
    const createdAt = opts.date ? `${opts.date}T${String(9 + ((opts.hour ?? 0) % 9)).padStart(2, '0')}:15:00.000Z` : isoNow();

    if (input.customer_id) {
      const ok = db.prepare('SELECT 1 FROM customers WHERE id = ? AND account_id = ?').get(input.customer_id, acct.id);
      if (!ok) throw badRequest('Unknown customer');
    }

    // Merge duplicate product+price lines.
    const merged = new Map();
    for (const it of input.items) {
      const key = `${it.product_id}:${it.unit_price ?? 'default'}`;
      const cur = merged.get(key);
      if (cur) cur.quantity = round(cur.quantity + it.quantity, 3);
      else merged.set(key, { ...it });
    }

    const lines = [];
    const batchStmt = db.prepare(
      `SELECT id, quantity, cost_price FROM batches
       WHERE product_id = ? AND account_id = ? AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= ?)
       ORDER BY expiry_date IS NULL, expiry_date, id`,
    );
    // Track what this sale has already claimed so two lines for one product can't double-spend a batch.
    const claimed = new Map();

    for (const it of merged.values()) {
      const p = db
        .prepare('SELECT id, name, unit, selling_price, is_archived FROM products WHERE id = ? AND account_id = ?')
        .get(it.product_id, acct.id);
      if (!p) throw badRequest(`Unknown product (id ${it.product_id})`);
      if (p.is_archived) throw badRequest(`"${p.name}" is archived and cannot be sold`);
      const price = round(it.unit_price ?? p.selling_price);
      let need = round(it.quantity, 3);
      const allocs = [];
      for (const b of batchStmt.all(p.id, acct.id, today)) {
        if (need <= 0) break;
        const free = round(b.quantity - (claimed.get(b.id) ?? 0), 3);
        if (free <= 0) continue;
        const take = Math.min(free, need);
        allocs.push({ batchId: b.id, qty: take, cost: b.cost_price });
        claimed.set(b.id, round((claimed.get(b.id) ?? 0) + take, 3));
        need = round(need - take, 3);
      }
      if (need > 0) {
        const available = round(it.quantity - need, 3);
        throw conflict(`Not enough stock for "${p.name}": ${available} ${p.unit} available, ${it.quantity} requested`);
      }
      const costTotal = allocs.reduce((s, a) => s + a.qty * a.cost, 0);
      lines.push({
        product: p, qty: round(it.quantity, 3), price, allocs,
        lineTotal: round(it.quantity * price), unitCost: round(costTotal / it.quantity, 4), costTotal,
      });
    }

    const subtotal = round(lines.reduce((s, l) => s + l.lineTotal, 0));
    const discount = round(input.discount ?? 0);
    if (discount > subtotal) throw badRequest('Discount cannot exceed the subtotal');
    const total = round(subtotal - discount);
    const method = input.payment_method;
    const paid = round(input.amount_paid ?? (method === 'credit' ? 0 : total));
    if (paid > total) throw badRequest('Amount paid cannot exceed the total');
    if (method === 'credit' && paid >= total && total > 0) throw badRequest('A credit sale needs an unpaid balance');
    if (paid < total && !input.customer_id) throw badRequest('Select a customer to sell on credit or part-payment');
    const costTotal = round(lines.reduce((s, l) => s + l.costTotal, 0));

    const receiptNo = nextReceiptNo(acct.id);
    const saleId = Number(
      db
        .prepare(
          `INSERT INTO sales (account_id, receipt_no, customer_id, subtotal, discount, total, cost_total, amount_paid,
             payment_method, note, sold_on, created_at, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(acct.id, receiptNo, input.customer_id ?? null, subtotal, discount, total, costTotal, paid, method,
          input.note ?? '', soldOn, createdAt, opts.userId ?? null).lastInsertRowid,
    );

    const insItem = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, product_name, unit, quantity, unit_price, unit_cost, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const l of lines) {
      insItem.run(saleId, l.product.id, l.product.name, l.product.unit, l.qty, l.price, l.unitCost, l.lineTotal);
      for (const a of l.allocs) {
        db.prepare('UPDATE batches SET quantity = ? WHERE id = ?').run(
          round(db.prepare('SELECT quantity FROM batches WHERE id = ?').get(a.batchId).quantity - a.qty, 3),
          a.batchId,
        );
        recordMovement(acct, {
          productId: l.product.id, batchId: a.batchId, type: 'sale', quantity: -a.qty, unitCost: a.cost,
          unitPrice: l.price, refType: 'sale', refId: saleId, note: receiptNo, on: soldOn, at: createdAt,
        });
      }
    }
    return getSale(acct, saleId);
  });
}

export function getSale(acct, id) {
  const sale = db
    .prepare(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS served_by
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.account_id = ?`,
    )
    .get(id, acct.id);
  if (!sale) throw notFound('Sale');
  sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(id);
  sale.balance_due = sale.status === 'completed' ? round(sale.total - sale.amount_paid) : 0;
  sale.profit = round(sale.total - sale.cost_total);
  return sale;
}

export function listSales(acct, q = {}) {
  const params = [acct.id];
  let where = 'WHERE s.account_id = ?';
  if (q.from) { where += ' AND s.sold_on >= ?'; params.push(q.from); }
  if (q.to) { where += ' AND s.sold_on <= ?'; params.push(q.to); }
  if (q.status) { where += ' AND s.status = ?'; params.push(q.status); }
  if (q.payment_method) { where += ' AND s.payment_method = ?'; params.push(q.payment_method); }
  if (q.customer_id) { where += ' AND s.customer_id = ?'; params.push(Number(q.customer_id)); }
  if (q.user_id) { where += ' AND s.user_id = ?'; params.push(Number(q.user_id)); }
  if (q.unpaid) where += " AND s.status = 'completed' AND s.total - s.amount_paid > 0.005";
  if (q.search) {
    where += " AND (s.receipt_no LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')";
    const t = `%${escapeLike(q.search)}%`;
    params.push(t, t);
  }
  const pg = paging(q, 25);
  const from = `FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id ${where}`;
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.total END), 0) AS total,
              COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.total - s.cost_total END), 0) AS profit
       ${from}`,
    )
    .get(...params);
  const items = db
    .prepare(
      `SELECT s.id, s.receipt_no, s.total, s.discount, s.amount_paid, s.cost_total, s.payment_method, s.status, s.sold_on,
              s.created_at, c.name AS customer_name, u.name AS served_by, s.user_id,
              (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id) AS item_count
       ${from} ORDER BY s.id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`,
    )
    .all(...params);
  return { items, totals: { total: round(agg.total), profit: round(agg.profit) }, ...pageMeta(agg.n, pg) };
}

/** Voiding puts every unit back into the batch it came from and keeps an audit trail. */
export function voidSale(acct, id, reason = '') {
  return tx(() => {
    const sale = getSale(acct, id);
    if (sale.status === 'voided') throw conflict('This sale is already voided');
    const moves = db
      .prepare("SELECT * FROM stock_movements WHERE account_id = ? AND ref_type = 'sale' AND ref_id = ? AND type = 'sale'")
      .all(acct.id, id);
    for (const m of moves) {
      const qty = Math.abs(m.quantity);
      if (m.batch_id) {
        db.prepare('UPDATE batches SET quantity = quantity + ? WHERE id = ?').run(qty, m.batch_id);
      }
      recordMovement(acct, {
        productId: m.product_id, batchId: m.batch_id, type: 'sale_void', quantity: qty,
        unitCost: m.unit_cost, unitPrice: m.unit_price, refType: 'sale', refId: id, note: `Void ${sale.receipt_no}`,
      });
    }
    db.prepare("UPDATE sales SET status = 'voided', voided_at = ?, void_reason = ? WHERE id = ?").run(isoNow(), reason, id);
    return getSale(acct, id);
  });
}
