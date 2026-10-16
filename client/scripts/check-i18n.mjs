// Fails when a UI string passed to t('…') has no Kiswahili translation (or has mismatched {0} placeholders).
//   npm run i18n:check -w client
// Strings built at runtime with t(variable) can't be detected – add their English text to src/locales/sw.js by hand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const { sw } = await import(pathToFileURL(path.join(src, 'locales', 'sw.js')).href);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return e.name === 'locales' ? [] : walk(p);
  return /\.jsx?$/.test(e.name) && e.name !== 'i18n.js' ? [p] : []; // i18n.js only contains doc examples
});

const re = /(?<![\w.])t\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const used = new Map();
for (const file of walk(src)) {
  for (const m of fs.readFileSync(file, 'utf8').matchAll(re)) {
    if (m[1] === '`' && m[2].includes('${')) continue;
    const key = m[2].replace(/\\(['"`\\])/g, '$1');
    if (!used.has(key)) used.set(key, path.relative(src, file));
  }
}

const ph = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join();
const missing = [...used].filter(([k]) => !(k in sw));
const broken = Object.entries(sw).filter(([k, v]) => ph(k) !== ph(v));

console.log(`${used.size} strings in use · ${Object.keys(sw).length} Kiswahili entries`);
for (const [k, f] of missing) console.log(`  missing  ${JSON.stringify(k)}  (${f})`);
for (const [k, v] of broken) console.log(`  placeholder mismatch  ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
if (missing.length || broken.length) process.exit(1);
console.log('✓ translations complete');
