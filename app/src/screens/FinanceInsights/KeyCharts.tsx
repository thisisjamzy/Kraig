'use client';

// Finance Insights — "Key charts": four must-see trends, each a card with
// its question as the title, a status chip, a one-line summary, then per
// visual a title, the window it covers, the chart and a caption, and "See
// details". The selected period is outlined; the current, unfinished month
// is drawn lighter ("so far"); months with nothing recorded are gaps.

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ArrowRight, CircleAlert, CircleCheck, CircleDot } from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FinanceInsights } from '@/src/logic/financeInsights/useLogic';
import type {
  BalancePoint,
  ContributionPoint,
  FlowPoint,
  IncomeConsistencyData,
  KeyChart,
  KeyInterval,
  Status,
  TrendData,
} from '@/src/viewmodels/finance/keyCharts';
import { AXIS_TICK, COLORS, Legend, TooltipBox, compact, full, percent } from './parts';
import styles from './FinanceInsights.module.css';

const STATUS: Record<Status, { label: string; icon: typeof CircleCheck }> = {
  on_track: { label: 'On track', icon: CircleCheck },
  watch: { label: 'Watch', icon: CircleDot },
  off_track: { label: 'Off track', icon: CircleAlert },
};

function StatusChip({ status }: { status: Status }) {
  const { label, icon: Icon } = STATUS[status];
  return (
    <span className={styles.statusChip} data-status={status}>
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      {label}
    </span>
  );
}

function KeyCard({ question, chart, href, children }: { question: string; chart: KeyChart; href: string; children: ReactNode }) {
  return (
    <article className={styles.keyCard} aria-label={question}>
      <header className={styles.keyHead}>
        <h3 className={styles.keyQuestion}>{question}</h3>
        <StatusChip status={chart.status} />
      </header>
      <p className={styles.keySummary}>{chart.summary}</p>
      {children}
      <Link href={href} className={styles.details}>
        See details
        <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
      </Link>
    </article>
  );
}

/** A key chart without its card (the chart block draws the header). */
function BareCard({ children }: { question: string; chart: KeyChart; href: string; children: ReactNode }) {
  return <>{children}</>;
}

function Visual({ title, windowLabel, caption, note, children }: { title: string; windowLabel: string; caption: string; note?: string | null; children: ReactNode }) {
  return (
    <figure className={styles.visual}>
      <h4 className={styles.visualTitle}>{title}</h4>
      <p className={styles.windowLabel}>{windowLabel}</p>
      {children}
      <figcaption className={styles.visualCaption}>
        {caption}
        {note ? ` ${note}` : ''}
      </figcaption>
    </figure>
  );
}

/** "Sep so far" note when the window's last interval is still running. */
function soFarNote(intervals: KeyInterval[]) {
  const current = intervals.find((i) => i.current);
  return current ? `${current.long.split(' ')[0]} isn't over yet, so these figures will change.` : null;
}

function tipTitle(iv: KeyInterval) {
  return `${iv.long}${iv.current ? ' (so far)' : ''}${iv.selected ? ' · selected' : ''}`;
}

const NO_DATA = [{ label: 'No data recorded', value: '' }];
const opacity = (iv: KeyInterval) => (iv.current ? 0.45 : 1);
const outline = (iv: KeyInterval) => (iv.selected ? { stroke: 'var(--fi-navy)', strokeWidth: 2 } : {});

export type KeyId = 'income' | 'flow' | 'trend' | 'savings';

/** The four key charts; `only` renders one chart's visuals alone, for a
 * chart block that draws its own header. */
export function KeyCharts({ v, only }: { v: FinanceInsights; only?: KeyId }) {
  const show = (id: KeyId) => !only || only === id;
  const Card = only ? BareCard : KeyCard;
  const w = v.keyWindow;
  // Axes start at the first interval with data: no run of zeros before
  // the household's history begins.
  const lead = Math.max(0, w.intervals.findIndex((i) => i.hasData));
  const fromLead = <R,>(rows: R[]) => rows.slice(lead);
  const c = v.currency;
  const k = v.keyCharts;
  const note = [w.note, soFarNote(w.intervals)].filter(Boolean).join(' ') || null;

  // ---- 1. Income consistency ----
  const ic = k.income.blocks[0].data as IncomeConsistencyData;
  const icRows = fromLead(ic.points.map((p) => ({ label: p.interval.label, income: p.income, expected: p.expected, p })));

  // ---- 2. Money in vs out ----
  const flow = (k.flow.blocks[0].data as { points: FlowPoint[] }).points;
  // Income is drawn as earned with borrowed stacked on top.
  const flowAll = flow.map((p) => ({
    label: p.interval.label,
    income: p.income,
    earned: p.income === null ? null : p.income - (p.borrowed ?? 0),
    borrowed: p.borrowed ? p.borrowed : null,
    expense: p.expense,
    net: p.net,
    top: p.income === null ? null : Math.max(p.income, p.expense ?? 0),
    p,
  }));
  const flowRows = fromLead(flowAll).map((r) => ({ ...r, showNet: false }));
  // Net labels only where they matter: the latest, highest, lowest and selected.
  {
    const withNet = flowRows.map((r, i) => ({ r, i })).filter(({ r }) => r.net !== null);
    const pick = (i: number | undefined) => {
      if (i !== undefined) flowRows[i].showNet = true;
    };
    pick(withNet.at(-1)?.i);
    pick([...withNet].sort((a, b) => b.r.net! - a.r.net!)[0]?.i);
    pick([...withNet].sort((a, b) => a.r.net! - b.r.net!)[0]?.i);
    pick(withNet.filter(({ r }) => r.p.interval.selected).at(-1)?.i);
  }
  const anyBorrowed = flowRows.some((r) => (r.borrowed ?? 0) > 0);

  // ---- 3. Trend ----
  const trend = k.trend.blocks[0].data as TrendData;
  const trendRows = fromLead(trend.points).map((p) => {
    const both = p.income !== null && p.expense !== null;
    return {
      label: p.interval.label,
      income: p.income,
      expense: p.expense,
      base: both ? Math.min(p.income!, p.expense!) : null,
      ahead: both ? Math.max(0, p.income! - p.expense!) : null,
      behind: both ? Math.max(0, p.expense! - p.income!) : null,
      p,
    };
  });
  const selectedTrend = trendRows.filter((r) => r.p.interval.selected).at(-1);

  // ---- 4. Savings ----
  const balance = (k.savings.blocks[0].data as { points: BalancePoint[] }).points;
  const contrib = k.savings.blocks[1].data as { points: ContributionPoint[]; target: number | null; rateThisMonth: number | null; cushionMonths: number | null };
  const balanceRows = fromLead(balance.map((p) => ({ label: p.interval.label, balance: p.balance, p })));
  const selectedBalance = balanceRows.filter((r) => r.p.interval.selected && r.balance !== null).at(-1);
  const contribRows = fromLead(contrib.points.map((p) => ({ label: p.interval.label, contribution: p.contribution, p })));

  const growthText = (g: number | null, name: string) =>
    g === null ? `${name}: not enough history` : `${name} ${g >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(g * 100))}% a ${w.granularity}`;

  return (
    <div className={only ? undefined : styles.keyGrid}>
      {/* 1 */}
      {show('income') && (
      <Card question="Is my income consistent?" chart={k.income} href={v.historyHref()}>
        <Visual title={k.income.blocks[0].title} windowLabel={w.label} caption={k.income.blocks[0].caption} note={note}>
          <ComposedChart responsive style={{ width: '100%', height: 210 }} data={icRows} margin={{ top: 16, right: 64, bottom: 0, left: -6 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
            {ic.average > 0 && <ReferenceArea y1={ic.low} y2={ic.high} fill="var(--fi-blue)" fillOpacity={0.08} ifOverflow="extendDomain" />}
            {ic.average > 0 && (
              <ReferenceLine
                y={ic.average}
                stroke="var(--fi-muted)"
                strokeDasharray="6 4"
                label={{ value: `avg ${compact(ic.average)}`, position: 'right', fill: 'var(--fi-muted)', fontSize: 11 }}
              />
            )}
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof icRows)[number] | undefined;
                if (!row) return null;
                return (
                  <TooltipBox
                    active={active}
                    title={tipTitle(row.p.interval)}
                    rows={
                      row.income === null
                        ? NO_DATA
                        : [
                            { label: 'Received', value: full(row.income, c), color: COLORS.income },
                            ...(row.expected !== null ? [{ label: 'Expected', value: full(row.expected, c) }] : []),
                            ...(row.p.tone ? [{ label: 'Range', value: row.p.tone === 'within' ? 'normal' : row.p.tone === 'below' ? 'below normal' : 'above normal' }] : []),
                          ]
                    }
                  />
                );
              }}
            />
            <Bar dataKey="income" name="Income" radius={[4, 4, 0, 0]} barSize={16}>
              {icRows.map((r) => (
                <Cell
                  key={r.p.interval.key}
                  fill={r.p.tone === 'below' ? COLORS.bad : r.p.tone === 'above' ? COLORS.expense : COLORS.income}
                  fillOpacity={opacity(r.p.interval)}
                  {...outline(r.p.interval)}
                />
              ))}
            </Bar>
            <Scatter
              dataKey="expected"
              name="Expected"
              shape={(props: { cx?: number; cy?: number }) =>
                props.cx === undefined || props.cy === undefined ? <g /> : <rect x={props.cx - 9} y={props.cy - 2} width={18} height={4} rx={2} fill="none" stroke="var(--fi-navy)" strokeWidth={1.5} />
              }
            />
          </ComposedChart>
          <Legend
            items={[
              { label: 'Within normal range', color: COLORS.income },
              { label: 'Below range', color: COLORS.bad },
              { label: 'Above range', color: COLORS.expense },
              ...(ic.points.some((p) => p.expected !== null) ? [{ label: 'Expected', color: COLORS.expense, style: 'outline' as const }] : []),
            ]}
          />
          {ic.rating && (
            <p className={styles.rating}>
              Consistency: <strong>{ic.rating}</strong> · {ic.outside} of {ic.judged} {w.granularity === 'quarter' ? 'quarters' : 'months'} outside the normal range
            </p>
          )}
        </Visual>
      </Card>
      )}

      {/* 2 */}
      {show('flow') && (
      <Card question="Money in vs money out" chart={k.flow} href={v.historyHref()}>
        <Visual title={k.flow.blocks[0].title} windowLabel={w.label} caption={k.flow.blocks[0].caption} note={note}>
          <ComposedChart responsive style={{ width: '100%', height: 220 }} data={flowRows} margin={{ top: 22, right: 4, bottom: 0, left: -6 }} barGap={2} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof flowRows)[number] | undefined;
                if (!row) return null;
                return (
                  <TooltipBox
                    active={active}
                    title={tipTitle(row.p.interval)}
                    rows={
                      row.net === null
                        ? NO_DATA
                        : [
                            { label: 'Income', value: full(row.income!, c), color: COLORS.income },
                            ...(row.borrowed ? [{ label: 'of which borrowed', value: full(row.borrowed, c), color: COLORS.amber }] : []),
                            { label: 'Expenses', value: full(row.expense!, c), color: COLORS.expense },
                            { label: 'Net', value: `${row.net < 0 ? '−' : '+'}${full(Math.abs(row.net), c)}`, color: row.net < 0 ? COLORS.bad : COLORS.income },
                          ]
                    }
                  />
                );
              }}
            />
            <Bar dataKey="earned" name="Income" stackId="in" radius={anyBorrowed ? undefined : [3, 3, 0, 0]} barSize={9}>
              {flowRows.map((r) => (
                <Cell key={r.p.interval.key} fill={COLORS.income} fillOpacity={opacity(r.p.interval)} {...outline(r.p.interval)} />
              ))}
            </Bar>
            {anyBorrowed && (
              <Bar dataKey="borrowed" name="Borrowed" stackId="in" radius={[3, 3, 0, 0]} barSize={9}>
                {flowRows.map((r) => (
                  <Cell key={r.p.interval.key} fill={COLORS.amber} fillOpacity={opacity(r.p.interval)} {...outline(r.p.interval)} />
                ))}
              </Bar>
            )}
            <Bar dataKey="expense" name="Expenses" radius={[3, 3, 0, 0]} barSize={9}>
              {flowRows.map((r) => (
                <Cell key={r.p.interval.key} fill={COLORS.expense} fillOpacity={opacity(r.p.interval)} {...outline(r.p.interval)} />
              ))}
            </Bar>
            {/* The net, as a small label above each pair. */}
            <Line dataKey="top" stroke="none" dot={false} activeDot={false} isAnimationActive={false} legendType="none">
              <LabelList
                dataKey="net"
                content={(props) => {
                  const { x, y, value, index } = props as { x?: number; y?: number; value?: number | null; index?: number };
                  if (x === undefined || y === undefined || value === null || value === undefined) return null;
                  if (index === undefined || !flowRows[index]?.showNet) return null;
                  return (
                    <text x={x} y={y - 6} textAnchor="middle" fontSize={9} fontWeight={700} fill={value < 0 ? 'var(--fi-red)' : 'var(--fi-blue)'}>
                      {value < 0 ? '−' : '+'}
                      {compact(Math.abs(value))}
                    </text>
                  );
                }}
              />
            </Line>
          </ComposedChart>
          <Legend
            items={[
              { label: 'Income', color: COLORS.income },
              ...(anyBorrowed ? [{ label: 'Borrowed (debt financing)', color: COLORS.amber }] : []),
              { label: 'Expenses', color: COLORS.expense },
              { label: 'Net (red = deficit)', color: COLORS.bad, style: 'line' as const },
            ]}
          />
        </Visual>
      </Card>
      )}

      {/* 3 */}
      {show('trend') && (
      <Card question="Where are income and expenses heading?" chart={k.trend} href={v.historyHref()}>
        <Visual title={k.trend.blocks[0].title} windowLabel={w.label} caption={k.trend.blocks[0].caption} note={note}>
          <label className={styles.toggle}>
            <input type="checkbox" checked={v.smooth} onChange={(e) => v.setSmooth(e.target.checked)} />
            Smooth (3-month average)
          </label>
          <ComposedChart responsive style={{ width: '100%', height: 210 }} data={trendRows} margin={{ top: 8, right: 8, bottom: 0, left: -6 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof trendRows)[number] | undefined;
                if (!row) return null;
                return (
                  <TooltipBox
                    active={active}
                    title={tipTitle(row.p.interval)}
                    rows={
                      row.income === null
                        ? NO_DATA
                        : [
                            { label: v.smooth ? 'Income (avg)' : 'Income', value: full(row.income, c), color: COLORS.income },
                            { label: v.smooth ? 'Expenses (avg)' : 'Expenses', value: full(row.expense!, c), color: COLORS.expense },
                          ]
                    }
                  />
                );
              }}
            />
            {/* Shade between the lines: blue where income leads, red where expenses do. */}
            <Area dataKey="base" stackId="gap" stroke="none" fill="none" isAnimationActive={false} legendType="none" connectNulls={false} />
            <Area dataKey="ahead" stackId="gap" stroke="none" fill="var(--fi-blue)" fillOpacity={0.12} isAnimationActive={false} legendType="none" connectNulls={false} />
            <Area dataKey="behind" stackId="gap" stroke="none" fill="var(--fi-red)" fillOpacity={0.14} isAnimationActive={false} legendType="none" connectNulls={false} />
            <Line dataKey="income" name="Income" stroke={COLORS.income} strokeWidth={2.5} dot={false} connectNulls={false} />
            <Line dataKey="expense" name="Expenses" stroke={COLORS.expense} strokeWidth={2.5} dot={false} connectNulls={false} />
            {selectedTrend && selectedTrend.income !== null && <ReferenceDot x={selectedTrend.label} y={selectedTrend.income} r={4} fill={COLORS.income} stroke="#fff" />}
            {selectedTrend && selectedTrend.expense !== null && <ReferenceDot x={selectedTrend.label} y={selectedTrend.expense} r={4} fill={COLORS.expense} stroke="#fff" />}
          </ComposedChart>
          <Legend
            items={[
              { label: 'Income', color: COLORS.income, style: 'line' },
              { label: 'Expenses', color: COLORS.expense, style: 'line' },
            ]}
          />
          <div className={styles.trendFigures}>
            <span>{growthText(trend.incomeGrowth, 'Income')}</span>
            <span data-tone={trend.expenseGrowth !== null && trend.incomeGrowth !== null && trend.expenseGrowth > trend.incomeGrowth ? 'bad' : undefined}>
              {growthText(trend.expenseGrowth, 'Expenses')}
            </span>
          </div>
        </Visual>
      </Card>
      )}

      {/* 4 */}
      {show('savings') && (
      <Card question="Are my savings growing?" chart={k.savings} href="/wallets">
        <Visual title={k.savings.blocks[0].title} windowLabel={w.label} caption={k.savings.blocks[0].caption}>
          <ComposedChart responsive style={{ width: '100%', height: 180 }} data={balanceRows} margin={{ top: 18, right: 12, bottom: 0, left: -6 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof balanceRows)[number] | undefined;
                if (!row) return null;
                return <TooltipBox active={active} title={tipTitle(row.p.interval)} rows={row.balance === null ? NO_DATA : [{ label: 'Savings balance', value: full(row.balance, c), color: COLORS.expense }]} />;
              }}
            />
            <Line dataKey="balance" name="Savings balance" stroke={COLORS.expense} strokeWidth={2.5} dot={false} connectNulls={false} />
            {selectedBalance && (
              <ReferenceDot
                x={selectedBalance.label}
                y={selectedBalance.balance!}
                r={5}
                fill={COLORS.expense}
                stroke="#fff"
                label={{ value: full(selectedBalance.balance!), position: 'top', fill: 'var(--fi-navy)', fontSize: 11, fontWeight: 700 }}
              />
            )}
          </ComposedChart>
        </Visual>

        <Visual title={k.savings.blocks[1].title} windowLabel={w.label} caption={k.savings.blocks[1].caption} note={soFarNote(w.intervals)}>
          <ComposedChart responsive style={{ width: '100%', height: 180 }} data={contribRows} margin={{ top: 12, right: 72, bottom: 0, left: -6 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
            <ReferenceLine y={0} stroke="var(--fi-light)" />
            {contrib.target !== null && (
              <ReferenceLine
                y={contrib.target}
                stroke="var(--fi-green)"
                strokeDasharray="6 4"
                label={{ value: `target ${compact(contrib.target)}`, position: 'right', fill: 'var(--fi-green)', fontSize: 11 }}
              />
            )}
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof contribRows)[number] | undefined;
                if (!row) return null;
                return (
                  <TooltipBox
                    active={active}
                    title={tipTitle(row.p.interval)}
                    rows={
                      row.contribution === null
                        ? NO_DATA
                        : [
                            { label: row.contribution < 0 ? 'Withdrawn' : 'Saved', value: full(Math.abs(row.contribution), c), color: row.contribution < 0 ? COLORS.bad : COLORS.income },
                            ...(row.p.metTarget !== null ? [{ label: 'Target', value: row.p.metTarget ? 'met' : 'missed' }] : []),
                          ]
                    }
                  />
                );
              }}
            />
            <Bar dataKey="contribution" name="Contributions" barSize={14} radius={2}>
              {contribRows.map((r) => (
                <Cell
                  key={r.p.interval.key}
                  fill={(r.contribution ?? 0) < 0 ? COLORS.bad : COLORS.income}
                  fillOpacity={opacity(r.p.interval)}
                  {...outline(r.p.interval)}
                />
              ))}
            </Bar>
          </ComposedChart>
          <Legend
            items={[
              { label: 'Deposits', color: COLORS.income },
              { label: 'Withdrawals', color: COLORS.bad },
              ...(contrib.target !== null ? [{ label: 'Monthly target', color: COLORS.good, style: 'dashed' as const }] : []),
            ]}
          />
          <p className={styles.rating}>
            Savings rate this month <strong>{percent(contrib.rateThisMonth)}</strong> · Emergency cushion{' '}
            <strong>{contrib.cushionMonths === null ? 'Not enough data' : `${contrib.cushionMonths.toFixed(1)} months`}</strong>
          </p>
          <TargetEditor target={v.data.savingsTarget} onSave={v.setSavingsTarget} />
        </Visual>
      </Card>
      )}
    </div>
  );
}

/** The savings target (a share of income) — its monthly amount is the dashed line. */
function TargetEditor({ target, onSave }: { target: number; onSave: (target: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(Math.round(target * 100)));
  if (!editing) {
    return (
      <button type="button" className={styles.textButton} onClick={() => setEditing(true)}>
        Target {Math.round(target * 100)}% of income · change
      </button>
    );
  }
  return (
    <form
      className={styles.inlineForm}
      onSubmit={async (e) => {
        e.preventDefault();
        const n = Number(value);
        if (n >= 0 && n <= 100) await onSave(n / 100);
        setEditing(false);
      }}
    >
      <label>
        Savings target
        <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} aria-label="Savings target, percent of income" />%
      </label>
      <button type="submit" className={styles.primaryButton}>
        Save
      </button>
    </form>
  );
}
