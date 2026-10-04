'use client';

// Finance Insights: Needs attention (alerts strip), Snapshot (KPI tiles +
// safe to spend) and Cash flow over time.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Inbox,
  PiggyBank,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { Alert } from '@/src/phone/viewmodels/finance/insights';
import type { FinanceInsights } from '@/src/phone/logic/financeInsights/useLogic';
import { AXIS_TICK, COLORS, ChangeChip, Empty, Legend, TooltipBox, compact, full, percent, tappedIndex } from '@/src/screens/FinanceInsights/parts';
import styles from '@/src/phone/screens/FinanceInsights/FinanceInsights.module.css';

const ALERT_ICONS: Record<Alert['icon'], typeof AlertTriangle> = {
  shortfall: TrendingDown,
  pace: Clock,
  unplanned: Search,
  overspend: ShieldAlert,
  overdue: CalendarClock,
  income: TrendingDown,
  savings: PiggyBank,
  later: Search,
  unassigned: Inbox,
  growth: TrendingUp,
  clear: CheckCircle2,
};

const SEVERITY_LABEL = { red: 'Needs action', amber: 'Worth a look', blue: 'Good' };

export function AttentionStrip({ alerts }: { alerts: Alert[] }) {
  return (
    <ul className={styles.alerts} aria-label="Needs attention">
      {alerts.map((a) => {
        const Icon = ALERT_ICONS[a.icon];
        const inner = (
          <>
            <span className={styles.alertIcon} aria-hidden>
              <Icon size={18} strokeWidth={2.25} />
            </span>
            <span className={styles.alertText}>
              <span className={styles.alertLevel}>{SEVERITY_LABEL[a.severity]}</span>
              <strong>{a.headline}</strong>
              <span>{a.detail}</span>
            </span>
          </>
        );
        return (
          <li key={a.id} className={styles.alert} data-severity={a.severity}>
            {a.href.startsWith('#') ? (
              <a href={a.href} className={styles.alertLink}>
                {inner}
              </a>
            ) : (
              <Link href={a.href} className={styles.alertLink}>
                {inner}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Snapshot({ v }: { v: FinanceInsights }) {
  const t = v.totals;
  const c = v.currency;
  const tiles = [
    {
      label: 'Income',
      value: full(t.income, c),
      sub: t.projectedIncome > 0 ? `of ${full(t.projectedIncome)} projected` : 'nothing projected',
      chip: <ChangeChip value={v.changes.income} goodWhen="up" />,
    },
    {
      label: 'Expenses',
      value: full(t.expense, c),
      sub: t.plannedExpense > 0 ? `of ${full(t.plannedExpense)} planned` : 'no plan',
      chip: <ChangeChip value={v.changes.expense} goodWhen="down" />,
    },
    {
      label: 'Net cash flow',
      value: `${t.net < 0 ? '−' : ''}${full(Math.abs(t.net), c)}`,
      sub: 'income minus expenses',
      chip: <ChangeChip value={v.changes.net} goodWhen="up" />,
      tone: t.net < 0 ? 'bad' : undefined,
    },
    {
      label: 'Savings rate',
      value: percent(t.savingsRate),
      sub: `target ${percent(v.data.savingsTarget)}`,
      chip: <ChangeChip value={v.changes.savingsRate} goodWhen="up" points />,
    },
    {
      label: 'Unplanned',
      value: full(t.unplanned, c),
      sub: `${percent(t.unplannedShare)} of expenses`,
      chip: <ChangeChip value={v.changes.unplanned} goodWhen="down" />,
      tone: (t.unplannedShare ?? 0) > 0.2 ? 'bad' : undefined,
    },
    {
      label: 'Plan adherence',
      value: percent(t.adherence),
      sub: t.itemsTotal ? `${t.itemsWithin} of ${t.itemsTotal} items within plan` : 'no items planned',
      chip: <ChangeChip value={v.changes.adherence} goodWhen="up" points />,
    },
  ];
  const s = v.safe;
  return (
    <>
      <div className={styles.tiles}>
        {tiles.map((tile) => (
          <div key={tile.label} className={styles.tile} data-tone={tile.tone}>
            <span className={styles.tileLabel}>{tile.label}</span>
            <span className={styles.tileValue}>{tile.value}</span>
            <span className={styles.tileSub}>{tile.sub}</span>
            {tile.chip}
          </div>
        ))}
      </div>
      <div className={styles.safe}>
        <span className={styles.safeIcon} aria-hidden>
          <Wallet size={18} strokeWidth={2.25} />
        </span>
        <span className={styles.safeText}>
          <span className={styles.tileLabel}>Safe to spend this month</span>
          <strong>{full(s.amount, c)}</strong>
          <span className={styles.tileSub}>
            {s.amount > 0
              ? `about ${full(s.perDay, c)} a day for ${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'} · after ${full(s.upcoming)} of planned payments`
              : 'Your remaining budget is already spoken for by planned payments.'}
          </span>
        </span>
      </div>
      <p className={styles.compareNote}>Changes compare with {v.comparisonLabel}.</p>
    </>
  );
}

export function CashFlowChart({ v }: { v: FinanceInsights }) {
  const router = useRouter();
  const [ghost, setGhost] = useState(true);
  const [running, setRunning] = useState(false);
  const rows = v.flow.map((p) => ({ ...p, netPositive: p.net >= 0 ? p.net : null, netNegative: p.net < 0 ? p.net : null }));
  const empty = rows.every((r) => !r.income && !r.expense);
  if (empty) return <Empty />;
  return (
    <>
      <div className={styles.toggles}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} />
          Show planned
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} />
          Show running balance
        </label>
      </div>
      <ComposedChart
        responsive
        style={{ width: '100%', height: 230 }}
        data={rows}
        barGap={2}
        margin={{ top: 8, right: 4, bottom: 0, left: -6 }}
        onClick={(state) => {
          const i = tappedIndex(state);
          if (i !== null && rows[i]) router.push(v.historyHref());
        }}
        accessibilityLayer
      >
        <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        {/* The planned bars sit on their own hidden axis so they line up
            exactly behind the actual ones. */}
        <XAxis xAxisId="ghost" dataKey="label" hide />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
        <ReferenceLine y={0} stroke="var(--fi-light)" />
        <Tooltip
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
            if (!p) return null;
            return (
              <TooltipBox
                active={active}
                title={p.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: v.granularity === 'month' ? 'numeric' : undefined })}
                rows={[
                  { label: 'Income', value: full(p.income, v.currency), color: COLORS.income },
                  { label: 'Expenses', value: full(p.expense, v.currency), color: COLORS.expense },
                  { label: 'Net', value: full(p.net, v.currency), color: p.net >= 0 ? COLORS.good : COLORS.bad },
                  { label: 'Projected income', value: full(p.projectedIncome, v.currency) },
                  { label: 'Planned expenses', value: full(p.plannedExpense, v.currency) },
                  ...(running ? [{ label: 'Running balance', value: full(p.running, v.currency) }] : []),
                ]}
              />
            );
          }}
        />
        {ghost && <Bar xAxisId="ghost" dataKey="projectedIncome" name="Projected income" fill="transparent" stroke={COLORS.income} strokeDasharray="3 2" barSize={12} />}
        {ghost && <Bar xAxisId="ghost" dataKey="plannedExpense" name="Planned expenses" fill="transparent" stroke={COLORS.expense} strokeDasharray="3 2" barSize={12} />}
        <Bar dataKey="income" name="Income" fill={COLORS.income} radius={[4, 4, 0, 0]} barSize={12} />
        <Bar dataKey="expense" name="Expenses" fill={COLORS.expense} radius={[4, 4, 0, 0]} barSize={12} />
        <Line dataKey="netPositive" name="Net" stroke={COLORS.good} strokeWidth={2} dot={false} connectNulls={false} />
        <Line dataKey="netNegative" name="Net (negative)" stroke={COLORS.bad} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
        {running && <Line dataKey="running" name="Running balance" stroke="var(--fi-amber)" strokeWidth={2} strokeDasharray="5 3" dot={false} />}
      </ComposedChart>
      <Legend
        items={[
          { label: 'Income', color: COLORS.income },
          { label: 'Expenses', color: COLORS.expense },
          { label: 'Net (green up, red down)', color: COLORS.good, style: 'line' },
          ...(ghost ? [{ label: 'Planned (outline)', color: COLORS.expense, style: 'outline' as const }] : []),
          ...(running ? [{ label: 'Running balance', color: 'var(--fi-amber)', style: 'dashed' as const }] : []),
        ]}
      />
    </>
  );
}
