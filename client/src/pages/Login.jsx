import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDocumentTitle } from '../lib/hooks.js';

import { t } from '../lib/i18n.js';
export default function Login() {
  useDocumentTitle(t('Sign in'));
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ email: loc.state?.email ?? '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await login(form);
      nav(loc.state?.from || '/', { replace: true });
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };

  return (
    <AuthLayout title={t('Welcome back')} subtitle={t('Sign in to your shop’s workspace.')}
      footer={<>{t('New here?')} <Link to="/register">{t('Create your shop account')}</Link></>}>
      <form className="stack-v" onSubmit={submit} noValidate>
        {loc.state?.registered && !err && <div className="alert" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>{t('Account created. Sign in to open your shop.')}</div>}
        {err && !err.fields?.email && !err.fields?.password && <div className="alert danger">{err.message}</div>}
        <Field label={t('Email')} error={err?.fields?.email}>
          <input className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} required autoFocus={!form.email} />
        </Field>
        <Field label={t('Password')} error={err?.fields?.password}>
          <input className="input" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} required autoFocus={!!form.email} />
        </Field>
        <button className="btn primary lg block" disabled={busy}>{busy ? <Spinner /> : t('Sign in')}</button>
      </form>
    </AuthLayout>
  );
}
