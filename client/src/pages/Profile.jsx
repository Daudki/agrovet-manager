import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Badge, Field, PageHead, Spinner } from '../components/ui.jsx';
import LanguageSwitch from '../components/LanguageSwitch.jsx';
import { useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { t } from '../lib/i18n.js';

const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', cashier: 'Cashier' };

/** Available to every role: your own login, password and language. */
export default function Profile() {
  useDocumentTitle('My account');
  const { user, account, logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const change = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.post('/account/password', pw);
      setPw({ current_password: '', new_password: '' });
      toast.success(t('Password changed. Other devices were signed out.'));
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };

  const signOutAll = async () => {
    if (!(await confirm({ title: t('Sign out everywhere?'), message: t('You’ll be signed out on this device and every other device.'), confirmText: t('Sign out everywhere') }))) return;
    await api.post('/account/sign-out-everywhere').catch(() => {});
    await logout();
  };

  return (
    <>
      <PageHead title={t('My account')} subtitle={t('Your own login, password and language.')} />
      <div className="stack-v" style={{ maxWidth: 640 }}>
        <div className="card card-pad row">
          <div className="avatar" style={{ width: 46, height: 46, fontSize: 16 }}>{user.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
          <div className="grow"><b>{user.name}</b><div className="cell-sub">{user.email} · {account.shop_name}</div></div>
          <Badge tone={user.role === 'owner' ? 'info' : user.role === 'manager' ? 'ok' : ''}>{t(ROLE_LABEL[user.role])}</Badge>
        </div>

        <div className="card card-pad row between wrap">
          <div><b>{t('Language')}</b><div className="cell-sub">English · Kiswahili</div></div>
          <LanguageSwitch />
        </div>

        <form className="card" onSubmit={change}>
          <div className="card-head"><h3>{t('Password')}</h3></div>
          <div className="card-body form-grid">
            {err && !err.fields && <div className="alert danger full">{err.message}</div>}
            <Field label={t('Current password')} error={err?.fields?.current_password}><input className="input" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label={t('New password')} error={err?.fields?.new_password}><input className="input" type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
            <div className="full row between wrap">
              <button type="button" className="btn ghost" onClick={signOutAll}><LogOut size={16} /> {t('Sign out on all devices')}</button>
              <button className="btn primary" disabled={busy}>{busy ? <Spinner /> : t('Change password')}</button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
