'use client';

// Plan and forecast's Focus view (the default on tablet and web): one or two
// months chosen (this month and next to start). For each: starting balance,
// expected income (what's already received below it), fixed, flexible,
// savings, what's left, the lowest balance (its date below) and the balance
// at month end, side by side with a Difference column when two are chosen.
// One visual with a Chart / Table toggle: a waterfall from the starting
// balance to the month end (the last bar colored by the cushion) and a
// donut of where the money goes, or the same figures as a table. A summary
// sentence, then the board for those months only (the page passes it in).

import { useState, type ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { monthWord } from '@/src/viewmodels/plans/allocate';
import { cushionState, type EngineMonth, type EngineResult } from '@/src/viewmodels/plans/engine';
import { formatMoney } from '@/src/widgets/Money/Money';
import { signed } from './ForecastChart';
import styles from './FocusView.module.css';

const short = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

interface Figures {
  month: string;
  start: number;
  income: number;
  received: number | null;
  fixed: number;
  flexible: number;
  savings: number;
  left: number;
  lowest: number;
  lowestDate: Date;
  end: number;
}

function figuresOf(result: EngineResult, month: string, startBalance: number, received: number | null): Figures | null {
  const i = result.months.findIndex((m) => m.month === month);
  if (i < 0) return null;
  const m: EngineMonth = result.months[i];
  return {
    month,
    start: i === 0 ? startBalance : result.months[i - 1].endBalance,
    income: m.income,
    received,
    fixed: m.fixed + m.fees,
    flexible: m.flexible,
    savings: m.savings,
    left: m.free,
    lowest: m.lowest,
    lowestDate: m.lowestDate,
    end: m.endBalance,
  };
}

const ROWS: { key: keyof Figures; label: string; sub?: (f: Figures) => string | null }[] = [
  { key: 'start', label: 'Starting balance' },
  { key: 'income', label: 'Expected income', sub: (f) => (f.received !== null ? `${formatMoney(f.received)} received` : null) },
  { key: 'fixed', label: 'Fixed' },
  { key: 'flexible', label: 'Flexible' },
  { key: 'savings', label: 'Savings' },
  { key: 'left', label: 'Left' },
  { key: 'lowest', label: 'Lowest balance', sub: (f) => short(f.lowestDate) },
  { key: 'end', label: 'Balance at month end' },
];

const DONUT = [
  { key: 'fixed', label: 'Fixed', color: '#3965fa' },
  { key: 'flexible', label: 'Flexible', color: '#8aa4ff' },
  { key: 'savings', label: 'Savings', color: '#1f9d6b' },
  { key: 'left', label: 'Left', color: '#d9dde8' },
] as const;

export function FocusView({
  result,
  months,
  current,
  startBalance,
  receivedThisMonth,
  cushion,
  board,
}: {
  result: EngineResult;
  months: string[];
  current: string;
  startBalance: number;
  receivedThisMonth: number;
  cushion: number;
  /** The month board for the chosen months (and the backlog beside it). */
  board: (chosen: string[]) => ReactNode;
}) {
  const next = months.find((m) => m > current) ?? null;
  const [chosen, setChosen] = useState<string[]>(next ? [current, next] : [current]);
  const [visual, setVisual] = useState<'chart' | 'table'>('chart');

  function toggle(m: string) {
    setChosen((c) => {
      if (c.includes(m)) return c.length > 1 ? c.filter((x) => x !== m) : c;
      return [...(c.length >= 2 ? c.slice(1) : c), m].sort();
    });
  }

  const figs = chosen.map((m) => figuresOf(result, m, startBalance, m === current ? receivedThisMonth : null)).filter(Boolean) as Figures[];
  const two = figs.length === 2;
  const lead = figs[figs.length - 1];

  return (
    <section className={styles.focus} aria-label="Focus">
      <div className={styles.picker} role="group" aria-label="Months to focus on (one or two)">
        {months.map((m) => (
          <button key={m} type="button" className={styles.month} aria-pressed={chosen.includes(m)} onClick={() => toggle(m)}>
            {monthWord(m)}
          </button>
        ))}
      </div>

      <table className={styles.figures}>
        <thead>
          <tr>
            <th />
            {figs.map((f) => (
              <th key={f.month} data-num>
                {monthWord(f.month)}
              </th>
            ))}
            {two && <th data-num>Difference</th>}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {figs.map((f) => {
                const n = f[row.key] as number;
                const tone = row.key === 'lowest' || row.key === 'end' ? cushionState(n, cushion) : n < 0 ? 'below' : null;
                return (
                  <td key={f.month} data-num data-tone={tone === 'below' ? 'bad' : tone === 'close' ? 'watch' : undefined}>
                    {signed(n)}
                    {row.sub?.(f) && <span className={styles.sub}>{row.sub(f)}</span>}
                  </td>
                );
              })}
              {two && <td data-num>{signed((figs[1][row.key] as number) - (figs[0][row.key] as number))}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.visualHead}>
        <span className={styles.segmented} role="radiogroup" aria-label="Show as">
          <button type="button" role="radio" aria-checked={visual === 'chart'} onClick={() => setVisual('chart')}>
            Chart
          </button>
          <button type="button" role="radio" aria-checked={visual === 'table'} onClick={() => setVisual('table')}>
            Table
          </button>
        </span>
      </div>

      {visual === 'chart' ? (
        <div className={styles.charts}>
          {figs.map((f) => (
            <div key={f.month} className={styles.chartPair}>
              <Waterfall f={f} cushion={cushion} />
              <Donut f={f} />
            </div>
          ))}
        </div>
      ) : (
        <table className={styles.figures}>
          <thead>
            <tr>
              <th>Month</th>
              <th data-num>Expected income</th>
              <th data-num>Fixed</th>
              <th data-num>Flexible</th>
              <th data-num>Savings</th>
              <th data-num>Left</th>
              <th data-num>Lowest balance</th>
              <th>Lowest on</th>
              <th data-num>Balance at month end</th>
            </tr>
          </thead>
          <tbody>
            {figs.map((f) => (
              <tr key={f.month}>
                <th scope="row">{monthWord(f.month)}</th>
                <td data-num>{signed(f.income)}</td>
                <td data-num>{signed(f.fixed)}</td>
                <td data-num>{signed(f.flexible)}</td>
                <td data-num>{signed(f.savings)}</td>
                <td data-num data-tone={f.left < 0 ? 'bad' : undefined}>{signed(f.left)}</td>
                <td data-num>{signed(f.lowest)}</td>
                <td>{short(f.lowestDate)}</td>
                <td data-num>{signed(f.end)}</td>
              </tr>
            ))}
            {two && (
              <tr>
                <th scope="row">Difference</th>
                {(['income', 'fixed', 'flexible', 'savings', 'left', 'lowest'] as const).map((k) => (
                  <td key={k} data-num>
                    {signed(figs[1][k] - figs[0][k])}
                  </td>
                ))}
                <td />
                <td data-num>{signed(figs[1].end - figs[0].end)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {lead && (
        <p className={styles.summary}>
          {monthWord(lead.month)} leaves {signed(lead.left)} after everything planned; your lowest point is {signed(lead.lowest)} on {short(lead.lowestDate)}.
        </p>
      )}

      {board(chosen)}
    </section>
  );
}

/** Starting balance, +income, minus fixed, flexible and savings, ending balance. */
function Waterfall({ f, cushion }: { f: Figures; cushion: number }) {
  const steps = [
    { label: 'Start', from: 0, to: f.start, kind: 'total' as const },
    { label: 'Income', from: f.start, to: f.start + f.income, kind: 'up' as const },
    { label: 'Fixed', from: f.start + f.income, to: f.start + f.income - f.fixed, kind: 'down' as const },
    { label: 'Flexible', from: f.start + f.income - f.fixed, to: f.start + f.income - f.fixed - f.flexible, kind: 'down' as const },
    { label: 'Savings', from: f.start + f.income - f.fixed - f.flexible, to: f.end, kind: 'down' as const },
    { label: 'End', from: 0, to: f.end, kind: 'total' as const },
  ];
  const values = steps.flatMap((s) => [s.from, s.to]);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const W = 320;
  const H = 160;
  const barW = W / steps.length - 12;
  const y = (v: number) => ((max - v) / (max - min)) * (H - 20) + 4;
  const endState = cushionState(f.end, cushion);
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>{monthWord(f.month)}: start to month end</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Waterfall for ${monthWord(f.month)}: from ${formatMoney(f.start)} to ${formatMoney(f.end)}`}>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} className={styles.zero} />
        {steps.map((s, i) => {
          const top = y(Math.max(s.from, s.to));
          const height = Math.max(1, Math.abs(y(s.from) - y(s.to)));
          const tone = s.label === 'End' ? endState : s.kind;
          return (
            <g key={s.label}>
              <rect x={i * (W / steps.length) + 6} y={top} width={barW} height={height} className={styles.bar} data-kind={tone} rx="2" />
              <text x={i * (W / steps.length) + 6 + barW / 2} y={H + 14} textAnchor="middle" className={styles.axis}>
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function Donut({ f }: { f: Figures }) {
  const data = DONUT.map((d) => ({ name: d.label, value: Math.max(0, f[d.key]), color: d.color })).filter((d) => d.value > 0);
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>Where the money goes</figcaption>
      <div className={styles.donut}>
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={1} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatMoney(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
        <ul className={styles.legend}>
          {data.map((d) => (
            <li key={d.name}>
              <span className={styles.swatch} style={{ background: d.color }} aria-hidden />
              {d.name} {formatMoney(d.value)}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
