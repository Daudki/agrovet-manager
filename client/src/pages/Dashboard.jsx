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

import { t } from '../lib/i18n.js';
export default function Dashboard() {
  useDocumentTitle(t('Dashboard'));
  const { account, user } = useAuth();
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
    try { await api.post('/account/demo-data'); toast.success(t('Sample data loaded')); reload(); } catch (e) { toast.error(e.message); }
  };

  return (
    <>
      <PageHead title={t('{0}, {1}', [t(greet), user.name.split(' ')[0]])} subtitle={t('Here’s how {0} is doing today.', [account.shop_name])}>
        <button className="btn" onClick={() => nav('/products?new=1')}><Plus size={16} /> {t('Add product')}</button>
        <button className="btn" onClick={() => nav('/purchases?new=1')}><PackagePlus size={16} /> {t('Receive stock')}</button>
        <button className="btn primary" onClick={() => nav('/pos')}><ShoppingCart size={16} /> {t('New sale')}</button>
      </PageHead>

      {stock.products === 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <Empty icon={Sparkles} title={t('Let’s set up your shop')}
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <button className="btn primary" onClick={() => nav('/products?new=1')}><Plus size={16} /> {t('Add your first product')}</button>
                <button className="btn" onClick={loadDemo}>{t('Load sample data')}</button>
              </div>
            }>
            {t('Add products with opening stock, then record sales and watch your stock, expiry and profit update automatically.')}
          </Empty>
        </div>
      )}

      <div className="kpi-grid">
        <Kpi icon={Banknote} label={t('Sales today')} value={money(kpis.sales_today)}>
          <Delta value={kpis.sales_today_change} suffix={t('vs yesterday')} /><span className="faint">· {kpis.orders_today} {t('orders')}</span>
        </Kpi>
        <Kpi icon={TrendingUp} tone="info" label={t('Revenue this month')} value={money(kpis.revenue_month)}>
          <Delta value={kpis.revenue_month_change} suffix={t('vs last month')} />
        </Kpi>
        <Kpi icon={Wallet} label={t('Net profit this month')} value={money(kpis.net_profit_month)}>
          <Delta value={kpis.net_profit_change} suffix={t('vs last month')} />
        </Kpi>
        <Kpi icon={Boxes} tone="warn" label={t('Stock value (at cost)')} value={money(stock.stock_cost_value)}>
          <span className="faint">{t('Retail')} {money(stock.stock_retail_value)}</span>
        </Kpi>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <h3>{t('Sales · last 30 days')}</h3>
            <div className="legend"><span><i style={{ background: 'var(--primary)' }} />{t('Revenue')}</span><span><i style={{ background: 'var(--info)' }} />{t('Profit')}</span></div>
          </div>
          <div className="card-body">
            <AreaChart data={d.trend.map((pt) => ({ label: pt.day, revenue: pt.revenue, profit: pt.profit }))}
              series={[{ key: 'revenue', name: t('Revenue'), color: 'var(--primary)' }, { key: 'profit', name: t('Profit'), color: 'var(--info)' }]}
              formatValue={(v, axis) => (axis ? moneyShort(v) : money(v))}
              formatLabel={(l, full) => (full ? dateShort(l) : dateShort(l))} />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>{t('Needs attention')}</h3>{attention > 0 && <Badge tone="warn">{attention}</Badge>}</div>
          <div className="card-body attn">
            {attention === 0 && <div className="row muted"><CheckCircle2 size={18} color="var(--ok)" /> {t('Everything looks good.')}</div>}
            {alerts.expired.length > 0 && (
              <div className="attn-item"><span className="ico danger"><CalendarClock size={16} /></span>
                <div className="grow"><b>{stock.expired === 1 ? t('1 product with expired stock') : t('{0} products with expired stock', [stock.expired])}</b><div className="cell-sub">{t('{0} and more', [alerts.expired[0].product_name])}</div></div>
                <Link to="/stock?tab=expired">{t('Review')}</Link></div>
            )}
            {alerts.expiring.length > 0 && (
              <div className="attn-item"><span className="ico warn"><AlertTriangle size={16} /></span>
                <div className="grow"><b>{t('{0} expiring within {1} days', [stock.expiring, account.expiry_warning_days])}</b><div className="cell-sub">{t('Next: {0} · {1}d', [alerts.expiring[0].product_name, alerts.expiring[0].days_left])}</div></div>
                <Link to="/stock?tab=expiring">{t('View')}</Link></div>
            )}
            {alerts.low_stock.map((p) => (
              <div className="attn-item" key={p.id}>
                <span className={`ico ${p.stock_status === 'out' ? 'danger' : 'warn'}`}><PackageX size={16} /></span>
                <div className="grow"><b className="truncate" style={{ display: 'block' }}>{p.name}</b><div className="cell-sub">{p.stock_status === 'out' ? t('Out of stock') : t('{0} {1} left · reorder at {2}', [num(p.sellable), p.unit, num(p.reorder_level)])}</div></div>
                <Link to={`/purchases?new=1&product=${p.id}`}>{t('Restock')}</Link>
              </div>
            ))}
            {receivables.owed > 0 && (
              <div className="attn-item"><span className="ico info"><Banknote size={16} /></span>
                <div className="grow"><b>{t('{0} owed', [money(receivables.owed)])}</b><div className="cell-sub">{receivables.customers === 1 ? t('by 1 customer') : t('by {0} customers', [receivables.customers])}</div></div>
                <Link to="/customers">{t('Collect')}</Link></div>
            )}
          </div>
        </div>
      </div>

      <div className="dash-grid three">
        <div className="card">
          <div className="card-head"><h3>{t('Top products')}</h3><span className="faint">{t('30 days')}</span></div>
          <div className="card-body">
            {d.top_products.length ? <HBars items={d.top_products.map((p) => ({ name: p.name, value: p.revenue }))} format={money} /> : <p className="muted">{t('No sales yet.')}</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Sales by category')}</h3><span className="faint">{t('30 days')}</span></div>
          <div className="card-body">
            {d.by_category.length ? <Donut items={d.by_category.map((c) => ({ name: c.name, value: c.revenue, color: c.color }))} format={moneyShort} centerLabel={t('revenue')} /> : <p className="muted">{t('No sales yet.')}</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Recent sales')}</h3><Link to="/sales">{t('All sales')}</Link></div>
          <div className="card-body">
            {d.recent_sales.length === 0 && <p className="muted">{t('No sales yet.')}</p>}
            {d.recent_sales.map((s) => (
              <div className="attn-item" key={s.id}>
                <div className="grow"><b>{s.receipt_no}</b><div className="cell-sub">{s.customer_name || t('Walk-in')} · {PAYMENT_LABELS[s.payment_method]} · {time(s.created_at)}</div></div>
                <b className="num">{money(s.total)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
