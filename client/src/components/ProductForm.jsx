import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Field, Spinner, TagInput } from './ui.jsx';
import { Modal } from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { UNITS } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

const n = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

export default function ProductForm({ product, onClose, onSaved }) {
  const editing = !!product;
  const toast = useToast();
  const { money } = useFmt();
  const cats = useApi('/categories');
  const sups = useApi('/suppliers');
  const [f, setF] = useState(() => ({
    name: product?.name ?? '', category_id: product?.category_id ?? '', supplier_id: product?.supplier_id ?? '',
    sku: product?.sku ?? '', barcode: product?.barcode ?? '', unit: product?.unit ?? 'pcs',
    buying_price: product?.buying_price ?? '', selling_price: product?.selling_price ?? '', reorder_level: product?.reorder_level ?? '',
    description: product?.description ?? '', active_ingredients: product?.active_ingredients ?? [],
    attributes: product?.attributes?.length ? product.attributes : [],
    os_qty: '', os_batch: '', os_expiry: '',
  }));
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const fe = (k) => err?.fields?.[k];

  const margin = f.buying_price !== '' && f.selling_price !== '' && Number(f.selling_price) > 0
    ? Math.round(((f.selling_price - f.buying_price) / f.selling_price) * 100) : null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const body = {
      name: f.name, category_id: f.category_id ? Number(f.category_id) : null, supplier_id: f.supplier_id ? Number(f.supplier_id) : null,
      sku: f.sku, barcode: f.barcode, unit: f.unit, buying_price: n(f.buying_price) ?? 0, selling_price: n(f.selling_price) ?? 0,
      reorder_level: n(f.reorder_level) ?? 0, description: f.description, active_ingredients: f.active_ingredients,
      attributes: f.attributes.filter((a) => a.key.trim() && a.value.trim()),
    };
    if (!editing && n(f.os_qty) > 0) {
      body.opening_stock = { quantity: n(f.os_qty), cost_price: n(f.buying_price) ?? 0, batch_number: f.os_batch, expiry_date: f.os_expiry || null };
    }
    try {
      const saved = editing ? await api.patch(`/products/${product.id}`, body) : await api.post('/products', body);
      toast.success(editing ? 'Product updated' : 'Product added');
      onSaved?.(saved); onClose();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };

  const setAttr = (i, k, v) => setF((s) => ({ ...s, attributes: s.attributes.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));

  return (
    <Modal title={editing ? 'Edit product' : 'Add product'} size="lg" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="pf" disabled={busy}>{busy ? <Spinner /> : editing ? 'Save changes' : 'Add product'}</button></>}>
      <form id="pf" className="form-grid" onSubmit={submit} noValidate>
        {err && !err.fields && <div className="alert danger full">{err.message}</div>}
        <div className="form-section">Basics</div>
        <Field label="Product name" className="full" error={fe('name')}><input className="input" value={f.name} onChange={set('name')} placeholder="e.g. Glyphosate 480 SL" autoFocus /></Field>
        <Field label="Category">
          <select className="select" value={f.category_id} onChange={set('category_id')}>
            <option value="">Uncategorised</option>
            {cats.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Unit of sale">
          <select className="select" value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
        </Field>
        <Field label="Active ingredients" className="full" hint="Press Enter or comma after each one. Used to suggest alternatives with the same ingredient.">
          <TagInput value={f.active_ingredients} onChange={(v) => setF((s) => ({ ...s, active_ingredients: v }))} placeholder="e.g. Glyphosate" />
        </Field>
        <Field label="Supplier">
          <select className="select" value={f.supplier_id} onChange={set('supplier_id')}>
            <option value="">— None —</option>
            {sups.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="SKU" hint="Leave blank to auto-generate." error={fe('sku')}><input className="input" value={f.sku} onChange={set('sku')} /></Field>
        <Field label="Barcode" className="full"><input className="input" value={f.barcode} onChange={set('barcode')} placeholder="Scan or type" /></Field>

        <div className="form-section">Pricing & reorder</div>
        <Field label="Buying price (cost)" error={fe('buying_price')}><input className="input" type="number" step="any" min="0" value={f.buying_price} onChange={set('buying_price')} /></Field>
        <Field label="Selling price" error={fe('selling_price')} hint={margin !== null ? `Margin ${margin}% · profit ${money(f.selling_price - f.buying_price)} per ${f.unit}` : ''}>
          <input className="input" type="number" step="any" min="0" value={f.selling_price} onChange={set('selling_price')} />
        </Field>
        <Field label="Reorder level" className="full" hint="You’ll be alerted when sellable stock falls to this level."><input className="input" type="number" step="any" min="0" value={f.reorder_level} onChange={set('reorder_level')} /></Field>

        {!editing && (
          <>
            <div className="form-section">Opening stock (optional)</div>
            <Field label={`Quantity on hand (${f.unit})`}><input className="input" type="number" step="any" min="0" value={f.os_qty} onChange={set('os_qty')} /></Field>
            <Field label="Batch / lot no."><input className="input" value={f.os_batch} onChange={set('os_batch')} placeholder="Auto if blank" /></Field>
            <Field label="Expiry date" className="full" hint="Leave blank for items that don’t expire (equipment, fertilizer…)."><input className="input" type="date" value={f.os_expiry} onChange={set('os_expiry')} /></Field>
          </>
        )}

        <div className="form-section">Specifications & notes</div>
        <div className="full stack-v" style={{ gap: 8 }}>
          {f.attributes.map((a, i) => (
            <div className="row" key={i}>
              <input className="input" placeholder="e.g. Capacity" value={a.key} onChange={(e) => setAttr(i, 'key', e.target.value)} />
              <input className="input" placeholder="e.g. 16 L" value={a.value} onChange={(e) => setAttr(i, 'value', e.target.value)} />
              <button type="button" className="btn ghost icon" onClick={() => setF((s) => ({ ...s, attributes: s.attributes.filter((_, j) => j !== i) }))} aria-label="Remove"><Trash2 size={16} /></button>
            </div>
          ))}
          <div><button type="button" className="btn sm" onClick={() => setF((s) => ({ ...s, attributes: [...s.attributes, { key: '', value: '' }] }))}><Plus size={14} /> Add specification</button></div>
        </div>
        <Field label="Notes" className="full"><textarea className="textarea" value={f.description} onChange={set('description')} rows={2} /></Field>
      </form>
    </Modal>
  );
}
