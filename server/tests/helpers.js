import { initDb } from '../src/db.js';
import { createAccount, getAccount } from '../src/services/accounts.js';

export function freshDb() {
  initDb(':memory:');
}

export function makeAccount(email = 'owner@example.com', extra = {}) {
  const a = createAccount({ email, passwordHash: 'x', ownerName: 'Owner', shopName: 'Test Agrovet', ...extra });
  return getAccount(a.id);
}
