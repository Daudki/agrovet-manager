import { db } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { isoNow } from '../utils.js';
import { getAccount, listTeam, setUserPassword } from './accounts.js';

const SHOP_COLUMNS = `
  a.id, a.shop_name, a.owner_name, a.phone, a.address, a.currency, a.timezone, a.created_at, a.suspended_at,
  (SELECT u.email FROM users u WHERE u.account_id = a.id AND u.role = 'owner' ORDER BY u.id LIMIT 1) AS owner_email,
  (SELECT COUNT(*) FROM users u WHERE u.account_id = a.id AND u.is_active = 1) AS users,
  (SELECT COUNT(*) FROM products p WHERE p.account_id = a.id) AS products,
  (SELECT COUNT(*) FROM sales s WHERE s.account_id = a.id AND s.status = 'completed') AS sales_count,
  (SELECT MAX(s.created_at) FROM sales s WHERE s.account_id = a.id) AS last_sale_at
`;

const shape = (r) => ({ ...r, suspended: r.suspended_at !== null });

export function platformStats() {
  const n = (sql, ...args) => db.prepare(sql).get(...args).n;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const pages = db.prepare('PRAGMA page_count').get().page_count;
  const pageSize = db.prepare('PRAGMA page_size').get().page_size;
  return {
    shops: n('SELECT COUNT(*) AS n FROM accounts'),
    new_30d: n('SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ?', since),
    active_30d: n('SELECT COUNT(DISTINCT account_id) AS n FROM sales WHERE created_at >= ?', since),
    suspended: n('SELECT COUNT(*) AS n FROM accounts WHERE suspended_at IS NOT NULL'),
    users: n('SELECT COUNT(*) AS n FROM users WHERE is_active = 1'),
    sales_total: n("SELECT COUNT(*) AS n FROM sales WHERE status = 'completed'"),
    db_bytes: pages * pageSize,
  };
}

export function listShops({ q = '', status = 'all' } = {}) {
  const where = [];
  const args = [];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push(
      `(a.shop_name LIKE ? ESCAPE '\\' OR a.owner_name LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM users u WHERE u.account_id = a.id AND u.email LIKE ? ESCAPE '\\'))`,
    );
    args.push(like, like, like);
  }
  if (status === 'suspended') where.push('a.suspended_at IS NOT NULL');
  if (status === 'active') where.push('a.suspended_at IS NULL');
  const sql = `SELECT ${SHOP_COLUMNS} FROM accounts a ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.created_at DESC, a.id DESC LIMIT 500`;
  return db.prepare(sql).all(...args).map(shape);
}

function shopRow(id) {
  const row = db.prepare(`SELECT ${SHOP_COLUMNS} FROM accounts a WHERE a.id = ?`).get(id);
  if (!row) throw notFound('Shop');
  return shape(row);
}

export function getShop(id) {
  const shop = shopRow(id);
  return { shop, team: listTeam({ id }) };
}

export function setSuspended(id, suspended) {
  const result = db.prepare('UPDATE accounts SET suspended_at = ? WHERE id = ?').run(suspended ? isoNow() : null, id);
  if (!result.changes) throw notFound('Shop');
  return shopRow(id);
}

export function resetShopUserPassword(accountId, userId, passwordHash) {
  if (!getAccount(accountId)) throw notFound('Shop');
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND account_id = ?').get(userId, accountId);
  if (!user) throw notFound('User');
  if (!passwordHash) throw badRequest('Password hash missing');
  setUserPassword(userId, passwordHash);
}
