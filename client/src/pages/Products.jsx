import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ClipboardEdit, Download, Pencil, PackagePlus, Package, Plus, Trash2 } from 'lucide-react';
import ProductForm from '../components/ProductForm.jsx';
import { AdjustModal, ReceiveStockModal } from '../components/StockModals.jsx';
import { Drawer } from '../components/Modal.jsx';
import { useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  Badge, DataTable, Empty, ErrorState, ExpiryBadge, Loading, PageHead, Pagination, SearchInput, StockBadge, Tabs,
} from '../components/ui.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { MOVEMENT_LABELS } from '../lib/format.js';
import { useApi, useDebounced, useDocumentTitle, useOnChange } from '../lib/hooks.js';

const STATUS = [
  ['', 'All products'], ['attention', 'Needs attention'], ['ok', 'In stock'], ['low', 'Low stock'], ['out', 'Out of stock'],
  ['expiring', 'Expiring soon'], ['expired', 'Has expired stock'],
];

export default function Products() {
  useDocumentTitle('Products');
  const { money, num, date } = useFmt();
  const [sp, setSp] = useSearchParams();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null); // null | {} | product
  const dsearch = useDebounced(search, 250);

  useEffect(() => setPage(1), [dsearch, category, status, archived]);
  useEffect(() => { if (sp.get('new')) { setForm({}); sp.delete('new'); setSp(sp, { replace: true }); } }, [sp, setSp]);

  const cats = useApi('/categories');
  const list = useApi('/products', { search: dsearch, category_id: category, status, archived: archived ? 'only' : '', page, limit: 25 });
  useOnChange(list.reload);

  const openId = Number(sp.get('open')) || null;
  const openDrawer = (id) => { const n = new URLSearchParams(sp); id ? n.set('open', id) : n.delete('open'); setSp(n, { replace: true }); };

  const items = list.data?.items ?? [];
  const cols = [
    { header: 'Product', first: true, render: (p) => (
      <div><div className="cell-main">{p.name}</div><div className="cell-sub">{p.sku}{p.active_ingredients.length ? ` · ${p.active_ingredients.join(', ')}` : ''}</div></div>) },
    { header: 'Category', render: (p) => (p.category_name ? <span className="row" style={{ gap: 7 }}><i className="dot" style={{ background: p.category_color }} />{p.category_name}</span> : <span className="faint">—</span>) },
    { header: 'Stock', render: (p) => <div><b className="num">{num(p.sellable)}</b> <span className="muted">{p.unit}</span><div><StockBadge product={p} /></div></div> },
    { header: 'Price', align: 'right', render: (p) => <div className="num"><b>{money(p.selling_price)}</b><div className="cell-sub">cost {money(p.buying_price)}</div></div> },
    { header: 'Next expiry', render: (p) => (
      p.expired_qty > 0 ? <ExpiryBadge status="expired" /> :
      p.expiring_qty > 0 ? <div><ExpiryBadge status="expiring" days={Math.max(0, Math.round((Date.parse(p.next_expiry) - Date.now()) / 864e5))} /><div className="cell-sub">{date(p.next_expiry)}</div></div> :
      p.next_expiry ? <span className="muted">{date(p.next_expiry)}</span> : <span className="faint">—</span>) },
  ];

  return (
    <>
      <PageHead title="Products" subtitle="Your catalogue with live stock, pricing and expiry status.">
        <a className="btn" href="/api/export/products.csv"><Download size={16} /> Export</a>
        <button className="btn primary" onClick={() => setForm({})}><Plus size={16} /> Add product</button>
      </PageHead>

      <div className="card">
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, SKU, barcode or ingredient…" />
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {cats.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.product_count})</option>)}
            <option value="none">Uncategorised</option>
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="chip" aria-pressed={archived} onClick={() => setArchived((a) => !a)}>Archived</button>
        </div>
        {list.loading && !list.data ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : items.length === 0 ? (
          <Empty icon={Package} title={dsearch || category || status ? 'No products match your filters' : archived ? 'No archived products' : 'No products yet'}
            action={!dsearch && !category && !status && !archived && <button className="btn primary" onClick={() => setForm({})}><Plus size={16} /> Add your first product</button>}>
            {dsearch || category || status ? 'Try clearing a filter or searching for something else.' : 'Add products with opening stock to start tracking inventory.'}
          </Empty>
        ) : (
          <>
            <DataTable columns={cols} rows={items} onRowClick={(p) => openDrawer(p.id)} />
            <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} limit={list.data.limit} onPage={setPage} />
          </>
        )}
      </div>

      {form && <ProductForm product={form.id ? form : null} onClose={() => setForm(null)} onSaved={list.reload} />}
      {openId && <ProductDrawer id={openId} onClose={() => openDrawer(null)} onEdit={(p) => setForm(p)} onChanged={list.reload} />}
    </>
  );
}

function ProductDrawer({ id, onClose, onEdit, onChanged }) {
  const { money, num, date, dateTime } = useFmt();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: p, loading, error, reload } = useApi(`/products/${id}`);
  const alt = useApi(`/products/${id}/alternatives`);
  const [tab, setTab] = useState('batches');
  const [receive, setReceive] = useState(false);
  const [adjust, setAdjust] = useState(null);
  useOnChange(() => { reload(); alt.reload(); });

  const archive = async (flag) => {
    try { await api.post(`/products/${id}/${flag ? 'archive' : 'restore'}`); toast.success(flag ? 'Product archived' : 'Product restored'); onChanged(); reload(); } catch (e) { toast.error(e.message); }
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Delete product?', message: 'Products that have been sold or purchased are archived instead, so your history stays accurate.', confirmText: 'Delete', tone: 'danger' }))) return;
    try {
      const r = await api.del(`/products/${id}`);
      toast.success(r.archived ? 'Product has history, so it was archived' : 'Product deleted');
      onChanged(); onClose();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <Drawer title={p?.name ?? 'Product'} subtitle={p ? `${p.sku}${p.category_name ? ` · ${p.category_name}` : ''}` : ''} onClose={onClose}
      actions={p && <button className="btn sm" onClick={() => onEdit(p)}><Pencil size={14} /> Edit</button>}>
      {loading && !p ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <div className="row wrap" style={{ marginBottom: 14 }}>
            <StockBadge product={p} />
            {p.is_archived && <Badge>Archived</Badge>}
            {p.expired_qty > 0 && <Badge tone="danger">{num(p.expired_qty)} {p.unit} expired</Badge>}
            {p.expiring_qty > 0 && <Badge tone="warn">{num(p.expiring_qty)} {p.unit} expiring</Badge>}
          </div>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {[
              ['Sellable stock', `${num(p.sellable)} ${p.unit}`],
              ['Stock value (cost)', money(p.cost_value)],
              ['Selling price', money(p.selling_price)],
              ['Sold to date', `${num(p.sales_summary.qty)} ${p.unit} · ${money(p.sales_summary.revenue)}`],
            ].map(([k, v]) => <div className="card card-pad" key={k} style={{ boxShadow: 'none' }}><div className="muted" style={{ fontSize: 12 }}>{k}</div><b className="num">{v}</b></div>)}
          </div>

          {(p.active_ingredients.length > 0 || p.attributes.length > 0 || p.supplier_name || p.description) && (
            <dl className="kv mt">
              {p.active_ingredients.length > 0 && <><dt>Active ingredients</dt><dd>{p.active_ingredients.join(', ')}</dd></>}
              {p.attributes.map((a) => <Fragment key={a.key}><dt>{a.key}</dt><dd>{a.value}</dd></Fragment>)}
              {p.supplier_name && <><dt>Supplier</dt><dd>{p.supplier_name}</dd></>}
              {p.barcode && <><dt>Barcode</dt><dd>{p.barcode}</dd></>}
              {p.reorder_level > 0 && <><dt>Reorder level</dt><dd>{num(p.reorder_level)} {p.unit}</dd></>}
              {p.description && <><dt>Notes</dt><dd>{p.description}</dd></>}
            </dl>
          )}

          <div className="row wrap mt">
            <button className="btn primary" onClick={() => setReceive(true)} disabled={p.is_archived}><PackagePlus size={16} /> Receive stock</button>
            {p.is_archived
              ? <button className="btn" onClick={() => archive(false)}><ArchiveRestore size={16} /> Restore</button>
              : <button className="btn" onClick={() => archive(true)}><Archive size={16} /> Archive</button>}
            <button className="btn ghost" onClick={remove} style={{ color: 'var(--danger)' }}><Trash2 size={16} /> Delete</button>
          </div>

          <div className="mt-lg">
            <Tabs value={tab} onChange={setTab} tabs={[
              { value: 'batches', label: `Batches (${p.batches.filter((b) => b.quantity > 0).length})` },
              { value: 'moves', label: 'History' },
              { value: 'alt', label: `Alternatives (${alt.data?.items.length ?? 0})` },
            ]} />
            {tab === 'batches' && (p.batches.length === 0 ? <p className="muted">No stock received yet.</p> : (
              <div className="stack-v" style={{ gap: 10 }}>
                {p.batches.map((b) => {
                  const today = new Date().toISOString().slice(0, 10);
                  const status = !b.expiry_date ? 'none' : b.expiry_date < today ? 'expired' : 'ok';
                  const days = b.expiry_date ? Math.round((Date.parse(b.expiry_date) - Date.parse(today)) / 864e5) : null;
                  return (
                    <div className="card card-pad row" key={b.id} style={{ boxShadow: 'none', opacity: b.quantity === 0 ? 0.55 : 1 }}>
                      <div className="grow">
                        <b>Batch {b.batch_number}</b> {b.quantity > 0 && b.expiry_date && <ExpiryBadge status={status === 'ok' && days <= 30 ? 'expiring' : status} days={days} />}
                        <div className="cell-sub">{num(b.quantity)} of {num(b.initial_quantity)} {p.unit} · cost {money(b.cost_price)} · {b.expiry_date ? `exp ${date(b.expiry_date)}` : 'no expiry'}</div>
                      </div>
                      {b.quantity > 0 && <button className="btn sm" onClick={() => setAdjust({ ...b, product_name: p.name, unit: p.unit, expiry_status: status })}><ClipboardEdit size={14} /> Adjust</button>}
                    </div>
                  );
                })}
              </div>
            ))}
            {tab === 'moves' && (p.movements.length === 0 ? <p className="muted">No movements yet.</p> : p.movements.map((m) => (
              <div className="attn-item" key={m.id}>
                <div className="grow"><b>{MOVEMENT_LABELS[m.type]}</b><div className="cell-sub">{m.created_on}{m.note ? ` · ${m.note}` : ''}</div></div>
                <b className="num" style={{ color: m.quantity < 0 ? 'var(--danger)' : 'var(--ok)' }}>{m.quantity > 0 ? '+' : ''}{num(m.quantity)} {p.unit}</b>
              </div>
            )))}
            {tab === 'alt' && (alt.data?.items.length ? alt.data.items.map((a) => (
              <div className="attn-item" key={a.id}>
                <div className="grow"><b>{a.name}</b><div className="cell-sub">{a.active_ingredients.join(', ')}</div></div>
                <div className="right"><b className="num">{money(a.selling_price)}</b><div className="cell-sub">{num(a.sellable)} {a.unit} in stock</div></div>
              </div>
            )) : <p className="muted">No other products share this active ingredient{p.active_ingredients.length ? '' : ' (add ingredients to this product to find alternatives)'}.</p>)}
          </div>
        </>
      )}
      {receive && p && <ReceiveStockModal product={p} onClose={() => setReceive(false)} onDone={() => { reload(); onChanged(); }} />}
      {adjust && <AdjustModal batch={adjust} onClose={() => setAdjust(null)} onDone={() => { reload(); onChanged(); }} />}
    </Drawer>
  );
}
