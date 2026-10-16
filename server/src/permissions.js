/**
 * Role-based access control. Roles are ordered by power: owner > manager > cashier.
 * The server enforces these on every route; the client only uses them to hide things.
 */
export const ROLES = ['owner', 'manager', 'cashier'];
export const TEAM_ROLES = ['manager', 'cashier'];

const ALL = [
  'dashboard.view',
  'sell',
  'sales.view',
  'sales.void',
  'products.view',
  'products.manage',
  'costs.view', // buying prices, cost values, profit
  'stock.manage', // purchases, batches, adjustments, ledger
  'customers.manage',
  'customers.delete',
  'categories.manage',
  'suppliers.manage',
  'expenses.manage',
  'reports.view',
  'export',
  'settings.manage',
  'team.manage',
];

const MATRIX = {
  owner: new Set(ALL),
  manager: new Set(ALL.filter((p) => p !== 'settings.manage' && p !== 'team.manage')),
  cashier: new Set(['sell', 'sales.view', 'products.view', 'customers.manage']),
};

export const can = (role, perm) => !!MATRIX[role]?.has(perm);
export const permissionsFor = (role) => [...(MATRIX[role] ?? [])];
