import { Fragment, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import DateRange, { useRangePresets } from '../components/DateRange.jsx';
import { AreaChart, Donut, HBars } from '../components/Charts.jsx';
import { DataTable, ErrorState, Kpi, Loading, PageHead, Tabs } from '../components/ui.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { qs } from '../lib/api.js';
import { PAYMENT_LABELS } from '../lib/format.js';
import { useApi, useDocumentTitle } from '../lib/hooks.js';
import { Banknote, Percent, TrendingUp, Wallet } from 'lucide-react';

export default function Reports() {
  useDocumentTitle('Reports');
  const { presets } = useRangePresets();
  const [tab, setTab] = useState('sales');
  const [range, setRange] = useState(presets.find((p) => p.key === 'month').range);
  return (
    <>
      <PageHead title="Reports" subtitle="Profit and loss, best sellers and the value of your stock.">
        <button className="btn" onClick={() => window.print()}><Printer size={16} /> Print</button>
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'sales', label: 'Profit & sales' }, { value: 'inventory', label: 'Inventory valuation' }]} />
      {tab === 'sales' ? <SalesReport range={range} setRange={setRange} /> : <InventoryReport />}
    </>
  );
}

function SalesReport({ range, setRange }) {
  const { money, moneyShort, num, dateShort } = useFmt();
  const valid = range.from && range.to && range.from <= range.to;
  const { data: r, loading, error, reload } = useApi('/reports/sales', range, { enabled: !!valid });

  return (
    <div className="stack-v">
      <div className="card card-pad row between wrap">
        <DateRange value={range} onChange={setRange} allowAll={false} />
        <a className="btn sm" href={`/api/export/sales.csv${qs(range)}`}><Download size={14} /> Sales CSV</a>
      </div>
      {!valid ? <div className="alert warn">Choose a start and end date.</div> : loading && !r ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <div className="kpi-grid">
            <Kpi icon={Banknote} label="Revenue" value={money(r.summary.revenue)}><span className="faint">{r.summary.orders} sales · avg {money(r.summary.average_sale)}</span></Kpi>
            <Kpi icon={TrendingUp} tone="info" label="Gross profit" value={money(r.summary.gross_profit)}><span className="faint">after cost of goods</span></Kpi>
            <Kpi icon={Percent} tone="warn" label="Gross margin" value={`${r.summary.gross_margin}%`}><span className="faint">profit ÷ revenue</span></Kpi>
            <Kpi icon={Wallet} label="Net profit" value={money(r.summary.net_profit)}><span className="faint">after {money(r.summary.expenses)} expenses</span></Kpi>
          </div>

          <div className="dash-grid" style={{ marginTop: 0 }}>
            <div className="card">
              <div className="card-head"><h3>Daily revenue &amp; profit</h3>
                <div className="legend"><span><i style={{ background: 'var(--primary)' }} />Revenue</span><span><i style={{ background: 'var(--info)' }} />Profit</span></div></div>
              <div className="card-body">
                <AreaChart data={r.daily.map((d) => ({ label: d.day, revenue: d.revenue, profit: d.profit }))}
                  series={[{ key: 'revenue', name: 'Revenue', color: 'var(--primary)' }, { key: 'profit', name: 'Profit', color: 'var(--info)' }]}
                  formatValue={(v, axis) => (axis ? moneyShort(v) : money(v))} formatLabel={(l) => dateShort(l)} />
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Profit &amp; loss</h3></div>
              <div className="card-body">
                <dl className="kv" style={{ rowGap: 11 }}>
                  <dt>Revenue</dt><dd className="num">{money(r.summary.revenue)}</dd>
                  <dt>Cost of goods sold</dt><dd className="num">−{money(r.summary.cogs)}</dd>
                  <dt><b>Gross profit</b></dt><dd className="num"><b>{money(r.summary.gross_profit)}</b></dd>
                  {r.expenses_by_category.map((e) => <Fragment key={e.category}><dt className="muted">&nbsp;&nbsp;{e.category}</dt><dd className="num muted">−{money(e.total)}</dd></Fragment>)}
                  <dt>Total expenses</dt><dd className="num">−{money(r.summary.expenses)}</dd>
                  <dt style={{ fontSize: 15 }}><b>Net profit</b></dt>
                  <dd className="num" style={{ fontSize: 15, color: r.summary.net_profit >= 0 ? 'var(--ok)' : 'var(--danger)' }}><b>{money(r.summary.net_profit)}</b></dd>
                </dl>
                {r.summary.discounts > 0 && <p className="hint mt">Discounts given in this period: {money(r.summary.discounts)} (already deducted from revenue).</p>}
              </div>
            </div>
          </div>

          <div className="dash-grid three">
            <div className="card">
              <div className="card-head"><h3>By category</h3></div>
              <div className="card-body">{r.categories.length ? <Donut items={r.categories.map((c) => ({ name: c.name, value: c.revenue, color: c.color }))} format={moneyShort} centerLabel="revenue" /> : <p className="muted">No sales in this period.</p>}</div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Payment methods</h3></div>
              <div className="card-body">{r.payment_methods.length ? <HBars items={r.payment_methods.map((m) => ({ name: `${PAYMENT_LABELS[m.method]} (${m.count})`, value: m.total }))} format={money} /> : <p className="muted">No sales in this period.</p>}</div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Best sellers</h3></div>
              <div className="card-body">{r.top_products.length ? <HBars items={r.top_products.slice(0, 6).map((p) => ({ name: p.name, value: p.revenue }))} format={money} /> : <p className="muted">No sales in this period.</p>}</div>
            </div>
          </div>

          {r.top_products.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Product performance</h3></div>
              <div style={{ marginTop: 12 }}>
                <DataTable rows={r.top_products} rowKey={(p) => p.name + p.unit} columns={[
                  { header: 'Product', first: true, render: (p) => <b>{p.name}</b> },
                  { header: 'Units sold', align: 'right', render: (p) => <span className="num">{num(p.qty)} {p.unit}</span> },
                  { header: 'Revenue', align: 'right', render: (p) => <span className="num">{money(p.revenue)}</span> },
                  { header: 'Profit', align: 'right', render: (p) => <b className="num">{money(p.profit)}</b> },
                  { header: 'Margin', align: 'right', render: (p) => <span className="num">{p.revenue ? Math.round((p.profit / p.revenue) * 100) : 0}%</span> },
                ]} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InventoryReport() {
  const { money, moneyShort, num } = useFmt();
  const { data: r, loading, error, reload } = useApi('/reports/inventory');
  if (loading && !r) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="stack-v">
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Kpi icon={Wallet} label="Stock value (cost)" value={money(r.totals.cost_value)}><span className="faint">{r.totals.products} products</span></Kpi>
        <Kpi icon={Banknote} tone="info" label="Stock value (retail)" value={money(r.totals.retail_value)} />
        <Kpi icon={TrendingUp} tone="warn" label="Potential profit" value={money(r.totals.potential_profit)}><span className="faint">if everything sells at list price</span></Kpi>
      </div>
      <div className="dash-grid" style={{ marginTop: 0 }}>
        <div className="card">
          <div className="card-head"><h3>Stock by product</h3><a className="btn sm" href="/api/export/products.csv"><Download size={14} /> CSV</a></div>
          <div style={{ marginTop: 12 }}>
            <DataTable rows={r.items} columns={[
              { header: 'Product', first: true, render: (p) => <div><b>{p.name}</b><div className="cell-sub">{p.category}</div></div> },
              { header: 'In stock', align: 'right', render: (p) => <span className="num">{num(p.stock)} {p.unit}</span> },
              { header: 'Cost value', align: 'right', render: (p) => <span className="num">{money(p.cost_value)}</span> },
              { header: 'Retail value', align: 'right', render: (p) => <span className="num">{money(p.retail_value)}</span> },
            ]} />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Value by category</h3></div>
          <div className="card-body">
            <Donut items={r.categories.map((c) => ({ name: c.name, value: c.cost_value, color: c.color }))} format={moneyShort} centerLabel="at cost" />
          </div>
        </div>
      </div>
    </div>
  );
}
