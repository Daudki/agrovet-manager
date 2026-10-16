import { useState } from 'react';
import { Field, Segmented, Spinner } from './ui.jsx';
import { Modal } from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';

import { t } from '../lib/i18n.js';
const numOrUndef = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

/** Receive stock for one product as a single-line purchase. */
export function ReceiveStockModal({ product, onClose, onDone }) {
  const toast = useToast();
  const { num } = useFmt();
  const suppliers = useApi('/suppliers');
  const [f, setF] = useState({
    quantity: '', unit_cost: product.buying_price || '', batch_number: '', expiry_date: '', supplier_id: product.supplier_id || '',
  });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.post('/purchases', {
        supplier_id: f.supplier_id ? Number(f.supplier_id) : null,
        items: [{
          product_id: product.id, quantity: Number(f.quantity), unit_cost: Number(f.unit_cost || 0),
          batch_number: f.batch_number, expiry_date: f.expiry_date || null,
        }],
      });
      toast.success(t('Received {0} {1} of {2}', [num(f.quantity), product.unit, product.name]));
      onDone?.(); onClose();
    } catch (ex) {
      setErr(ex);
    } finally { setBusy(false); }
  };

  const fe = (k) => err?.fields?.[`items.0.${k}`];
  return (
    <Modal title={t('Receive stock · {0}', [product.name])} onClose={onClose} size="sm"
      footer={<><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn primary" form="recv" disabled={busy}>{busy ? <Spinner /> : t('Receive stock')}</button></>}>
      <form id="recv" className="stack-v" onSubmit={submit}>
        {err && !err.fields && <div className="alert danger">{err.message}</div>}
        <div className="form-grid">
          <Field label={t('Quantity ({0})', [product.unit])} error={fe('quantity')}><input className="input" type="number" step="any" min="0" value={f.quantity} onChange={set('quantity')} required autoFocus /></Field>
          <Field label={t('Unit cost')} error={fe('unit_cost')}><input className="input" type="number" step="any" min="0" value={f.unit_cost} onChange={set('unit_cost')} required /></Field>
          <Field label={t('Batch / lot no.')}><input className="input" value={f.batch_number} onChange={set('batch_number')} placeholder={t('Auto if blank')} /></Field>
          <Field label={t('Expiry date')} error={fe('expiry_date')}><input className="input" type="date" value={f.expiry_date} onChange={set('expiry_date')} /></Field>
        </div>
        <Field label={t('Supplier')}>
          <select className="select" value={f.supplier_id} onChange={set('supplier_id')}>
            <option value="">{t('— None —')}</option>
            {suppliers.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

/** Stock count correction or write-off for one batch. */
export function AdjustModal({ batch, onClose, onDone }) {
  const toast = useToast();
  const { num, date } = useFmt();
  const [mode, setMode] = useState('write_off');
  const [qty, setQty] = useState('');
  const [counted, setCounted] = useState(String(batch.quantity));
  const [reason, setReason] = useState(batch.expiry_status === 'expired' ? 'Expired' : 'Damaged');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.post('/stock/adjust', {
        batch_id: batch.id, type: mode, reason: mode === 'count' ? 'Stock count' : reason, note,
        ...(mode === 'count' ? { counted: numOrUndef(counted) } : { quantity: numOrUndef(qty) }),
      });
      toast.success(mode === 'count' ? t('Stock count recorded') : t('Stock written off'));
      onDone?.(); onClose();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };

  return (
    <Modal title={t('Adjust stock')} onClose={onClose} size="sm"
      footer={<><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn primary" form="adj" disabled={busy}>{busy ? <Spinner /> : t('Save adjustment')}</button></>}>
      <form id="adj" className="stack-v" onSubmit={submit}>
        <div className="card card-pad" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
          <b>{batch.product_name}</b>
          <div className="cell-sub">{t('Batch')} {batch.batch_number} · {num(batch.quantity)} {batch.unit} {t('on hand')}{batch.expiry_date ? t(' · expires {0}', [date(batch.expiry_date)]) : ''}</div>
        </div>
        {err && <div className="alert danger">{err.message}</div>}
        <Segmented block value={mode} onChange={setMode} options={[{ value: 'write_off', label: t('Write off') }, { value: 'count', label: t('Stock count') }]} />
        {mode === 'write_off' ? (
          <>
            <Field label={t('Quantity to remove ({0})', [batch.unit])}><input className="input" type="number" step="any" min="0" max={batch.quantity} value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus /></Field>
            <Field label={t('Reason')}>
              <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
                {['Expired', 'Damaged', 'Lost or stolen', 'Returned to supplier', 'Other'].map((r) => <option key={r} value={r}>{t(r)}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <Field label={t('Counted quantity ({0})', [batch.unit])} hint={t('Sets this batch to the number you physically counted.')}><input className="input" type="number" step="any" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} required autoFocus /></Field>
        )}
        <Field label={t('Note (optional)')}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
