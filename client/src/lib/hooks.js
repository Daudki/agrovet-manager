import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Fetches `path` whenever params change; refetch on demand with reload(). */
export function useApi(path, params, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const key = path + JSON.stringify(params ?? {});
  const ticket = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!enabled) return;
      const mine = ++ticket.current;
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await api.get(path, params);
        if (mine === ticket.current) setState({ data, loading: false, error: null });
      } catch (error) {
        if (mine === ticket.current) setState((s) => ({ data: s.data, loading: false, error }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, enabled],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: () => load(true), reloadWithSpinner: () => load(false) };
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Agrovet Manager` : 'Agrovet Manager';
  }, [title]);
}

/** Re-runs fn when any mutation succeeds anywhere in the app. */
export function useOnChange(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener('avm:changed', h);
    return () => window.removeEventListener('avm:changed', h);
  }, []);
}
