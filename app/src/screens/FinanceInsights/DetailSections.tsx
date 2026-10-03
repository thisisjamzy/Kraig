'use client';

// Finance Insights: Where the money goes, Income (by source), Daily
// habits. Savings lives in the Key charts.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { FinanceInsights } from '@/src/logic/financeInsights/useLogic';
import { AXIS_TICK, COLORS, Empty, Legend, PALETTE, Pills, TooltipBox, compact, full, percent, tappedIndex } from './parts';
import { RankList } from './PlanSections';
import styles from './FinanceInsights.module.css';

export function MoneySection({ v }: { v: FinanceInsights }) {
  const router = useRouter();
  const [by, setBy] = useState<'category' | 'bucket'>('category');
  const m = v.money;
  const c = v.currency;
  const slices = by === 'category' ? m.byCategory : m.byBucket;
  if (!slices.length) return <Empty />;
  const open = (key: string) => {
    if (key === 'other' || key === 'none') return router.push(v.historyHref());
    router.push(by === 'category' ? v.historyHref(`&category=${key}`) : v.bucketHref(key));
  };
  const fixedTotal = m.fixed + m.variable;
  return (
    <>
      <Pills
        label="Group by"
        small
        value={by}
        onChange={setBy}
        options={[
          { value: 'category', label: 'By category' },
          { value: 'bucket', label: 'By bucket' },
        ]}
      />
      <div className={styles.donutRow}>
        <PieChart style={{ width: 150, height: 150 }} responsive accessibilityLayer>
          <Pie data={slices} dataKey="amount" nameKey="label" innerRadius={46} outerRadius={70} paddingAngle={1.5} onClick={(_, i) => open(slices[i].key)}>
            {slices.map((s, i) => (
              <Cell key={s.key} fill={PALETTE[i % PALETTE.length]} cursor="pointer" />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              const s = payload?.[0]?.payload as (typeof slices)[number] | undefined;
              return s ? <TooltipBox active={active} title={s.label} rows={[{ label: 'Spent', value: full(s.amount, c) }, { label: 'Share', value: percent(s.share, 1) }]} /> : null;
            }}
          />
        </PieChart>
        <ul className={styles.donutLegend}>
          {slices.map((s, i) => (
            <li key={s.key}>
              <button type="button" onClick={() => open(s.key)}>
                <span className={styles.swatch} style={{ '--c': PALETTE[i % PALETTE.length] } as React.CSSProperties} aria-hidden />
                <span className={styles.donutLabel}>{s.label}</span>
                <span className={styles.donutValue}>
                  {full(s.amount)} <small>{percent(s.share)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className={styles.listTitle}>Fixed vs variable</p>
      <div className={styles.split} role="img" aria-label={`Fixed ${full(m.fixed, c)}, variable ${full(m.variable, c)}`}>
        <span style={{ flex: m.fixed || 0.0001 }} data-tone="navy">
          Fixed {fixedTotal ? percent(m.fixed / fixedTotal) : ''}
        </span>
        <span style={{ flex: m.variable || 0.0001 }} data-tone="blue">
          Variable {fixedTotal ? percent(m.variable / fixedTotal) : ''}
        </span>
      </div>
      <p className={styles.note}>
        Fixed {full(m.fixed, c)} (recurring planned payments) · variable {full(m.variable, c)}
      </p>

      {m.trends.length > 0 && (
        <>
          <p className={styles.listTitle}>Category trends · last 6 months</p>
          <ul className={styles.sparks}>
            {m.trends.map((t) => (
              <li key={t.key}>
                <span className={styles.sparkLabel}>{t.label}</span>
                <LineChart style={{ width: '100%', height: 36 }} responsive data={t.values.map((value, i) => ({ value, month: m.trendMonths[i] }))} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
                  <Line dataKey="value" stroke={COLORS.income} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
                <span className={styles.sparkChange} data-tone={t.change === null ? undefined : t.change > 0.1 ? 'bad' : t.change < -0.1 ? 'good' : undefined}>
                  {t.change === null ? '' : `${t.change > 0 ? '+' : ''}${Math.round(t.change * 100)}%`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={styles.twoCol}>
        <div>
          <p className={styles.listTitle}>Top payees</p>
          <RankList rows={m.payees.map((s) => ({ label: s.label, amount: s.amount, key: s.key }))} currency={c} />
        </div>
        <div>
          <p className={styles.listTitle}>Payment methods</p>
          <RankList rows={m.methods.map((s) => ({ label: `${s.label} · ${percent(s.share)}`, amount: s.amount, key: s.key }))} currency={c} />
          {m.transferFees > 0 && <p className={styles.note}>Transfer fees paid: {full(m.transferFees, c)}</p>}
        </div>
      </div>
    </>
  );
}

export function IncomeSection({ v }: { v: FinanceInsights }) {
  const i = v.income;
  const c = v.currency;
  if (!i.sources.length) return <Empty>No income recorded in this period.</Empty>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.gapTable}>
        <caption className={styles.srOnly}>Income by source</caption>
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Received</th>
            <th scope="col">Share</th>
            <th scope="col">Payments</th>
          </tr>
        </thead>
        <tbody>
          {i.sources.map((s) => (
            <tr key={s.key}>
              <th scope="row">
                {s.key === 'none' ? (
                  s.label
                ) : (
                  <Link href={v.historyHref(`&category=${s.key}`)} className={styles.tableLink}>
                    {s.label}
                  </Link>
                )}
              </th>
              <td>{full(s.received)}</td>
              <td>{percent(s.share)}</td>
              <td>{s.count}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>{full(i.total, c)}</td>
            <td colSpan={2}>{i.projected > 0 ? `of ${full(i.projected)} projected` : ''}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function HabitsSection({ v }: { v: FinanceInsights }) {
  const router = useRouter();
  const h = v.habits;
  const c = v.currency;
  if (!h.highest) return <Empty>No spending in this period yet.</Empty>;
  const max = Math.max(...h.days.map((d) => d.amount)) || 1;
  const lead = (h.days[0].date.getDay() + 6) % 7;
  return (
    <>
      <div className={styles.facts}>
        <span>
          Average a day <strong>{full(h.average, c)}</strong>
        </span>
        <span>
          Highest day
          <strong>{full(h.highest.amount, c)}</strong>
          <small>{h.highest.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</small>
        </span>
      </div>
      <div className={styles.heatmap} role="grid" aria-label="Daily spending">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className={styles.heatHead} aria-hidden>
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`pad${i}`} aria-hidden />
        ))}
        {h.days.map((d) => (
          <button
            key={d.date.toDateString()}
            type="button"
            className={styles.heatCell}
            data-unplanned={d.unplannedHeavy || undefined}
            data-future={d.future || undefined}
            style={{ '--level': d.amount > 0 ? 0.15 + (d.amount / max) * 0.85 : 0 } as React.CSSProperties}
            onClick={() => router.push(v.historyHref())}
            aria-label={`${d.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}: ${full(d.amount, c)}${d.unplannedHeavy ? ', mostly unplanned' : ''}`}
          >
            {d.date.getDate()}
          </button>
        ))}
      </div>
      <Legend
        items={[
          { label: 'Darker = more spent', color: COLORS.income },
          { label: 'Mostly unplanned', color: COLORS.bad, style: 'outline' },
        ]}
      />
      <p className={styles.listTitle}>By day of the week</p>
      <BarChart
        responsive
        style={{ width: '100%', height: 150 }}
        data={h.byWeekday}
        margin={{ top: 8, right: 4, bottom: 0, left: -6 }}
        onClick={(state) => {
          if (tappedIndex(state) !== null) router.push(v.historyHref());
        }}
        accessibilityLayer
      >
        <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
        <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
        <Tooltip content={({ active, payload, label }) => (payload?.[0] ? <TooltipBox active={active} title={String(label)} rows={[{ label: 'Spent', value: full(Number(payload[0].value), c) }]} /> : null)} />
        <Bar dataKey="amount" name="Spent" fill={COLORS.income} radius={[4, 4, 0, 0]} />
      </BarChart>
    </>
  );
}
