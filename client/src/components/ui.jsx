import { forwardRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

import { t } from '../lib/i18n.js';
export const Spinner = () => <span className="spinner" role="status" aria-label={t('Loading')} />;
export const Loading = () => <div className="center-fill"><Spinner /></div>;

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && <div className="ico"><Icon size={24} /></div>}
      <h4>{title}</h4>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export const Badge = ({ tone = '', children }) => <span className={`badge ${tone}`}>{children}</span>;

/** A label that wraps its control so clicking the text focuses it. */
export function Field({ label, error, hint, className = '', children }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export const SearchInput = forwardRef(function SearchInput({ value, onChange, placeholder = 'Search…', ...rest }, ref) {
  return (
    <div className="input-affix">
      <Search size={16} />
      <input ref={ref} className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...rest} />
    </div>
  );
});

export function Segmented({ value, onChange, options, block }) {
  return (
    <div className={`seg ${block ? 'block' : ''}`} role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{t(o.label)}</button>
      ))}
    </div>
  );
}

export function Tabs({ value, onChange, tabs }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tb) => (
        <button key={tb.value} role="tab" aria-selected={value === tb.value} onClick={() => onChange(tb.value)}>{t(tb.label)}</button>
      ))}
    </div>
  );
}

export function TagInput({ value = [], onChange, placeholder }) {
  const [text, setText] = useState('');
  const add = (raw) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setText('');
  };
  return (
    <div className="tags">
      {value.map((tag) => (
        <span className="tag" key={tag}>
          {tag}
          <button type="button" onClick={() => onChange(value.filter((v) => v !== tag))} aria-label={t('Remove {0}', [tag])}><X size={12} /></button>
        </span>
      ))}
      <input
        value={text}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add(text); }
          if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(text)}
      />
    </div>
  );
}

export function Pagination({ page, pages, total, limit, onPage }) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="pager">
      <span className="num">{from}–{to} {t('of')} {total}</span>
      <div className="row">
        <button className="btn sm icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('Previous page')}><ChevronLeft size={16} /></button>
        <span className="num">{t('Page')} {page} / {pages}</span>
        <button className="btn sm icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('Next page')}><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

/** columns: [{ header, render(row), align, label (mobile caption), first }] */
export function DataTable({ columns, rows, rowKey = (r) => r.id, onRowClick, dim }) {
  return (
    <div className="table-wrap">
      <table className="table stack">
        <thead>
          <tr>{columns.map((c, i) => <th key={i} className={c.align === 'right' ? 'right' : ''}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={`${onRowClick ? 'click' : ''} ${dim?.(r) ? 'dim' : ''}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c, i) => (
                <td key={i} className={`${c.align === 'right' ? 'right' : ''} ${c.first ? 'first' : ''}`} data-label={c.first ? '' : (c.label ?? c.header)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Kpi({ icon: Icon, tone = '', label, value, children }) {
  return (
    <div className="card kpi">
      <div className="top"><span>{label}</span>{Icon && <span className={`ico ${tone}`}><Icon size={17} /></span>}</div>
      <div className="val">{value}</div>
      <div className="sub">{children}</div>
    </div>
  );
}

export function Delta({ value, suffix = 'vs last period' }) {
  if (value === null || value === undefined) return <span className="faint">{t('No prior data')}</span>;
  const up = value >= 0;
  return (
    <>
      <span className={`delta ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(value)}%</span>
      <span className="faint">{t(suffix)}</span>
    </>
  );
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty">
      <h4>{t('Couldn’t load this')}</h4>
      <p>{error?.message || t('Something went wrong.')}</p>
      {onRetry && <button className="btn" onClick={onRetry}>{t('Try again')}</button>}
    </div>
  );
}

/* Shared status badges */
export function StockBadge({ product }) {
  if (product.stock_status === 'out') return <Badge tone="danger">{t('Out of stock')}</Badge>;
  if (product.stock_status === 'low') return <Badge tone="warn">{t('Low stock')}</Badge>;
  return <Badge tone="ok">{t('In stock')}</Badge>;
}

export function ExpiryBadge({ status, days }) {
  if (status === 'expired') return <Badge tone="danger">{t('Expired')}{days !== null && days !== undefined ? t(' {0}d ago', [Math.abs(days)]) : ''}</Badge>;
  if (status === 'expiring') return <Badge tone="warn">{days === 0 ? t('Expires today') : t('{0}d left', [days])}</Badge>;
  if (status === 'ok') return <Badge tone="ok">{t('{0}d left', [days])}</Badge>;
  return <Badge>{t('No expiry')}</Badge>;
}

/** Applies a server field-error map to a form: `fe('name')` → message. */
export const fieldErr = (err) => (name) => err?.fields?.[name];
