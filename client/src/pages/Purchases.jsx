import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, PackagePlus, Plus, Trash2 } from 'lucide-react';
import DateRange from '../components/DateRange.jsx';
import ProductPicker from '../components/ProductPicker.jsx';
import { Drawer, Modal, useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, DataTable, Empty, ErrorState, Field, Loading, PageHead, Pagination, SearchInput, Spinner } from '../components/ui.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useApi, useDebounced, useDocumentTitle, useOnChange } from '../lib/hooks.js';

export default function Purchases() {
  useDocumentTitle('Purchases');
  const { money, date, num } = useFmt();
  const [sp, setSp] = useSearchParams();
  const [range, setRange] = useState({ from: '', to: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [presetProduct, setPresetProduct] = useState(null);
  const [openId, setOpenId] = useState(null);
  const dsearch = useDebounced(search);
  useEffect(() => setPage(1), [range, dsearch]);

  // Deep links: ?new=1 (&product=ID) from dashboard "Restock" buttons.
  useEffect(() => {
    if (!sp.get('new')) return;
    const pid = Number(sp.get('product'));
    (pid ? api.get(`/products/${pid}`).catch(() => null) : Promise.resolve(null)).then((p) => { setPresetProduct(p); setCreating(true); });
    setSp({}, { replace: true });
  }, [sp, setSp]);

  const { data, loading, error, reload } = useApi('/purchases', { ...range, search: dsearch, page, limit: 25 });
  useOnChange(reload);
  const items = data?.items ?? [];

  const cols = [
    { header: 'Date', first: true, render: (p) => <div><div className="cell-main">{date(p.purchased_on)}</div><div className="cell-sub">{p.reference || `Purchase #${p.id}`}</div></div> },
    { header: 'Supplier', render: (p) => p.supplier_name || <span className="faint">—</span> },
    { header: 'Items', align: 'right', render: (p) => p.item_count },
    { header: 'Total', align: 'right', render: (p) => <b className="num">{money(p.total)}</b> },
    { header: 'Status', render: (p) => (p.status === 'voided' ? <Badge tone="danger">Voided</Badge> : <Badge tone="ok">Received</Badge>) },
  ];

  return (
    <>
      <PageHead title="Purchases" subtitle="Record stock you receive from suppliers. Each line creates a batch with its own cost and expiry.">
        <button className="btn primary" onClick={() => { setPresetProduct(null); setCreating(true); }}><Plus size={16} /> New purchase</button>
      </PageHead>
      <div className="card">
        <div className="toolbar"><DateRange value={range} onChange={setRange} /></div>
        <div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Reference or supplier…" /></div>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : items.length === 0 ? (
          <Empty icon={PackagePlus} title="No purchases yet" action={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Record a purchase</button>}>
            Receiving stock here keeps batches, costs and expiry dates accurate.
          </Empty>
        ) : (
          <>
            <DataTable columns={cols} rows={items} onRowClick={(p) => setOpenId(p.id)} dim={(p) => p.status === 'voided'} />
            <Pagination page={data.page} pages={data.pages} total={data.total} limit={data.limit} onPage={setPage} />
          </>
        )}
      </div>
      {creating && <PurchaseForm preset={presetProduct} onClose={() => setCreating(false)} onSaved={reload} />}
      {openId && <PurchaseDrawer id={openId} onClose={() => setOpenId(null)} onChanged={reload} fmt={{ money, date, num }} />}
    </>
  );
}

const blank = (p) => ({ key: Math.random(), product: p, quantity: '', unit_cost: p?.buying_price ?? '', batch_number: '', expiry_date: '' });

function PurchaseForm({ preset, onClose, onSaved }) {
  const toast = useToast();
  const { money } = useFmt();
  const sups = useApi('/suppliers');
  const [supplier, setSupplier] = useState(preset?.supplier_id ? String(preset.supplier_id) : '');
  const [reference, setReference] = useState('');
  const [on, setOn] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState(preset ? [blank(preset)] : []);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post('/purchases', {
        supplier_id: supplier ? Number(supplier) : null, reference, note, ...(on ? { purchased_on: on } : {}),
        items: lines.map((l) => ({
          product_id: l.product.id, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost || 0),
          batch_number: l.batch_number, expiry_date: l.expiry_date || null,
        })),
      });
      toast.success('Stock received'); onSaved(); onClose();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };

  return (
    <Modal title="New purchase" size="lg" onClose={onClose}
      footer={<>
        <span className="muted grow">Total <b className="num" style={{ color: 'var(--text)' }}>{money(total)}</b></span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || lines.length === 0} onClick={submit}>{busy ? <Spinner /> : 'Receive stock'}</button>
      </>}>
      <div className="stack-v">
        {err && <div className="alert danger">{err.message}{err.fields && ' — check the quantities and costs.'}</div>}
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Field label="Supplier">
            <select className="select" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">— None —</option>{sups.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Invoice / reference"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label="Date received"><input className="input" type="date" value={on} onChange={(e) => setOn(e.target.value)} /></Field>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Add product</div>
          <ProductPicker params={{ status: '' }} placeholder="Search a product to add…" onSelect={(p) => setLines((ls) => [...ls, blank(p)])} />
        </div>
        {lines.length > 0 && (
          <div className="table-wrap">
            <table className="lines">
              <thead><tr><th>Product</th><th>Qty</th><th>Unit cost</th><th>Batch no.</th><th>Expiry</th><th /></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key}>
                    <td style={{ minWidth: 150, paddingTop: 10 }}><b>{l.product.name}</b><div className="cell-sub">{l.product.unit}</div></td>
                    <td><input className="input sm" style={{ width: 84 }} type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} autoFocus={i === lines.length - 1 && !l.quantity} aria-label="Quantity" /></td>
                    <td><input className="input sm" style={{ width: 100 }} type="number" min="0" step="any" value={l.unit_cost} onChange={(e) => setLine(l.key, { unit_cost: e.target.value })} aria-label="Unit cost" /></td>
                    <td><input className="input sm" style={{ width: 110 }} value={l.batch_number} placeholder="Auto" onChange={(e) => setLine(l.key, { batch_number: e.target.value })} aria-label="Batch number" /></td>
                    <td><input className="input sm" style={{ width: 140 }} type="date" value={l.expiry_date} onChange={(e) => setLine(l.key, { expiry_date: e.target.value })} aria-label="Expiry date" /></td>
                    <td><button className="btn ghost icon sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function PurchaseDrawer({ id, onClose, onChanged, fmt }) {
  const { money, date, num } = fmt;
  const toast = useToast();
  const confirm = useConfirm();
  const { data: p, loading, error, reload } = useApi(`/purchases/${id}`);
  const voidIt = async () => {
    if (!(await confirm({ title: 'Void this purchase?', tone: 'danger', confirmText: 'Void purchase', message: 'The received stock is removed. This only works if none of it has been sold or adjusted yet.' }))) return;
    try { await api.post(`/purchases/${id}/void`); toast.success('Purchase voided'); reload(); onChanged(); } catch (e) { toast.error(e.message); }
  };
  return (
    <Drawer title={p ? p.reference || `Purchase #${p.id}` : 'Purchase'} subtitle={p && `${date(p.purchased_on)}${p.supplier_name ? ` · ${p.supplier_name}` : ''}`} onClose={onClose}>
      {loading && !p ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          {p.status === 'voided' && <div className="alert danger" style={{ marginBottom: 14 }}>This purchase was voided.</div>}
          {p.items.map((i) => (
            <div className="attn-item" key={i.id}>
              <div className="grow"><b>{i.product_name}</b><div className="cell-sub">Batch {i.batch_number}{i.expiry_date ? ` · exp ${date(i.expiry_date)}` : ''}</div></div>
              <div className="right"><b className="num">{num(i.quantity)} {i.unit}</b><div className="cell-sub">@ {money(i.unit_cost)}</div></div>
            </div>
          ))}
          <div className="row between mt" style={{ fontSize: 16 }}><span className="muted">Total</span><b className="num">{money(p.total)}</b></div>
          {p.note && <p className="muted mt">{p.note}</p>}
          {p.status === 'received' && <div className="mt"><button className="btn ghost" style={{ color: 'var(--danger)' }} onClick={voidIt}><Ban size={16} /> Void purchase</button></div>}
        </>
      )}
    </Drawer>
  );
}
