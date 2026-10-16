import { useMemo, useState } from 'react';
import { useWidth } from '../lib/hooks.js';

import { t } from '../lib/i18n.js';
const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

/** Responsive SVG area/line chart with hover tooltip. data: [{label, a, b}], series: [{key, name, color}] */
export function AreaChart({ data, series, height = 240, formatValue = String, formatLabel = String, tickEvery }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { t: 12, r: 12, b: 26, l: 46 };

  const geo = useMemo(() => {
    if (!width || !data.length) return null;
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;
    const max = niceMax(Math.max(...data.flatMap((d) => series.map((s) => d[s.key] || 0)), 0));
    const x = (i) => pad.l + (data.length === 1 ? w / 2 : (i / (data.length - 1)) * w);
    const y = (v) => pad.t + h - (v / max) * h;
    const paths = series.map((s) => {
      const pts = data.map((d, i) => [x(i), y(d[s.key] || 0)]);
      const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
      const area = `${line} L${x(data.length - 1).toFixed(1)},${pad.t + h} L${x(0).toFixed(1)},${pad.t + h} Z`;
      return { ...s, line, area };
    });
    return { w, h, max, x, y, paths };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, data, series, height]);

  const onMove = (e) => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - pad.l) / geo.w) * (data.length - 1));
    setHover(Math.min(Math.max(i, 0), data.length - 1));
  };

  const every = tickEvery ?? Math.max(1, Math.ceil(data.length / Math.max(Math.floor((width - pad.l) / 70), 1)));
  const gid = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {geo && (
        <>
          <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
            <defs>
              {geo.paths.map((p, i) => (
                <linearGradient key={p.key} id={`${gid}${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={p.color} stopOpacity={i === 0 ? 0.28 : 0.1} />
                  <stop offset="100%" stopColor={p.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((q) => {
              const yy = geo.y(geo.max * q);
              return (
                <g key={q}>
                  <line x1={pad.l} x2={width - pad.r} y1={yy} y2={yy} stroke="var(--border)" strokeDasharray={q === 0 ? '' : '3 4'} />
                  <text x={pad.l - 8} y={yy + 4} textAnchor="end">{formatValue(geo.max * q, true)}</text>
                </g>
              );
            })}
            {data.map((d, i) => (i % every === 0 ? <text key={i} x={geo.x(i)} y={height - 7} textAnchor="middle">{formatLabel(d.label)}</text> : null))}
            {geo.paths.map((p, i) => (
              <g key={p.key}>
                <path d={p.area} fill={`url(#${gid}${i})`} />
                <path d={p.line} fill="none" stroke={p.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ))}
            {hover !== null && (
              <g>
                <line x1={geo.x(hover)} x2={geo.x(hover)} y1={pad.t} y2={pad.t + geo.h} stroke="var(--faint)" strokeDasharray="3 3" />
                {series.map((s) => <circle key={s.key} cx={geo.x(hover)} cy={geo.y(data[hover][s.key] || 0)} r="4.5" fill="var(--surface)" stroke={s.color} strokeWidth="2.2" />)}
              </g>
            )}
          </svg>
          {hover !== null && (
            <div className="chart-tip" style={{ left: Math.min(Math.max(geo.x(hover), 70), width - 70), top: Math.max(geo.y(Math.max(...series.map((s) => data[hover][s.key] || 0))), 40) }}>
              <b>{formatLabel(data[hover].label, true)}</b>
              {series.map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.name}: {formatValue(data[hover][s.key] || 0)}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Donut({ items, format, size = 150, centerLabel }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={t('Breakdown')}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
        {total > 0 && items.map((it) => {
          const len = (it.value / total) * c;
          const el = (
            <circle key={it.name} cx="70" cy="70" r={r} fill="none" stroke={it.color} strokeWidth="18"
              strokeDasharray={`${Math.max(len - 1.5, 0)} ${c - Math.max(len - 1.5, 0)}`} strokeDashoffset={-offset}
              transform="rotate(-90 70 70)" />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="67" textAnchor="middle" style={{ font: '700 15px var(--font)', fill: 'var(--text)' }}>{format(total)}</text>
        <text x="70" y="83" textAnchor="middle" style={{ font: '500 10px var(--font)', fill: 'var(--faint)' }}>{centerLabel}</text>
      </svg>
      <div className="donut-legend">
        {items.slice(0, 6).map((it) => (
          <div key={it.name}><i className="dot" style={{ background: it.color }} /><span style={{ marginLeft: 0, fontWeight: 500 }} className="truncate">{it.name}</span><span>{total ? Math.round((it.value / total) * 100) : 0}%</span></div>
        ))}
      </div>
    </div>
  );
}

export function HBars({ items, format }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div>
      {items.map((i) => (
        <div className="hbar" key={i.name}>
          <div className="meta"><span className="truncate">{i.name}</span><b className="num">{format(i.value)}</b></div>
          <div className="track"><i style={{ width: `${(i.value / max) * 100}%`, background: i.color }} /></div>
        </div>
      ))}
    </div>
  );
}
