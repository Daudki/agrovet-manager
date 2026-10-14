import { db } from '../db.js';
import { isoNow, round, todayIn } from '../utils.js';

/** Appends a row to the stock ledger. Quantity is signed (+in / −out). */
export function recordMovement(acct, m) {
  return db
    .prepare(
      `INSERT INTO stock_movements
        (account_id, product_id, batch_id, type, quantity, unit_cost, unit_price, ref_type, ref_id, note, created_on, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      acct.id,
      m.productId,
      m.batchId ?? null,
      m.type,
      round(m.quantity, 3),
      round(m.unitCost ?? 0),
      m.unitPrice ?? null,
      m.refType ?? null,
      m.refId ?? null,
      m.note ?? '',
      m.on ?? todayIn(acct.timezone),
      m.at ?? isoNow(),
    ).lastInsertRowid;
}

/** Creates a stock batch and its ledger entry. Returns the new batch id. */
export function insertBatch(acct, b) {
  const receivedOn = b.receivedOn ?? todayIn(acct.timezone);
  const number = (b.batchNumber || '').trim() || `LOT-${receivedOn.replaceAll('-', '')}`;
  const id = Number(
    db
      .prepare(
        `INSERT INTO batches
          (account_id, product_id, purchase_id, supplier_id, batch_number, initial_quantity, quantity,
           cost_price, expiry_date, received_on, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        acct.id,
        b.productId,
        b.purchaseId ?? null,
        b.supplierId ?? null,
        number,
        round(b.quantity, 3),
        round(b.quantity, 3),
        round(b.costPrice ?? 0),
        b.expiryDate || null,
        receivedOn,
        isoNow(),
      ).lastInsertRowid,
  );
  recordMovement(acct, {
    productId: b.productId,
    batchId: id,
    type: b.type ?? 'purchase',
    quantity: b.quantity,
    unitCost: b.costPrice,
    refType: b.refType,
    refId: b.refId,
    note: b.note,
    on: receivedOn,
  });
  return id;
}
