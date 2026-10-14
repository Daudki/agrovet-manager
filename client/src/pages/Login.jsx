import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDocumentTitle } from '../lib/hooks.js';

export default function Login() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
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
    <AuthLayout title="Welcome back" subtitle="Sign in to your shop’s workspace."
      footer={<>New here? <Link to="/register">Create your shop account</Link></>}>
      <form className="stack-v" onSubmit={submit} noValidate>
        {err && !err.fields?.email && !err.fields?.password && <div className="alert danger">{err.message}</div>}
        <Field label="Email" error={err?.fields?.email}>
          <input className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} required autoFocus />
        </Field>
        <Field label="Password" error={err?.fields?.password}>
          <input className="input" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} required />
        </Field>
        <button className="btn primary lg block" disabled={busy}>{busy ? <Spinner /> : 'Sign in'}</button>
      </form>
    </AuthLayout>
  );
}
