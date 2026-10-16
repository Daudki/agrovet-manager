import { z } from 'zod';
import { badRequest } from '../errors.js';

/** Validates data and throws a 400 whose `details.fields` maps field path → message. */
export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data;
  const fields = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  throw badRequest('Please check the highlighted fields', { fields });
}

const id = z.number().int().positive();
const money = z.number().min(0).max(1e12);
const qty = z.number().positive().max(1e9);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const text = (max = 200) => z.string().trim().max(max);
const optEmail = z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email').max(160)]);

export const register = z.object({
  owner_name: text(80).min(2, 'Enter your name'),
  shop_name: text(100).min(2, 'Enter your business name'),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(160),
  password: z.string().min(8, 'Use at least 8 characters').max(100),
  phone: text(30).optional(),
  load_sample_data: z.boolean().optional(),
});
export const login = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password').max(100),
});
export const accountPatch = z.object({
  owner_name: text(80).min(2),
  shop_name: text(100).min(2),
  phone: text(30),
  address: text(200),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use a 3-letter code, e.g. TZS').transform((s) => s.toUpperCase()),
  timezone: text(60).min(1),
  expiry_warning_days: z.number().int().min(1).max(365),
  receipt_footer: text(200),
}).partial();
export const passwordChange = z.object({
  current_password: z.string().min(1, 'Enter your current password'),
  new_password: z.string().min(8, 'Use at least 8 characters').max(100),
});

export const category = z.object({ name: text(60).min(1, 'Enter a name'), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() });
export const categoryPatch = category.partial();

const contact = {
  phone: text(30).optional(),
  email: optEmail.optional(),
  address: text(200).optional(),
  notes: text(500).optional(),
};
export const supplier = z.object({ name: text(120).min(1, 'Enter a name'), contact_person: text(80).optional(), ...contact });
export const supplierPatch = supplier.partial();
export const customer = z.object({ name: text(120).min(1, 'Enter a name'), ...contact });
export const customerPatch = customer.partial();
export const customerPayment = z.object({
  amount: z.number().positive('Enter an amount').max(1e12),
  method: z.enum(['cash', 'mobile_money', 'card', 'bank_transfer']).default('cash'),
  note: text(200).optional(),
});

export const product = z.object({
  name: text(160).min(1, 'Enter a product name'),
  category_id: id.nullable().optional(),
  supplier_id: id.nullable().optional(),
  sku: text(40).optional(),
  barcode: text(60).optional(),
  unit: text(20).min(1).default('pcs'),
  buying_price: money.default(0),
  selling_price: money.default(0),
  reorder_level: z.number().min(0).max(1e9).default(0),
  description: text(1000).optional(),
  attributes: z.array(z.object({ key: text(40), value: text(120) })).max(20).optional(),
  active_ingredients: z.array(text(80)).max(20).optional(),
  opening_stock: z.object({
    quantity: z.number().min(0).max(1e9),
    cost_price: money.optional(),
    batch_number: text(40).optional(),
    expiry_date: date.nullable().optional(),
  }).optional(),
});
export const productPatch = product.partial().omit({ opening_stock: true });

export const purchase = z.object({
  supplier_id: id.nullable().optional(),
  reference: text(60).optional(),
  purchased_on: date.optional(),
  note: text(300).optional(),
  items: z.array(z.object({
    product_id: id,
    quantity: qty,
    unit_cost: money,
    batch_number: text(40).optional(),
    expiry_date: date.nullable().optional(),
  })).min(1, 'Add at least one item').max(100),
});

export const adjustment = z.object({
  batch_id: id,
  type: z.enum(['count', 'write_off']),
  quantity: qty.optional(),
  counted: z.number().min(0).max(1e9).optional(),
  reason: text(80).optional(),
  note: text(200).optional(),
});

export const sale = z.object({
  customer_id: id.nullable().optional(),
  items: z.array(z.object({ product_id: id, quantity: qty, unit_price: money.optional() })).min(1, 'Add at least one item').max(100),
  discount: money.optional(),
  payment_method: z.enum(['cash', 'mobile_money', 'card', 'bank_transfer', 'credit']),
  amount_paid: money.optional(),
  note: text(300).optional(),
});
export const voidSale = z.object({ reason: text(200).optional() });

export const expense = z.object({
  category: text(60).min(1, 'Choose a category'),
  amount: z.number().positive('Enter an amount').max(1e12),
  description: text(200).optional(),
  spent_on: date.optional(),
});
export const expensePatch = expense.partial();

export const teamMember = z.object({
  name: text(80).min(2, 'Enter a name'),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(160),
  password: z.string().min(8, 'Use at least 8 characters').max(100),
  role: z.enum(['manager', 'cashier']),
});
export const teamPatch = z.object({
  name: text(80).min(2),
  role: z.enum(['manager', 'cashier']),
  is_active: z.boolean(),
  password: z.string().min(8, 'Use at least 8 characters').max(100),
}).partial();
