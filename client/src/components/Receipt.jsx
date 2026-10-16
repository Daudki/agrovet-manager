import { Printer } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { PAYMENT_LABELS } from '../lib/format.js';

import { t } from '../lib/i18n.js';
export default function Receipt({ sale }) {
  const { account, fmt } = useAuth();
  const { money, num, dateTime } = fmt;
  return (
    <>
      <div className="receipt" id="receipt">
        <h4>{account.shop_name}</h4>
        {account.address && <div className="c">{account.address}</div>}
        {account.phone && <div className="c">{t('Tel:')} {account.phone}</div>}
        <hr />
        <div className="ln"><span>{t('Receipt')}</span><b>{sale.receipt_no}</b></div>
        <div className="ln"><span>{t('Date')}</span><span>{dateTime(sale.created_at)}</span></div>
        {sale.served_by && <div className="ln"><span>{t('Served by')}</span><span>{sale.served_by}</span></div>}
        {sale.customer_name && <div className="ln"><span>{t('Customer')}</span><span>{sale.customer_name}</span></div>}
        {sale.status === 'voided' && <div className="c"><b>{t('*** VOIDED ***')}</b></div>}
        <hr />
        {sale.items.map((i) => (
          <div className="it" key={i.id}>
            <div>{i.product_name}</div>
            <div className="ln"><small>{num(i.quantity)} {i.unit} × {money(i.unit_price)}</small><span>{money(i.line_total)}</span></div>
          </div>
        ))}
        <hr />
        <div className="ln"><span>{t('Subtotal')}</span><span>{money(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div className="ln"><span>{t('Discount')}</span><span>−{money(sale.discount)}</span></div>}
        <div className="ln b"><span>{t('TOTAL')}</span><span>{money(sale.total)}</span></div>
        <div className="ln"><span>{t('Paid ({0})', [PAYMENT_LABELS[sale.payment_method]])}</span><span>{money(sale.amount_paid)}</span></div>
        {sale.balance_due > 0 && <div className="ln b"><span>{t('BALANCE DUE')}</span><span>{money(sale.balance_due)}</span></div>}
        <hr />
        <div className="c">{account.receipt_footer}</div>
      </div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
        <button className="btn" onClick={() => window.print()}><Printer size={16} /> {t('Print receipt')}</button>
      </div>
    </>
  );
}
