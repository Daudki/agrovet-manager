import { Router } from 'express';
import { notFound } from '../errors.js';
import { need, requireAuth } from '../middleware/auth.js';
import { can } from '../permissions.js';
import * as redact from '../redact.js';
import * as S from './schemas.js';
import { accountRouter, authRouter, teamRouter } from './auth.js';
import * as categories from '../services/categories.js';
import * as customers from '../services/customers.js';
import * as expenses from '../services/expenses.js';
import * as exportsSvc from '../services/exports.js';
import * as products from '../services/products.js';
import * as reports from '../services/reports.js';
import * as sales from '../services/sales.js';
import * as stock from '../services/stock.js';
import * as suppliers from '../services/suppliers.js';
import { startOfMonth, todayIn } from '../utils.js';

const intId = (req) => {
  const n = Number(req.params.id);
  return Number.isInteger(n) && n > 0 ? n : 0; // 0 never exists → services answer 404
};
const dateQ = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const dateRange = (q) => ({ ...q, from: dateQ(q.from), to: dateQ(q.to) });

function csv(res, name, body) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(body);
}

export const api = Router();

// Query strings may carry arrays/objects (?a[b]=1). Keep plain strings only; `ids` is internal-only.
api.use((req, _res, next) => {
  const clean = {};
  for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string' && k !== 'ids') clean[k] = v;
  req.query = clean;
  next();
});

api.use('/auth', authRouter);
api.use(requireAuth); // everything below is private to the signed-in login
api.use('/account', accountRouter);
api.use('/team', teamRouter);

const role = (req) => req.user.role;

/* Dashboard & reports */
api.get('/dashboard', need('dashboard.view'), (req, res) => res.json(reports.dashboard(req.acct)));
api.get('/alerts', (req, res) => res.json(redact.alerts(role(req), products.stockSummary(req.acct))));
api.get('/reports/sales', need('reports.view'), (req, res) => {
  const today = todayIn(req.acct.timezone);
  res.json(reports.salesReport(req.acct, dateQ(req.query.from) ?? startOfMonth(today), dateQ(req.query.to) ?? today));
});
api.get('/reports/inventory', need('reports.view'), (req, res) => res.json(reports.inventoryReport(req.acct)));
api.get('/search', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  res.json(q.length < 2 ? { matches: [], alternatives: [] } : redact.search(role(req), products.searchProducts(req.acct, q.slice(0, 80))));
});

/* Categories */
api.get('/categories', (req, res) => res.json({ items: categories.listCategories(req.acct) }));
api.post('/categories', need('categories.manage'), (req, res) => res.status(201).json(categories.createCategory(req.acct, S.parse(S.category, req.body))));
api.patch('/categories/:id', need('categories.manage'), (req, res) => res.json(categories.updateCategory(req.acct, intId(req), S.parse(S.categoryPatch, req.body))));
api.delete('/categories/:id', need('categories.manage'), (req, res) => {
  res.json(categories.deleteCategory(req.acct, intId(req), { reassignTo: Number(req.query.reassign_to) || undefined }));
});

/* Suppliers */
api.use('/suppliers', need('suppliers.manage'));
api.get('/suppliers', (req, res) => res.json({ items: suppliers.listSuppliers(req.acct, { search: req.query.search }) }));
api.post('/suppliers', (req, res) => res.status(201).json(suppliers.createSupplier(req.acct, S.parse(S.supplier, req.body))));
api.get('/suppliers/:id', (req, res) => res.json(suppliers.getSupplier(req.acct, intId(req))));
api.patch('/suppliers/:id', (req, res) => res.json(suppliers.updateSupplier(req.acct, intId(req), S.parse(S.supplierPatch, req.body))));
api.delete('/suppliers/:id', (req, res) => res.json(suppliers.deleteSupplier(req.acct, intId(req))));

/* Customers */
api.get('/customers', (req, res) =>
  res.json({ items: customers.listCustomers(req.acct, { search: req.query.search, owing: req.query.owing === 'true' }) }));
api.post('/customers', need('customers.manage'), (req, res) => res.status(201).json(customers.createCustomer(req.acct, S.parse(S.customer, req.body))));
api.get('/customers/:id', (req, res) => res.json(customers.getCustomerDetail(req.acct, intId(req))));
api.patch('/customers/:id', need('customers.manage'), (req, res) => res.json(customers.updateCustomer(req.acct, intId(req), S.parse(S.customerPatch, req.body))));
api.delete('/customers/:id', need('customers.delete'), (req, res) => res.json(customers.deleteCustomer(req.acct, intId(req))));
api.post('/customers/:id/payments', need('customers.manage'), (req, res) =>
  res.status(201).json(customers.recordPayment(req.acct, intId(req), S.parse(S.customerPayment, req.body))));

/* Products (cashiers can look up and sell, but never see costs) */
api.get('/products', (req, res) => res.json(redact.productPage(role(req), products.listProducts(req.acct, req.query))));
api.post('/products', need('products.manage'), (req, res) => res.status(201).json(products.createProduct(req.acct, S.parse(S.product, req.body))));
api.get('/products/:id', (req, res) => res.json(redact.product(role(req), products.getProductDetail(req.acct, intId(req)))));
api.patch('/products/:id', need('products.manage'), (req, res) => res.json(products.updateProduct(req.acct, intId(req), S.parse(S.productPatch, req.body))));
api.delete('/products/:id', need('products.manage'), (req, res) => res.json(products.deleteProduct(req.acct, intId(req))));
api.post('/products/:id/archive', need('products.manage'), (req, res) => res.json(products.setArchived(req.acct, intId(req), true)));
api.post('/products/:id/restore', need('products.manage'), (req, res) => res.json(products.setArchived(req.acct, intId(req), false)));
api.get('/products/:id/alternatives', (req, res) =>
  res.json({ items: redact.products(role(req), products.alternatives(req.acct, intId(req))) }));

/* Stock: purchases, batches, adjustments, ledger */
api.use(['/purchases', '/stock'], need('stock.manage'));
api.get('/purchases', (req, res) => res.json(stock.listPurchases(req.acct, dateRange(req.query))));
api.post('/purchases', (req, res) => res.status(201).json(stock.createPurchase(req.acct, S.parse(S.purchase, req.body))));
api.get('/purchases/:id', (req, res) => res.json(stock.getPurchase(req.acct, intId(req))));
api.post('/purchases/:id/void', (req, res) => res.json(stock.voidPurchase(req.acct, intId(req))));
api.get('/stock/batches', (req, res) =>
  res.json(stock.listBatches(req.acct, { ...req.query, include_empty: req.query.include_empty === 'true' })));
api.post('/stock/adjust', (req, res) => res.status(201).json(stock.adjustStock(req.acct, S.parse(S.adjustment, req.body))));
api.get('/stock/movements', (req, res) => res.json(stock.listMovements(req.acct, dateRange(req.query))));

/* Sales – cashiers only ever see sales they rang up themselves */
api.get('/sales', need('sales.view'), (req, res) => {
  const q = { ...dateRange(req.query), unpaid: req.query.unpaid === 'true' };
  if (!can(role(req), 'costs.view')) q.user_id = req.user.id;
  res.json(redact.salePage(role(req), sales.listSales(req.acct, q)));
});
api.post('/sales', need('sell'), (req, res) =>
  res.status(201).json(redact.sale(role(req), sales.createSale(req.acct, S.parse(S.sale, req.body), { userId: req.user.id }))));
api.get('/sales/:id', need('sales.view'), (req, res) => {
  const sale = sales.getSale(req.acct, intId(req));
  if (!can(role(req), 'costs.view') && sale.user_id !== req.user.id) throw notFound('Sale');
  res.json(redact.sale(role(req), sale));
});
api.post('/sales/:id/void', need('sales.void'), (req, res) =>
  res.json(sales.voidSale(req.acct, intId(req), S.parse(S.voidSale, req.body).reason ?? '')));

/* Expenses */
api.use('/expenses', need('expenses.manage'));
api.get('/expenses', (req, res) => res.json(expenses.listExpenses(req.acct, dateRange(req.query))));
api.post('/expenses', (req, res) => res.status(201).json(expenses.createExpense(req.acct, S.parse(S.expense, req.body))));
api.patch('/expenses/:id', (req, res) => res.json(expenses.updateExpense(req.acct, intId(req), S.parse(S.expensePatch, req.body))));
api.delete('/expenses/:id', (req, res) => res.json(expenses.deleteExpense(req.acct, intId(req))));

/* CSV exports */
api.use('/export', need('export'));
const stamp = (acct) => todayIn(acct.timezone);
api.get('/export/products.csv', (req, res) => csv(res, `products-${stamp(req.acct)}.csv`, exportsSvc.productsCsv(req.acct)));
api.get('/export/sales.csv', (req, res) =>
  csv(res, `sales-${stamp(req.acct)}.csv`, exportsSvc.salesCsv(req.acct, { from: dateQ(req.query.from), to: dateQ(req.query.to) })));
api.get('/export/expenses.csv', (req, res) =>
  csv(res, `expenses-${stamp(req.acct)}.csv`, exportsSvc.expensesCsv(req.acct, { from: dateQ(req.query.from), to: dateQ(req.query.to) })));
api.get('/export/movements.csv', (req, res) => csv(res, `stock-ledger-${stamp(req.acct)}.csv`, exportsSvc.movementsCsv(req.acct)));
