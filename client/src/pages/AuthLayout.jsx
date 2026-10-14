import { CheckCircle2 } from 'lucide-react';

const POINTS = [
  'Batch-level stock with automatic first-expiry-first-out selling',
  'Expiry and low-stock alerts before they cost you money',
  'Fast point of sale with receipts, credit sales and customer balances',
  'Real profit reports: revenue, cost of goods and expenses',
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <section className="auth-art">
        <div className="brand-inline" style={{ color: '#fff' }}><img src="/favicon.svg" alt="" /> Agrovet Manager</div>
        <div>
          <h2>Run your agrovet with confidence.</h2>
          <ul>{POINTS.map((p) => <li key={p}><CheckCircle2 size={18} /> {p}</li>)}</ul>
        </div>
        <small style={{ color: 'rgba(236,245,238,.5)' }}>Every shop gets its own private workspace.</small>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          <div className="brand-inline" style={{ marginBottom: 28 }}><img src="/favicon.svg" alt="" /> Agrovet Manager</div>
          <h1>{title}</h1>
          <p className="sub">{subtitle}</p>
          {children}
          <div className="auth-foot">{footer}</div>
        </div>
      </section>
    </div>
  );
}
