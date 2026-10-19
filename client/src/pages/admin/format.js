export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function fmtBytes(n) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function ago(iso) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export const isRecent = (iso, days = 30) => Boolean(iso) && Date.now() - new Date(iso).getTime() < days * 86400000;

export function shopStatus(shop) {
  if (shop.suspended) return { tone: 'danger', label: 'Suspended' };
  if (isRecent(shop.last_sale_at)) return { tone: 'ok', label: 'Active' };
  return { tone: '', label: 'Idle' };
}
