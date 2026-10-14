import { db } from '../db.js';
import { toCsv } from '../utils.js';
import { listProducts } from './products.js';

export function productsCsv(acct) {
  const { items } = listProducts(acct, { limit: 500, archived: 'all' });
  return toCsv(items, [
    { label: 'SKU', key: 'sku' }, { label: 'Name', key: 'name' }, { label: 'Category', key: 'category_name' },
    { label: 'Supplier', key: 'supplier_name' }, { label: 'Active ingredients', value: (r) => r.active_ingredients.join('; ') },
    { label: 'Unit', key: 'unit' }, { label: 'In stock', key: 'stock' }, { label: 'Sellable', key: 'sellable' },
    { label: 'Reorder level', key: 'reorder_level' }, { label: 'Buying price', key: 'buying_price' },
    { label: 'Selling price', key: 'selling_price' }, { label: 'Stock value (cost)', key: 'cost_value' },
    { label: 'Next expiry', key: 'next_expiry' }, { label: 'Status', key: 'stock_status' },
    { label: 'Archived', value: (r) => (r.is_archived ? 'yes' : 'no') },
  ]);
}

export function salesCsv(acct, { from, to } = {}) {
  const rows = db
    .prepare(
      `SELECT s.receipt_no, s.sold_on, c.name AS customer, s.payment_method, s.status, s.subtotal, s.discount, s.total,
              s.amount_paid, s.cost_total, (s.total - s.cost_total) AS profit
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.account_id = ? AND s.sold_on >= ? AND s.sold_on <= ? ORDER BY s.id`,
    )
    .all(acct.id, from || '0000-01-01', to || '9999-12-31');
  return toCsv(rows, [
    { label: 'Receipt', key: 'receipt_no' }, { label: 'Date', key: 'sold_on' }, { label: 'Customer', key: 'customer' },
    { label: 'Payment', key: 'payment_method' }, { label: 'Status', key: 'status' }, { label: 'Subtotal', key: 'subtotal' },
    { label: 'Discount', key: 'discount' }, { label: 'Total', key: 'total' }, { label: 'Paid', key: 'amount_paid' },
    { label: 'Cost of goods', key: 'cost_total' }, { label: 'Profit', key: 'profit' },
  ]);
}

export function expensesCsv(acct, { from, to } = {}) {
  const rows = db
    .prepare('SELECT spent_on, category, description, amount FROM expenses WHERE account_id = ? AND spent_on >= ? AND spent_on <= ? ORDER BY spent_on')
    .all(acct.id, from || '0000-01-01', to || '9999-12-31');
  return toCsv(rows, [
    { label: 'Date', key: 'spent_on' }, { label: 'Category', key: 'category' },
    { label: 'Description', key: 'description' }, { label: 'Amount', key: 'amount' },
  ]);
}

export function movementsCsv(acct) {
  const rows = db
    .prepare(
      `SELECT m.created_on, p.name AS product, b.batch_number, m.type, m.quantity, m.unit_cost, m.note
       FROM stock_movements m JOIN products p ON p.id = m.product_id LEFT JOIN batches b ON b.id = m.batch_id
       WHERE m.account_id = ? ORDER BY m.id`,
    )
    .all(acct.id);
  return toCsv(rows, [
    { label: 'Date', key: 'created_on' }, { label: 'Product', key: 'product' }, { label: 'Batch', key: 'batch_number' },
    { label: 'Type', key: 'type' }, { label: 'Quantity', key: 'quantity' }, { label: 'Unit cost', key: 'unit_cost' },
    { label: 'Note', key: 'note' },
  ]);
}
