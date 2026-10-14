import { db } from '../db.js';
import { badRequest } from '../errors.js';
import { addDays, round, startOfMonth, todayIn } from '../utils.js';
import { listBatches } from './stock.js';
import { listProducts, stockSummary } from './products.js';

const salesAgg = (accId, from, to) =>
  db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(cost_total), 0) AS cogs,
              COALESCE(SUM(discount), 0) AS discounts, COUNT(*) AS count
       FROM sales WHERE account_id = ? AND status = 'completed' AND sold_on BETWEEN ? AND ?`,
    )
    .get(accId, from, to);

const expenseSum = (accId, from, to) =>
  db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE account_id = ? AND spent_on BETWEEN ? AND ?').get(accId, from, to).s;

function fillDays(rows, from, to, keys) {
  const map = new Map(rows.map((r) => [r.day, r]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = map.get(d);
    out.push({ day: d, ...Object.fromEntries(keys.map((k) => [k, round(r?.[k] ?? 0)])) });
  }
  return out;
}

const pct = (now, before) => (before > 0 ? round(((now - before) / before) * 100, 1) : null);

export function dashboard(acct) {
  const today = todayIn(acct.timezone);
  const yesterday = addDays(today, -1);
  const monthStart = startOfMonth(today);
  const dom = Number(today.slice(8));
  const prevMonthEnd = addDays(monthStart, -1);
  const prevMonthStart = startOfMonth(prevMonthEnd);
  const prevSame = [addDays(prevMonthStart, dom - 1), prevMonthEnd].sort()[0];

  const todayS = salesAgg(acct.id, today, today);
  const yestS = salesAgg(acct.id, yesterday, yesterday);
  const monthS = salesAgg(acct.id, monthStart, today);
  const prevS = salesAgg(acct.id, prevMonthStart, prevSame);
  const monthExp = expenseSum(acct.id, monthStart, today);
  const prevExp = expenseSum(acct.id, prevMonthStart, prevSame);
  const netNow = monthS.revenue - monthS.cogs - monthExp;
  const netPrev = prevS.revenue - prevS.cogs - prevExp;

  const from30 = addDays(today, -29);
  const trend = fillDays(
    db
      .prepare(
        `SELECT sold_on AS day, SUM(total) AS revenue, SUM(total - cost_total) AS profit
         FROM sales WHERE account_id = ? AND status = 'completed' AND sold_on BETWEEN ? AND ? GROUP BY sold_on`,
      )
      .all(acct.id, from30, today),
    from30, today, ['revenue', 'profit'],
  );

  const topProducts = db
    .prepare(
      `SELECT si.product_name AS name, SUM(si.quantity) AS qty, SUM(si.line_total) AS revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.account_id = ? AND s.status = 'completed' AND s.sold_on BETWEEN ? AND ?
       GROUP BY si.product_name ORDER BY revenue DESC LIMIT 5`,
    )
    .all(acct.id, from30, today);

  const byCategory = db
    .prepare(
      `SELECT COALESCE(c.name, 'Uncategorised') AS name, COALESCE(c.color, '#94a3b8') AS color, SUM(si.line_total) AS revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE s.account_id = ? AND s.status = 'completed' AND s.sold_on BETWEEN ? AND ?
       GROUP BY c.id ORDER BY revenue DESC`,
    )
    .all(acct.id, from30, today);

  const recentSales = db
    .prepare(
      `SELECT s.id, s.receipt_no, s.total, s.payment_method, s.created_at, c.name AS customer_name
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.account_id = ? AND s.status = 'completed' ORDER BY s.id DESC LIMIT 6`,
    )
    .all(acct.id);

  const receivables = db
    .prepare(
      `SELECT COALESCE(SUM(total - amount_paid), 0) AS owed, COUNT(DISTINCT customer_id) AS customers
       FROM sales WHERE account_id = ? AND status = 'completed' AND total - amount_paid > 0.005`,
    )
    .get(acct.id);

  const lowStock = listProducts(acct, { status: 'attention', limit: 100 }).items
    .filter((p) => p.stock_status !== 'ok')
    .slice(0, 6)
    .map((p) => ({ id: p.id, name: p.name, unit: p.unit, sellable: p.sellable, reorder_level: p.reorder_level, stock_status: p.stock_status }));

  const expiring = listBatches(acct, { status: 'expiring', limit: 6 }).items;
  const expired = listBatches(acct, { status: 'expired', limit: 6 }).items;

  return {
    today,
    kpis: {
      sales_today: round(todayS.revenue),
      sales_today_change: pct(todayS.revenue, yestS.revenue),
      orders_today: todayS.count,
      revenue_month: round(monthS.revenue),
      revenue_month_change: pct(monthS.revenue, prevS.revenue),
      gross_profit_month: round(monthS.revenue - monthS.cogs),
      net_profit_month: round(netNow),
      net_profit_change: pct(netNow, netPrev),
      expenses_month: round(monthExp),
    },
    stock: stockSummary(acct),
    receivables: { owed: round(receivables.owed), customers: receivables.customers },
    trend, top_products: topProducts, by_category: byCategory, recent_sales: recentSales,
    alerts: { low_stock: lowStock, expiring, expired },
  };
}

export function salesReport(acct, from, to) {
  if (!from || !to || from > to) throw badRequest('Provide a valid date range');
  const s = salesAgg(acct.id, from, to);
  const exp = db
    .prepare('SELECT category, SUM(amount) AS total FROM expenses WHERE account_id = ? AND spent_on BETWEEN ? AND ? GROUP BY category ORDER BY total DESC')
    .all(acct.id, from, to);
  const expensesTotal = exp.reduce((a, e) => a + e.total, 0);
  const days = Math.min((Date.parse(to) - Date.parse(from)) / 86400000 + 1, 400);
  const daily = fillDays(
    db
      .prepare(
        `SELECT sold_on AS day, SUM(total) AS revenue, SUM(total - cost_total) AS profit, COUNT(*) AS orders
         FROM sales WHERE account_id = ? AND status = 'completed' AND sold_on BETWEEN ? AND ? GROUP BY sold_on`,
      )
      .all(acct.id, from, to),
    from, days >= 400 ? addDays(from, 399) : to, ['revenue', 'profit', 'orders'],
  );
  const methods = db
    .prepare(
      `SELECT payment_method AS method, COUNT(*) AS count, SUM(total) AS total FROM sales
       WHERE account_id = ? AND status = 'completed' AND sold_on BETWEEN ? AND ? GROUP BY payment_method ORDER BY total DESC`,
    )
    .all(acct.id, from, to);
  const categories = db
    .prepare(
      `SELECT COALESCE(c.name, 'Uncategorised') AS name, COALESCE(c.color, '#94a3b8') AS color,
              SUM(si.line_total) AS revenue, SUM(si.line_total - si.unit_cost * si.quantity) AS profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE s.account_id = ? AND s.status = 'completed' AND s.sold_on BETWEEN ? AND ?
       GROUP BY c.id ORDER BY revenue DESC`,
    )
    .all(acct.id, from, to);
  const products = db
    .prepare(
      `SELECT si.product_name AS name, si.unit, SUM(si.quantity) AS qty, SUM(si.line_total) AS revenue,
              SUM(si.line_total - si.unit_cost * si.quantity) AS profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.account_id = ? AND s.status = 'completed' AND s.sold_on BETWEEN ? AND ?
       GROUP BY si.product_name, si.unit ORDER BY revenue DESC LIMIT 15`,
    )
    .all(acct.id, from, to);
  const gross = s.revenue - s.cogs;
  return {
    from, to,
    summary: {
      revenue: round(s.revenue), discounts: round(s.discounts), cogs: round(s.cogs), gross_profit: round(gross),
      gross_margin: s.revenue > 0 ? round((gross / s.revenue) * 100, 1) : 0,
      expenses: round(expensesTotal), net_profit: round(gross - expensesTotal),
      orders: s.count, average_sale: s.count ? round(s.revenue / s.count) : 0,
    },
    expenses_by_category: exp.map((e) => ({ ...e, total: round(e.total) })),
    daily,
    payment_methods: methods.map((m) => ({ ...m, total: round(m.total) })),
    categories: categories.map((c) => ({ ...c, revenue: round(c.revenue), profit: round(c.profit) })),
    top_products: products.map((p) => ({ ...p, qty: round(p.qty, 3), revenue: round(p.revenue), profit: round(p.profit) })),
  };
}

export function inventoryReport(acct) {
  const { items } = listProducts(acct, { limit: 500, sort: 'name' });
  const rows = items.map((p) => ({
    id: p.id, name: p.name, sku: p.sku, unit: p.unit, category: p.category_name ?? 'Uncategorised',
    category_color: p.category_color ?? '#94a3b8', stock: round(p.stock, 3), selling_price: p.selling_price,
    cost_value: round(p.cost_value), retail_value: round(p.stock * p.selling_price), stock_status: p.stock_status,
  }));
  const map = new Map();
  for (const r of rows) {
    const c = map.get(r.category) ?? { name: r.category, color: r.category_color, products: 0, cost_value: 0, retail_value: 0 };
    c.products += 1; c.cost_value += r.cost_value; c.retail_value += r.retail_value;
    map.set(r.category, c);
  }
  const categories = [...map.values()].map((c) => ({ ...c, cost_value: round(c.cost_value), retail_value: round(c.retail_value) }))
    .sort((a, b) => b.cost_value - a.cost_value);
  const cost = round(rows.reduce((s, r) => s + r.cost_value, 0));
  const retail = round(rows.reduce((s, r) => s + r.retail_value, 0));
  return { totals: { cost_value: cost, retail_value: retail, potential_profit: round(retail - cost), products: rows.length }, categories, items: rows };
}
