import { db, tx } from '../db.js';
import { conflict, isUnique, notFound } from '../errors.js';
import { isoNow } from '../utils.js';

export function listCategories(acct) {
  return db
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_archived = 0) AS product_count
       FROM categories c WHERE c.account_id = ? ORDER BY c.name`,
    )
    .all(acct.id);
}

export function getCategory(acct, id) {
  const row = db.prepare('SELECT * FROM categories WHERE id = ? AND account_id = ?').get(id, acct.id);
  if (!row) throw notFound('Category');
  return row;
}

export function createCategory(acct, { name, color }) {
  try {
    const id = db
      .prepare('INSERT INTO categories (account_id, name, color, created_at) VALUES (?, ?, ?, ?)')
      .run(acct.id, name, color || '#2e7d4f', isoNow()).lastInsertRowid;
    return getCategory(acct, Number(id));
  } catch (e) {
    if (isUnique(e)) throw conflict(`A category named "${name}" already exists`);
    throw e;
  }
}

export function updateCategory(acct, id, patch) {
  const cur = getCategory(acct, id);
  try {
    db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ? AND account_id = ?').run(
      patch.name ?? cur.name,
      patch.color ?? cur.color,
      id,
      acct.id,
    );
  } catch (e) {
    if (isUnique(e)) throw conflict(`A category named "${patch.name}" already exists`);
    throw e;
  }
  return getCategory(acct, id);
}

/** Deleting a category that has products requires reassigning them (or leaves them uncategorised). */
export function deleteCategory(acct, id, { reassignTo, force } = {}) {
  getCategory(acct, id);
  return tx(() => {
    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ? AND account_id = ?')
      .get(id, acct.id);
    if (n > 0 && !reassignTo && !force) {
      throw conflict(`This category still has ${n} product${n === 1 ? '' : 's'}. Move them to another category first.`);
    }
    if (reassignTo) {
      getCategory(acct, reassignTo);
      db.prepare('UPDATE products SET category_id = ? WHERE category_id = ? AND account_id = ?').run(
        reassignTo,
        id,
        acct.id,
      );
    }
    db.prepare('DELETE FROM categories WHERE id = ? AND account_id = ?').run(id, acct.id);
    return { deleted: true, moved: n };
  });
}
