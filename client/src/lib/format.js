const ZERO_DECIMAL = new Set(['TZS', 'KES', 'UGX', 'RWF', 'BIF', 'XOF', 'XAF', 'JPY', 'KRW', 'VND']);

export function makeFormatters(account) {
  const currency = account?.currency || 'TZS';
  const timeZone = account?.timezone || 'UTC';
  let nf;
  try {
    nf = new Intl.NumberFormat(undefined, {
      style: 'currency', currency, currencyDisplay: 'code',
      minimumFractionDigits: 0, maximumFractionDigits: ZERO_DECIMAL.has(currency) ? 0 : 2,
    });
  } catch {
    nf = null;
  }
  const plain = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
  const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  return {
    currency,
    money: (n) => (nf ? nf.format(Number(n) || 0) : `${currency} ${plain.format(Number(n) || 0)}`),
    moneyShort: (n) => compact.format(Number(n) || 0),
    num: (n) => plain.format(Number(n) || 0),
    date: (ymd) => {
      if (!ymd) return '—';
      const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`);
      return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
    },
    dateShort: (ymd) => {
      const d = new Date(`${ymd}T00:00:00Z`);
      return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
    },
    dateTime: (iso) =>
      iso
        ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso))
        : '—',
    time: (iso) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso)),
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

export const PAYMENT_LABELS = {
  cash: 'Cash', mobile_money: 'Mobile money', card: 'Card', bank_transfer: 'Bank transfer', credit: 'On credit',
};

export const MOVEMENT_LABELS = {
  opening: 'Opening stock', purchase: 'Purchase', sale: 'Sale', sale_void: 'Sale voided', adjustment: 'Adjustment', write_off: 'Write-off',
};

export const UNITS = ['pcs', 'kg', 'g', 'L', 'ml', 'bag', 'bottle', 'pack', 'vial', 'box', 'sachet', 'tablet', 'dose', 'roll'];

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
