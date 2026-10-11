'use client';

// Donut (fixed size), Radar (fixed size, actual against target), Treemap
// (up to six tiles in two rows), Sankey (sources on the left to uses on the
// right, shared out in proportion) and BoxPlot (linear or log).

import { makeScale, type ScaleMode } from '@/src/shared/dashboard/scale';
import { Plot } from './Columns';
import { boxStats, spreadLabels, textOn } from './math';
import s from './Charts.module.css';

export { boxStats, textOn, whiteOn, spreadLabels } from './math';
export type { BoxStats } from './math';

export interface Part {
  label: string;
  value: number;
  color: string;
}

// ---- Donut ----

export function Donut({ parts, format, centerLabel, ariaLabel }: { parts: Part[]; format: (n: number) => string; centerLabel: string; ariaLabel: string }) {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  const r = 15.915; // circumference 100
  let offset = 25; // start at the top
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 0.8 : 0;
  return (
    <div className={s.donutWrap}>
      <div className={s.donut} role="img" aria-label={ariaLabel}>
        <svg viewBox="0 0 42 42" width="100%" height="100%" aria-hidden>
          <circle cx="21" cy="21" r={r} fill="none" stroke="var(--c-grid)" strokeWidth="6" />
          {total > 0 &&
            parts.map((p) => {
              const share = (Math.max(0, p.value) / total) * 100;
              if (share <= 0) return null;
              const el = (
                <circle
                  key={p.label}
                  cx="21"
                  cy="21"
                  r={r}
                  fill="none"
                  stroke={p.color}
                  strokeWidth="6"
                  strokeDasharray={`${Math.max(0, share - gap)} ${100 - Math.max(0, share - gap)}`}
                  strokeDashoffset={offset}
                />
              );
              offset -= share;
              return el;
            })}
        </svg>
        <div className={s.donutCenter}>
          <strong>{format(total)}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className={s.list}>
        {parts.map((p) => (
          <li key={p.label}>
            <span className={s.swatch} style={{ background: p.color }} aria-hidden />
            <span>{p.label}</span>
            <strong>{format(p.value)}</strong>
            <span style={{ flex: 'none', minWidth: 42, textAlign: 'right', color: 'var(--c-muted)' }}>{total > 0 ? `${Math.round((p.value / total) * 100)}%` : '0%'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Radar ----

export function Radar({ axes, ariaLabel }: { axes: { label: string; actual: number; target: number }[]; ariaLabel: string }) {
  const W = 320;
  const H = 300;
  const cx = W / 2;
  const cy = H / 2 + 6;
  const R = 100;
  const n = axes.length;
  const at = (i: number, frac: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * R * frac, cy + Math.sin(a) * R * frac];
  };
  const shape = (fracs: number[]) => fracs.map((f, i) => at(i, f).map((v) => v.toFixed(1)).join(',')).join(' ');
  const ratios = axes.map((a) => (a.target > 0 ? Math.min(1.2, a.actual / a.target) : 0));
  return (
    <div className={s.radar} role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: '100%' }} aria-hidden>
        {[0.5, 1].map((ring) => (
          <polygon key={ring} points={shape(axes.map(() => ring))} fill="none" stroke="var(--c-grid)" strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = at(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--c-grid)" />;
        })}
        <polygon points={shape(axes.map(() => 1))} fill="none" stroke="var(--c-text)" strokeDasharray="5 4" strokeWidth={1.5} />
        <polygon points={shape(ratios)} fill="var(--c-primary)" fillOpacity={0.22} stroke="var(--c-primary)" strokeWidth={2} />
      </svg>
      {axes.map((a, i) => {
        const [x, y] = at(i, 1.32);
        return (
          <span key={a.label} className={s.radarLabel} style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}>
            {a.label}
            <small>{a.target > 0 ? `${Math.round((a.actual / a.target) * 100)}% of target` : 'No target'}</small>
          </span>
        );
      })}
    </div>
  );
}

// ---- Treemap ----

export function Treemap({ parts, format, ariaLabel }: { parts: Part[]; format: (n: number) => string; ariaLabel: string }) {
  const sorted = [...parts].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((sum, p) => sum + p.value, 0);
  const tiles = rest > 0 ? [...top, { label: 'Everything else', value: rest, color: 'var(--c-grey)' }] : top;
  const total = tiles.reduce((sum, p) => sum + p.value, 0) || 1;
  // Two rows: the first takes tiles until it holds over half the total.
  const first: Part[] = [];
  let acc = 0;
  for (const t of tiles) {
    if (first.length && acc >= total * 0.5) break;
    first.push(t);
    acc += t.value;
  }
  const second = tiles.slice(first.length);
  const rows = second.length ? [first, second] : [first];
  return (
    <div className={s.tree} role="img" aria-label={ariaLabel}>
      {rows.map((row, ri) => {
        const rowTotal = row.reduce((sum, p) => sum + p.value, 0);
        return (
          <div key={ri} className={s.treeRow} style={{ flex: `${rowTotal} 1 0` }}>
            {row.map((t) => {
              return (
                <div key={t.label} className={s.treeTile} style={{ flex: `${t.value} 1 0`, background: t.color, color: textOn(t.color) }}>
                  <strong>{t.label}</strong>
                  <span className={s.num}>
                    {format(t.value)} · {Math.round((t.value / total) * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---- Sankey ----

/** Nodes stacked top to bottom, each as tall as its share, with gaps between. */
function stackNodes(parts: Part[], total: number, usable: number, gap: number) {
  const out: (Part & { y: number; h: number })[] = [];
  let y = 0;
  for (const p of parts) {
    const h = (p.value / total) * usable;
    out.push({ ...p, y, h });
    y += h + gap;
  }
  return out;
}

export function Sankey({ sources, uses, format, ariaLabel }: { sources: Part[]; uses: Part[]; format: (n: number) => string; ariaLabel: string }) {
  const total = Math.max(1, sources.reduce((sum, p) => sum + p.value, 0));
  const useTotal = Math.max(1, uses.reduce((sum, p) => sum + p.value, 0));
  const H = 100;
  const gapL = sources.length > 1 ? 4 / (sources.length - 1) : 0;
  const gapR = uses.length > 1 ? 4 / (uses.length - 1) : 0;
  const usable = H - 4;
  // Node positions (percent of height).
  const left = stackNodes(sources, total, usable, gapL);
  const right = stackNodes(uses, useTotal, usable, gapR);
  // Each source shares out over the uses in proportion to the uses.
  const outCursor = left.map((l) => l.y);
  const inCursor = right.map((r) => r.y);
  const ribbons: { d: string; color: string; key: string }[] = [];
  left.forEach((l, li) => {
    right.forEach((r, ri) => {
      const share = r.value / useTotal;
      const hl = l.h * share;
      const hr = (l.value / total) * r.h;
      const y0 = outCursor[li];
      const y1 = inCursor[ri];
      outCursor[li] += hl;
      inCursor[ri] += hr;
      if (hl < 0.05) return;
      const x0 = 4;
      const x1 = 96;
      const mx = 50;
      ribbons.push({
        key: `${li}-${ri}`,
        color: l.color,
        d: `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + hr} C${mx},${y1 + hr} ${mx},${y0 + hl} ${x0},${y0 + hl} Z`,
      });
    });
  });
  // Labels at their node's middle, pushed apart so none overlap.
  const leftLabels = spreadLabels(left.map((l) => l.y + l.h / 2));
  const rightLabels = spreadLabels(right.map((r) => r.y + r.h / 2));
  return (
    <div className={s.sankey} role="img" aria-label={ariaLabel}>
      <svg className={s.svg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {ribbons.map((r) => (
          <path key={r.key} d={r.d} fill={r.color} fillOpacity={0.28} stroke="none" />
        ))}
      </svg>
      {left.map((l, i) => (
        <span key={l.label}>
          <span className={s.sankeyNode} style={{ left: 0, top: `${l.y}%`, height: `${Math.max(0.8, l.h)}%`, background: l.color }} />
          <span className={s.sankeyLabel} style={{ left: 14, top: `${leftLabels[i]}%` }}>
            {l.label} <strong>{format(l.value)}</strong>
          </span>
        </span>
      ))}
      {right.map((r, i) => (
        <span key={r.label}>
          <span className={s.sankeyNode} style={{ right: 0, top: `${r.y}%`, height: `${Math.max(0.8, r.h)}%`, background: r.color }} />
          <span className={s.sankeyLabel} style={{ right: 14, top: `${rightLabels[i]}%`, textAlign: 'right' }}>
            {r.label} <strong>{format(r.value)}</strong>
          </span>
        </span>
      ))}
    </div>
  );
}

// ---- Box plot ----

export function BoxPlot({
  groups,
  mode,
  format,
  tick,
  ariaLabel,
}: {
  groups: { label: string; values: number[] }[];
  mode: ScaleMode;
  format: (n: number) => string;
  tick: (n: number) => string;
  ariaLabel: string;
}) {
  const stats = groups.map((g) => ({ label: g.label, stats: boxStats(g.values) }));
  const scale = makeScale(stats.flatMap((x) => (x.stats ? [x.stats.max, x.stats.min] : [])), mode);
  const p = (v: number) => Math.max(0, Math.min(100, scale.pos(v)));
  return (
    <Plot scale={scale} tick={tick} labels={groups.map((g) => ({ text: g.label }))} ariaLabel={ariaLabel}>
      <div className={s.cols}>
        {stats.map(({ label, stats: b }) => (
          <div key={label} className={s.box}>
            {b && (
              <>
                <span className={s.whisker} style={{ bottom: `${p(b.min)}%`, height: `${p(b.max) - p(b.min)}%` }} />
                <span className={s.cap} style={{ bottom: `${p(b.max)}%` }} />
                <span className={s.cap} style={{ bottom: `${p(b.min)}%` }} />
                <span className={s.boxBody} style={{ bottom: `${p(b.q1)}%`, height: `${Math.max(1, p(b.q3) - p(b.q1))}%` }} />
                <span className={s.median} style={{ bottom: `${p(b.median)}%` }} />
                <span className={s.boxLabel} style={{ top: `${100 - p(b.max)}%` }}>
                  Typical {format(b.median)}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </Plot>
  );
}
