import { Printer } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { PAYMENT_LABELS } from '../lib/format.js';

export default function Receipt({ sale }) {
  const { account, fmt } = useAuth();
  const { money, num, dateTime } = fmt;
  return (
    <>
      <div className="receipt" id="receipt">
        <h4>{account.shop_name}</h4>
        {account.address && <div className="c">{account.address}</div>}
        {account.phone && <div className="c">Tel: {account.phone}</div>}
        <hr />
        <div className="ln"><span>Receipt</span><b>{sale.receipt_no}</b></div>
        <div className="ln"><span>Date</span><span>{dateTime(sale.created_at)}</span></div>
        {sale.customer_name && <div className="ln"><span>Customer</span><span>{sale.customer_name}</span></div>}
        {sale.status === 'voided' && <div className="c"><b>*** VOIDED ***</b></div>}
        <hr />
        {sale.items.map((i) => (
          <div className="it" key={i.id}>
            <div>{i.product_name}</div>
            <div className="ln"><small>{num(i.quantity)} {i.unit} × {money(i.unit_price)}</small><span>{money(i.line_total)}</span></div>
          </div>
        ))}
        <hr />
        <div className="ln"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div className="ln"><span>Discount</span><span>−{money(sale.discount)}</span></div>}
        <div className="ln b"><span>TOTAL</span><span>{money(sale.total)}</span></div>
        <div className="ln"><span>Paid ({PAYMENT_LABELS[sale.payment_method]})</span><span>{money(sale.amount_paid)}</span></div>
        {sale.balance_due > 0 && <div className="ln b"><span>BALANCE DUE</span><span>{money(sale.balance_due)}</span></div>}
        <hr />
        <div className="c">{account.receipt_footer}</div>
      </div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
        <button className="btn" onClick={() => window.print()}><Printer size={16} /> Print receipt</button>
      </div>
    </>
  );
}
