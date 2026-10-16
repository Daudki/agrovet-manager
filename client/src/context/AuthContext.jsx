import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { makeFormatters } from '../lib/format.js';
import { useLocale } from '../lib/i18n.js';

const Ctx = createContext(null);
const EMPTY = { account: null, user: null, permissions: [] };

export function AuthProvider({ children }) {
  const [s, setS] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const apply = (r) => setS({ account: r.account, user: r.user, permissions: r.permissions ?? [] });

  useEffect(() => {
    api.get('/auth/me').then(apply).catch(() => setS(EMPTY)).finally(() => setLoading(false));
    const onUnauthorized = () => setS(EMPTY);
    window.addEventListener('avm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('avm:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (body) => apply(await api.post('/auth/login', body)), []);
  // Registering creates the shop but does not sign in – the caller sends the person to the login page.
  const register = useCallback((body) => api.post('/auth/register', body), []);
  const logout = useCallback(async () => {
    await api.post('/auth/logout'); // throws if the server can't be reached – the session is then still active
    setS(EMPTY);
  }, []);
  const setAccount = useCallback((account) => setS((x) => ({ ...x, account })), []);
  const can = useCallback((perm) => s.permissions.includes(perm), [s.permissions]);

  const locale = useLocale();
  const fmt = useMemo(() => makeFormatters(s.account, locale), [s.account, locale]);
  const value = useMemo(
    () => ({ account: s.account, user: s.user, can, setAccount, loading, login, register, logout, fmt }),
    [s.account, s.user, can, setAccount, loading, login, register, logout, fmt],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const useFmt = () => useContext(Ctx).fmt;
export const useCan = () => useContext(Ctx).can;
