import { useEffect, useState } from 'react';
import { Download, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import DateRange, { useRangePresets } from '../components/DateRange.jsx';
import { HBars } from '../components/Charts.jsx';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { DataTable, Empty, ErrorState, Field, Loading, PageHead, Pagination, SearchInput, Spinner } from '../components/ui.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced, useDocumentTitle, useOnChange } from '../lib/hooks.js';

export default function Expenses() {
  useDocumentTitle('Expenses');
  const { money, date } = useFmt();
  const toast = useToast();
  const confirm = useConfirm();
  const { presets } = useRangePresets();
  const [range, setRange] = useState(presets.find((p) => p.key === 'month').range);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(null);
  const dsearch = useDebounced(search);
  useEffect(() => setPage(1), [range, category, dsearch]);
  const { data, loading, error, reload } = useApi('/expenses', { ...range, category, search: dsearch, page, limit: 25 });
  useOnChange(reload);
  const items = data?.items ?? [];

  const remove = async (x) => {
    if (!(await confirm({ title: 'Delete expense?', message: `${x.category} · ${money(x.amount)}`, confirmText: 'Delete', tone: 'danger' }))) return;
    try { await api.del(`/expenses/${x.id}`); toast.success('Expense deleted'); } catch (e) { toast.error(e.message); }
  };

  const cols = [
    { header: 'Date', first: true, render: (x) => <span className="cell-main">{date(x.spent_on)}</span> },
    { header: 'Category', render: (x) => x.category },
    { header: 'Description', render: (x) => <span className="muted">{x.description || '—'}</span> },
    { header: 'Amount', align: 'right', render: (x) => <b className="num">{money(x.amount)}</b> },
    { header: '', render: (x) => (
      <div className="row-actions">
        <button className="btn ghost icon sm" onClick={() => setEdit(x)} aria-label="Edit"><Pencil size={15} /></button>
        <button className="btn ghost icon sm" onClick={() => remove(x)} aria-label="Delete"><Trash2 size={15} /></button>
      </div>) },
  ];

  return (
    <>
      <PageHead title="Expenses" subtitle="Rent, wages, transport and other running costs — deducted from your profit.">
        <a className="btn" href={`/api/export/expenses.csv${qs(range)}`}><Download size={16} /> Export</a>
        <button className="btn primary" onClick={() => setEdit({})}><Plus size={16} /> Add expense</button>
      </PageHead>
      <div className="dash-grid" style={{ marginTop: 0 }}>
        <div className="card">
          <div className="toolbar"><DateRange value={range} onChange={setRange} /></div>
          <div className="toolbar">
            <SearchInput value={search} onChange={setSearch} placeholder="Search description…" />
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="">All categories</option>{data?.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : items.length === 0 ? (
            <Empty icon={Wallet} title="No expenses in this period" action={<button className="btn primary" onClick={() => setEdit({})}>Add expense</button>}>Record running costs so your net profit is accurate.</Empty>
          ) : (
            <>
              <DataTable columns={cols} rows={items} />
              <Pagination page={data.page} pages={data.pages} total={data.total} limit={data.limit} onPage={setPage} />
            </>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h3>Total</h3></div>
          <div className="card-body">
            <div className="kpi"><div className="val" style={{ margin: 0, padding: 0 }}>{money(data?.sum ?? 0)}</div></div>
            <hr className="divider" />
            {data?.by_category.length ? <HBars items={data.by_category.map((c) => ({ name: c.category, value: c.total }))} format={money} /> : <p className="muted">Nothing to show.</p>}
          </div>
        </div>
      </div>
      {edit && <ExpenseForm expense={edit.id ? edit : null} categories={data?.categories ?? []} onClose={() => setEdit(null)} />}
    </>
  );
}

function ExpenseForm({ expense, categories, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ category: expense?.category ?? categories[0] ?? 'Other', amount: expense?.amount ?? '', description: expense?.description ?? '', spent_on: expense?.spent_on ?? '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = { ...f, amount: Number(f.amount), ...(f.spent_on ? {} : { spent_on: undefined }) };
    try {
      if (expense) await api.patch(`/expenses/${expense.id}`, body); else await api.post('/expenses', body);
      toast.success(expense ? 'Expense updated' : 'Expense added'); onClose();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  return (
    <Modal title={expense ? 'Edit expense' : 'Add expense'} size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="ef" disabled={busy}>{busy ? <Spinner /> : 'Save'}</button></>}>
      <form id="ef" className="stack-v" onSubmit={submit}>
        {err && !err.fields && <div className="alert danger">{err.message}</div>}
        <Field label="Category" error={err?.fields?.category}>
          <input className="input" list="expense-cats" value={f.category} onChange={set('category')} />
          <datalist id="expense-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <div className="form-grid">
          <Field label="Amount" error={err?.fields?.amount}><input className="input" type="number" min="0" step="any" value={f.amount} onChange={set('amount')} autoFocus /></Field>
          <Field label="Date"><input className="input" type="date" value={f.spent_on} onChange={set('spent_on')} /></Field>
        </div>
        <Field label="Description"><input className="input" value={f.description} onChange={set('description')} placeholder="Optional" /></Field>
      </form>
    </Modal>
  );
}
