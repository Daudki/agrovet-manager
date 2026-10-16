import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardEdit, Download, Boxes } from 'lucide-react';
import DateRange from '../components/DateRange.jsx';
import { AdjustModal } from '../components/StockModals.jsx';
import { DataTable, Empty, ErrorState, ExpiryBadge, Loading, PageHead, Pagination, SearchInput, Tabs } from '../components/ui.jsx';
import { useFmt } from '../context/AuthContext.jsx';
import { MOVEMENT_LABELS } from '../lib/format.js';
import { useApi, useDebounced, useDocumentTitle, useOnChange } from '../lib/hooks.js';

import { t } from '../lib/i18n.js';
const TABS = [
  { value: 'expired', label: 'Expired' }, { value: 'expiring', label: 'Expiring soon' },
  { value: 'active', label: 'All active batches' }, { value: 'ledger', label: 'Stock ledger' },
];

export default function Stock() {
  useDocumentTitle(t('Batches & expiry'));
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some((x) => x.value === sp.get('tab')) ? sp.get('tab') : 'expiring';
  const setTab = (tabValue) => setSp({ tab: tabValue }, { replace: true });
  return (
    <>
      <PageHead title={t('Batches & expiry')} subtitle={t('Know exactly what’s on your shelves, what’s about to expire, and every movement in and out.')} />
      <Tabs value={tab} onChange={setTab} tabs={TABS} />
      {tab === 'ledger' ? <Ledger /> : <Batches key={tab} status={tab} />}
    </>
  );
}

function Batches({ status }) {
  const { money, num, date } = useFmt();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [adjust, setAdjust] = useState(null);
  const dsearch = useDebounced(search);
  useEffect(() => setPage(1), [dsearch]);
  const { data, loading, error, reload } = useApi('/stock/batches', { status, search: dsearch, page, limit: 25 });
  useOnChange(reload);
  const items = data?.items ?? [];

  const cols = [
    { header: t('Product'), first: true, render: (b) => <div><div className="cell-main">{b.product_name}</div><div className="cell-sub">{t('Batch')} {b.batch_number}{b.supplier_name ? ` · ${b.supplier_name}` : ''}</div></div> },
    { header: t('On hand'), align: 'right', render: (b) => <span className="num"><b>{num(b.quantity)}</b> {b.unit}</span> },
    { header: t('Expiry'), render: (b) => <div><ExpiryBadge status={b.expiry_status} days={b.days_left} />{b.expiry_date && <div className="cell-sub">{date(b.expiry_date)}</div>}</div> },
    { header: t('Value at cost'), align: 'right', render: (b) => <span className="num">{money(b.quantity * b.cost_price)}</span> },
    { header: '', render: (b) => <div className="row-actions"><button className="btn sm" onClick={(e) => { e.stopPropagation(); setAdjust(b); }}><ClipboardEdit size={14} /> {t('Adjust')}</button></div> },
  ];

  return (
    <div className="card">
      <div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder={t('Search product or batch number…')} /></div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : items.length === 0 ? (
        <Empty icon={Boxes} title={status === 'expired' ? t('No expired stock') : status === 'expiring' ? t('Nothing expiring soon') : t('No batches yet')}>
          {status === 'active' ? t('Receive stock to create batches.') : t('Great — nothing needs your attention here.')}
        </Empty>
      ) : (
        <>
          <DataTable columns={cols} rows={items} />
          <Pagination page={data.page} pages={data.pages} total={data.total} limit={data.limit} onPage={setPage} />
        </>
      )}
      {adjust && <AdjustModal batch={adjust} onClose={() => setAdjust(null)} onDone={reload} />}
    </div>
  );
}

function Ledger() {
  const { num, money } = useFmt();
  const [type, setType] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [type, range]);
  const { data, loading, error, reload } = useApi('/stock/movements', { type, ...range, page, limit: 30 });
  useOnChange(reload);
  const items = data?.items ?? [];

  const cols = [
    { header: t('Date'), first: true, render: (m) => <span className="num">{m.created_on}</span> },
    { header: t('Product'), render: (m) => <div><div className="cell-main">{m.product_name}</div>{m.batch_number && <div className="cell-sub">{t('Batch')} {m.batch_number}</div>}</div> },
    { header: t('Type'), render: (m) => MOVEMENT_LABELS[m.type] },
    { header: t('Quantity'), align: 'right', render: (m) => <b className="num" style={{ color: m.quantity < 0 ? 'var(--danger)' : 'var(--ok)' }}>{m.quantity > 0 ? '+' : ''}{num(m.quantity)} {m.unit}</b> },
    { header: t('Unit cost'), align: 'right', render: (m) => <span className="num">{money(m.unit_cost)}</span> },
    { header: t('Note'), render: (m) => <span className="muted">{m.note || '—'}</span> },
  ];

  return (
    <div className="card">
      <div className="toolbar">
        <DateRange value={range} onChange={setRange} />
        <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label={t('Movement type')}>
          <option value="">{t('All movements')}</option>{Object.entries(MOVEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <a className="btn sm" href="/api/export/movements.csv"><Download size={14} /> {t('Export')}</a>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : items.length === 0 ? (
        <Empty icon={Boxes} title={t('No movements')}>{t('Every purchase, sale, adjustment and write-off is logged here.')}</Empty>
      ) : (
        <>
          <DataTable columns={cols} rows={items} />
          <Pagination page={data.page} pages={data.pages} total={data.total} limit={data.limit} onPage={setPage} />
        </>
      )}
    </div>
  );
}
