import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Banknote, Boxes, CalendarClock, CheckCircle2, PackageX, Plus, PackagePlus, ShoppingCart, TrendingUp, Wallet, Sparkles,
} from 'lucide-react';
import { AreaChart, Donut, HBars } from '../components/Charts.jsx';
import { Badge, Delta, Empty, ErrorState, Kpi, Loading, PageHead } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth, useFmt } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { PAYMENT_LABELS } from '../lib/format.js';
import { useApi, useDocumentTitle, useOnChange } from '../lib/hooks.js';

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { account } = useAuth();
  const { money, moneyShort, num, dateShort, time } = useFmt();
  const nav = useNavigate();
  const toast = useToast();
  const { data: d, loading, error, reload } = useApi('/dashboard');
  useOnChange(reload);

  if (loading && !d) return <Loading />;
  if (error && !d) return <ErrorState error={error} onRetry={reload} />;

  const { kpis, stock, alerts, receivables } = d;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const attention = alerts.low_stock.length + alerts.expiring.length + alerts.expired.length + (receivables.owed > 0 ? 1 : 0);

  const loadDemo = async () => {
    try { await api.post('/account/demo-data'); toast.success('Sample data loaded'); reload(); } catch (e) { toast.error(e.message); }
  };

  return (
    <>
      <PageHead title={`${greet}, ${account.owner_name.split(' ')[0]}`} subtitle={`Here’s how ${account.shop_name} is doing today.`}>
        <button className="btn" onClick={() => nav('/products?new=1')}><Plus size={16} /> Add product</button>
        <button className="btn" onClick={() => nav('/purchases?new=1')}><PackagePlus size={16} /> Receive stock</button>
        <button className="btn primary" onClick={() => nav('/pos')}><ShoppingCart size={16} /> New sale</button>
      </PageHead>

      {stock.products === 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <Empty icon={Sparkles} title="Let’s set up your shop"
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <button className="btn primary" onClick={() => nav('/products?new=1')}><Plus size={16} /> Add your first product</button>
                <button className="btn" onClick={loadDemo}>Load sample data</button>
              </div>
            }>
            Add products with opening stock, then record sales and watch your stock, expiry and profit update automatically.
          </Empty>
        </div>
      )}

      <div className="kpi-grid">
        <Kpi icon={Banknote} label="Sales today" value={money(kpis.sales_today)}>
          <Delta value={kpis.sales_today_change} suffix="vs yesterday" /><span className="faint">· {kpis.orders_today} orders</span>
        </Kpi>
        <Kpi icon={TrendingUp} tone="info" label="Revenue this month" value={money(kpis.revenue_month)}>
          <Delta value={kpis.revenue_month_change} suffix="vs last month" />
        </Kpi>
        <Kpi icon={Wallet} label="Net profit this month" value={money(kpis.net_profit_month)}>
          <Delta value={kpis.net_profit_change} suffix="vs last month" />
        </Kpi>
        <Kpi icon={Boxes} tone="warn" label="Stock value (at cost)" value={money(stock.stock_cost_value)}>
          <span className="faint">Retail {money(stock.stock_retail_value)}</span>
        </Kpi>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <h3>Sales · last 30 days</h3>
            <div className="legend"><span><i style={{ background: 'var(--primary)' }} />Revenue</span><span><i style={{ background: 'var(--info)' }} />Profit</span></div>
          </div>
          <div className="card-body">
            <AreaChart data={d.trend.map((t) => ({ label: t.day, revenue: t.revenue, profit: t.profit }))}
              series={[{ key: 'revenue', name: 'Revenue', color: 'var(--primary)' }, { key: 'profit', name: 'Profit', color: 'var(--info)' }]}
              formatValue={(v, axis) => (axis ? moneyShort(v) : money(v))}
              formatLabel={(l, full) => (full ? dateShort(l) : dateShort(l))} />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Needs attention</h3>{attention > 0 && <Badge tone="warn">{attention}</Badge>}</div>
          <div className="card-body attn">
            {attention === 0 && <div className="row muted"><CheckCircle2 size={18} color="var(--ok)" /> Everything looks good.</div>}
            {alerts.expired.length > 0 && (
              <div className="attn-item"><span className="ico danger"><CalendarClock size={16} /></span>
                <div className="grow"><b>{stock.expired} product{stock.expired === 1 ? '' : 's'} with expired stock</b><div className="cell-sub">{alerts.expired[0].product_name} and more</div></div>
                <Link to="/stock?tab=expired">Review</Link></div>
            )}
            {alerts.expiring.length > 0 && (
              <div className="attn-item"><span className="ico warn"><AlertTriangle size={16} /></span>
                <div className="grow"><b>{stock.expiring} expiring within {account.expiry_warning_days} days</b><div className="cell-sub">Next: {alerts.expiring[0].product_name} · {alerts.expiring[0].days_left}d</div></div>
                <Link to="/stock?tab=expiring">View</Link></div>
            )}
            {alerts.low_stock.map((p) => (
              <div className="attn-item" key={p.id}>
                <span className={`ico ${p.stock_status === 'out' ? 'danger' : 'warn'}`}><PackageX size={16} /></span>
                <div className="grow"><b className="truncate" style={{ display: 'block' }}>{p.name}</b><div className="cell-sub">{p.stock_status === 'out' ? 'Out of stock' : `${num(p.sellable)} ${p.unit} left · reorder at ${num(p.reorder_level)}`}</div></div>
                <Link to={`/purchases?new=1&product=${p.id}`}>Restock</Link>
              </div>
            ))}
            {receivables.owed > 0 && (
              <div className="attn-item"><span className="ico info"><Banknote size={16} /></span>
                <div className="grow"><b>{money(receivables.owed)} owed</b><div className="cell-sub">by {receivables.customers} customer{receivables.customers === 1 ? '' : 's'}</div></div>
                <Link to="/customers">Collect</Link></div>
            )}
          </div>
        </div>
      </div>

      <div className="dash-grid three">
        <div className="card">
          <div className="card-head"><h3>Top products</h3><span className="faint">30 days</span></div>
          <div className="card-body">
            {d.top_products.length ? <HBars items={d.top_products.map((p) => ({ name: p.name, value: p.revenue }))} format={money} /> : <p className="muted">No sales yet.</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Sales by category</h3><span className="faint">30 days</span></div>
          <div className="card-body">
            {d.by_category.length ? <Donut items={d.by_category.map((c) => ({ name: c.name, value: c.revenue, color: c.color }))} format={moneyShort} centerLabel="revenue" /> : <p className="muted">No sales yet.</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Recent sales</h3><Link to="/sales">All sales</Link></div>
          <div className="card-body">
            {d.recent_sales.length === 0 && <p className="muted">No sales yet.</p>}
            {d.recent_sales.map((s) => (
              <div className="attn-item" key={s.id}>
                <div className="grow"><b>{s.receipt_no}</b><div className="cell-sub">{s.customer_name || 'Walk-in'} · {PAYMENT_LABELS[s.payment_method]} · {time(s.created_at)}</div></div>
                <b className="num">{money(s.total)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
