import { db, tx } from '../db.js';
import { conflict, isUnique, notFound } from '../errors.js';
import { isoNow, validTimezone } from '../utils.js';
import { badRequest } from '../errors.js';

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
  const { password_hash, token_version, next_receipt, ...rest } = a;
  return rest;
};

export const getAccount = (id) => db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
export const getAccountByEmail = (email) =>
  db.prepare('SELECT * FROM accounts WHERE email = ?').get(String(email).trim());

export function createAccount({ email, passwordHash, ownerName, shopName, phone = '' }) {
  return tx(() => {
    let id;
    try {
      id = db
        .prepare(
          `INSERT INTO accounts (email, password_hash, owner_name, shop_name, phone, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(email, passwordHash, ownerName, shopName, phone, isoNow()).lastInsertRowid;
    } catch (e) {
      if (isUnique(e)) throw conflict('An account with this email already exists');
      throw e;
    }
    const ins = db.prepare('INSERT INTO categories (account_id, name, color, created_at) VALUES (?, ?, ?, ?)');
    for (const [name, color] of DEFAULT_CATEGORIES) ins.run(id, name, color, isoNow());
    return getAccount(Number(id));
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
  const acct = getAccount(id);
  if (!acct) throw notFound('Account');
  return acct;
}

/** Changes the password and invalidates every existing session. */
export function setPasswordHash(id, passwordHash) {
  db.prepare('UPDATE accounts SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(
    passwordHash,
    id,
  );
  return getAccount(id);
}

export function revokeSessions(id) {
  db.prepare('UPDATE accounts SET token_version = token_version + 1 WHERE id = ?').run(id);
}

export function nextReceiptNo(accountId) {
  const { next_receipt } = db.prepare('SELECT next_receipt FROM accounts WHERE id = ?').get(accountId);
  db.prepare('UPDATE accounts SET next_receipt = next_receipt + 1 WHERE id = ?').run(accountId);
  return `R-${String(next_receipt).padStart(6, '0')}`;
}
