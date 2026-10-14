import { useState } from 'react';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { DataTable, Empty, ErrorState, Field, Loading, PageHead, SearchInput, Spinner } from '../components/ui.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useApi, useDebounced, useDocumentTitle, useOnChange } from '../lib/hooks.js';

export default function Suppliers() {
  useDocumentTitle('Suppliers');
  const { money } = useFmt();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const dsearch = useDebounced(search);
  const { data, loading, error, reload } = useApi('/suppliers', { search: dsearch });
  useOnChange(reload);
  const [edit, setEdit] = useState(null);
  const items = data?.items ?? [];

  const remove = async (s) => {
    if (!(await confirm({ title: `Delete ${s.name}?`, message: 'Products and past purchases are kept, just without this supplier link.', confirmText: 'Delete', tone: 'danger' }))) return;
    try { await api.del(`/suppliers/${s.id}`); toast.success('Supplier deleted'); } catch (e) { toast.error(e.message); }
  };

  const cols = [
    { header: 'Supplier', first: true, render: (s) => <div><div className="cell-main">{s.name}</div><div className="cell-sub">{s.contact_person}</div></div> },
    { header: 'Contact', render: (s) => <div>{s.phone || '—'}<div className="cell-sub">{s.email}</div></div> },
    { header: 'Products', align: 'right', render: (s) => s.product_count },
    { header: 'Total purchased', align: 'right', render: (s) => <span className="num">{money(s.total_purchased)}</span> },
    { header: '', render: (s) => (
      <div className="row-actions">
        <button className="btn ghost icon sm" onClick={() => setEdit(s)} aria-label="Edit"><Pencil size={15} /></button>
        <button className="btn ghost icon sm" onClick={() => remove(s)} aria-label="Delete"><Trash2 size={15} /></button>
      </div>) },
  ];

  return (
    <>
      <PageHead title="Suppliers" subtitle="Who you buy from, and how much.">
        <button className="btn primary" onClick={() => setEdit({})}><Plus size={16} /> Add supplier</button>
      </PageHead>
      <div className="card">
        <div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search suppliers…" /></div>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : items.length === 0 ? (
          <Empty icon={Truck} title="No suppliers yet" action={<button className="btn primary" onClick={() => setEdit({})}>Add supplier</button>}>Link suppliers to products and purchases to track who you buy from.</Empty>
        ) : <DataTable columns={cols} rows={items} onRowClick={setEdit} />}
      </div>
      {edit && <SupplierForm supplier={edit.id ? edit : null} onClose={() => setEdit(null)} />}
    </>
  );
}

function SupplierForm({ supplier, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ name: supplier?.name ?? '', contact_person: supplier?.contact_person ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', address: supplier?.address ?? '', notes: supplier?.notes ?? '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (supplier) await api.patch(`/suppliers/${supplier.id}`, f); else await api.post('/suppliers', f);
      toast.success(supplier ? 'Supplier updated' : 'Supplier added'); onClose();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  return (
    <Modal title={supplier ? 'Edit supplier' : 'Add supplier'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="sf" disabled={busy}>{busy ? <Spinner /> : 'Save'}</button></>}>
      <form id="sf" className="form-grid" onSubmit={submit}>
        {err && !err.fields && <div className="alert danger full">{err.message}</div>}
        <Field label="Company name" className="full" error={err?.fields?.name}><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Contact person"><input className="input" value={f.contact_person} onChange={set('contact_person')} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email" className="full" error={err?.fields?.email}><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Address" className="full"><input className="input" value={f.address} onChange={set('address')} /></Field>
        <Field label="Notes" className="full"><textarea className="textarea" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}
