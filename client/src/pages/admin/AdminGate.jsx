import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Download, LogOut, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';
import { Field, Loading, Spinner } from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDocumentTitle } from '../../lib/hooks.js';

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.append(meta);
    return () => meta.remove();
  }, []);
}

async function downloadBackup() {
  let res;
  try {
    res = await fetch('/api/admin/backup', { method: 'POST', credentials: 'same-origin' });
  } catch {
    throw new Error('Cannot reach the server.');
  }
  if (!res.ok) {
    let message = 'Backup failed.';
    try { message = (await res.json()).error || message; } catch { message = res.statusText || message; }
    throw new Error(message);
  }
  const blob = await res.blob();
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'agrovet-backup.db';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function AdminLogin({ onSignedIn }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post('/admin/login', form);
      onSignedIn(r.email);
    } catch (ex) {
      setErr(ex);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-fill" style={{ minHeight: '100vh', padding: 16 }}>
      <form className="card card-pad stack-v" style={{ width: 380, maxWidth: '100%' }} onSubmit={submit} noValidate>
        <div className="row" style={{ gap: 8 }}>
          <ShieldCheck size={20} />
          <h1 style={{ fontSize: 20 }}>Platform admin</h1>
        </div>
        {err && <div className="alert danger">{err.message}</div>}
        <Field label="Email" error={err?.fields?.email}>
          <input className="input" type="email" autoComplete="username" value={form.email} onChange={set('email')} required autoFocus />
        </Field>
        <Field label="Password" error={err?.fields?.password}>
          <input className="input" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} required />
        </Field>
        <button className="btn primary lg block" disabled={busy}>{busy ? <Spinner /> : 'Sign in'}</button>
      </form>
    </div>
  );
}

function AdminShell({ email, onSignedOut }) {
  const toast = useToast();
  const [backingUp, setBackingUp] = useState(false);

  const backup = async () => {
    setBackingUp(true);
    try {
      await downloadBackup();
      toast.success('Backup downloaded');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBackingUp(false);
    }
  };

  const signOut = async () => {
    try { await api.post('/admin/logout'); } catch { /* session is dropped client-side either way */ }
    onSignedOut();
  };

  return (
    <>
      <header className="topbar">
        <Link to="/admin" className="row" style={{ gap: 8, fontWeight: 700, color: 'inherit', textDecoration: 'none' }}>
          <ShieldCheck size={18} /> Platform admin
        </Link>
        <div style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 13 }}>{email}</span>
        <button className="btn sm" onClick={backup} disabled={backingUp}>
          {backingUp ? <Spinner /> : <Download size={15} />} Backup
        </button>
        <button className="btn ghost sm" onClick={signOut}><LogOut size={15} /> Sign out</button>
      </header>
      <main className="content">
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </main>
    </>
  );
}

export default function AdminGate() {
  useDocumentTitle('Platform admin');
  useNoIndex();
  const [state, setState] = useState({ loading: true, email: null });

  useEffect(() => {
    api.get('/admin/me')
      .then((r) => setState({ loading: false, email: r.email }))
      .catch(() => setState({ loading: false, email: null }));
    const onExpired = () => setState({ loading: false, email: null });
    window.addEventListener('avm:admin-unauthorized', onExpired);
    return () => window.removeEventListener('avm:admin-unauthorized', onExpired);
  }, []);

  if (state.loading) return <Loading />;
  if (!state.email) return <AdminLogin onSignedIn={(email) => setState({ loading: false, email })} />;
  return <AdminShell email={state.email} onSignedOut={() => setState({ loading: false, email: null })} />;
}
