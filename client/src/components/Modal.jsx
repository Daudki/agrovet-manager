import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { t } from '../lib/i18n.js';
function useLockAndEsc(onClose) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
}

export function Modal({ title, onClose, children, footer, size = '', dismissible = true }) {
  useLockAndEsc(dismissible ? onClose : undefined);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current?.querySelector('[autofocus],input:not([readonly]):not([type=hidden]),select,textarea');
    el?.focus?.();
  }, []);
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => dismissible && e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost icon sm" onClick={onClose} aria-label={t('Close')}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ title, subtitle, onClose, children, actions }) {
  useLockAndEsc(onClose);
  return createPortal(
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div className="grow">
            <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em' }}>{title}</h3>
            {subtitle && <div className="muted" style={{ marginTop: 2 }}>{subtitle}</div>}
          </div>
          {actions}
          <button className="btn ghost icon sm" onClick={onClose} aria-label={t('Close')}><X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/* Promise-based confirm dialog.
   const ok = await confirm({ title, message, confirmText, tone: 'danger' })            → boolean
   const reason = await confirm({ ..., input: { label: 'Reason' } })                    → string | false */
const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [text, setText] = useState('');

  const confirm = useCallback((opts) => new Promise((resolve) => { setText(''); setState({ ...opts, resolve }); }), []);
  const close = (result) => { state.resolve(result); setState(null); };
  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmCtx.Provider value={value}>
      {children}
      {state && (
        <Modal
          size="sm"
          title={state.title || t('Are you sure?')}
          onClose={() => close(false)}
          footer={
            <>
              <button className="btn" onClick={() => close(false)}>{state.cancelText || t('Cancel')}</button>
              <button className={`btn ${state.tone === 'danger' ? 'danger' : 'primary'}`} onClick={() => close(state.input ? text.trim() : true)}>
                {state.confirmText || t('Confirm')}
              </button>
            </>
          }
        >
          <p className="muted">{state.message}</p>
          {state.input && (
            <label className="field mt">
              <span className="label">{state.input.label}</span>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={state.input.placeholder} autoFocus />
            </label>
          )}
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
