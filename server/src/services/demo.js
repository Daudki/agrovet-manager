import { db, tx } from '../db.js';
import { addDays, todayIn } from '../utils.js';
import { createCustomer } from './customers.js';
import { createExpense } from './expenses.js';
import { createProduct } from './products.js';
import { createSale } from './sales.js';
import { createSupplier } from './suppliers.js';

/** Fills a fresh account with realistic sample data so the app is explorable straight away. */
export function seedDemoData(acct) {
  return tx(() => {
    const today = todayIn(acct.timezone);
    const cat = Object.fromEntries(db.prepare('SELECT id, name FROM categories WHERE account_id = ?').all(acct.id).map((c) => [c.name, c.id]));
    const sup = {
      agro: createSupplier(acct, { name: 'GreenField Agro Supplies', contact_person: 'Amina Yusuf', phone: '+255 700 100 200', email: 'sales@greenfield.example' }).id,
      vet: createSupplier(acct, { name: 'VetCare Distributors', contact_person: 'Peter Mwakyusa', phone: '+255 700 300 400' }).id,
      feed: createSupplier(acct, { name: 'Highland Feeds Ltd', phone: '+255 700 500 600' }).id,
    };
    const customers = [
      createCustomer(acct, { name: 'John Mwangosi', phone: '+255 710 111 222', address: 'Mbeya' }).id,
      createCustomer(acct, { name: 'Neema Farmers Group', phone: '+255 710 333 444' }).id,
      createCustomer(acct, { name: 'Salim Poultry Farm', phone: '+255 710 555 666' }).id,
    ];

    const P = (name, category, supplier, unit, buy, sell, reorder, qty, expiryDays, ingredients = [], extra = {}) =>
      createProduct(acct, {
        name, category_id: cat[category], supplier_id: sup[supplier], unit, buying_price: buy, selling_price: sell,
        reorder_level: reorder, active_ingredients: ingredients, ...extra,
        opening_stock: qty > 0 ? {
          quantity: qty, cost_price: buy,
          batch_number: `B${String(1000 + Math.floor(Math.abs(Math.sin(name.length * 7 + qty)) * 8999))}`,
          expiry_date: expiryDays === null ? null : addDays(today, expiryDays),
        } : undefined,
      });

    const products = [
      P('Glyphosate 480 SL', 'Herbicides – Non-selective', 'agro', 'L', 9500, 14000, 20, 120, 540, ['Glyphosate']),
      P('Glyphosate 360 SL (Generic)', 'Herbicides – Non-selective', 'agro', 'L', 8000, 12000, 20, 15, 400, ['Glyphosate']),
      P('2,4-D Amine 720 SL', 'Herbicides – Selective', 'agro', 'L', 7800, 11500, 15, 60, 300, ['2,4-D Amine']),
      P('Atrazine 500 SC', 'Herbicides – Selective', 'agro', 'L', 8800, 13000, 15, 8, 365, ['Atrazine']),
      P('Cypermethrin 10 EC', 'Insecticides', 'agro', 'bottle', 4200, 6500, 25, 90, 25, ['Cypermethrin']),
      P('Imidacloprid 200 SL', 'Insecticides', 'agro', 'bottle', 6500, 9500, 20, 45, 480, ['Imidacloprid']),
      P('Mancozeb 80 WP', 'Fungicides', 'agro', 'kg', 5200, 8000, 20, 70, 210, ['Mancozeb']),
      P('Hybrid Maize Seed (2 kg)', 'Seeds', 'agro', 'pack', 11000, 16000, 30, 150, 180),
      P('NPK 17:17:17 (50 kg)', 'Fertilizers', 'agro', 'bag', 62000, 78000, 20, 60, null, ['Nitrogen', 'Phosphorus', 'Potassium']),
      P('Urea 46% (50 kg)', 'Fertilizers', 'agro', 'bag', 58000, 72000, 20, 35, null, ['Nitrogen']),
      P('Layers Mash (70 kg)', 'Animal Feed', 'feed', 'bag', 68000, 82000, 15, 40, 120),
      P('Broiler Starter (50 kg)', 'Animal Feed', 'feed', 'bag', 72000, 88000, 15, 22, 90),
      P('Newcastle Vaccine (100 doses)', 'Vaccines & Vet Drugs', 'vet', 'vial', 3800, 6000, 20, 40, 14, ['Newcastle disease virus']),
      P('Oxytetracycline 20% LA (100 ml)', 'Vaccines & Vet Drugs', 'vet', 'bottle', 7500, 11000, 12, 28, 260, ['Oxytetracycline']),
      P('Knapsack Sprayer 16 L', 'Sprayers & Pumps', 'agro', 'pcs', 38000, 52000, 5, 14, null, [], {
        attributes: [{ key: 'Type', value: 'Knapsack sprayer' }, { key: 'Capacity', value: '16 L' }],
      }),
    ];

    // An already-expired batch to show the expiry workflow.
    createProduct(acct, {
      name: 'Dimethoate 40 EC', category_id: cat.Insecticides, supplier_id: sup.agro, unit: 'bottle', buying_price: 3900,
      selling_price: 6000, reorder_level: 10, active_ingredients: ['Dimethoate'],
      opening_stock: { quantity: 6, cost_price: 3900, batch_number: 'B0420', expiry_date: addDays(today, -12) },
    });

    // ~30 days of back-dated sales using a deterministic pseudo-random sequence.
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const methods = ['cash', 'cash', 'cash', 'mobile_money', 'mobile_money', 'card'];
    for (let back = 29; back >= 0; back--) {
      const date = addDays(today, -back);
      const orders = 2 + Math.floor(rnd() * 4);
      for (let o = 0; o < orders; o++) {
        const picks = 1 + Math.floor(rnd() * 3);
        const items = [];
        for (let i = 0; i < picks; i++) {
          const p = products[Math.floor(rnd() * products.length)];
          if (items.some((x) => x.product_id === p.id)) continue;
          items.push({ product_id: p.id, quantity: 1 + Math.floor(rnd() * (p.unit === 'bag' ? 2 : 4)) });
        }
        try {
          createSale(acct, { items, payment_method: methods[Math.floor(rnd() * methods.length)] }, { date, hour: o });
        } catch {
          /* ran out of a product – skip */
        }
      }
    }
    // A couple of credit sales so receivables are visible.
    try {
      createSale(acct, { items: [{ product_id: products[8].id, quantity: 2 }], customer_id: customers[1], payment_method: 'credit', amount_paid: 50000 });
      createSale(acct, { items: [{ product_id: products[10].id, quantity: 3 }], customer_id: customers[2], payment_method: 'credit', amount_paid: 0 });
    } catch { /* ignore */ }

    for (const [category, amount, description, ago] of [
      ['Rent', 350000, 'Shop rent', 25], ['Salaries', 600000, 'Shop assistant', 24], ['Utilities', 85000, 'Electricity & water', 18],
      ['Transport', 60000, 'Delivery of stock', 9], ['Licences & Permits', 120000, 'Annual business licence', 5],
    ]) createExpense(acct, { category, amount, description, spent_on: addDays(today, -ago) });
  });
}
