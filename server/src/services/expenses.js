import { db } from '../db.js';
import { notFound } from '../errors.js';
import { escapeLike, isoNow, pageMeta, paging, round, todayIn } from '../utils.js';

export const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Transport', 'Utilities', 'Licences & Permits', 'Packaging', 'Marketing', 'Repairs', 'Other'];

export function listExpenses(acct, q = {}) {
  const params = [acct.id];
  let where = 'WHERE account_id = ?';
  if (q.from) { where += ' AND spent_on >= ?'; params.push(q.from); }
  if (q.to) { where += ' AND spent_on <= ?'; params.push(q.to); }
  if (q.category) { where += ' AND category = ?'; params.push(q.category); }
  if (q.search) {
    where += " AND (description LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')";
    const t = `%${escapeLike(q.search)}%`;
    params.push(t, t);
  }
  const pg = paging(q, 25);
  const total = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS sum FROM expenses ${where}`).get(...params);
  const byCategory = db
    .prepare(`SELECT category, SUM(amount) AS total FROM expenses ${where} GROUP BY category ORDER BY total DESC`)
    .all(...params);
  const items = db
    .prepare(`SELECT * FROM expenses ${where} ORDER BY spent_on DESC, id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`)
    .all(...params);
  return { items, sum: round(total.sum), by_category: byCategory, categories: EXPENSE_CATEGORIES, ...pageMeta(total.n, pg) };
}

export function getExpense(acct, id) {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ? AND account_id = ?').get(id, acct.id);
  if (!row) throw notFound('Expense');
  return row;
}

export function createExpense(acct, d) {
  const id = db
    .prepare('INSERT INTO expenses (account_id, category, amount, description, spent_on, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(acct.id, d.category, round(d.amount), d.description ?? '', d.spent_on || todayIn(acct.timezone), isoNow()).lastInsertRowid;
  return getExpense(acct, Number(id));
}

export function updateExpense(acct, id, patch) {
  const cur = getExpense(acct, id);
  const m = { ...cur, ...patch };
  db.prepare('UPDATE expenses SET category = ?, amount = ?, description = ?, spent_on = ? WHERE id = ? AND account_id = ?').run(
    m.category, round(m.amount), m.description ?? '', m.spent_on, id, acct.id,
  );
  return getExpense(acct, id);
}

export function deleteExpense(acct, id) {
  getExpense(acct, id);
  db.prepare('DELETE FROM expenses WHERE id = ? AND account_id = ?').run(id, acct.id);
  return { deleted: true };
}
