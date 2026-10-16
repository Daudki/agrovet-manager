import { useEffect, useState } from 'react';
import { Ban, Download, Receipt as ReceiptIcon } from 'lucide-react';
import DateRange, { useRangePresets } from '../components/DateRange.jsx';
import Receipt from '../components/Receipt.jsx';
import { Drawer, useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, DataTable, Empty, ErrorState, Loading, PageHead, Pagination, SearchInput } from '../components/ui.jsx';
import { useAuth, useFmt } from '../context/AuthContext.jsx';
import { api, qs } from '../lib/api.js';
import { PAYMENT_LABELS } from '../lib/format.js';
import { useApi, useDebounced, useDocumentTitle, useOnChange } from '../lib/hooks.js';

import { t } from '../lib/i18n.js';
export default function Sales() {
  useDocumentTitle(t('Sales history'));
  const { money, dateTime } = useFmt();
  const { can } = useAuth();
  const { presets } = useRangePresets();
  const [range, setRange] = useState(presets.find((p) => p.key === '30d').range);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [unpaid, setUnpaid] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const dsearch = useDebounced(search);
  useEffect(() => setPage(1), [range, dsearch, status, method, unpaid]);

  const params = { ...range, search: dsearch, status, payment_method: method, unpaid, page, limit: 25 };
  const { data, loading, error, reload } = useApi('/sales', params);
  useOnChange(reload);
  const items = data?.items ?? [];

  const cols = [
    { header: t('Receipt'), first: true, render: (s) => <div><div className="cell-main">{s.receipt_no}</div><div className="cell-sub">{dateTime(s.created_at)}</div></div> },
    { header: t('Customer'), render: (s) => s.customer_name || <span className="faint">{t('Walk-in')}</span> },
    ...(can('costs.view') ? [{ header: t('Served by'), render: (s) => s.served_by || <span className="faint">—</span> }] : []),
    { header: t('Items'), align: 'right', render: (s) => s.item_count },
    { header: t('Payment'), render: (s) => <span>{PAYMENT_LABELS[s.payment_method]}{s.status === 'completed' && s.amount_paid < s.total - 0.005 && <Badge tone="warn"> {t('Owes')} {money(s.total - s.amount_paid)}</Badge>}</span> },
    { header: t('Total'), align: 'right', render: (s) => <b className="num">{money(s.total)}</b> },
    { header: t('Status'), render: (s) => (s.status === 'voided' ? <Badge tone="danger">{t('Voided')}</Badge> : <Badge tone="ok">{t('Completed')}</Badge>) },
  ];

  return (
    <>
      <PageHead title={t('Sales history')} subtitle={t('Every sale, with receipts, balances and voids.')}>
        {can('export') && <a className="btn" href={`/api/export/sales.csv${qs(range)}`}><Download size={16} /> {t('Export CSV')}</a>}
      </PageHead>
      <div className="card">
        <div className="toolbar"><DateRange value={range} onChange={setRange} /></div>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder={t('Receipt number or customer…')} />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Status')}>
            <option value="">{t('All statuses')}</option><option value="completed">{t('Completed')}</option><option value="voided">{t('Voided')}</option>
          </select>
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value)} aria-label={t('Payment method')}>
            <option value="">{t('All payments')}</option>{Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="chip" aria-pressed={unpaid} onClick={() => setUnpaid((u) => !u)}>{t('Unpaid balances')}</button>
        </div>
        {data && (
          <div className="stat-strip">
            <div><small>{t('Sales')}</small><b>{data.total}</b></div>
            <div><small>{t('Revenue')}</small><b>{money(data.totals.total)}</b></div>
            {data.totals.profit !== undefined && <div><small>{t('Gross profit')}</small><b>{money(data.totals.profit)}</b></div>}
          </div>
        )}
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : items.length === 0 ? (
          <Empty icon={ReceiptIcon} title={t('No sales found')}>{t('Try a wider date range or clear the filters.')}</Empty>
        ) : (
          <>
            <DataTable columns={cols} rows={items} onRowClick={(s) => setOpenId(s.id)} dim={(s) => s.status === 'voided'} />
            <Pagination page={data.page} pages={data.pages} total={data.total} limit={data.limit} onPage={setPage} />
          </>
        )}
      </div>
      {openId && <SaleDrawer id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}

function SaleDrawer({ id, onClose, onChanged }) {
  const { money } = useFmt();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: sale, loading, error, reload } = useApi(`/sales/${id}`);

  const voidIt = async () => {
    const reason = await confirm({
      title: t('Void this sale?'), tone: 'danger', confirmText: t('Void sale'),
      message: t('All items go back into stock, in the batches they came from. Any money collected must be refunded by you.'),
      input: { label: t('Reason (optional)'), placeholder: t('e.g. Customer returned goods') },
    });
    if (reason === false) return;
    try { await api.post(`/sales/${id}/void`, { reason }); toast.success(t('Sale voided and stock restored')); reload(); onChanged(); } catch (e) { toast.error(e.message); }
  };

  return (
    <Drawer title={sale?.receipt_no ?? t('Sale')} subtitle={sale && (sale.status === 'voided' ? t('Voided') : sale.profit !== undefined ? t('Profit {0}', [money(sale.profit)]) : '')} onClose={onClose}>
      {loading && !sale ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          {sale.status === 'voided' && <div className="alert danger" style={{ marginBottom: 14 }}>{t('Voided')}{sale.void_reason ? `: ${sale.void_reason}` : ''}</div>}
          {sale.note && <div className="alert" style={{ marginBottom: 14 }}>{sale.note}</div>}
          <Receipt sale={sale} />
          {sale.status === 'completed' && can('sales.void') && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button className="btn ghost" style={{ color: 'var(--danger)' }} onClick={voidIt}><Ban size={16} /> {t('Void sale')}</button>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
