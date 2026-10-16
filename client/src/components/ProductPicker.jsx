import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useDebounced } from '../lib/hooks.js';
import { useFmt } from '../context/AuthContext.jsx';

import { t } from '../lib/i18n.js';
/** Search-as-you-type product combobox. */
export default function ProductPicker({ onSelect, placeholder = 'Search products…', params = {}, autoFocus }) {
  const { money, num } = useFmt();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const dq = useDebounced(q, 200);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api.get('/products', { search: dq, limit: 8, ...params }).then((r) => live && setItems(r.items)).catch(() => {});
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, open]);

  useEffect(() => {
    const h = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="picker" ref={box}>
      <input className="input" value={q} placeholder={placeholder} autoFocus={autoFocus}
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && (
        <div className="results">
          {items.length === 0 && <div className="muted" style={{ padding: 10 }}>{t('No products found')}</div>}
          {items.map((p) => (
            <button type="button" key={p.id} onClick={() => { onSelect(p); setQ(''); setOpen(false); }}>
              <span><b>{p.name}</b><br /><small className="muted">{p.sku} · {num(p.sellable)} {p.unit} {t('in stock')}</small></span>
              <span className="num">{money(p.selling_price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
