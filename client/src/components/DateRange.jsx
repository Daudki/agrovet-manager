import { useAuth } from '../context/AuthContext.jsx';
import { addDaysISO, monthStartISO, todayISO } from '../lib/format.js';

import { t } from '../lib/i18n.js';
/** Preset + custom date range. `value` = { from, to }. */
export function useRangePresets() {
  const { account } = useAuth();
  const today = todayISO(account.timezone);
  return {
    today,
    presets: [
      { key: 'today', label: t('Today'), range: { from: today, to: today } },
      { key: '7d', label: t('7 days'), range: { from: addDaysISO(today, -6), to: today } },
      { key: '30d', label: t('30 days'), range: { from: addDaysISO(today, -29), to: today } },
      { key: 'month', label: t('This month'), range: { from: monthStartISO(today), to: today } },
      { key: 'all', label: t('All time'), range: { from: '', to: '' } },
    ],
  };
}

export default function DateRange({ value, onChange, allowAll = true }) {
  const { presets } = useRangePresets();
  const list = allowAll ? presets : presets.filter((p) => p.key !== 'all');
  const active = list.find((p) => p.range.from === value.from && p.range.to === value.to)?.key;
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <div className="chips">
        {list.map((p) => <button key={p.key} className="chip" aria-pressed={active === p.key} onClick={() => onChange(p.range)}>{p.label}</button>)}
      </div>
      <input className="input sm" type="date" style={{ width: 142 }} value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label={t('From date')} />
      <span className="muted">{t('to')}</span>
      <input className="input sm" type="date" style={{ width: 142 }} value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label={t('To date')} />
    </div>
  );
}
