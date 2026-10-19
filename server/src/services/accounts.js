import { db, tx } from '../db.js';
import { badRequest, conflict, isUnique, notFound } from '../errors.js';
import { TEAM_ROLES } from '../permissions.js';
import { isoNow, validTimezone } from '../utils.js';

export const DEFAULT_CATEGORIES = [
  ['Seeds', '#65a30d'],
  ['Fertilizers', '#ca8a04'],
  ['Herbicides – Selective', '#0d9488'],
  ['Herbicides – Non-selective', '#0f766e'],
  ['Insecticides', '#dc2626'],
  ['Fungicides', '#7c3aed'],
  ['Animal Feed', '#ea580c'],
  ['Vaccines & Vet Drugs', '#2563eb'],
  ['Sprayers & Pumps', '#475569'],
  ['Equipment & Tools', '#64748b'],
  ['Other', '#78716c'],
];

export const publicAccount = (a) => {
  if (!a) return null;
  // eslint-disable-next-line no-unused-vars
  const { password_hash, token_version, next_receipt, email, suspended_at, ...rest } = a;
  return rest;
};

export const publicUser = (u) =>
  u && { id: u.id, name: u.name, email: u.email, role: u.role, is_active: !!u.is_active, created_at: u.created_at };

export const getAccount = (id) => db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
export const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
export const getUserByEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim());

/** Creates the shop and its owner login together. */
export function createAccount({ email, passwordHash, ownerName, shopName, phone = '' }) {
  return tx(() => {
    let id;
    try {
      id = Number(
        db
          .prepare(
            `INSERT INTO accounts (email, password_hash, owner_name, shop_name, phone, created_at)
             VALUES (?, '', ?, ?, ?, ?)`,
          )
          .run(email, ownerName, shopName, phone, isoNow()).lastInsertRowid,
      );
      db.prepare(
        `INSERT INTO users (account_id, email, password_hash, name, role, created_at)
         VALUES (?, ?, ?, ?, 'owner', ?)`,
      ).run(id, email, passwordHash, ownerName, isoNow());
    } catch (e) {
      if (isUnique(e)) throw conflict('An account with this email already exists');
      throw e;
    }
    const ins = db.prepare('INSERT INTO categories (account_id, name, color, created_at) VALUES (?, ?, ?, ?)');
    for (const [name, color] of DEFAULT_CATEGORIES) ins.run(id, name, color, isoNow());
    return getAccount(id);
  });
}

const EDITABLE = [
  'owner_name',
  'shop_name',
  'phone',
  'address',
  'currency',
  'timezone',
  'expiry_warning_days',
  'receipt_footer',
];

export function updateAccount(id, patch) {
  if (patch.timezone && !validTimezone(patch.timezone)) throw badRequest('Unknown timezone');
  const keys = EDITABLE.filter((k) => patch[k] !== undefined);
  if (keys.length) {
    db.prepare(`UPDATE accounts SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
      ...keys.map((k) => patch[k]),
      id,
    );
  }
  if (patch.owner_name) {
    db.prepare("UPDATE users SET name = ? WHERE account_id = ? AND role = 'owner'").run(patch.owner_name, id);
  }
  const acct = getAccount(id);
  if (!acct) throw notFound('Account');
  return acct;
}

/** Changes a user's password and signs them out everywhere. */
export function setUserPassword(userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(passwordHash, userId);
  return getUser(userId);
}

export function revokeUserSessions(userId) {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
}

/* ───────────── Team (staff accounts) ───────────── */

export function listTeam(acct) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
         (SELECT COUNT(*) FROM sales s WHERE s.user_id = u.id AND s.status = 'completed') AS sale_count
       FROM users u WHERE u.account_id = ?
       ORDER BY u.role = 'owner' DESC, u.name COLLATE NOCASE`,
    )
    .all(acct.id)
    .map((u) => ({ ...u, is_active: !!u.is_active }));
}

function teamMember(acct, id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND account_id = ?').get(id, acct.id);
  if (!u) throw notFound('Team member');
  if (u.role === 'owner') throw badRequest('The owner account cannot be changed here');
  return u;
}

export function createTeamMember(acct, { name, email, passwordHash, role }) {
  if (!TEAM_ROLES.includes(role)) throw badRequest('Role must be manager or cashier');
  try {
    const id = Number(
      db
        .prepare('INSERT INTO users (account_id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(acct.id, email, passwordHash, name, role, isoNow()).lastInsertRowid,
    );
    return publicUser(getUser(id));
  } catch (e) {
    if (isUnique(e)) throw conflict('This email is already used by another login');
    throw e;
  }
}

/** Role changes, deactivation and password resets all sign the member out immediately. */
export function updateTeamMember(acct, id, patch) {
  const u = teamMember(acct, id);
  if (patch.role !== undefined && !TEAM_ROLES.includes(patch.role)) throw badRequest('Role must be manager or cashier');
  const roleChanged = patch.role !== undefined && patch.role !== u.role;
  const deactivated = patch.is_active === false && u.is_active;
  db.prepare(
    `UPDATE users SET name = ?, role = ?, is_active = ?, password_hash = ?,
       token_version = token_version + ? WHERE id = ?`,
  ).run(
    patch.name ?? u.name,
    patch.role ?? u.role,
    patch.is_active === undefined ? u.is_active : patch.is_active ? 1 : 0,
    patch.passwordHash ?? u.password_hash,
    roleChanged || deactivated || patch.passwordHash ? 1 : 0,
    id,
  );
  return publicUser(getUser(id));
}

export function deleteTeamMember(acct, id) {
  teamMember(acct, id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id); // sales keep their history (user_id → NULL)
  return { deleted: true };
}

export function nextReceiptNo(accountId) {
  const { next_receipt } = db.prepare('SELECT next_receipt FROM accounts WHERE id = ?').get(accountId);
  db.prepare('UPDATE accounts SET next_receipt = next_receipt + 1 WHERE id = ?').run(accountId);
  return `R-${String(next_receipt).padStart(6, '0')}`;
}
