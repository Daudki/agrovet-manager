import { Fragment, useState } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, DataTable, Empty, ErrorState, Field, Loading, PageHead, Spinner } from '../components/ui.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useApi, useDocumentTitle, useOnChange } from '../lib/hooks.js';

import { t } from '../lib/i18n.js';
const ROLE_INFO = {
  owner: ['Owner', 'Full control, including settings and the team.'],
  manager: ['Manager', 'Runs the shop: products, stock, purchases, expenses, reports and voids. Cannot change settings or the team.'],
  cashier: ['Cashier', 'Sells and looks up products and customers. Cannot see costs or profit, and only sees their own sales.'],
};

export default function Team() {
  useDocumentTitle(t('Team'));
  const { date } = useFmt();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useApi('/team');
  useOnChange(reload);
  const [edit, setEdit] = useState(null);
  const items = data?.items ?? [];

  const remove = async (m) => {
    if (!(await confirm({ title: t('Remove {0}?', [m.name]), message: t('They can no longer sign in. Sales they made are kept.'), confirmText: t('Remove'), tone: 'danger' }))) return;
    try { await api.del(`/team/${m.id}`); toast.success(t('Team member removed')); } catch (e) { toast.error(e.message); }
  };

  const cols = [
    { header: t('Name'), first: true, render: (m) => <div><div className="cell-main">{m.name}</div><div className="cell-sub">{m.email}</div></div> },
    { header: t('Role'), render: (m) => <Badge tone={m.role === 'owner' ? 'info' : m.role === 'manager' ? 'ok' : ''}>{t(ROLE_INFO[m.role][0])}</Badge> },
    { header: t('Sales made'), align: 'right', render: (m) => m.sale_count },
    { header: t('Status'), render: (m) => (m.is_active ? <Badge tone="ok">{t('Active')}</Badge> : <Badge tone="danger">{t('Deactivated')}</Badge>) },
    { header: t('Added'), render: (m) => date(m.created_at) },
    { header: '', render: (m) => m.role === 'owner' ? null : (
      <div className="row-actions">
        <button className="btn ghost icon sm" onClick={() => setEdit(m)} aria-label={t('Edit')}><Pencil size={15} /></button>
        <button className="btn ghost icon sm" onClick={() => remove(m)} aria-label={t('Remove')}><Trash2 size={15} /></button>
      </div>) },
  ];

  return (
    <>
      <PageHead title={t('Team')} subtitle={t('Give your staff their own logins with the access they need.')}>
        <button className="btn primary" onClick={() => setEdit({})}><Plus size={16} /> {t('Add team member')}</button>
      </PageHead>
      <div className="card">
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : items.length <= 1 ? (
          <>
            <DataTable columns={cols} rows={items} />
            <Empty icon={UserCog} title={t('Just you so far')} action={<button className="btn primary" onClick={() => setEdit({})}>{t('Add your first team member')}</button>}>
              {t('Add a cashier so staff can sell without seeing your costs and profit.')}
            </Empty>
          </>
        ) : <DataTable columns={cols} rows={items} dim={(m) => !m.is_active} />}
      </div>
      <div className="card card-pad mt">
        <div className="row" style={{ marginBottom: 10 }}><ShieldCheck size={18} color="var(--primary)" /><b>{t('What each role can do')}</b></div>
        <dl className="kv" style={{ gridTemplateColumns: 'auto 1fr', textAlign: 'left' }}>
          {Object.values(ROLE_INFO).map(([name, desc]) => (<Fragment key={name}><dt><b>{t(name)}</b></dt><dd style={{ textAlign: 'left', fontWeight: 400 }} className="muted">{t(desc)}</dd></Fragment>))}
        </dl>
      </div>
      {edit && <MemberForm member={edit.id ? edit : null} onClose={() => setEdit(null)} />}
    </>
  );
}

function MemberForm({ member, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ name: member?.name ?? '', email: member?.email ?? '', role: member?.role ?? 'cashier', password: '', is_active: member?.is_active ?? true });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fe = (k) => err?.fields?.[k];

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (member) {
        await api.patch(`/team/${member.id}`, { name: f.name, role: f.role, is_active: f.is_active, ...(f.password ? { password: f.password } : {}) });
        toast.success(t('Team member updated'));
      } else {
        await api.post('/team', { name: f.name, email: f.email, role: f.role, password: f.password });
        toast.success(t('Team member added'));
      }
      onClose();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };

  return (
    <Modal title={member ? t('Edit {0}', [member.name]) : t('Add team member')} size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn primary" form="mf" disabled={busy}>{busy ? <Spinner /> : t('Save')}</button></>}>
      <form id="mf" className="stack-v" onSubmit={submit} noValidate>
        {err && !err.fields && <div className="alert danger">{err.message}</div>}
        <Field label={t('Full name')} error={fe('name')}><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label={t('Email (used to sign in)')} error={fe('email')}><input className="input" type="email" value={f.email} onChange={set('email')} readOnly={!!member} /></Field>
        <Field label={t('Role')} hint={t(ROLE_INFO[f.role][1])}>
          <select className="select" value={f.role} onChange={set('role')}><option value="cashier">{t('Cashier')}</option><option value="manager">{t('Manager')}</option></select>
        </Field>
        <Field label={member ? t('New password (leave blank to keep)') : t('Password')} error={fe('password')} hint={t('At least 8 characters. Share it with them privately.')}>
          <input className="input" type="text" autoComplete="off" value={f.password} onChange={set('password')} />
        </Field>
        {member && (
          <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /><span>{t('Active (untick to block sign-in without deleting)')}</span></label>
        )}
      </form>
    </Modal>
  );
}
