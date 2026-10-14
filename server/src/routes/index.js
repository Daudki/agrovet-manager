import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as S from './schemas.js';
import { accountRouter, authRouter } from './auth.js';
import * as categories from '../services/categories.js';
import * as customers from '../services/customers.js';
import * as expenses from '../services/expenses.js';
import * as exportsSvc from '../services/exports.js';
import * as products from '../services/products.js';
import * as reports from '../services/reports.js';
import * as sales from '../services/sales.js';
import * as stock from '../services/stock.js';
import * as suppliers from '../services/suppliers.js';
import { addDays, startOfMonth, todayIn } from '../utils.js';

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
api.use(requireAuth); // everything below is private to the signed-in account
api.use('/account', accountRouter);

/* Dashboard & reports */
api.get('/alerts', (req, res) => res.json(products.stockSummary(req.acct)));
api.get('/dashboard', (req, res) => res.json(reports.dashboard(req.acct)));
api.get('/reports/sales', (req, res) => {
  const today = todayIn(req.acct.timezone);
  const from = dateQ(req.query.from) ?? startOfMonth(today);
  const to = dateQ(req.query.to) ?? today;
  res.json(reports.salesReport(req.acct, from, to));
});
api.get('/reports/inventory', (req, res) => res.json(reports.inventoryReport(req.acct)));
api.get('/search', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  res.json(q.length < 2 ? { matches: [], alternatives: [] } : products.searchProducts(req.acct, q.slice(0, 80)));
});

/* Categories */
api.get('/categories', (req, res) => res.json({ items: categories.listCategories(req.acct) }));
api.post('/categories', (req, res) => res.status(201).json(categories.createCategory(req.acct, S.parse(S.category, req.body))));
api.patch('/categories/:id', (req, res) => res.json(categories.updateCategory(req.acct, intId(req), S.parse(S.categoryPatch, req.body))));
api.delete('/categories/:id', (req, res) => {
  const reassignTo = Number(req.query.reassign_to) || undefined;
  res.json(categories.deleteCategory(req.acct, intId(req), { reassignTo }));
});

/* Suppliers */
api.get('/suppliers', (req, res) => res.json({ items: suppliers.listSuppliers(req.acct, { search: req.query.search }) }));
api.post('/suppliers', (req, res) => res.status(201).json(suppliers.createSupplier(req.acct, S.parse(S.supplier, req.body))));
api.get('/suppliers/:id', (req, res) => res.json(suppliers.getSupplier(req.acct, intId(req))));
api.patch('/suppliers/:id', (req, res) => res.json(suppliers.updateSupplier(req.acct, intId(req), S.parse(S.supplierPatch, req.body))));
api.delete('/suppliers/:id', (req, res) => res.json(suppliers.deleteSupplier(req.acct, intId(req))));

/* Customers */
api.get('/customers', (req, res) =>
  res.json({ items: customers.listCustomers(req.acct, { search: req.query.search, owing: req.query.owing === 'true' }) }));
api.post('/customers', (req, res) => res.status(201).json(customers.createCustomer(req.acct, S.parse(S.customer, req.body))));
api.get('/customers/:id', (req, res) => res.json(customers.getCustomerDetail(req.acct, intId(req))));
api.patch('/customers/:id', (req, res) => res.json(customers.updateCustomer(req.acct, intId(req), S.parse(S.customerPatch, req.body))));
api.delete('/customers/:id', (req, res) => res.json(customers.deleteCustomer(req.acct, intId(req))));
api.post('/customers/:id/payments', (req, res) =>
  res.status(201).json(customers.recordPayment(req.acct, intId(req), S.parse(S.customerPayment, req.body))));

/* Products */
api.get('/products', (req, res) => res.json(products.listProducts(req.acct, req.query)));
api.post('/products', (req, res) => res.status(201).json(products.createProduct(req.acct, S.parse(S.product, req.body))));
api.get('/products/:id', (req, res) => res.json(products.getProductDetail(req.acct, intId(req))));
api.patch('/products/:id', (req, res) => res.json(products.updateProduct(req.acct, intId(req), S.parse(S.productPatch, req.body))));
api.delete('/products/:id', (req, res) => res.json(products.deleteProduct(req.acct, intId(req))));
api.post('/products/:id/archive', (req, res) => res.json(products.setArchived(req.acct, intId(req), true)));
api.post('/products/:id/restore', (req, res) => res.json(products.setArchived(req.acct, intId(req), false)));
api.get('/products/:id/alternatives', (req, res) => res.json({ items: products.alternatives(req.acct, intId(req)) }));

/* Stock: purchases, batches, adjustments, ledger */
api.get('/purchases', (req, res) => res.json(stock.listPurchases(req.acct, dateRange(req.query))));
api.post('/purchases', (req, res) => res.status(201).json(stock.createPurchase(req.acct, S.parse(S.purchase, req.body))));
api.get('/purchases/:id', (req, res) => res.json(stock.getPurchase(req.acct, intId(req))));
api.post('/purchases/:id/void', (req, res) => res.json(stock.voidPurchase(req.acct, intId(req))));
api.get('/stock/batches', (req, res) =>
  res.json(stock.listBatches(req.acct, { ...req.query, include_empty: req.query.include_empty === 'true' })));
api.post('/stock/adjust', (req, res) => res.status(201).json(stock.adjustStock(req.acct, S.parse(S.adjustment, req.body))));
api.get('/stock/movements', (req, res) => res.json(stock.listMovements(req.acct, dateRange(req.query))));

/* Sales */
api.get('/sales', (req, res) => res.json(sales.listSales(req.acct, { ...dateRange(req.query), unpaid: req.query.unpaid === 'true' })));
api.post('/sales', (req, res) => res.status(201).json(sales.createSale(req.acct, S.parse(S.sale, req.body))));
api.get('/sales/:id', (req, res) => res.json(sales.getSale(req.acct, intId(req))));
api.post('/sales/:id/void', (req, res) =>
  res.json(sales.voidSale(req.acct, intId(req), S.parse(S.voidSale, req.body).reason ?? '')));

/* Expenses */
api.get('/expenses', (req, res) => res.json(expenses.listExpenses(req.acct, dateRange(req.query))));
api.post('/expenses', (req, res) => res.status(201).json(expenses.createExpense(req.acct, S.parse(S.expense, req.body))));
api.patch('/expenses/:id', (req, res) => res.json(expenses.updateExpense(req.acct, intId(req), S.parse(S.expensePatch, req.body))));
api.delete('/expenses/:id', (req, res) => res.json(expenses.deleteExpense(req.acct, intId(req))));

/* CSV exports */
const stamp = (acct) => todayIn(acct.timezone);
api.get('/export/products.csv', (req, res) => csv(res, `products-${stamp(req.acct)}.csv`, exportsSvc.productsCsv(req.acct)));
api.get('/export/sales.csv', (req, res) =>
  csv(res, `sales-${stamp(req.acct)}.csv`, exportsSvc.salesCsv(req.acct, { from: dateQ(req.query.from), to: dateQ(req.query.to) })));
api.get('/export/expenses.csv', (req, res) =>
  csv(res, `expenses-${stamp(req.acct)}.csv`, exportsSvc.expensesCsv(req.acct, { from: dateQ(req.query.from), to: dateQ(req.query.to) })));
api.get('/export/movements.csv', (req, res) => csv(res, `stock-ledger-${stamp(req.acct)}.csv`, exportsSvc.movementsCsv(req.acct)));
