import { useSyncExternalStore } from 'react';
import { sw, SERVER_PATTERNS } from '../locales/sw.js';

export const LANGUAGES = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'sw', short: 'SW', name: 'Kiswahili' },
];

const DICTIONARIES = { sw };
const STORAGE_KEY = 'avm-lang';

function initialLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch { /* storage unavailable */ }
  return (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('sw')) ? 'sw' : 'en';
}

let locale = initialLocale();
const listeners = new Set();
if (typeof document !== 'undefined') document.documentElement.lang = locale;

export const getLocale = () => locale;

export function setLocale(code) {
  if (code === locale || !LANGUAGES.some((l) => l.code === code)) return;
  locale = code;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = code;
  listeners.forEach((l) => l());
}

/** Re-renders the calling component whenever the language changes. */
export function useLocale() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getLocale,
    getLocale,
  );
}

const fill = (s, params) => (params ? s.replace(/\{(\d+)\}/g, (m, i) => (params[i] === undefined ? m : params[i])) : s);

/**
 * Translate an English UI string. English text IS the key, so a missing translation
 * simply shows English. Placeholders are positional: t('Received {0} of {1}', [qty, name]).
 */
export function t(key, params) {
  if (typeof key !== 'string') return key;
  const dict = DICTIONARIES[locale];
  return fill(dict?.[key] ?? key, params);
}

/** Translates error messages coming from the API (static ones by lookup, dynamic ones by pattern). */
export function tServer(message) {
  if (typeof message !== 'string' || locale === 'en') return message;
  const dict = DICTIONARIES[locale];
  if (dict?.[message]) return dict[message];
  for (const [re, template] of SERVER_PATTERNS) {
    const m = message.match(re);
    if (m) return template.replace(/\$(\d)/g, (_, i) => m[i] ?? '');
  }
  return message;
}

/** Translates category names that the API returns (default categories are stored in English). */
export function localizeData(value, key) {
  if (locale === 'en') return value;
  if (typeof value === 'string') return key === 'category_name' ? t(value) : value;
  if (Array.isArray(value)) return value.map((v) => localizeData(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    const isCategory = typeof value.name === 'string' && typeof value.color === 'string';
    for (const [k, v] of Object.entries(value)) out[k] = isCategory && k === 'name' ? t(v) : localizeData(v, k);
    return out;
  }
  return value;
}
