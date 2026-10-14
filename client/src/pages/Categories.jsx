import { useState } from 'react';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { Empty, ErrorState, Field, Loading, PageHead, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useApi, useDocumentTitle, useOnChange } from '../lib/hooks.js';

const COLORS = ['#65a30d', '#ca8a04', '#0d9488', '#0f766e', '#dc2626', '#7c3aed', '#ea580c', '#2563eb', '#475569', '#db2777', '#0891b2', '#78716c'];

export default function Categories() {
  useDocumentTitle('Categories');
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useApi('/categories');
  useOnChange(reload);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const items = data?.items ?? [];

  const remove = async (c) => {
    if (c.product_count > 0) return setDel(c);
    if (!(await confirm({ title: `Delete “${c.name}”?`, message: 'This category has no products.', confirmText: 'Delete', tone: 'danger' }))) return;
    try { await api.del(`/categories/${c.id}`); toast.success('Category deleted'); } catch (e) { toast.error(e.message); }
  };

  return (
    <>
      <PageHead title="Categories" subtitle="Group your products for faster searching, selling and reporting.">
        <button className="btn primary" onClick={() => setEdit({})}><Plus size={16} /> Add category</button>
      </PageHead>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : items.length === 0 ? (
        <div className="card"><Empty icon={Tags} title="No categories" action={<button className="btn primary" onClick={() => setEdit({})}>Add category</button>} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
          {items.map((c) => (
            <div className="card card-pad row" key={c.id}>
              <span className="avatar" style={{ background: `${c.color}22`, color: c.color }}><Tags size={17} /></span>
              <div className="grow"><b className="truncate" style={{ display: 'block' }}>{c.name}</b><span className="cell-sub">{c.product_count} product{c.product_count === 1 ? '' : 's'}</span></div>
              <button className="btn ghost icon sm" onClick={() => setEdit(c)} aria-label={`Edit ${c.name}`}><Pencil size={15} /></button>
              <button className="btn ghost icon sm" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
      {edit && <CategoryForm category={edit.id ? edit : null} onClose={() => setEdit(null)} />}
      {del && <ReassignDelete category={del} others={items.filter((c) => c.id !== del.id)} onClose={() => setDel(null)} />}
    </>
  );
}

function CategoryForm({ category, onClose }) {
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? COLORS[0]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (category) await api.patch(`/categories/${category.id}`, { name, color }); else await api.post('/categories', { name, color });
      toast.success(category ? 'Category updated' : 'Category added'); onClose();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  return (
    <Modal title={category ? 'Edit category' : 'Add category'} size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="cf" disabled={busy}>{busy ? <Spinner /> : 'Save'}</button></>}>
      <form id="cf" className="stack-v" onSubmit={submit}>
        {err && !err.fields && <div className="alert danger">{err.message}</div>}
        <Field label="Name" error={err?.fields?.name}><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <div><div className="label" style={{ marginBottom: 8 }}>Colour</div>
          <div className="row wrap">{COLORS.map((c) => (
            <button type="button" key={c} onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c}
              style={{ width: 28, height: 28, borderRadius: 8, background: c, border: color === c ? '3px solid var(--text)' : '3px solid transparent', outlineOffset: 1 }} />
          ))}</div>
        </div>
      </form>
    </Modal>
  );
}

function ReassignDelete({ category, others, onClose }) {
  const toast = useToast();
  const [to, setTo] = useState('');
  const go = async () => {
    try { await api.del(`/categories/${category.id}`, { reassign_to: to }); toast.success('Category deleted'); onClose(); } catch (e) { toast.error(e.message); }
  };
  return (
    <Modal title={`Delete “${category.name}”`} size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn danger" disabled={!to} onClick={go}>Move &amp; delete</button></>}>
      <p className="muted" style={{ marginBottom: 14 }}>{category.product_count} product{category.product_count === 1 ? ' is' : 's are'} in this category. Choose where to move them.</p>
      <Field label="Move products to">
        <select className="select" value={to} onChange={(e) => setTo(e.target.value)} autoFocus>
          <option value="">Select a category…</option>{others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
    </Modal>
  );
}
