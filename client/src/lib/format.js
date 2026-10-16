import { t } from './i18n.js';

const ZERO_DECIMAL = new Set(['TZS', 'KES', 'UGX', 'RWF', 'BIF', 'XOF', 'XAF', 'JPY', 'KRW', 'VND']);

export function makeFormatters(account, locale) {
  const currency = account?.currency || 'TZS';
  const timeZone = account?.timezone || 'UTC';
  let nf;
  try {
    nf = new Intl.NumberFormat(locale, {
      style: 'currency', currency, currencyDisplay: 'code',
      minimumFractionDigits: 0, maximumFractionDigits: ZERO_DECIMAL.has(currency) ? 0 : 2,
    });
  } catch {
    nf = null;
  }
  const plain = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  return {
    currency,
    money: (n) => (nf ? nf.format(Number(n) || 0) : `${currency} ${plain.format(Number(n) || 0)}`),
    moneyShort: (n) => compact.format(Number(n) || 0),
    num: (n) => plain.format(Number(n) || 0),
    date: (ymd) => {
      if (!ymd) return '—';
      const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`);
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
    },
    dateShort: (ymd) => {
      const d = new Date(`${ymd}T00:00:00Z`);
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
    },
    dateTime: (iso) =>
      iso
        ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso))
        : '—',
    time: (iso) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso)),
  };
}

export const todayISO = (tz) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function addDaysISO(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const monthStartISO = (ymd) => `${ymd.slice(0, 8)}01`;

const translated = (base) => new Proxy(base, { get: (o, k) => (typeof k === 'string' && k in o ? t(o[k]) : o[k]) });

export const PAYMENT_LABELS = translated({
  cash: 'Cash', mobile_money: 'Mobile money', card: 'Card', bank_transfer: 'Bank transfer', credit: 'On credit',
});

export const MOVEMENT_LABELS = translated({
  opening: 'Opening stock', purchase: 'Purchase', sale: 'Sale', sale_void: 'Sale voided', adjustment: 'Adjustment', write_off: 'Write-off',
});

export const UNITS = ['pcs', 'kg', 'g', 'L', 'ml', 'bag', 'bottle', 'pack', 'vial', 'box', 'sachet', 'tablet', 'dose', 'roll'];

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
