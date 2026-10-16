import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from './Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { t } from '../lib/i18n.js';

/**
 * Signs the person out and sends them to the login page.
 * If the server can't be reached the session is still active, so we say so instead of pretending.
 */
export default function SignOutButton({ className = 'btn ghost icon', showLabel = false, size = 18 }) {
  const { logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const click = async () => {
    setBusy(true);
    try {
      await logout();
      nav('/login', { replace: true });
    } catch {
      toast.error(t('Could not sign out. Check your connection and try again.'));
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={click} disabled={busy} aria-label={t('Sign out')} title={t('Sign out')}>
      <LogOut size={size} />
      {showLabel && <span>{t('Sign out')}</span>}
    </button>
  );
}
