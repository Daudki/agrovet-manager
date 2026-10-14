import { db } from '../db.js';
import { notFound } from '../errors.js';
import { escapeLike, isoNow } from '../utils.js';

const FIELDS = ['name', 'contact_person', 'phone', 'email', 'address', 'notes'];

export function listSuppliers(acct, { search } = {}) {
  const params = [acct.id];
  let where = 'WHERE s.account_id = ?';
  if (search) {
    where += " AND (s.name LIKE ? ESCAPE '\\' OR s.phone LIKE ? ESCAPE '\\' OR s.contact_person LIKE ? ESCAPE '\\')";
    const q = `%${escapeLike(search)}%`;
    params.push(q, q, q);
  }
  return db
    .prepare(
      `SELECT s.*,
         (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.is_archived = 0) AS product_count,
         (SELECT COUNT(*) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'received') AS purchase_count,
         (SELECT COALESCE(SUM(total), 0) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'received') AS total_purchased
       FROM suppliers s ${where} ORDER BY s.name`,
    )
    .all(...params);
}

export function getSupplier(acct, id) {
  const row = db.prepare('SELECT * FROM suppliers WHERE id = ? AND account_id = ?').get(id, acct.id);
  if (!row) throw notFound('Supplier');
  return row;
}

export function createSupplier(acct, data) {
  const vals = FIELDS.map((f) => data[f] ?? '');
  const id = db
    .prepare(
      `INSERT INTO suppliers (account_id, ${FIELDS.join(', ')}, created_at)
       VALUES (?, ${FIELDS.map(() => '?').join(', ')}, ?)`,
    )
    .run(acct.id, ...vals, isoNow()).lastInsertRowid;
  return getSupplier(acct, Number(id));
}

export function updateSupplier(acct, id, patch) {
  const cur = getSupplier(acct, id);
  const vals = FIELDS.map((f) => patch[f] ?? cur[f]);
  db.prepare(`UPDATE suppliers SET ${FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ? AND account_id = ?`).run(
    ...vals,
    id,
    acct.id,
  );
  return getSupplier(acct, id);
}

export function deleteSupplier(acct, id) {
  getSupplier(acct, id);
  // FKs are ON DELETE SET NULL, so history is preserved without the link.
  db.prepare('DELETE FROM suppliers WHERE id = ? AND account_id = ?').run(id, acct.id);
  return { deleted: true };
}
