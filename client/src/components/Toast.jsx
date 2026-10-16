import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

const Ctx = createContext(null);
let nextId = 1;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((s) => s.filter((x) => x.id !== id)), []);
  const push = useCallback((message, tone = 'success') => {
    const id = nextId++;
    setItems((s) => [...s.slice(-3), { id, message, tone }]);
    setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3500);
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    warn: (m) => push(m, 'warn'),
  }), [push]);

  const Icon = { success: CheckCircle2, error: XCircle, warn: AlertTriangle };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((it) => {
          const I = Icon[it.tone];
          return (
            <div key={it.id} className={`toast ${it.tone}`} onClick={() => dismiss(it.id)}>
              <I size={18} /> <span>{it.message}</span>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
