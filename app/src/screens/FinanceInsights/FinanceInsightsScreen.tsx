'use client';

// Insights (Money) — a Notion-style dashboard on every screen size: the
// title "Insights", properties (Period, Showing, Compare to, Last
// updated), a callout with what needs attention ("Everything looks on
// track." when nothing does), then chart blocks in a staggered grid (1, 2
// or 3 columns by width). Each block asks a question, with a status chip,
// a one-line summary, its visual, a caption and "Show table". Blocks can
// be widened, hidden (restored from the page's "Show hidden blocks") and
// dragged into a new order; all remembered on this device.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, PieChart } from 'lucide-react';
import { useLogic, type FinanceInsights } from '@/src/logic/financeInsights/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { useSyncStatus } from '@/src/shared/hooks/useSyncStatus';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { ChartBlock, type BlockStatus, type BlockTable } from '@/src/widgets/Database/ChartBlock';
import { MasonryGrid } from '@/src/widgets/Database/MasonryGrid';
import {
  cashFlowTakeaway,
  forecastTakeaway,
  habitsTakeaway,
  incomeTakeaway,
  moneyTakeaway,
  snapshotTakeaway,
  unplannedTakeaway,
} from '@/src/viewmodels/finance/insights';
import type { BalancePoint, FlowPoint, IncomeConsistencyData, KeyChart, TrendData } from '@/src/viewmodels/finance/keyCharts';
import type { RangeKind } from '@/src/viewmodels/finance/ranges';
import { CashFlowChart, Snapshot } from './OverviewSections';
import { PlanVsActual, UnplannedSection } from './PlanSections';
import { ForecastSection } from './ForecastSection';
import { HabitsSection, IncomeSection, MoneySection } from './DetailSections';
import { KeyCharts } from './KeyCharts';
import styles from './FinanceInsights.module.css';
import bm from '@/src/screens/BudgetMonth/BudgetMonth.module.css';

const RANGES: { value: RangeKind; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

const LAYOUT_KEY = 'dreda.insights.blocks';
interface BlockLayout {
  order: string[];
  hidden: string[];
  wide: string[];
}
const DEFAULT_WIDE = ['flow', 'cashflow', 'plan'];

function readLayout(): BlockLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null');
    if (saved?.order) return saved;
  } catch {
    // Not remembered.
  }
  return { order: [], hidden: [], wide: DEFAULT_WIDE };
}

const STATUS_TONE: Record<KeyChart['status'], BlockStatus> = {
  on_track: { label: 'On track', tone: 'good' },
  watch: { label: 'Watch', tone: 'watch' },
  off_track: { label: 'Off track', tone: 'bad' },
};

interface Block {
  id: string;
  title: string;
  status?: BlockStatus;
  summary?: string | null;
  table?: BlockTable | null;
  body: ReactNode;
  empty?: string | null;
}

function keyTables(v: FinanceInsights) {
  const lead = Math.max(0, v.keyWindow.intervals.findIndex((i) => i.hasData));
  const k = v.keyCharts;
  const ic = k.income.blocks[0].data as IncomeConsistencyData;
  const flow = (k.flow.blocks[0].data as { points: FlowPoint[] }).points;
  const trend = k.trend.blocks[0].data as TrendData;
  const balance = (k.savings.blocks[0].data as { points: BalancePoint[] }).points;
  const n = (x: number | null) => (x === null ? '' : x);
  return {
    income: { columns: ['Period', 'Received', 'Expected'], rows: ic.points.slice(lead).map((p) => [p.interval.long, n(p.income), n(p.expected)]) },
    flow: { columns: ['Period', 'Income', 'Of which borrowed', 'Expenses', 'Net'], rows: flow.slice(lead).map((p) => [p.interval.long, n(p.income), n(p.borrowed), n(p.expense), n(p.net)]) },
    trend: { columns: ['Period', 'Income', 'Expenses'], rows: trend.points.slice(lead).map((p) => [p.interval.long, n(p.income), n(p.expense)]) },
    savings: { columns: ['Period', 'Savings balance'], rows: balance.slice(lead).map((p) => [p.interval.long, n(p.balance)]) },
  };
}

export function FinanceInsightsScreen() {
  const v = useLogic();
  const swipeRef = useSwipeModeSwitch('money');
  const sync = useSyncStatus();
  const c = v.currency;
  const [layout, setLayout] = useState<BlockLayout>({ order: [], hidden: [], wide: DEFAULT_WIDE });
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLayout(readLayout()));
    return () => cancelAnimationFrame(frame);
  }, []);
  function save(next: BlockLayout) {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
    } catch {
      // Not remembered.
    }
  }

  const blocks = useMemo<Block[]>(() => {
    if (v.loading) return [];
    const k = v.keyCharts;
    const t = keyTables(v);
    const noData = !v.data.firstMonth ? 'Add a few transactions to see this.' : null;
    const list: Block[] = [
      {
        id: 'snapshot',
        title: 'How did this period go?',
        summary: snapshotTakeaway(v.totals, c),
        table: {
          columns: ['Figure', 'This period', v.comparisonLabel],
          rows: [
            ['Income', v.totals.income, v.previous.income],
            ['Expenses', v.totals.expense, v.previous.expense],
            ['Net', v.totals.net, v.previous.net],
          ],
        },
        body: <Snapshot v={v} />,
        empty: noData,
      },
      { id: 'income', title: 'Is my income consistent?', status: STATUS_TONE[k.income.status], summary: k.income.summary, table: t.income, body: <KeyCharts v={v} only="income" />, empty: noData },
      { id: 'flow', title: 'Is more coming in than going out?', status: STATUS_TONE[k.flow.status], summary: k.flow.summary, table: t.flow, body: <KeyCharts v={v} only="flow" />, empty: noData },
      { id: 'trend', title: 'Where are income and expenses heading?', status: STATUS_TONE[k.trend.status], summary: k.trend.summary, table: t.trend, body: <KeyCharts v={v} only="trend" />, empty: noData },
      { id: 'savings', title: 'Are my savings growing?', status: STATUS_TONE[k.savings.status], summary: k.savings.summary, table: t.savings, body: <KeyCharts v={v} only="savings" />, empty: noData },
      {
        id: 'cashflow',
        title: 'How did cash flow over this period?',
        summary: cashFlowTakeaway(v.flow, c),
        table: { columns: ['Period', 'Income', 'Expenses', 'Net'], rows: v.flow.map((p) => [p.label, p.income, p.expense, p.net]) },
        body: <CashFlowChart v={v} />,
        empty: v.flow.length ? null : 'No money in or out in this period.',
      },
      { id: 'plan', title: 'Am I sticking to the plan?', body: <PlanVsActual v={v} />, empty: noData },
      { id: 'unplanned', title: 'How much was unplanned?', summary: unplannedTakeaway(v.unplanned, c), body: <UnplannedSection v={v} />, empty: noData },
      { id: 'forecast', title: 'Where is this heading?', summary: forecastTakeaway(v.projection, c), body: <ForecastSection v={v} />, empty: noData },
      { id: 'money', title: 'Where does the money go?', summary: moneyTakeaway(v.money), body: <MoneySection v={v} />, empty: noData },
      { id: 'sources', title: 'Where does income come from?', summary: incomeTakeaway(v.income, c), body: <IncomeSection v={v} />, empty: noData },
      ...(v.showHabits ? [{ id: 'habits', title: 'What are my spending habits?', summary: habitsTakeaway(v.habits, c), body: <HabitsSection v={v} />, empty: noData }] : []),
    ];
    return list;
  }, [v, c]);

  const order = [...layout.order.filter((id) => blocks.some((b) => b.id === id)), ...blocks.map((b) => b.id).filter((id) => !layout.order.includes(id))];
  const shown = order.map((id) => blocks.find((b) => b.id === id)!).filter((b) => b && !layout.hidden.includes(b.id));
  const hiddenCount = blocks.filter((b) => layout.hidden.includes(b.id)).length;
  const attention = v.attention.filter((a) => a.severity === 'red' || a.severity === 'amber');
  const periods = v.recentPeriods(12);

  function move(target: string) {
    if (!dragging || dragging === target) return;
    const ids = order.filter((id) => id !== dragging);
    ids.splice(ids.indexOf(target), 0, dragging);
    save({ ...layout, order: ids });
    setDragging(null);
  }

  return (
    <div ref={swipeRef}>
      <NotionPage
        title="Insights"
        icon={<PieChart strokeWidth={1.75} />}
        crumbs={[{ label: 'Money', href: '/home' }, { label: 'Insights' }]}
        actions={
          hiddenCount > 0 ? (
            <button type="button" className={bm.ghostButton} onClick={() => save({ ...layout, hidden: [] })}>
              Show hidden blocks ({hiddenCount})
            </button>
          ) : null
        }
        properties={[
          {
            id: 'period',
            label: 'Period',
            edit: { type: 'select', value: v.kind, options: RANGES, onSave: (next) => typeof next === 'string' && v.setKind(next as RangeKind) },
          },
          v.kind === 'custom'
            ? {
                id: 'showing',
                label: 'Showing',
                display: (
                  <span className={styles.customRange}>
                    <input type="date" aria-label="From" value={v.custom.start} max={v.custom.end} onChange={(e) => e.target.value && v.setCustom({ ...v.custom, start: e.target.value })} />
                    <input type="date" aria-label="To" value={v.custom.end} min={v.custom.start} onChange={(e) => e.target.value && v.setCustom({ ...v.custom, end: e.target.value })} />
                  </span>
                ),
              }
            : {
                id: 'showing',
                label: 'Showing',
                edit: {
                  type: 'select',
                  value: v.periodLabel,
                  options: periods.map((p) => ({ value: p.label, label: p.label })),
                  onSave: (next) => {
                    const p = periods.find((x) => x.label === next);
                    if (p) v.setPeriodStart(p.start);
                  },
                },
              },
          {
            id: 'compare',
            label: 'Compare to',
            edit: {
              type: 'select',
              value: v.compareTo,
              options: [
                { value: 'previous', label: 'Previous period' },
                { value: 'lastYear', label: 'Same period last year' },
              ],
              onSave: (next) => v.setCompareTo(next === 'lastYear' ? 'lastYear' : 'previous'),
            },
          },
          { id: 'updated', label: 'Last updated', display: sync },
        ]}
      >
        {v.loading ? (
          <ScreenState loading />
        ) : (
          <>
            {attention.length ? (
              <Callout tone={attention.some((a) => a.severity === 'red') ? 'bad' : 'watch'} icon={<AlertTriangle size={18} strokeWidth={2} />}>
                <p>
                  <strong>
                    {attention.length} {attention.length === 1 ? 'thing needs' : 'things need'} attention
                  </strong>
                </p>
                <ul>
                  {attention.slice(0, 4).map((a) => (
                    <li key={a.id}>
                      {a.href.startsWith('#') ? a.headline : <Link href={a.href} className={bm.relation}>{a.headline}</Link>}. {a.detail}
                    </li>
                  ))}
                </ul>
              </Callout>
            ) : (
              <Callout tone="good" icon={<CheckCircle2 size={18} strokeWidth={2} />}>
                <p>Everything looks on track.</p>
              </Callout>
            )}
            <div className={styles.tokens}>
              <MasonryGrid
                label="Insights"
                items={shown.map((b) => ({
                  id: b.id,
                  span: layout.wide.includes(b.id) ? 2 : 1,
                  node: (
                    <ChartBlock
                      id={b.id}
                      title={b.title}
                      status={b.status}
                      summary={b.summary}
                      table={b.table}
                      empty={b.empty}
                      wide={layout.wide.includes(b.id)}
                      onToggleWide={() =>
                        save({ ...layout, wide: layout.wide.includes(b.id) ? layout.wide.filter((x) => x !== b.id) : [...layout.wide, b.id] })
                      }
                      onHide={() => save({ ...layout, hidden: [...layout.hidden, b.id] })}
                      onDragStart={setDragging}
                      onDrop={move}
                    >
                      {b.body}
                    </ChartBlock>
                  ),
                }))}
              />
            </div>
          </>
        )}
      </NotionPage>
    </div>
  );
}
