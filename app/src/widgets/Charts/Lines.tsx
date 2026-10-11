'use client';

// LineChart: several series over the same buckets, in an SVG with a
// 0 to 100 view box (strokes don't scale), an optional area under the first
// series, a forecast part (dashed, over a hatched band), reference lines,
// and dots as HTML so they stay round. Each point sits in the middle of its
// bucket, in line with the labels below. null points are gaps.

import { makeScale, type ScaleMode } from '@/src/shared/dashboard/scale';
import { Plot, type RefLine } from './Columns';
import s from './Charts.module.css';

export interface LineSeries {
  name: string;
  color: string;
  values: (number | null)[];
  /** Shade under this line (a running total). */
  area?: boolean;
  /** A dot per point, coloured per point (e.g. above or under a target). */
  dots?: (string | null)[];
  /** Only the last actual point gets a dot. */
  endDot?: boolean;
}

export function LineChart({
  labels,
  series,
  mode,
  tick,
  format,
  refs,
  forecastFrom,
  allowNegative,
  ariaLabel,
}: {
  labels: { text: string; future?: boolean }[];
  series: LineSeries[];
  mode: ScaleMode;
  tick: (n: number) => string;
  format: (n: number) => string;
  refs?: RefLine[];
  /** Index of the first forecast point: dashed from the point before it. */
  forecastFrom?: number | null;
  allowNegative?: boolean;
  ariaLabel: string;
}) {
  const n = labels.length;
  const scale = makeScale([...series.flatMap((x) => x.values), ...(refs ?? []).map((r) => r.value)], mode, allowNegative && mode === 'linear');
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - Math.max(0, Math.min(100, scale.pos(v)));
  const dense = n > 8;

  function path(values: (number | null)[], from: number, to: number) {
    let d = '';
    let pen = false;
    for (let i = from; i <= to && i < values.length; i++) {
      const v = values[i];
      if (v === null) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
      pen = true;
    }
    return d.trim();
  }

  const split = typeof forecastFrom === 'number' && forecastFrom > 0 && forecastFrom < n ? forecastFrom : null;
  return (
    <Plot scale={scale} tick={tick} refs={refs} labels={labels} dense={dense} ariaLabel={ariaLabel}>
      {split !== null && (
        <span className={s.forecastBand} style={{ left: `${(split / n) * 100}%` }} aria-hidden>
          <span>Forecast</span>
        </span>
      )}
      <svg className={s.svg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {series.map((ser) => {
          const lastActual = split === null ? n - 1 : split - 1;
          const solid = path(ser.values, 0, lastActual);
          const dashed = split === null ? '' : path(ser.values, split - 1, n - 1);
          const firstIdx = ser.values.findIndex((v) => v !== null);
          let lastIdx = -1;
          for (let i = Math.min(lastActual, n - 1); i >= 0; i--) if (ser.values[i] !== null) { lastIdx = i; break; }
          const floor = y(scale.mode === 'log' ? scale.min : Math.max(scale.min, 0));
          return (
            <g key={ser.name}>
              {ser.area && firstIdx >= 0 && lastIdx >= 0 && (
                <path d={`${solid} L${x(lastIdx).toFixed(2)},${floor} L${x(firstIdx).toFixed(2)},${floor} Z`} fill={ser.color} fillOpacity={0.14} stroke="none" />
              )}
              {solid && <path d={solid} fill="none" stroke={ser.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
              {dashed && <path d={dashed} fill="none" stroke={ser.color} strokeWidth={2.5} strokeDasharray="5 4" strokeLinecap="round" />}
            </g>
          );
        })}
      </svg>
      {series.map((ser) =>
        ser.values.map((v, i) => {
          if (v === null) return null;
          const color = ser.dots ? ser.dots[i] : ser.endDot && i === (split === null ? lastIndex(ser.values) : split - 1) ? ser.color : null;
          if (!color) return null;
          return <span key={`${ser.name}-${i}`} className={s.dot} title={`${labels[i]?.text}: ${format(v)}`} style={{ left: `${x(i)}%`, bottom: `${100 - y(v)}%`, background: color }} />;
        })
      )}
    </Plot>
  );
}

function lastIndex(values: (number | null)[]) {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null) return i;
  return -1;
}
