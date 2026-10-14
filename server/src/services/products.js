import { db, tx } from '../db.js';
import { badRequest, conflict, isUnique, notFound } from '../errors.js';
import { addDays, escapeLike, isoNow, pageMeta, paging, round, todayIn } from '../utils.js';
import { insertBatch } from './ledger.js';

const SORTS = {
  name: 'name COLLATE NOCASE',
  stock: 'sellable',
  selling_price: 'selling_price',
  created_at: 'id',
  next_expiry: 'next_expiry IS NULL, next_expiry',
};

/** One row per product with live stock figures derived from its batches. */
const BASE_SQL = `
  SELECT p.id, p.account_id, p.category_id, p.supplier_id, p.name, p.sku, p.barcode, p.unit,
         p.buying_price, p.selling_price, p.reorder_level, p.description, p.attributes,
         p.is_archived, p.created_at, p.updated_at,
         c.name AS category_name, c.color AS category_color, s.name AS supplier_name,
         COALESCE(st.stock, 0) AS stock,
         COALESCE(st.sellable, 0) AS sellable,
         COALESCE(st.expired_qty, 0) AS expired_qty,
         COALESCE(st.expiring_qty, 0) AS expiring_qty,
         COALESCE(st.cost_value, 0) AS cost_value,
         st.next_expiry AS next_expiry,
         CASE WHEN COALESCE(st.sellable, 0) <= 0 THEN 'out'
              WHEN p.reorder_level > 0 AND st.sellable <= p.reorder_level THEN 'low'
              ELSE 'ok' END AS stock_status
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  LEFT JOIN (
    SELECT product_id,
           SUM(quantity) AS stock,
           SUM(CASE WHEN expiry_date IS NULL OR expiry_date >= :today THEN quantity ELSE 0 END) AS sellable,
           SUM(CASE WHEN expiry_date < :today THEN quantity ELSE 0 END) AS expired_qty,
           SUM(CASE WHEN expiry_date >= :today AND expiry_date <= :soon THEN quantity ELSE 0 END) AS expiring_qty,
           SUM(quantity * cost_price) AS cost_value,
           MIN(CASE WHEN expiry_date >= :today THEN expiry_date END) AS next_expiry
    FROM batches WHERE account_id = :acc AND quantity > 0 GROUP BY product_id
  ) st ON st.product_id = p.id
  WHERE p.account_id = :acc`;

const ctx = (acct) => {
  const today = todayIn(acct.timezone);
  return { acc: acct.id, today, soon: addDays(today, acct.expiry_warning_days) };
};

function hydrate(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const ings = db
    .prepare(`SELECT product_id, name FROM product_ingredients WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY name`)
    .all(...ids);
  const byProduct = new Map();
  for (const i of ings) {
    if (!byProduct.has(i.product_id)) byProduct.set(i.product_id, []);
    byProduct.get(i.product_id).push(i.name);
  }
  return rows.map((r) => ({
    ...r,
    is_archived: !!r.is_archived,
    attributes: safeJson(r.attributes),
    active_ingredients: byProduct.get(r.id) ?? [],
  }));
}

const safeJson = (s) => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export function listProducts(acct, q = {}) {
  const params = ctx(acct);
  const conds = [];
  if (!q.archived) conds.push('is_archived = 0');
  else if (q.archived === 'only') conds.push('is_archived = 1');
  if (q.category_id === 'none') conds.push('category_id IS NULL');
  else if (q.category_id) {
    conds.push('category_id = :cat');
    params.cat = Number(q.category_id);
  }
  if (q.supplier_id) {
    conds.push('supplier_id = :sup');
    params.sup = Number(q.supplier_id);
  }
  switch (q.status) {
    case 'ok': conds.push("stock_status = 'ok'"); break;
    case 'low': conds.push("stock_status = 'low'"); break;
    case 'out': conds.push("stock_status = 'out'"); break;
    case 'attention': conds.push("(stock_status IN ('low','out') OR expiring_qty > 0 OR expired_qty > 0)"); break;
    case 'expiring': conds.push('expiring_qty > 0'); break;
    case 'expired': conds.push('expired_qty > 0'); break;
    case 'sellable': conds.push('sellable > 0'); break;
    default:
  }
  if (q.ids?.length) {
    conds.push(`id IN (${q.ids.map((_, i) => `:id${i}`).join(',')})`);
    q.ids.forEach((id, i) => (params[`id${i}`] = id));
  }
  if (q.search?.trim()) {
    const term = q.search.trim();
    conds.push(`(name LIKE :q ESCAPE '\\' OR sku LIKE :q ESCAPE '\\' OR barcode = :exact
      OR EXISTS (SELECT 1 FROM product_ingredients pi WHERE pi.product_id = id AND pi.name LIKE :q ESCAPE '\\'))`);
    params.q = `%${escapeLike(term)}%`;
    params.exact = term;
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const sort = SORTS[q.sort] ?? SORTS.name;
  const dir = q.dir === 'desc' ? 'DESC' : 'ASC';
  const pg = paging(q, 25, 500);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM (${BASE_SQL}) ${where}`).get(params).n;
  const rows = db
    .prepare(`SELECT * FROM (${BASE_SQL}) ${where} ORDER BY ${sort} ${dir}, id LIMIT ${pg.limit} OFFSET ${pg.offset}`)
    .all(params);
  return { items: hydrate(rows), ...pageMeta(total, pg) };
}

export function getProduct(acct, id) {
  const row = db.prepare(`SELECT * FROM (${BASE_SQL}) WHERE id = :id`).get({ ...ctx(acct), id });
  if (!row) throw notFound('Product');
  return hydrate([row])[0];
}

export function getProductDetail(acct, id) {
  const product = getProduct(acct, id);
  const batches = db
    .prepare(
      `SELECT b.*, s.name AS supplier_name FROM batches b LEFT JOIN suppliers s ON s.id = b.supplier_id
       WHERE b.product_id = ? AND b.account_id = ?
       ORDER BY b.quantity = 0, b.expiry_date IS NULL, b.expiry_date, b.id`,
    )
    .all(id, acct.id);
  const movements = db
    .prepare('SELECT * FROM stock_movements WHERE product_id = ? AND account_id = ? ORDER BY id DESC LIMIT 30')
    .all(id, acct.id);
  const sold = db
    .prepare(
      `SELECT COALESCE(SUM(si.quantity), 0) AS qty, COALESCE(SUM(si.line_total), 0) AS revenue,
              COALESCE(SUM(si.line_total - si.unit_cost * si.quantity), 0) AS profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE si.product_id = ? AND s.account_id = ? AND s.status = 'completed'`,
    )
    .get(id, acct.id);
  return { ...product, batches, movements, sales_summary: sold };
}

function checkRefs(acct, data) {
  if (data.category_id) {
    const ok = db.prepare('SELECT 1 FROM categories WHERE id = ? AND account_id = ?').get(data.category_id, acct.id);
    if (!ok) throw badRequest('Unknown category');
  }
  if (data.supplier_id) {
    const ok = db.prepare('SELECT 1 FROM suppliers WHERE id = ? AND account_id = ?').get(data.supplier_id, acct.id);
    if (!ok) throw badRequest('Unknown supplier');
  }
}

const normIngredients = (list = []) => {
  const seen = new Map();
  for (const raw of list) {
    const v = String(raw).trim();
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()].slice(0, 20);
};

function setIngredients(acct, productId, list) {
  db.prepare('DELETE FROM product_ingredients WHERE product_id = ?').run(productId);
  const ins = db.prepare('INSERT INTO product_ingredients (product_id, account_id, name) VALUES (?, ?, ?)');
  for (const name of normIngredients(list)) ins.run(productId, acct.id, name);
}

function nextSku(acct) {
  const { n } = db
    .prepare("SELECT COALESCE(MAX(CAST(SUBSTR(sku, 5) AS INTEGER)), 0) + 1 AS n FROM products WHERE account_id = ? AND sku GLOB 'SKU-[0-9]*'")
    .get(acct.id);
  return `SKU-${String(n).padStart(5, '0')}`;
}

const cleanAttrs = (attrs = []) =>
  JSON.stringify(
    attrs
      .map((a) => ({ key: String(a.key ?? '').trim(), value: String(a.value ?? '').trim() }))
      .filter((a) => a.key && a.value)
      .slice(0, 20),
  );

export function createProduct(acct, data) {
  return tx(() => {
    checkRefs(acct, data);
    const now = isoNow();
    let id;
    try {
      id = Number(
        db
          .prepare(
            `INSERT INTO products (account_id, category_id, supplier_id, name, sku, barcode, unit, buying_price,
               selling_price, reorder_level, description, attributes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            acct.id,
            data.category_id ?? null,
            data.supplier_id ?? null,
            data.name,
            data.sku?.trim() || nextSku(acct),
            data.barcode?.trim() || null,
            data.unit || 'pcs',
            round(data.buying_price ?? 0),
            round(data.selling_price ?? 0),
            data.reorder_level ?? 0,
            data.description ?? '',
            cleanAttrs(data.attributes),
            now,
            now,
          ).lastInsertRowid,
      );
    } catch (e) {
      if (isUnique(e)) throw conflict('That SKU is already used by another product');
      throw e;
    }
    setIngredients(acct, id, data.active_ingredients);
    const os = data.opening_stock;
    if (os && os.quantity > 0) {
      insertBatch(acct, {
        productId: id,
        quantity: os.quantity,
        costPrice: os.cost_price ?? data.buying_price ?? 0,
        batchNumber: os.batch_number,
        expiryDate: os.expiry_date,
        supplierId: data.supplier_id,
        type: 'opening',
        note: 'Opening stock',
      });
    }
    return getProduct(acct, id);
  });
}

export function updateProduct(acct, id, patch) {
  return tx(() => {
    const cur = getProduct(acct, id);
    checkRefs(acct, patch);
    const m = { ...cur, ...patch };
    try {
      db.prepare(
        `UPDATE products SET category_id = ?, supplier_id = ?, name = ?, sku = ?, barcode = ?, unit = ?,
           buying_price = ?, selling_price = ?, reorder_level = ?, description = ?, attributes = ?, updated_at = ?
         WHERE id = ? AND account_id = ?`,
      ).run(
        m.category_id ?? null,
        m.supplier_id ?? null,
        m.name,
        m.sku?.trim() || cur.sku,
        m.barcode?.trim() || null,
        m.unit,
        round(m.buying_price),
        round(m.selling_price),
        m.reorder_level,
        m.description ?? '',
        patch.attributes ? cleanAttrs(patch.attributes) : JSON.stringify(cur.attributes),
        isoNow(),
        id,
        acct.id,
      );
    } catch (e) {
      if (isUnique(e)) throw conflict('That SKU is already used by another product');
      throw e;
    }
    if (patch.active_ingredients) setIngredients(acct, id, patch.active_ingredients);
    return getProduct(acct, id);
  });
}

export function setArchived(acct, id, archived) {
  getProduct(acct, id);
  db.prepare('UPDATE products SET is_archived = ?, updated_at = ? WHERE id = ? AND account_id = ?').run(
    archived ? 1 : 0,
    isoNow(),
    id,
    acct.id,
  );
  return getProduct(acct, id);
}

/** Hard-deletes products that never sold; archives the rest so history stays intact. */
export function deleteProduct(acct, id) {
  getProduct(acct, id);
  const used = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM sale_items si JOIN sales s ON s.id = si.sale_id
               WHERE si.product_id = ? AND s.account_id = ?) AS sold,
              (SELECT COUNT(*) FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
               WHERE pi.product_id = ? AND p.account_id = ?) AS bought`,
    )
    .get(id, acct.id, id, acct.id);
  if (used.sold + used.bought > 0) {
    setArchived(acct, id, true);
    return { deleted: false, archived: true };
  }
  db.prepare('DELETE FROM products WHERE id = ? AND account_id = ?').run(id, acct.id);
  return { deleted: true, archived: false };
}

export function alternatives(acct, id) {
  getProduct(acct, id);
  const ids = db
    .prepare(
      `SELECT DISTINCT b.product_id AS id
       FROM product_ingredients a
       JOIN product_ingredients b ON b.account_id = a.account_id AND b.name = a.name AND b.product_id <> a.product_id
       JOIN products p ON p.id = b.product_id AND p.is_archived = 0
       WHERE a.product_id = ? AND a.account_id = ?`,
    )
    .all(id, acct.id)
    .map((r) => r.id);
  return ids.length ? listProducts(acct, { ids, limit: 50 }).items : [];
}

/** Quick lookup used by the global search: direct matches plus same-ingredient alternatives. */
export function searchProducts(acct, term) {
  const matches = listProducts(acct, { search: term, limit: 8 }).items;
  if (!matches.length) return { matches, alternatives: [] };
  const matchIds = matches.map((m) => m.id);
  const names = matches.flatMap((m) => m.active_ingredients);
  if (!names.length) return { matches, alternatives: [] };
  const rows = db
    .prepare(
      `SELECT DISTINCT product_id AS id FROM product_ingredients
       WHERE account_id = ? AND name IN (${names.map(() => '?').join(',')})
         AND product_id NOT IN (${matchIds.map(() => '?').join(',')})`,
    )
    .all(acct.id, ...names, ...matchIds);
  const ids = rows.map((r) => r.id).slice(0, 8);
  return { matches, alternatives: ids.length ? listProducts(acct, { ids, limit: 8 }).items : [] };
}

/** Headline stock numbers for dashboards and reports. */
export function stockSummary(acct) {
  const params = ctx(acct);
  const r = db
    .prepare(
      `SELECT COUNT(*) AS products,
              COALESCE(SUM(CASE WHEN stock_status = 'out' THEN 1 ELSE 0 END), 0) AS out_of_stock,
              COALESCE(SUM(CASE WHEN stock_status = 'low' THEN 1 ELSE 0 END), 0) AS low_stock,
              COALESCE(SUM(CASE WHEN expiring_qty > 0 THEN 1 ELSE 0 END), 0) AS expiring,
              COALESCE(SUM(CASE WHEN expired_qty > 0 THEN 1 ELSE 0 END), 0) AS expired,
              COALESCE(SUM(cost_value), 0) AS stock_cost_value,
              COALESCE(SUM(stock * selling_price), 0) AS stock_retail_value
       FROM (${BASE_SQL}) WHERE is_archived = 0`,
    )
    .get(params);
  return { ...r, stock_cost_value: round(r.stock_cost_value), stock_retail_value: round(r.stock_retail_value) };
}
