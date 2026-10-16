import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDocumentTitle } from '../lib/hooks.js';

import { t } from '../lib/i18n.js';
export default function Register() {
  useDocumentTitle(t('Create account'));
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ shop_name: '', owner_name: '', email: '', phone: '', password: '', load_sample_data: false });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const fe = (k) => err?.fields?.[k];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await register(form); nav('/login', { replace: true, state: { registered: true, email: form.email } }); } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };

  return (
    <AuthLayout title={t('Create your shop account')} subtitle={t('Your data stays private to your account.')}
      footer={<>{t('Already registered?')} <Link to="/login">{t('Sign in')}</Link></>}>
      <form className="stack-v" onSubmit={submit} noValidate>
        {err && !err.fields && <div className="alert danger">{err.message}</div>}
        <Field label={t('Business name')} error={fe('shop_name')}>
          <input className="input" value={form.shop_name} onChange={set('shop_name')} placeholder={t('e.g. Green Valley Agrovet')} autoFocus />
        </Field>
        <div className="form-grid">
          <Field label={t('Your name')} error={fe('owner_name')}><input className="input" value={form.owner_name} onChange={set('owner_name')} autoComplete="name" /></Field>
          <Field label={t('Phone (optional)')}><input className="input" value={form.phone} onChange={set('phone')} autoComplete="tel" /></Field>
        </div>
        <Field label={t('Email')} error={fe('email')}><input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label={t('Password')} error={fe('password')} hint={t('At least 8 characters.')}>
          <input className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <label className="check">
          <input type="checkbox" checked={form.load_sample_data} onChange={set('load_sample_data')} />
          <span>{t('Load sample products and sales so I can explore the app first.')}</span>
        </label>
        <button className="btn primary lg block" disabled={busy}>{busy ? <Spinner /> : t('Create account')}</button>
      </form>
    </AuthLayout>
  );
}
