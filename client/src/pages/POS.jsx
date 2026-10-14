import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Minus, Plus, ShoppingCart, Trash2, UserPlus, X } from 'lucide-react';
import Receipt from '../components/Receipt.jsx';
import { Modal } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, Empty, Field, Loading, PageHead, SearchInput, Spinner } from '../components/ui.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { PAYMENT_LABELS } from '../lib/format.js';
import { useApi, useDebounced, useDocumentTitle } from '../lib/hooks.js';

const METHODS = ['cash', 'mobile_money', 'card', 'bank_transfer', 'credit'];
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function POS() {
  useDocumentTitle('New sale');
  const { money, num } = useFmt();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const dsearch = useDebounced(search, 200);
  const cats = useApi('/categories');
  const customers = useApi('/customers');
  const products = useApi('/products', { search: dsearch, category_id: category, status: 'sellable', limit: 60, sort: 'name' });

  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState('cash');
  const [paid, setPaid] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const searchRef = useRef(null);

  const subtotal = useMemo(() => round2(cart.reduce((s, l) => s + l.quantity * l.unit_price, 0)), [cart]);
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = round2(subtotal - disc);
  const paidNow = paid === '' ? (method === 'credit' ? 0 : total) : Math.min(Number(paid) || 0, total);
  const balance = round2(total - paidNow);
  const count = cart.reduce((s, l) => s + 1, 0);

  const add = (p, qty = 1) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        const next = [...c];
        const q = Math.min(next[i].quantity + qty, p.sellable);
        if (q === next[i].quantity) toast.warn(`Only ${num(p.sellable)} ${p.unit} of ${p.name} available`);
        next[i] = { ...next[i], quantity: q };
        return next;
      }
      return [...c, { product: p, quantity: Math.min(qty, p.sellable), unit_price: p.selling_price }];
    });
  };
  const setLine = (i, patch) => setCart((c) => c.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setQty = (i, v) => {
    const l = cart[i];
    const q = Math.min(Math.max(Number(v) || 0, 0), l.product.sellable);
    if (Number(v) > l.product.sellable) toast.warn(`Only ${num(l.product.sellable)} ${l.product.unit} available`);
    setLine(i, { quantity: q });
  };

  // Barcode scanners type the code then press Enter.
  const onSearchKey = (e) => {
    if (e.key !== 'Enter' || !search.trim()) return;
    const q = search.trim().toLowerCase();
    const items = products.data?.items ?? [];
    const exact = items.find((p) => p.barcode === search.trim() || p.sku?.toLowerCase() === q);
    const pick = exact || (items.length === 1 ? items[0] : null);
    if (pick) { add(pick); setSearch(''); }
  };

  useEffect(() => { if (!cart.length) setCartOpen(false); }, [cart.length]);

  const needsCustomer = balance > 0;
  const canCharge = cart.length > 0 && cart.every((l) => l.quantity > 0) && (!needsCustomer || customerId) && !busy;

  const checkout = async () => {
    setBusy(true);
    try {
      const sale = await api.post('/sales', {
        customer_id: customerId ? Number(customerId) : null,
        items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity, unit_price: l.unit_price })),
        discount: disc, payment_method: method, amount_paid: paidNow, note,
      });
      setReceipt(sale);
      setCart([]); setDiscount(''); setPaid(''); setNote(''); setMethod('cash'); setCustomerId(''); setCartOpen(false);
      products.reload(); customers.reload();
    } catch (e) {
      toast.error(e.message);
      products.reload();
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="New sale" subtitle="Tap a product to add it. Stock is taken from the earliest-expiring batch first." />
      <div className="pos">
        <section className="pos-catalog">
          <div className="card card-pad stack-v" style={{ gap: 12 }}>
            <SearchInput ref={searchRef} value={search} onChange={setSearch} onKeyDown={onSearchKey} autoFocus
              placeholder="Search, or scan a barcode and press Enter…" />
            <div className="chips">
              <button className="chip" aria-pressed={category === ''} onClick={() => setCategory('')}>All</button>
              {cats.data?.items.filter((c) => c.product_count > 0).map((c) => (
                <button key={c.id} className="chip" aria-pressed={category === String(c.id)} onClick={() => setCategory(String(c.id))}>{c.name}</button>
              ))}
            </div>
          </div>
          {products.loading && !products.data ? <Loading /> : products.data?.items.length === 0 ? (
            <div className="card"><Empty icon={ShoppingCart} title="No sellable products found">Products need in-date stock to appear here. Receive stock from the Products or Purchases page.</Empty></div>
          ) : (
            <div className="pos-grid">
              {products.data?.items.map((p) => {
                const inCart = cart.find((l) => l.product.id === p.id);
                return (
                  <button key={p.id} className="pcard" onClick={() => add(p)} disabled={inCart && inCart.quantity >= p.sellable}>
                    <span className="name">{p.name}</span>
                    {p.category_name && <span className="cell-sub">{p.category_name}</span>}
                    <span className="stock">
                      <span>{num(p.sellable)} {p.unit}</span>
                      {p.stock_status === 'low' ? <Badge tone="warn">Low</Badge> : p.expiring_qty > 0 ? <Badge tone="warn">Expiring</Badge> : null}
                    </span>
                    <span className="price">{money(p.selling_price)}{inCart && <Badge tone="ok"> ×{num(inCart.quantity)}</Badge>}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className={`card cart ${cartOpen ? 'open' : ''}`}>
          <div className="cart-head">
            <b>Current sale {count > 0 && <span className="muted">· {count} item{count === 1 ? '' : 's'}</span>}</b>
            <div className="row">
              {cart.length > 0 && <button className="btn ghost sm" onClick={() => setCart([])}>Clear</button>}
              <button className="btn ghost icon sm cart-close" onClick={() => setCartOpen(false)} aria-label="Hide cart" style={{ display: cartOpen ? undefined : 'none' }}><X size={16} /></button>
            </div>
          </div>
          <div className="cart-lines">
            {cart.length === 0 && <Empty icon={ShoppingCart} title="Cart is empty">Add products from the list.</Empty>}
            {cart.map((l, i) => (
              <div className="cart-line" key={l.product.id}>
                <div><b>{l.product.name}</b><div className="cell-sub">{num(l.product.sellable)} {l.product.unit} available</div></div>
                <button className="btn ghost icon sm" onClick={() => setCart((c) => c.filter((_, j) => j !== i))} aria-label={`Remove ${l.product.name}`}><Trash2 size={15} /></button>
                <div className="row">
                  <div className="stepper">
                    <button onClick={() => setQty(i, l.quantity - 1)} aria-label="Decrease"><Minus size={14} /></button>
                    <input type="number" step="any" min="0" value={l.quantity} onChange={(e) => setQty(i, e.target.value)} aria-label="Quantity" />
                    <button onClick={() => setQty(i, l.quantity + 1)} aria-label="Increase"><Plus size={14} /></button>
                  </div>
                  <span className="muted">×</span>
                  <input className="input sm num" style={{ width: 100 }} type="number" step="any" min="0" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })} aria-label="Unit price" />
                </div>
                <b className="num right" style={{ alignSelf: 'center' }}>{money(l.quantity * l.unit_price)}</b>
              </div>
            ))}
          </div>
          <div className="cart-foot">
            <div className="row">
              <select className="select sm grow" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer">
                <option value="">Walk-in customer</option>
                {customers.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}{c.balance > 0 ? ` (owes ${money(c.balance)})` : ''}</option>)}
              </select>
              <button className="btn sm icon" onClick={() => setNewCustomer(true)} aria-label="New customer" title="New customer"><UserPlus size={15} /></button>
            </div>
            <div className="seg block" role="group" aria-label="Payment method" style={{ flexWrap: 'wrap' }}>
              {METHODS.map((m) => <button key={m} aria-pressed={method === m} onClick={() => { setMethod(m); setPaid(''); }} style={{ fontSize: 11.5, padding: '6px 8px' }}>{PAYMENT_LABELS[m].replace('On credit', 'Credit').replace('Mobile money', 'Mobile').replace('Bank transfer', 'Bank')}</button>)}
            </div>
            <div className="form-grid" style={{ gap: 10 }}>
              <Field label="Discount"><input className="input sm" type="number" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></Field>
              <Field label="Paid now"><input className="input sm" type="number" min="0" step="any" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={String(method === 'credit' ? 0 : total)} /></Field>
            </div>
            <div className="totals">
              <div className="row between"><span className="muted">Subtotal</span><span className="num">{money(subtotal)}</span></div>
              {disc > 0 && <div className="row between"><span className="muted">Discount</span><span className="num">−{money(disc)}</span></div>}
              {balance > 0 && <div className="row between" style={{ color: 'var(--warn)' }}><span>Balance on credit</span><b className="num">{money(balance)}</b></div>}
              <div className="grand"><span>Total</span><span>{money(total)}</span></div>
            </div>
            {needsCustomer && cart.length > 0 && !customerId && <div className="alert warn">Select a customer to sell on credit or part-payment.</div>}
            <button className="btn primary lg block" disabled={!canCharge} onClick={checkout}>
              {busy ? <Spinner /> : <>Charge {money(paidNow)}</>}
            </button>
          </div>
        </aside>
      </div>

      {cart.length > 0 && !cartOpen && (
        <button className="cart-fab" onClick={() => setCartOpen(true)}>
          <span className="row"><ShoppingCart size={18} /> {count} item{count === 1 ? '' : 's'}</span><span className="num">{money(total)} · View</span>
        </button>
      )}

      {receipt && (
        <Modal title="Sale complete" size="sm" onClose={() => setReceipt(null)}
          footer={<button className="btn primary" onClick={() => { setReceipt(null); searchRef.current?.focus?.(); }}>New sale</button>}>
          <div className="row" style={{ justifyContent: 'center', marginBottom: 14, color: 'var(--ok)', fontWeight: 650 }}><CheckCircle2 size={20} /> {receipt.receipt_no} recorded</div>
          <Receipt sale={receipt} />
        </Modal>
      )}
      {newCustomer && <QuickCustomer onClose={() => setNewCustomer(false)} onCreated={(c) => { customers.reload(); setCustomerId(String(c.id)); }} />}
    </>
  );
}

function QuickCustomer({ onClose, onCreated }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', phone: '' });
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try { const c = await api.post('/customers', f); toast.success('Customer added'); onCreated(c); onClose(); } catch (ex) { setErr(ex); }
  };
  return (
    <Modal title="New customer" size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="qc">Add customer</button></>}>
      <form id="qc" className="stack-v" onSubmit={submit}>
        <Field label="Name" error={err?.fields?.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
