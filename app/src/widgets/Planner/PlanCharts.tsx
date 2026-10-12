'use client';

// The plans' charts, on the dashboards' chart kit (src/widgets/Charts):
// the balance forecast (daily line over the horizon, the starting plan
// dashed, the safety buffer, period dividers and the lowest point), a
// column waterfall (money or hours), money in and out by period, bar rows
// (baskets or projects, with the starting plan's mark), the starting plan
// against the plan, the daily load and a goal's bar. Locked steps and rows
// carry the lock glyph.

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { makeScale } from '@/src/shared/dashboard/scale';
import { compact, signedCompact } from '@/src/shared/dashboard/format';
import { Plot } from '@/src/widgets/Charts/Columns';
import s from '@/src/widgets/Charts/Charts.module.css';
import p from './Planner.module.css';
import { styleGuide } from '@/src/styles/tokens/styleGuide';

export function LockGlyph({ label = 'Locked' }: { label?: string }) {
  return <Lock className={p.lock} size={12} strokeWidth={2.4} aria-label={label} role="img" />;
}

const pct = (n: number) => `${Math.max(0, Math.min(100, n)).toFixed(2)}%`;

// ---- Balance forecast ----

export function BalanceForecast({
  from,
  to,
  points,
  startPoints,
  buffer,
  dividers,
  labels,
  lowest,
  ariaLabel,
}: {
  from: number;
  to: number;
  points: [number, number][];
  /** The starting plan, when there are changes. */
  startPoints?: [number, number][] | null;
  buffer: number;
  /** Days where a new period starts. */
  dividers: number[];
  /** Period labels at their middle day. */
  labels: { day: number; text: string }[];
  lowest: { day: number; value: number; text: string };
  ariaLabel: string;
}) {
  const values = [...points.map((x) => x[1]), ...(startPoints ?? []).map((x) => x[1]), buffer, 0];
  const scale = makeScale(values, 'linear', true);
  const span = to - from || 1;
  const x = (d: number) => ((d - from) / span) * 100;
  const y = (v: number) => 100 - scale.pos(v);
  const path = (pts: [number, number][]) => (pts.length ? `M${pts.map(([d, v]) => `${x(d).toFixed(2)} ${y(v).toFixed(2)}`).join(' L')}` : '');
  const line = path(points);
  const floor = y(Math.max(scale.min, 0)).toFixed(2);
  const last = points[points.length - 1];
  return (
    <Plot
      scale={scale}
      tick={compact}
      refs={[{ value: buffer, label: `Buffer ${compact(buffer)}`, side: 'left' }]}
      ariaLabel={ariaLabel}
      footer={
        <div className={p.xRow} aria-hidden>
          {labels.map((l) => (
            <span key={l.day} style={{ left: pct(x(l.day)) }}>
              {l.text}
            </span>
          ))}
        </div>
      }
    >
      {dividers.map((d) => (
        <span key={d} className={p.divider} style={{ left: pct(x(d)) }} aria-hidden />
      ))}
      {scale.min < 0 && <span className={s.zeroLine} style={{ bottom: pct(scale.pos(0)) }} aria-hidden />}
      <svg className={s.svg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {line && <path d={`${line} L100 ${floor} L0 ${floor} Z`} fill="var(--c-primary)" fillOpacity={0.1} stroke="none" />}
        {startPoints && <path d={path(startPoints)} fill="none" stroke="var(--c-grey)" strokeWidth={1.5} strokeDasharray="5 4" />}
        {line && <path d={line} fill="none" stroke="var(--c-primary)" strokeWidth={2.5} strokeLinejoin="round" />}
      </svg>
      <span
        className={s.dot}
        style={{
          left: pct(x(lowest.day)),
          bottom: pct(scale.pos(lowest.value)),
          background: 'var(--c-bad)',
        }}
        aria-hidden
      />
      <span
        className={p.lowLabel}
        data-side={x(lowest.day) > 70 ? 'left' : 'right'}
        style={{
          left: pct(x(lowest.day)),
          bottom: pct(scale.pos(lowest.value)),
        }}
        aria-hidden
      >
        {lowest.text}
      </span>
      {last && (
        <span
          className={s.dot}
          style={{
            left: '100%',
            bottom: pct(scale.pos(last[1])),
            background: 'var(--c-primary)',
          }}
          aria-hidden
        />
      )}
    </Plot>
  );
}

// ---- Waterfall ----

export interface FallStep {
  label: string;
  /** total: the value itself (or the running total when left out); sub: the running total; delta: signed. */
  kind: 'total' | 'sub' | 'delta';
  value?: number;
  color: string;
  lock?: boolean;
}

/** Where each step's bar starts (a) and ends (b). */
export function fallSpans(steps: FallStep[]) {
  const out: { step: FallStep; a: number; b: number }[] = [];
  let run = 0;
  for (const step of steps) {
    if (step.kind === 'delta') {
      const a = run;
      run += step.value ?? 0;
      out.push({ step, a, b: run });
      continue;
    }
    if (step.kind === 'total' && step.value !== undefined) run = step.value;
    out.push({ step, a: 0, b: run });
  }
  return out;
}

export function ColumnWaterfall({ steps, format, ariaLabel }: { steps: FallStep[]; format: (n: number) => string; ariaLabel: string }) {
  const bars = fallSpans(steps);
  const scale = makeScale([0, ...bars.flatMap((b) => [b.a, b.b])], 'linear', true);
  return (
    <div className={p.fall}>
      <Plot
        scale={scale}
        tick={compact}
        ariaLabel={ariaLabel}
        labels={steps.map((st) => ({
          text: (
            <>
              {st.lock && <LockGlyph />}
              {st.label}
            </>
          ),
        }))}
      >
        {scale.min < 0 && <span className={s.zeroLine} style={{ bottom: pct(scale.pos(0)) }} aria-hidden />}
        <div className={s.cols}>
          {bars.map(({ step, a, b }, i) => {
            const lo = scale.pos(Math.min(a, b));
            const hi = scale.pos(Math.max(a, b));
            const shown = step.kind === 'delta' ? `${(step.value ?? 0) >= 0 ? '+' : '−'}${format(Math.abs(step.value ?? 0))}` : format(b);
            return (
              <div key={i} className={p.fallCol} title={`${step.label}: ${shown}`}>
                <span
                  className={p.fallBar}
                  data-sub={step.kind === 'sub' || undefined}
                  style={{
                    bottom: pct(lo),
                    height: `max(2px, ${pct(hi - lo)})`,
                    background: step.color,
                  }}
                >
                  <span className={s.valueLabel} data-bad={(step.kind !== 'delta' && b < 0) || undefined}>
                    {shown}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </Plot>
    </div>
  );
}

// ---- Money in and out by period ----

export interface InOutPeriod {
  label: string;
  in: number;
  /** Out of the wallet: fixed (less what goals paid), variable, savings. */
  fixed: number;
  variable: number;
  savings: number;
  end: number;
  low: boolean;
}

export function InOutColumns({ periods, ariaLabel }: { periods: InOutPeriod[]; ariaLabel: string }) {
  const out = (x: InOutPeriod) => x.fixed + x.variable + x.savings;
  const scale = makeScale(
    periods.flatMap((x) => [x.in, out(x)]),
    'linear',
  );
  const dense = periods.length > 4;
  const h = (v: number) => pct(scale.pos(v));
  return (
    <Plot
      scale={scale}
      tick={compact}
      dense={dense}
      ariaLabel={ariaLabel}
      labels={periods.map((x) => ({ text: x.label }))}
      sub={periods.map((x) => ({
        text: `ends ${compact(x.end)}`,
        tone: x.low ? 'bad' : undefined,
      }))}
    >
      <div className={s.cols} data-dense={dense || undefined}>
        {periods.map((x, i) => {
          const o = out(x);
          return (
            <div key={i} className={s.col} title={`${x.label}: in ${compact(x.in)}, out ${compact(o)}`}>
              <span className={s.bar} data-pair style={{ height: h(x.in), background: 'var(--c-primary)' }}>
                {x.in > 0 && <span className={s.valueLabel}>{compact(x.in)}</span>}
              </span>
              <span
                className={s.bar}
                data-pair
                data-stack
                style={{
                  height: h(o),
                  overflow: 'visible',
                  display: 'flex',
                  flexDirection: 'column-reverse',
                }}
              >
                {o > 0 && <span className={s.valueLabel}>{compact(o)}</span>}
                {[
                  { v: x.fixed, c: 'var(--c-primary-dark)' },
                  { v: x.variable, c: 'var(--c-accent)' },
                  { v: x.savings, c: 'var(--c-primary-mid)' },
                ].map((seg, j) =>
                  seg.v > 0 ? (
                    <span
                      key={j}
                      className={s.seg}
                      style={{
                        height: `${(seg.v / o) * 100}%`,
                        background: seg.c,
                      }}
                    />
                  ) : null,
                )}
              </span>
            </div>
          );
        })}
      </div>
    </Plot>
  );
}

// ---- Bar rows ----

export interface BarRow {
  label: string;
  value: number;
  color: string;
  lock?: boolean;
  /** The starting plan's amount, marked on the track when it differs. */
  mark?: number | null;
  /** Shown beside the value ("+5k"); tone: good (dark) or bad (red). */
  diff?: { text: string; tone: 'good' | 'bad' } | null;
}

export function BarRows({ rows, format, ariaLabel }: { rows: BarRow[]; format: (n: number) => string; ariaLabel: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.value, r.mark ?? 0]));
  return (
    <div className={s.rows} role="img" aria-label={ariaLabel}>
      {rows.map((r) => (
        <div key={r.label} className={s.row}>
          <span className={s.rowLabel}>
            {r.lock && <LockGlyph />}
            {r.label}
          </span>
          <span className={s.track}>
            <span className={s.fill} style={{ width: pct((r.value / max) * 100), background: r.color }} />
            {r.mark != null && Math.abs(r.mark - r.value) > 1 && <span className={s.marker} style={{ left: pct((r.mark / max) * 100) }} title="Starting plan" />}
          </span>
          <span className={s.rowValue}>
            {format(r.value)}
            {r.diff && <small data-tone={r.diff.tone}>{r.diff.text}</small>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- Starting plan against the plan ----

export function CompareBars({
  rows,
}: {
  rows: {
    label: string;
    start: number;
    plan: number;
    higherIsBetter: boolean;
  }[];
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.start), Math.abs(r.plan)]));
  const bar = (v: number, color: string, name: string) => (
    <span className={p.cmpBar}>
      <span className={p.cmpTrack}>
        <i
          style={{
            width: pct((Math.abs(v) / max) * 100),
            background: v < 0 ? 'var(--c-bad)' : color,
          }}
        />
      </span>
      <span className={p.cmpValue}>
        <span className={p.srOnly}>{name}: </span>
        {compact(v)}
      </span>
    </span>
  );
  return (
    <div className={p.cmp}>
      {rows.map((r) => {
        const d = r.plan - r.start;
        const helps = r.higherIsBetter ? d > 0 : d < 0;
        return (
          <div key={r.label} className={p.cmpRow}>
            <div className={p.cmpHead}>
              <b>{r.label}</b>
              <span className={s.pill} data-tone={Math.abs(d) > 1 ? (helps ? 'good' : 'bad') : 'neutral'}>
                {Math.abs(d) > 1 ? signedCompact(d) : 'No change'}
              </span>
            </div>
            {bar(r.start, 'var(--c-primary-mid)', 'Starting plan')}
            {bar(r.plan, 'var(--c-primary)', 'Your plan')}
          </div>
        );
      })}
    </div>
  );
}

// ---- Daily load ----

export interface LoadColumn {
  label: string;
  capacity: number;
  meetings: number;
  parts: { project: string; color: string; hours: number }[];
  total: number;
}

const hrs = (h: number) => `${Math.round(h * 10) / 10} h`;

export function DailyLoad({ days, ariaLabel }: { days: LoadColumn[]; ariaLabel: string }) {
  const scale = makeScale([4, ...days.flatMap((d) => [d.total, d.capacity])], 'linear');
  const dense = days.length > 8;
  return (
    <Plot scale={scale} tick={(n) => `${n} h`} dense={dense} ariaLabel={ariaLabel} labels={days.map((d) => ({ text: d.label }))}>
      <div className={s.cols} data-dense={dense || undefined}>
        {days.map((d, i) => {
          const over = d.total - d.capacity > 0.01;
          return (
            <div key={i} className={s.col} title={`${d.label}: ${hrs(d.total)} of ${hrs(d.capacity)}`}>
              {d.total > 0 && (
                <span
                  className={s.bar}
                  data-stack
                  data-over={over || undefined}
                  style={{
                    height: pct(scale.pos(d.total)),
                    overflow: 'visible',
                    display: 'flex',
                    flexDirection: 'column-reverse',
                  }}
                >
                  <span className={s.valueLabel} data-bad={over || undefined}>
                    {hrs(d.total)}
                    {over ? ` (+${hrs(d.total - d.capacity)})` : ''}
                  </span>
                  {d.meetings > 0 && (
                    <span
                      className={s.seg}
                      style={{
                        height: `${(d.meetings / d.total) * 100}%`,
                        background: styleGuide.brand.primaryLight,
                      }}
                    />
                  )}
                  {d.parts.map((x) =>
                    x.hours > 0 ? (
                      <span
                        key={x.project}
                        className={s.seg}
                        style={{
                          height: `${(x.hours / d.total) * 100}%`,
                          background: x.color,
                        }}
                      />
                    ) : null,
                  )}
                </span>
              )}
              {d.capacity > 0 && <span className={p.capLine} style={{ bottom: pct(scale.pos(d.capacity)) }} aria-hidden />}
            </div>
          );
        })}
      </div>
    </Plot>
  );
}

// ---- A goal ----

export function GoalBar({ now, by, target, ariaLabel }: { now: number; by: number; target: number | null; ariaLabel: string }) {
  const max = Math.max(1, by, now, target ?? 0) * 1.08;
  return (
    <div className={p.goalBar} role="img" aria-label={ariaLabel}>
      <i style={{ width: pct((now / max) * 100) }} />
      <i
        data-light
        style={{
          left: pct((now / max) * 100),
          width: pct((Math.max(0, by - now) / max) * 100),
        }}
      />
      {target ? <span className={p.goalTarget} style={{ left: pct((target / max) * 100) }} /> : null}
    </div>
  );
}

export function SrOnly({ children }: { children: ReactNode }) {
  return <span className={p.srOnly}>{children}</span>;
}
