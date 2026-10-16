import { useMemo, useState } from 'react';
import { Download, Sparkles } from 'lucide-react';
import { useToast } from '../components/Toast.jsx';
import { Field, PageHead, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useApi, useDocumentTitle } from '../lib/hooks.js';

import { t } from '../lib/i18n.js';
const CURRENCIES = ['TZS', 'KES', 'UGX', 'RWF', 'ZMW', 'MWK', 'ETB', 'NGN', 'GHS', 'ZAR', 'USD', 'EUR', 'GBP'];

export default function Settings() {
  useDocumentTitle(t('Settings'));
  const { account, setAccount } = useAuth();
  const toast = useToast();
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
      setAccount(r.account); toast.success(t('Settings saved'));
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };

  const loadDemo = async () => {
    try { await api.post('/account/demo-data'); toast.success(t('Sample data loaded')); alerts.reload(); } catch (e) { toast.error(e.message); }
  };

  const fe = (k) => err?.fields?.[k];
  return (
    <>
      <PageHead title={t('Settings')} subtitle={t('Your business profile, regional preferences and data.')} />
      <div className="stack-v" style={{ maxWidth: 780 }}>
        <form className="card" onSubmit={save}>
          <div className="card-head"><h3>{t('Business profile')}</h3></div>
          <div className="card-body form-grid">
            {err && !err.fields && <div className="alert danger full">{err.message}</div>}
            <Field label={t('Business name')} error={fe('shop_name')}><input className="input" value={f.shop_name} onChange={set('shop_name')} /></Field>
            <Field label={t('Owner name')} error={fe('owner_name')}><input className="input" value={f.owner_name} onChange={set('owner_name')} /></Field>
            <Field label={t('Phone')}><input className="input" value={f.phone} onChange={set('phone')} /></Field>
            <Field label={t('Address')}><input className="input" value={f.address} onChange={set('address')} /></Field>
            <Field label={t('Receipt footer')} className="full"><input className="input" value={f.receipt_footer} onChange={set('receipt_footer')} /></Field>
            <div className="form-section">{t('Regional & alerts')}</div>
            <Field label={t('Currency')} error={fe('currency')}>
              <input className="input" list="currencies" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />
              <datalist id="currencies">{CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label={t('Time zone')} hint={t('Decides which day a sale belongs to.')}>
              <select className="select" value={f.timezone} onChange={set('timezone')}>{zones.map((z) => <option key={z}>{z}</option>)}</select>
            </Field>
            <Field label={t('Warn about expiry within (days)')} error={fe('expiry_warning_days')} className="full">
              <input className="input" type="number" min="1" max="365" value={f.expiry_warning_days} onChange={set('expiry_warning_days')} />
            </Field>
            <div className="full row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy}>{busy ? <Spinner /> : t('Save changes')}</button></div>
          </div>
        </form>

        <div className="card">
          <div className="card-head"><h3>{t('Your data')}</h3></div>
          <div className="card-body">
            <p className="muted" style={{ marginBottom: 12 }}>{t('Download your records at any time as spreadsheets.')}</p>
            <div className="row wrap">
              <a className="btn" href="/api/export/products.csv"><Download size={16} /> {t('Products')}</a>
              <a className="btn" href="/api/export/sales.csv"><Download size={16} /> {t('Sales')}</a>
              <a className="btn" href="/api/export/expenses.csv"><Download size={16} /> {t('Expenses')}</a>
              <a className="btn" href="/api/export/movements.csv"><Download size={16} /> {t('Stock ledger')}</a>
            </div>
            {alerts.data?.products === 0 && (
              <>
                <hr className="divider" />
                <div className="row between wrap"><span className="muted">{t('Your account is empty. Want to look around with example data?')}</span><button className="btn" onClick={loadDemo}><Sparkles size={16} /> {t('Load sample data')}</button></div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
