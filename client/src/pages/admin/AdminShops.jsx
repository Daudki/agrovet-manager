import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Ban, Database, Store } from 'lucide-react';
import { Badge, DataTable, Empty, ErrorState, Kpi, Loading, PageHead, SearchInput, Segmented } from '../../components/ui.jsx';
import { useApi, useDebounced } from '../../lib/hooks.js';
import { ago, fmtBytes, fmtDate, shopStatus } from './format.js';

const STATUS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

export default function AdminShops() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const dq = useDebounced(q, 250);
  const stats = useApi('/admin/overview');
  const shops = useApi('/admin/shops', { q: dq, status });
  const s = stats.data;
  const items = shops.data?.items ?? [];

  const cols = [
    { header: 'Shop', first: true, render: (r) => <div><div className="cell-main">{r.shop_name}</div><div className="cell-sub">{r.owner_name} · {r.owner_email}</div></div> },
    { header: 'Status', render: (r) => { const st = shopStatus(r); return <Badge tone={st.tone}>{st.label}</Badge>; } },
    { header: 'Users', align: 'right', render: (r) => r.users },
    { header: 'Products', align: 'right', render: (r) => r.products },
    { header: 'Sales', align: 'right', render: (r) => r.sales_count },
    { header: 'Last sale', render: (r) => ago(r.last_sale_at) },
    { header: 'Joined', render: (r) => fmtDate(r.created_at) },
  ];

  return (
    <>
      <PageHead title="Shops" subtitle="Every shop on the platform." />
      {stats.error ? <ErrorState error={stats.error} onRetry={stats.reload} /> : s && (
        <div className="kpi-grid">
          <Kpi icon={Store} label="Shops" value={s.shops}>{s.new_30d} new in the last 30 days</Kpi>
          <Kpi icon={Activity} tone="ok" label="Active shops" value={s.active_30d}>Made a sale in the last 30 days</Kpi>
          <Kpi icon={Ban} tone="danger" label="Suspended" value={s.suspended}>{s.users} active logins in total</Kpi>
          <Kpi icon={Database} label="Database" value={fmtBytes(s.db_bytes)}>{s.sales_total} sales recorded</Kpi>
        </div>
      )}
      <div className="card mt">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search shop, owner or email" />
          <Segmented value={status} onChange={setStatus} options={STATUS} />
        </div>
        {shops.loading && !shops.data ? <Loading /> : shops.error ? <ErrorState error={shops.error} onRetry={shops.reload} /> : items.length === 0 ? (
          <Empty icon={Store} title="No shops found">Try a different search or filter.</Empty>
        ) : (
          <DataTable columns={cols} rows={items} onRowClick={(r) => nav(`/admin/shops/${r.id}`)} dim={(r) => r.suspended} />
        )}
      </div>
    </>
  );
}
