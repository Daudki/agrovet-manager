import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Boxes, LayoutDashboard, LogOut, Menu, Moon, Package, Receipt, Search, Settings,
  ShoppingCart, Sun, Tags, Truck, Users, Wallet, Plus, PackagePlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { api } from '../lib/api.js';
import { initials } from '../lib/format.js';
import { useApi, useDebounced, useOnChange } from '../lib/hooks.js';
import { Badge } from '../components/ui.jsx';

const NAV = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  { group: 'Sell', items: [
    { to: '/pos', label: 'New sale', icon: ShoppingCart },
    { to: '/sales', label: 'Sales history', icon: Receipt },
    { to: '/customers', label: 'Customers', icon: Users },
  ] },
  { group: 'Inventory', items: [
    { to: '/products', label: 'Products', icon: Package, badge: 'products' },
    { to: '/stock', label: 'Batches & expiry', icon: Boxes, badge: 'stock' },
    { to: '/purchases', label: 'Purchases', icon: PackagePlus },
    { to: '/categories', label: 'Categories', icon: Tags },
    { to: '/suppliers', label: 'Suppliers', icon: Truck },
  ] },
  { group: 'Business', items: [
    { to: '/expenses', label: 'Expenses', icon: Wallet },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/settings', label: 'Settings', icon: Settings },
  ] },
];

function GlobalSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState({ matches: [], alternatives: [] });
  const dq = useDebounced(q.trim(), 220);
  const box = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    if (dq.length < 2) { setRes({ matches: [], alternatives: [] }); return undefined; }
    let live = true;
    api.get('/search', { q: dq }).then((r) => live && setRes(r)).catch(() => {});
    return () => { live = false; };
  }, [dq]);

  useEffect(() => {
    const click = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const key = (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); input.current?.focus(); }
    };
    document.addEventListener('mousedown', click);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); window.removeEventListener('keydown', key); };
  }, []);

  const go = (p) => { setOpen(false); setQ(''); nav(`/products?open=${p.id}`); };
  const Item = ({ p }) => (
    <button className="item" onClick={() => go(p)}>
      <span className="grow">
        <b>{p.name}</b>
        <div className="cell-sub truncate">{p.active_ingredients.join(', ') || p.category_name || p.sku}</div>
      </span>
      <Badge tone={p.stock_status === 'ok' ? 'ok' : p.stock_status === 'low' ? 'warn' : 'danger'}>{p.sellable} {p.unit}</Badge>
    </button>
  );
  const empty = dq.length >= 2 && !res.matches.length;

  return (
    <div className="gsearch" ref={box}>
      <div className="input-affix">
        <Search size={16} />
        <input ref={input} className="input" placeholder="Search products or active ingredients…" value={q}
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); e.target.blur(); } }} />
        {!q && <kbd>/</kbd>}
      </div>
      {open && dq.length >= 2 && (
        <div className="results">
          {res.matches.length > 0 && <div className="group">Matches</div>}
          {res.matches.map((p) => <Item key={p.id} p={p} />)}
          {res.alternatives.length > 0 && <div className="group">Alternatives · same active ingredient</div>}
          {res.alternatives.map((p) => <Item key={p.id} p={p} />)}
          {empty && <div className="muted" style={{ padding: 14 }}>No products match “{dq}”.</div>}
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }) {
  const { account, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const alerts = useApi('/alerts');
  useOnChange(() => alerts.reload());
  useEffect(() => setOpen(false), [loc.pathname]);

  const a = alerts.data;
  const badges = {
    products: a && a.out_of_stock + a.low_stock > 0 ? { n: a.out_of_stock + a.low_stock, amber: a.out_of_stock === 0 } : null,
    stock: a && a.expired + a.expiring > 0 ? { n: a.expired + a.expiring, amber: a.expired === 0 } : null,
  };

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sb-brand">
          <img src="/favicon.svg" alt="" />
          <div><b>Agrovet Manager</b><small className="truncate">{account.shop_name}</small></div>
        </div>
        {NAV.map((g) => (
          <div className="sb-group" key={g.group}>
            <span>{g.group}</span>
            {g.items.map((i) => {
              const b = i.badge && badges[i.badge];
              return (
                <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `sb-link ${isActive ? 'active' : ''}`}>
                  <i.icon size={18} /> {i.label}
                  {b && <span className={`count ${b.amber ? 'amber' : ''}`}>{b.n}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
        <div className="sb-user">
          <div className="avatar">{initials(account.owner_name)}</div>
          <div><b className="truncate" style={{ display: 'block' }}>{account.owner_name}</b><small className="truncate" style={{ display: 'block' }}>{account.email}</small></div>
          <button onClick={async () => { await logout(); nav('/login'); }} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <GlobalSearch />
          <div className="grow" />
          <button className="btn ghost icon" onClick={toggle} aria-label="Toggle dark mode" title="Toggle theme">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="btn primary" onClick={() => nav('/pos')}><Plus size={16} /> <span className="hide-sm">New sale</span></button>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
