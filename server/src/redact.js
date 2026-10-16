import { can } from './permissions.js';

/** Removes cost / profit fields for roles without `costs.view` (cashiers). */
const hide = (role) => !can(role, 'costs.view');
const omit = (obj, keys) => {
  const c = { ...obj };
  for (const k of keys) delete c[k];
  return c;
};

export function product(role, p) {
  if (!hide(role) || !p) return p;
  const out = omit(p, ['buying_price', 'cost_value', 'supplier_id', 'supplier_name']);
  if (out.batches) out.batches = out.batches.map((b) => omit(b, ['cost_price', 'supplier_id', 'supplier_name']));
  if (out.movements) out.movements = out.movements.map((m) => omit(m, ['unit_cost']));
  if (out.sales_summary) out.sales_summary = omit(out.sales_summary, ['profit']);
  return out;
}

export const products = (role, list) => (hide(role) ? list.map((p) => product(role, p)) : list);

export function productPage(role, page) {
  return hide(role) ? { ...page, items: products(role, page.items) } : page;
}

export function search(role, r) {
  return hide(role) ? { matches: products(role, r.matches), alternatives: products(role, r.alternatives) } : r;
}

export function alerts(role, a) {
  return hide(role) ? omit(a, ['stock_cost_value', 'stock_retail_value']) : a;
}

export function sale(role, s) {
  if (!hide(role) || !s) return s;
  const out = omit(s, ['cost_total', 'profit']);
  if (out.items) out.items = out.items.map((i) => omit(i, ['unit_cost']));
  return out;
}

export function salePage(role, page) {
  if (!hide(role)) return page;
  return {
    ...page,
    items: page.items.map((s) => omit(s, ['cost_total'])),
    totals: omit(page.totals, ['profit']),
  };
}
