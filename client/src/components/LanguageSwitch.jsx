import { Languages } from 'lucide-react';
import { LANGUAGES, setLocale, useLocale } from '../lib/i18n.js';

import { t } from '../lib/i18n.js';
/** Compact EN | SW toggle. Shown on the sign-in pages and in the top bar. */
export default function LanguageSwitch({ onDark = false }) {
  const current = useLocale();
  return (
    <div className="seg lang-switch" role="group" aria-label={t('Language')} style={onDark ? { background: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.15)' } : undefined}>
      <Languages size={15} style={{ alignSelf: 'center', margin: '0 4px 0 8px', color: onDark ? '#cfe' : 'var(--faint)' }} aria-hidden="true" />
      {LANGUAGES.map((l) => (
        <button key={l.code} type="button" aria-pressed={current === l.code} title={l.name} onClick={() => setLocale(l.code)}
          style={onDark && current !== l.code ? { color: 'rgba(255,255,255,.7)' } : undefined}>
          {l.short}
        </button>
      ))}
    </div>
  );
}
