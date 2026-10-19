import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Check, Copy, KeyRound, RotateCcw } from 'lucide-react';
import { Modal, useConfirm } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Badge, DataTable, ErrorState, Loading, PageHead } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApi, useDocumentTitle } from '../../lib/hooks.js';
import { ago, fmtDate, shopStatus } from './format.js';

function Detail({ label, children }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{children || '—'}</div>
    </div>
  );
}

function PasswordModal({ user, password, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Modal
      title={`New password for ${user.name}`}
      onClose={onClose}
      dismissible={false}
      size="sm"
      footer={<button className="btn primary" onClick={onClose}>Done</button>}
    >
      <div className="stack-v">
        <div className="row between" style={{ gap: 10 }}>
          <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: '.02em', wordBreak: 'break-all' }}>{password}</code>
          <button className="btn sm" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}</button>
        </div>
        <div className="alert warn">This is shown once. Share it securely. {user.name} was signed out everywhere and should change it after signing in.</div>
      </div>
    </Modal>
  );
}

export default function AdminShop() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useApi(`/admin/shops/${id}`);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  useDocumentTitle(data ? `${data.shop.shop_name} · Admin` : 'Admin');

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const { shop, team } = data;
  const st = shopStatus(shop);

  const toggle = async () => {
    const suspending = !shop.suspended;
    const ok = await confirm({
      title: suspending ? `Suspend ${shop.shop_name}?` : `Reactivate ${shop.shop_name}?`,
      message: suspending
        ? 'Everyone in this shop is signed out and cannot sign in until you reactivate it. Their data is kept.'
        : 'Their team can sign in again straight away.',
      confirmText: suspending ? 'Suspend' : 'Reactivate',
      tone: suspending ? 'danger' : undefined,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/admin/shops/${shop.id}/${suspending ? 'suspend' : 'unsuspend'}`);
      toast.success(suspending ? 'Shop suspended' : 'Shop reactivated');
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (user) => {
    const ok = await confirm({
      title: `Reset password for ${user.name}?`,
      message: 'A new random password is generated and they are signed out everywhere.',
      confirmText: 'Reset password',
    });
    if (!ok) return;
    try {
      const r = await api.post(`/admin/shops/${shop.id}/users/${user.id}/reset-password`);
      setIssued({ user, password: r.password });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const cols = [
    { header: 'Name', first: true, render: (u) => <div><div className="cell-main">{u.name}</div><div className="cell-sub">{u.email}</div></div> },
    { header: 'Role', render: (u) => <Badge tone={u.role === 'owner' ? 'info' : u.role === 'manager' ? 'ok' : ''}>{u.role}</Badge> },
    { header: 'Sales made', align: 'right', render: (u) => u.sale_count },
    { header: 'Status', render: (u) => (u.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="danger">Deactivated</Badge>) },
    { header: '', render: (u) => (
      <div className="row-actions">
        <button className="btn ghost sm" onClick={() => reset(u)}><KeyRound size={15} /> Reset password</button>
      </div>
    ) },
  ];

  return (
    <>
      <Link to="/admin" className="btn ghost sm" style={{ marginBottom: 12 }}><ArrowLeft size={15} /> All shops</Link>
      <PageHead title={shop.shop_name} subtitle={`${shop.owner_name} · ${shop.owner_email}`}>
        <Badge tone={st.tone}>{st.label}</Badge>
        <button className={`btn ${shop.suspended ? 'primary' : 'danger'}`} onClick={toggle} disabled={busy}>
          {shop.suspended ? <><RotateCcw size={15} /> Reactivate</> : <><Ban size={15} /> Suspend</>}
        </button>
      </PageHead>

      {shop.suspended && <div className="alert danger" style={{ marginBottom: 16 }}>Suspended on {fmtDate(shop.suspended_at)}. Nobody in this shop can sign in.</div>}

      <div className="card card-pad">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 18 }}>
          <Detail label="Phone">{shop.phone}</Detail>
          <Detail label="Address">{shop.address}</Detail>
          <Detail label="Currency">{shop.currency}</Detail>
          <Detail label="Time zone">{shop.timezone}</Detail>
          <Detail label="Joined">{fmtDate(shop.created_at)}</Detail>
          <Detail label="Last sale">{ago(shop.last_sale_at)}</Detail>
          <Detail label="Products">{String(shop.products)}</Detail>
          <Detail label="Sales recorded">{String(shop.sales_count)}</Detail>
        </div>
      </div>

      <div className="card mt">
        <div className="toolbar"><strong>Team</strong></div>
        <DataTable columns={cols} rows={team} dim={(u) => !u.is_active} />
      </div>

      {issued && <PasswordModal user={issued.user} password={issued.password} onClose={() => setIssued(null)} />}
    </>
  );
}
