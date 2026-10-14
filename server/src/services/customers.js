import { db, tx } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { escapeLike, isoNow, round, todayIn } from '../utils.js';

const FIELDS = ['name', 'phone', 'email', 'address', 'notes'];

const BALANCE_SQL = `(SELECT COALESCE(SUM(s.total - s.amount_paid), 0) FROM sales s
                      WHERE s.customer_id = c.id AND s.status = 'completed')`;

export function listCustomers(acct, { search, owing } = {}) {
  const params = [acct.id];
  let where = 'WHERE c.account_id = ?';
  if (search) {
    where += " AND (c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')";
    const q = `%${escapeLike(search)}%`;
    params.push(q, q);
  }
  const rows = db
    .prepare(
      `SELECT c.*, ${BALANCE_SQL} AS balance,
         (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS sale_count,
         (SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS total_spent
       FROM customers c ${where} ORDER BY c.name`,
    )
    .all(...params);
  return owing ? rows.filter((r) => r.balance > 0.005) : rows;
}

export function getCustomer(acct, id) {
  const row = db
    .prepare(`SELECT c.*, ${BALANCE_SQL} AS balance FROM customers c WHERE c.id = ? AND c.account_id = ?`)
    .get(id, acct.id);
  if (!row) throw notFound('Customer');
  return row;
}

export function getCustomerDetail(acct, id) {
  const customer = getCustomer(acct, id);
  const sales = db
    .prepare(
      `SELECT id, receipt_no, total, amount_paid, payment_method, status, sold_on
       FROM sales WHERE customer_id = ? AND account_id = ? ORDER BY id DESC LIMIT 25`,
    )
    .all(id, acct.id);
  const payments = db
    .prepare('SELECT * FROM payments WHERE customer_id = ? AND account_id = ? ORDER BY id DESC LIMIT 25')
    .all(id, acct.id);
  return { ...customer, sales, payments };
}

export function createCustomer(acct, data) {
  const id = db
    .prepare(
      `INSERT INTO customers (account_id, ${FIELDS.join(', ')}, created_at)
       VALUES (?, ${FIELDS.map(() => '?').join(', ')}, ?)`,
    )
    .run(acct.id, ...FIELDS.map((f) => data[f] ?? ''), isoNow()).lastInsertRowid;
  return getCustomer(acct, Number(id));
}

export function updateCustomer(acct, id, patch) {
  const cur = getCustomer(acct, id);
  db.prepare(`UPDATE customers SET ${FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ? AND account_id = ?`).run(
    ...FIELDS.map((f) => patch[f] ?? cur[f]),
    id,
    acct.id,
  );
  return getCustomer(acct, id);
}

export function deleteCustomer(acct, id) {
  const c = getCustomer(acct, id);
  if (c.balance > 0.005) throw badRequest('This customer still owes money. Record their payment before deleting.');
  db.prepare('DELETE FROM customers WHERE id = ? AND account_id = ?').run(id, acct.id);
  return { deleted: true };
}

/** Settles outstanding credit, oldest sale first. */
export function recordPayment(acct, customerId, { amount, method = 'cash', note = '' }) {
  return tx(() => {
    const customer = getCustomer(acct, customerId);
    amount = round(amount);
    if (amount <= 0) throw badRequest('Amount must be greater than zero');
    if (amount > round(customer.balance) + 0.005) {
      throw badRequest(`Payment exceeds the outstanding balance (${round(customer.balance)})`);
    }
    const open = db
      .prepare(
        `SELECT id, total, amount_paid FROM sales
         WHERE customer_id = ? AND account_id = ? AND status = 'completed' AND total - amount_paid > 0.005
         ORDER BY id`,
      )
      .all(customerId, acct.id);
    let left = amount;
    for (const s of open) {
      if (left <= 0) break;
      const apply = Math.min(left, round(s.total - s.amount_paid));
      db.prepare('UPDATE sales SET amount_paid = ? WHERE id = ?').run(round(s.amount_paid + apply), s.id);
      left = round(left - apply);
    }
    db.prepare(
      `INSERT INTO payments (account_id, customer_id, amount, method, note, paid_on, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(acct.id, customerId, amount, method, note, todayIn(acct.timezone), isoNow());
    return getCustomerDetail(acct, customerId);
  });
}
