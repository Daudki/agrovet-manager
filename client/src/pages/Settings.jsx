import { useMemo, useState } from 'react';
import { Download, LogOut, Sparkles } from 'lucide-react';
import { useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { Field, PageHead, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useApi, useDocumentTitle } from '../lib/hooks.js';

const CURRENCIES = ['TZS', 'KES', 'UGX', 'RWF', 'ZMW', 'MWK', 'ETB', 'NGN', 'GHS', 'ZAR', 'USD', 'EUR', 'GBP'];

export default function Settings() {
  useDocumentTitle('Settings');
  const { account, setAccount, logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const alerts = useApi('/alerts');
  const zones = useMemo(() => {
    try { const z = Intl.supportedValuesOf('timeZone'); return z.includes(account.timezone) ? z : [account.timezone, ...z]; } catch { return [account.timezone]; }
  }, [account.timezone]);

  const [f, setF] = useState({
    shop_name: account.shop_name, owner_name: account.owner_name, phone: account.phone, address: account.address,
    currency: account.currency, timezone: account.timezone, expiry_warning_days: account.expiry_warning_days, receipt_footer: account.receipt_footer,
  });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api.patch('/account', { ...f, expiry_warning_days: Number(f.expiry_warning_days) });
      setAccount(r.account); toast.success('Settings saved');
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };

  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [pwErr, setPwErr] = useState(null);
  const changePw = async (e) => {
    e.preventDefault(); setPwErr(null);
    try { await api.post('/account/password', pw); setPw({ current_password: '', new_password: '' }); toast.success('Password changed. Other devices were signed out.'); } catch (ex) { setPwErr(ex); }
  };

  const signOutAll = async () => {
    if (!(await confirm({ title: 'Sign out everywhere?', message: 'You’ll be signed out on this device and every other device.', confirmText: 'Sign out everywhere' }))) return;
    await api.post('/account/sign-out-everywhere').catch(() => {});
    await logout();
  };

  const loadDemo = async () => {
    try { await api.post('/account/demo-data'); toast.success('Sample data loaded'); alerts.reload(); } catch (e) { toast.error(e.message); }
  };

  const fe = (k) => err?.fields?.[k];
  return (
    <>
      <PageHead title="Settings" subtitle="Your business profile, regional preferences and security." />
      <div className="stack-v" style={{ maxWidth: 780 }}>
        <form className="card" onSubmit={save}>
          <div className="card-head"><h3>Business profile</h3></div>
          <div className="card-body form-grid">
            {err && !err.fields && <div className="alert danger full">{err.message}</div>}
            <Field label="Business name" error={fe('shop_name')}><input className="input" value={f.shop_name} onChange={set('shop_name')} /></Field>
            <Field label="Owner name" error={fe('owner_name')}><input className="input" value={f.owner_name} onChange={set('owner_name')} /></Field>
            <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
            <Field label="Address"><input className="input" value={f.address} onChange={set('address')} /></Field>
            <Field label="Receipt footer" className="full"><input className="input" value={f.receipt_footer} onChange={set('receipt_footer')} /></Field>
            <div className="form-section">Regional &amp; alerts</div>
            <Field label="Currency" error={fe('currency')}>
              <input className="input" list="currencies" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />
              <datalist id="currencies">{CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Time zone" hint="Decides which day a sale belongs to.">
              <select className="select" value={f.timezone} onChange={set('timezone')}>{zones.map((z) => <option key={z}>{z}</option>)}</select>
            </Field>
            <Field label="Warn about expiry within (days)" error={fe('expiry_warning_days')} className="full">
              <input className="input" type="number" min="1" max="365" value={f.expiry_warning_days} onChange={set('expiry_warning_days')} />
            </Field>
            <div className="full row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy}>{busy ? <Spinner /> : 'Save changes'}</button></div>
          </div>
        </form>

        <form className="card" onSubmit={changePw}>
          <div className="card-head"><h3>Password</h3></div>
          <div className="card-body form-grid">
            {pwErr && !pwErr.fields && <div className="alert danger full">{pwErr.message}</div>}
            <Field label="Current password" error={pwErr?.fields?.current_password}><input className="input" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New password" error={pwErr?.fields?.new_password}><input className="input" type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
            <div className="full row between wrap">
              <button type="button" className="btn ghost" onClick={signOutAll}><LogOut size={16} /> Sign out on all devices</button>
              <button className="btn primary">Change password</button>
            </div>
          </div>
        </form>

        <div className="card">
          <div className="card-head"><h3>Your data</h3></div>
          <div className="card-body">
            <p className="muted" style={{ marginBottom: 12 }}>Download your records at any time as spreadsheets.</p>
            <div className="row wrap">
              <a className="btn" href="/api/export/products.csv"><Download size={16} /> Products</a>
              <a className="btn" href="/api/export/sales.csv"><Download size={16} /> Sales</a>
              <a className="btn" href="/api/export/expenses.csv"><Download size={16} /> Expenses</a>
              <a className="btn" href="/api/export/movements.csv"><Download size={16} /> Stock ledger</a>
            </div>
            {alerts.data?.products === 0 && (
              <>
                <hr className="divider" />
                <div className="row between wrap"><span className="muted">Your account is empty. Want to look around with example data?</span><button className="btn" onClick={loadDemo}><Sparkles size={16} /> Load sample data</button></div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
