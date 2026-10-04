'use client';

// Plan and forecast's chart: the running balance from today to the end of
// the horizon (daily for two months, weekly after), blue above the cushion,
// amber below it and red below zero, with the cushion as a dashed line;
// under it, each month's expected income beside a stack of fixed, flexible
// and nice-to-have, and savings (transfers never: their fees sit in
// expenses). While a card is dragged over a month, the balance with the
// move is solid and the plan as it stands is a faint dashed "before" line.
// Clicking a month's bars scrolls the board to it. "Show table" lists the
// same figures.

import { useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartPoints, type EngineDay, type EngineResult } from '@/src/viewmodels/plans/engine';
import { monthWord } from '@/src/viewmodels/plans/allocate';
import { formatMoney } from '@/src/widgets/Money/Money';
import styles from './PlanBoard.module.css';

const BLUE = '#3965fa';
const AMBER = '#c27c0e';
const RED = '#d6404f';
const NAVY = '#1f2a5c';
const LIGHT_NAVY = '#8d97c4';
const GREEN = '#448361';

const short = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const axis = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

/** The chart's two sentences: the tightest point, then the trend. */
export function chartCaption(result: EngineResult, cushion: number): string {
  if (!result.days.length) return '';
  const low = result.lowest;
  const first = result.days[0].balance;
  const last = result.days[result.days.length - 1].balance;
  const tight =
    low.balance < 0
      ? `The tightest point is ${formatMoney(low.balance)} on ${short(low.date)}, below zero.`
      : low.balance < cushion
        ? `The tightest point is ${formatMoney(low.balance)} on ${short(low.date)}, ${formatMoney(cushion - low.balance)} under your cushion.`
        : `The tightest point is ${formatMoney(low.balance)} on ${short(low.date)}, ${formatMoney(low.balance - cushion)} above your cushion.`;
  const diff = last - first;
  const trend = Math.abs(diff) < 1 ? 'The balance ends where it starts.' : `The balance ${diff > 0 ? 'grows' : 'shrinks'} by ${formatMoney(Math.abs(diff))} over the period.`;
  return `${tight} ${trend}`;
}

interface Point {
  key: string;
  date: Date;
  label: string;
  balance: number;
  before: number | null;
  events: EngineDay['events'];
}

export function ForecastChart({
  result,
  before,
  cushion,
  compact,
  onMonth,
}: {
  result: EngineResult;
  /** The plan as it stands, while a drag previews a move. */
  before: EngineResult | null;
  cushion: number;
  /** Phone: monthly points, 240px. */
  compact: boolean;
  onMonth: (month: string) => void;
}) {
  const [table, setTable] = useState(false);
  const points = useMemo<Point[]>(() => {
    const days = compact ? result.days.filter((d, i) => d.date.getDate() === 1 || i === 0 || i === result.days.length - 1 || d.date.getDate() === 15) : chartPoints(result.days);
    const beforeByKey = before ? new Map(before.days.map((d) => [d.key, d.balance])) : null;
    return days.map((d) => ({ key: d.key, date: d.date, label: short(d.date), balance: d.balance, before: beforeByKey?.get(d.key) ?? null, events: d.events }));
  }, [result, before, compact]);

  // Blue above the cushion, amber between it and zero, red below zero.
  const values = points.flatMap((p) => [p.balance, p.before ?? p.balance]);
  const max = Math.max(cushion, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const at = (v: number) => `${Math.max(0, Math.min(100, ((max - v) / span) * 100))}%`;

  const bars = result.months.map((m) => ({
    month: m.month,
    label: monthWord(m.month).slice(0, 3),
    income: m.income,
    fixed: m.fixed + m.fees,
    flexible: m.flexible,
    savings: m.savings,
    out: m.fixed + m.fees + m.flexible + m.savings,
  }));

  return (
    <div className={styles.chartBlock}>
      <div className={styles.chartArea} style={{ height: compact ? 240 : 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 64, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BLUE} stopOpacity={0.28} />
                <stop offset={at(cushion)} stopColor={BLUE} stopOpacity={0.12} />
                <stop offset={at(cushion)} stopColor={AMBER} stopOpacity={0.3} />
                <stop offset={at(0)} stopColor={AMBER} stopOpacity={0.3} />
                <stop offset={at(0)} stopColor={RED} stopOpacity={0.35} />
                <stop offset="100%" stopColor={RED} stopOpacity={0.35} />
              </linearGradient>
              <linearGradient id="balanceStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={at(cushion)} stopColor={BLUE} />
                <stop offset={at(cushion)} stopColor={AMBER} />
                <stop offset={at(0)} stopColor={AMBER} />
                <stop offset={at(0)} stopColor={RED} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#edf0f6" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={44} tickFormatter={axis} domain={[min, max]} />
            <Tooltip content={<DayTip cushion={cushion} />} />
            <ReferenceLine y={cushion} stroke={AMBER} strokeDasharray="5 4" label={{ value: 'Cushion', position: 'right', fontSize: 11, fill: AMBER }} />
            <ReferenceLine y={0} stroke="#c9ccd6" />
            <ReferenceLine x={points[0]?.label} stroke="#9b9a97" label={{ value: 'Today', position: 'insideTopLeft', fontSize: 10, fill: '#6b7085' }} />
            <Area type="monotone" dataKey="balance" stroke="url(#balanceStroke)" strokeWidth={2} fill="url(#balanceFill)" isAnimationActive={false} />
            {before && <Line type="monotone" dataKey="before" stroke="#6b7085" strokeOpacity={0.6} strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Before" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.chartBars} style={{ height: compact ? 120 : 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 16, right: 64, bottom: 0, left: 0 }} onClick={(e) => e?.activeLabel && onMonth(bars.find((b) => b.label === e.activeLabel)?.month ?? '')}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis hide />
            <Tooltip formatter={(n, name) => [formatMoney(Number(n ?? 0)), String(name)]} />
            <Bar dataKey="income" name="Expected income" fill={BLUE} isAnimationActive={false} label={{ position: 'top', fontSize: 10, formatter: (v: unknown) => axis(Number(v)) }} />
            <Bar dataKey="fixed" name="Fixed" stackId="out" fill={NAVY} isAnimationActive={false} />
            <Bar dataKey="flexible" name="Flexible and nice to have" stackId="out" fill={LIGHT_NAVY} isAnimationActive={false} />
            <Bar dataKey="savings" name="Savings" stackId="out" fill={GREEN} isAnimationActive={false} label={{ position: 'top', fontSize: 10, formatter: (_: unknown, __?: unknown, i?: number) => (i !== undefined ? axis(bars[i]?.out ?? 0) : '') }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className={styles.legend}>
        <li><span style={{ background: BLUE }} />Expected income</li>
        <li><span style={{ background: NAVY }} />Fixed</li>
        <li><span style={{ background: LIGHT_NAVY }} />Flexible and nice to have</li>
        <li><span style={{ background: GREEN }} />Savings</li>
        <li><span className={styles.dash} />Cushion</li>
        {before && <li><span className={styles.dash} data-grey />Before this move</li>}
      </ul>
      <p className={styles.caption}>{chartCaption(result, cushion)}</p>
      <button type="button" className={styles.textButton} onClick={() => setTable((t) => !t)} aria-expanded={table}>
        {table ? 'Hide table' : 'Show table'}
      </button>
      {table && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th>Expected income</th>
                <th>Fixed</th>
                <th>Flexible</th>
                <th>Savings</th>
                <th>Left</th>
                <th>Lowest balance</th>
                <th>Balance at month end</th>
              </tr>
            </thead>
            <tbody>
              {result.months.map((m) => (
                <tr key={m.month}>
                  <td>{monthWord(m.month)}</td>
                  <td data-num>{formatMoney(m.income)}</td>
                  <td data-num>{formatMoney(m.fixed + m.fees)}</td>
                  <td data-num>{formatMoney(m.flexible)}</td>
                  <td data-num>{formatMoney(m.savings)}</td>
                  <td data-num data-tone={m.free < 0 ? 'bad' : undefined}>{formatMoney(m.free)}</td>
                  <td data-num data-tone={m.lowest < 0 ? 'bad' : m.lowest < cushion ? 'watch' : undefined}>
                    {formatMoney(m.lowest)} <span className={styles.muted}>{short(m.lowestDate)}</span>
                  </td>
                  <td data-num>{formatMoney(m.endBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DayTip({ active, payload, cushion }: { active?: boolean; payload?: { payload: Point }[]; cushion: number }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const income = p.events.filter((e) => e.amount > 0);
  const out = p.events.filter((e) => e.amount < 0);
  const gap = p.balance - cushion;
  return (
    <div className={styles.tip}>
      <strong>{p.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
      <span>Balance {formatMoney(p.balance)}</span>
      {income.map((e) => (
        <span key={`i${e.name}`} className={styles.tipIn}>
          + {formatMoney(e.amount)} {e.name}
        </span>
      ))}
      {out.slice(0, 5).map((e) => (
        <span key={`o${e.name}`}>
          {'−'} {formatMoney(-e.amount)} {e.name}
        </span>
      ))}
      <span className={styles.muted}>{gap >= 0 ? `${formatMoney(gap)} above the cushion` : `${formatMoney(-gap)} under the cushion`}</span>
    </div>
  );
}
