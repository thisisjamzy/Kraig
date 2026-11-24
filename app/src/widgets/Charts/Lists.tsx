'use client';

// Row charts and tables: BulletList (planned against actual), RankedBars
// (largest first, linear or log), HorizontalWaterfall (balance change), and
// the TransactionList table (it scrolls sideways in its own box).

import { makeScale, type ScaleMode } from '@/src/shared/dashboard/scale';
import { waterfallSpans } from './math';
import s from './Charts.module.css';

const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;

// ---- Planned against actual ----

export function BulletList({
  rows,
  format,
  ariaLabel,
}: {
  rows: { label: string; actual: number; plan: number }[];
  format: (n: number) => string;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.actual, r.plan])) * 1.05;
  return (
    <div className={s.rows} role="img" aria-label={ariaLabel}>
      {rows.map((r) => {
        const over = r.actual > r.plan + 0.5;
        const diff = r.actual - r.plan;
        return (
          <div key={r.label} className={s.row}>
            <span className={s.rowLabel}>{r.label}</span>
            <span className={s.track}>
              <span className={s.fill} data-over={over || undefined} style={{ width: pct((r.actual / max) * 100) }} />
              {r.plan > 0 && <span className={s.marker} style={{ left: pct((r.plan / max) * 100) }} />}
            </span>
            <span className={s.rowValue}>
              {format(r.actual)} of {format(r.plan)}
              <small data-tone={over ? 'bad' : 'good'}>{over ? `+${format(diff)} over` : `${format(-diff)} left`}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Ranked bars ----

export function RankedBars({
  rows,
  mode,
  format,
  color = 'var(--c-primary)',
  ariaLabel,
}: {
  rows: { label: string; value: number; note?: string; color?: string }[];
  mode: ScaleMode;
  format: (n: number) => string;
  color?: string;
  ariaLabel: string;
}) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const scale = makeScale(sorted.map((r) => r.value), mode);
  return (
    <div className={s.rows} role="img" aria-label={ariaLabel}>
      {sorted.map((r) => (
        <div key={r.label} className={s.row}>
          <span className={s.rowLabel}>{r.label}</span>
          <span className={s.track}>
            <span className={s.fill} style={{ width: pct(scale.pos(r.value)), background: r.color ?? color }} />
          </span>
          <span className={s.rowValue}>
            {format(r.value)}
            {r.note && <small>{r.note}</small>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- Debts: paid and left ----

export interface WaterfallStep {
  label: string;
  /** Totals: the balance itself; changes: signed amounts. */
  value: number;
  kind: 'total' | 'in' | 'out' | 'untracked';
}

export function HorizontalWaterfall({ steps, format, ariaLabel }: { steps: WaterfallStep[]; format: (n: number) => string; ariaLabel: string }) {
  const spans = waterfallSpans(steps);
  const lo = Math.min(0, ...spans.map((x) => x.from));
  const hi = Math.max(1, ...spans.map((x) => x.to));
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div className={s.rows} style={{ gap: 8 }} role="img" aria-label={ariaLabel}>
      {/* By position: a label can repeat ("Everything else" for money in and out). */}
      {spans.map(({ step, from, to }, i) => (
        <div key={`${i}-${step.label}`} className={s.wfRow}>
          <span className={s.rowLabel}>{step.label}</span>
          <span className={s.wfTrack}>
            <span
              className={`${s.wfBar} ${step.kind === 'untracked' ? s.hatchAccent : ''}`}
              style={{
                left: `${at(from)}%`,
                width: `${Math.max(0.6, at(to) - at(from))}%`,
                background: step.kind === 'total' ? 'var(--c-primary-dark)' : step.kind === 'in' ? 'var(--c-primary)' : 'var(--c-accent)',
              }}
            />
          </span>
          <span className={s.rowValue}>{step.kind === 'total' ? format(step.value) : `${step.value >= 0 ? '+' : ''}${format(step.value)}`}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Tables ----

export function TransactionList({
  rows,
  format,
}: {
  rows: { time: string; what: string; category: string; amount: number; unplanned: boolean; income: boolean }[];
  format: (n: number) => string;
}) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Time</th>
            <th>What</th>
            <th>Category</th>
            <th className={s.right}>Amount</th>
            <th>Plan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.time}</td>
              <td>{r.what}</td>
              <td>{r.category}</td>
              <td className={s.right}>
                {r.income ? '+' : '−'}
                {format(r.amount)}
              </td>
              <td>{r.income ? '' : <span className={s.tag} data-tone={r.unplanned ? 'accent' : 'good'}>{r.unplanned ? 'Unplanned' : 'Planned'}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
