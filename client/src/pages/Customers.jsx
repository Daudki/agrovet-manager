import { useState } from 'react';
import { Banknote, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Drawer, Modal, useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, DataTable, Empty, ErrorState, Field, Loading, PageHead, SearchInput, Spinner } from '../components/ui.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { PAYMENT_LABELS } from '../lib/format.js';
import { useApi, useDebounced, useDocumentTitle, useOnChange } from '../lib/hooks.js';

export default function Customers() {
  useDocumentTitle('Customers');
  const { money } = useFmt();
  const [search, setSearch] = useState('');
  const [owing, setOwing] = useState(false);
  const dsearch = useDebounced(search);
  const { data, loading, error, reload } = useApi('/customers', { search: dsearch, owing });
  useOnChange(reload);
  const [edit, setEdit] = useState(null);
  const [openId, setOpenId] = useState(null);
  const items = data?.items ?? [];
  const owed = items.reduce((s, c) => s + Math.max(c.balance, 0), 0);

  const cols = [
    { header: 'Customer', first: true, render: (c) => <div><div className="cell-main">{c.name}</div><div className="cell-sub">{c.phone || c.email}</div></div> },
    { header: 'Orders', align: 'right', render: (c) => c.sale_count },
    { header: 'Total spent', align: 'right', render: (c) => <span className="num">{money(c.total_spent)}</span> },
    { header: 'Balance owed', align: 'right', render: (c) => (c.balance > 0.005 ? <Badge tone="warn">{money(c.balance)}</Badge> : <span className="faint">—</span>) },
  ];

  return (
    <>
      <PageHead title="Customers" subtitle="Keep track of regulars and who owes you money.">
        <button className="btn primary" onClick={() => setEdit({})}><Plus size={16} /> Add customer</button>
      </PageHead>
      <div className="card">
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or phone…" />
          <button className="chip" aria-pressed={owing} onClick={() => setOwing((o) => !o)}>Owing money</button>
        </div>
        {owed > 0 && <div className="stat-strip"><div><small>Outstanding</small><b>{money(owed)}</b></div></div>}
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : items.length === 0 ? (
          <Empty icon={Users} title="No customers yet" action={<button className="btn primary" onClick={() => setEdit({})}>Add customer</button>}>Add customers to sell on credit and see their purchase history.</Empty>
        ) : <DataTable columns={cols} rows={items} onRowClick={(c) => setOpenId(c.id)} />}
      </div>
      {edit && <CustomerForm customer={edit.id ? edit : null} onClose={() => setEdit(null)} />}
      {openId && <CustomerDrawer id={openId} onClose={() => setOpenId(null)} onEdit={(c) => setEdit(c)} />}
    </>
  );
}

function CustomerForm({ customer, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ name: customer?.name ?? '', phone: customer?.phone ?? '', email: customer?.email ?? '', address: customer?.address ?? '', notes: customer?.notes ?? '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (customer) await api.patch(`/customers/${customer.id}`, f); else await api.post('/customers', f);
      toast.success(customer ? 'Customer updated' : 'Customer added'); onClose();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  return (
    <Modal title={customer ? 'Edit customer' : 'Add customer'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="cuf" disabled={busy}>{busy ? <Spinner /> : 'Save'}</button></>}>
      <form id="cuf" className="form-grid" onSubmit={submit}>
        {err && !err.fields && <div className="alert danger full">{err.message}</div>}
        <Field label="Name" className="full" error={err?.fields?.name}><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email" error={err?.fields?.email}><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Address / village" className="full"><input className="input" value={f.address} onChange={set('address')} /></Field>
        <Field label="Notes" className="full"><textarea className="textarea" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

function CustomerDrawer({ id, onClose, onEdit }) {
  const { money, date } = useFmt();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: c, loading, error, reload } = useApi(`/customers/${id}`);
  useOnChange(reload);
  const [paying, setPaying] = useState(false);

  const remove = async () => {
    if (!(await confirm({ title: 'Delete customer?', message: 'Their past sales are kept as walk-in sales.', confirmText: 'Delete', tone: 'danger' }))) return;
    try { await api.del(`/customers/${id}`); toast.success('Customer deleted'); onClose(); } catch (e) { toast.error(e.message); }
  };

  return (
    <Drawer title={c?.name ?? 'Customer'} subtitle={c && [c.phone, c.email, c.address].filter(Boolean).join(' · ')} onClose={onClose}
      actions={c && <button className="btn sm" onClick={() => onEdit(c)}><Pencil size={14} /> Edit</button>}>
      {loading && !c ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <div className="card card-pad row between" style={{ boxShadow: 'none', background: c.balance > 0.005 ? 'var(--warn-soft)' : 'var(--surface-2)' }}>
            <div><div className="muted" style={{ fontSize: 12 }}>Balance owed</div><b className="num" style={{ fontSize: 22 }}>{money(c.balance)}</b></div>
            {c.balance > 0.005 && <button className="btn primary" onClick={() => setPaying(true)}><Banknote size={16} /> Record payment</button>}
          </div>
          {c.notes && <p className="muted mt">{c.notes}</p>}

          <h4 className="mt-lg" style={{ marginBottom: 6 }}>Recent sales</h4>
          {c.sales.length === 0 ? <p className="muted">No sales yet.</p> : c.sales.map((s) => (
            <div className="attn-item" key={s.id}>
              <div className="grow"><b>{s.receipt_no}</b> {s.status === 'voided' && <Badge tone="danger">Voided</Badge>}<div className="cell-sub">{date(s.sold_on)} · {PAYMENT_LABELS[s.payment_method]}</div></div>
              <div className="right"><b className="num">{money(s.total)}</b>{s.status === 'completed' && s.total - s.amount_paid > 0.005 && <div className="cell-sub" style={{ color: 'var(--warn)' }}>owes {money(s.total - s.amount_paid)}</div>}</div>
            </div>
          ))}

          {c.payments.length > 0 && <>
            <h4 className="mt-lg" style={{ marginBottom: 6 }}>Payments received</h4>
            {c.payments.map((p) => (
              <div className="attn-item" key={p.id}><div className="grow"><b>{PAYMENT_LABELS[p.method] ?? p.method}</b><div className="cell-sub">{date(p.paid_on)}{p.note ? ` · ${p.note}` : ''}</div></div><b className="num" style={{ color: 'var(--ok)' }}>{money(p.amount)}</b></div>
            ))}
          </>}
          <div className="mt-lg"><button className="btn ghost" style={{ color: 'var(--danger)' }} onClick={remove}><Trash2 size={16} /> Delete customer</button></div>
          {paying && <PaymentModal customer={c} onClose={() => setPaying(false)} />}
        </>
      )}
    </Drawer>
  );
}

function PaymentModal({ customer, onClose }) {
  const { money } = useFmt();
  const toast = useToast();
  const [amount, setAmount] = useState(String(customer.balance));
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.post(`/customers/${customer.id}/payments`, { amount: Number(amount), method, note }); toast.success('Payment recorded'); onClose(); } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  return (
    <Modal title="Record payment" size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="pay" disabled={busy}>{busy ? <Spinner /> : 'Record payment'}</button></>}>
      <form id="pay" className="stack-v" onSubmit={submit}>
        {err && <div className="alert danger">{err.message}</div>}
        <Field label="Amount received" hint={`Outstanding: ${money(customer.balance)}. Applied to the oldest unpaid sales first.`}><input className="input" type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Method"><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>{['cash', 'mobile_money', 'card', 'bank_transfer'].map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}</select></Field>
        <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
