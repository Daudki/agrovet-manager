import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { makeFormatters } from '../lib/format.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me').then((r) => setAccount(r.account)).catch(() => setAccount(null)).finally(() => setLoading(false));
    const onUnauthorized = () => setAccount(null);
    window.addEventListener('avm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('avm:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (body) => setAccount((await api.post('/auth/login', body)).account), []);
  const register = useCallback(async (body) => setAccount((await api.post('/auth/register', body)).account), []);
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally { setAccount(null); }
  }, []);

  const fmt = useMemo(() => makeFormatters(account), [account]);
  const value = useMemo(() => ({ account, setAccount, loading, login, register, logout, fmt }), [account, loading, login, register, logout, fmt]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const useFmt = () => useContext(Ctx).fmt;
