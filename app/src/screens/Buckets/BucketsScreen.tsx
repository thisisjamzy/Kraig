'use client';

// Buckets — one month's buckets, one flow type at a time: Income,
// Expenses, Savings and Transfers each on their own tab, never mixed.
//
// Phone: the money plan card and the month's figures per type (from the
// shared totals, so savings read as positive amounts set aside and
// "available" is money actually received), whether the must-haves are
// covered, what's coming in, then the type tabs with the bucket cards.
//
// Medium screens and up: a Notion-style page — breadcrumb, title, the
// month and the bucket count per type as properties, then the type tabs,
// each a database of that type's buckets (Table or Cards). The month's
// summary lives on the Budget page, which this page links to.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Archive, ChevronLeft, ChevronRight, LayoutGrid, MoreHorizontal, Pencil, TrendingUp } from 'lucide-react';
import { useLogic, type BucketRow, type BucketsLogic } from '@/src/logic/buckets/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { FLOW_LABEL, FLOW_TYPES, INCOME_SUBTYPE_LABEL, type FlowType } from '@/src/shared/budget/flow';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { useBreadcrumb } from '@/src/widgets/AppShell/breadcrumb';
import { Database } from '@/src/widgets/Database/Database';
import { NotionPageHeader } from '@/src/widgets/Database/NotionPage';
import { PropertiesBlock } from '@/src/widgets/Database/PropertiesBlock';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { BucketCardView } from '@/src/screens/Planning/BucketCardView';
import { FLOW_ICON } from '@/src/screens/BudgetMonth/BudgetMonthPage';
import planning from '@/src/screens/Planning/Planning.module.css';
import { Card, Chip, Figure, full } from '@/src/screens/Plans/parts';
import styles from '@/src/screens/Plans/Plans.module.css';
import bm from '@/src/screens/BudgetMonth/BudgetMonth.module.css';
import phone from './BucketsScreen.module.css';

// Kept here for the screens that already import it from this file.
export { formatAmount } from '@/src/viewmodels/format';

export function BucketsScreen() {
  const v = useLogic();
  const inShell = useHasTopBar();
  if (inShell) return <BucketsPage v={v} />;
  return <BucketsPhone v={v} />;
}

// ---------------------------------------------------------------------------
// Phone

function BucketsPhone({ v }: { v: BucketsLogic }) {
  const router = useRouter();
  const swipeRef = useSwipeModeSwitch('money');
  const rows = v.byType[v.flow].filter((r) => r.itemCount > 0 || !r.archived);
  return (
    <div className={styles.page} ref={swipeRef}>
      <ScreenHeader
        left={
          <Link href="/home" className={styles.roundButton} aria-label="Back to Home">
            <ArrowLeft size={20} strokeWidth={2} />
          </Link>
        }
        title="Buckets"
        right={
          <ActionMenu
            ariaLabel="More"
            triggerClassName={styles.roundButton}
            triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
            items={[
              { key: 'archived', label: 'Archived buckets', icon: <Archive size={14} strokeWidth={2} />, onSelect: () => router.push('/settings/archived-buckets') },
              { key: 'plan', label: 'Edit plan', icon: <Pencil size={14} strokeWidth={2} />, onSelect: () => router.push(`/budget?month=${v.month}`) },
              { key: 'forecast', label: 'Plans forecast', icon: <TrendingUp size={14} strokeWidth={2} />, onSelect: () => router.push('/buckets/forecast') },
            ]}
          />
        }
      />
      <ScreenState loading={v.loading} />
      {!v.loading && (
        <>
          <MoneyPlanCard v={v} />
          <PlanCards v={v} />
          <MustCard v={v} />
          <IncomeCard v={v} />
          <div className={planning.tokens}>
            <TypeTabs v={v} />
          </div>
          {rows.length ? (
            <div className={planning.tokens} style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="tabpanel" aria-label={FLOW_LABEL[v.flow]}>
              {rows.map((row) => (
                <BucketCardView key={row.id} card={row.card} currency={v.currency} month={v.month} extras={extrasOf(row, v)} flow={row.type} />
              ))}
            </div>
          ) : (
            <p className={styles.muted}>No {FLOW_LABEL[v.flow].toLowerCase()} buckets yet.</p>
          )}
        </>
      )}
    </div>
  );
}

function extrasOf(row: BucketRow, v: BucketsLogic) {
  const s = row.summary;
  if (!s) return undefined;
  return {
    line: s.line,
    // Need chips only on expense and savings buckets.
    topNeed: v.showsNeed(row.type) ? s.topNeed : null,
    overdue:
      v.showsNeed(row.type) && s.overdue.length
        ? { count: s.overdue.length, amount: s.overdue.reduce((sum, o) => sum + Math.max(0, o.planned - o.paid), 0), href: '/buckets/items' }
        : undefined,
  };
}

function TypeTabs({ v }: { v: BucketsLogic }) {
  return (
    <div className={phone.typeTabs} role="tablist" aria-label="Money type">
      {FLOW_TYPES.map((type) => (
        <button key={type} type="button" role="tab" aria-selected={v.flow === type} onClick={() => v.setFlow(type)}>
          {FLOW_LABEL[type]}
          <span>{v.byType[type].length}</span>
        </button>
      ))}
    </div>
  );
}

function MonthPicker({ v }: { v: BucketsLogic }) {
  return (
    <div className={styles.monthPill}>
      <button type="button" onClick={v.previousMonth} aria-label="Previous month">
        <ChevronLeft size={18} strokeWidth={2.25} />
      </button>
      <span aria-live="polite">{v.monthText}</span>
      <button type="button" onClick={v.nextMonth} aria-label="Next month">
        <ChevronRight size={18} strokeWidth={2.25} />
      </button>
    </div>
  );
}

/**
 * The month at a glance: expected income against what's planned out
 * (expenses and savings; transfers are moves, not money out), then one bar
 * from 0 to the expected income, filled to what's planned.
 */
function MoneyPlanCard({ v }: { v: BucketsLogic }) {
  const t = v.totals;
  const plannedOut = t.expenses.planned + t.savings.planned;
  const pct = t.income.expected > 0 ? Math.round((plannedOut / t.income.expected) * 100) : plannedOut > 0 ? 100 : 0;
  const over = t.leftToPlan < 0;
  return (
    <Card navy title="Money plan" chip={<MonthPicker v={v} />}>
      <div className={styles.planFigures}>
        <Figure label="Expected in" value={t.income.expected} currency={v.currency} />
        <Figure label="Planned out" value={plannedOut} currency={v.currency} />
      </div>
      {t.income.expectedBorrowed > 0 && <p className={styles.planNote}>of which {full(t.income.expectedBorrowed)} borrowed</p>}
      <div className={styles.planMeter}>
        <p className={styles.planMeterTop}>
          <span>{pct}% of income planned</span>
          <strong data-tone={over || undefined}>
            {full(Math.abs(t.leftToPlan))} {over ? 'over' : 'left to plan'}
          </strong>
        </p>
        <span className={styles.planBar} role="img" aria-label={`${pct}% of expected income planned`}>
          <span style={{ width: `${Math.min(100, pct)}%` }} data-tone={over ? 'bad' : undefined} />
        </span>
        <p className={styles.planMeterEnds} aria-hidden>
          <span>0</span>
          <span>{full(t.income.expected)} expected</span>
        </p>
      </div>
    </Card>
  );
}

/** Planned vs actual, one small card per flow type, never mixed. */
function PlanCards({ v }: { v: BucketsLogic }) {
  const t = v.totals;
  const cards: { type: FlowType; label: string; soFar: number; planned: number; foot: string; over: boolean }[] = [
    { type: 'Income', label: 'Income', soFar: t.income.received, planned: t.income.expected, foot: `${full(t.income.notYetReceived)} to come · ${full(t.income.borrowed)} borrowed`, over: false },
    { type: 'Expense', label: 'Expenses', soFar: t.expenses.spent, planned: t.expenses.planned, foot: t.expenses.left >= 0 ? `${full(t.expenses.left)} left` : `${full(-t.expenses.left)} over`, over: t.expenses.left < -0.5 },
    { type: 'Savings', label: 'Savings', soFar: t.savings.saved, planned: t.savings.planned, foot: t.savings.withdrawn ? `${full(t.savings.withdrawn)} withdrawn` : `${full(t.savings.left)} to save`, over: false },
    { type: 'Transfer', label: 'Transfers', soFar: t.transfers.moved, planned: t.transfers.planned, foot: `${full(t.transfers.left)} to move`, over: false },
  ];
  return (
    <section aria-label="Planned vs actual">
      <h2 className={styles.railTitle}>Planned vs actual</h2>
      <div className={styles.rail}>
        {cards.map((c) => {
          const pct = c.planned > 0 ? Math.min(100, (c.soFar / c.planned) * 100) : 0;
          return (
            <button key={c.type} type="button" className={styles.kindCard} onClick={() => v.setFlow(c.type)}>
              <span className={styles.kindHead}>
                <span>{c.label}</span>
                {c.over && <Chip tone="bad">Over</Chip>}
              </span>
              <strong className={styles.kindValue}>
                {full(c.soFar)}
                <small>of {full(c.planned)}</small>
              </strong>
              <span className={styles.thinBar}>
                <span style={{ width: `${pct}%` }} data-tone={c.over ? 'bad' : undefined} />
              </span>
              <span className={styles.kindFoot} data-tone={c.over || undefined}>
                {c.foot}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Must-haves against money actually available (never expected income). */
function MustCard({ v }: { v: BucketsLogic }) {
  const m = v.must;
  if (!m.count) return null;
  const chip = m.status === 'short' ? <Chip tone="bad">Short</Chip> : m.status === 'waiting' ? <Chip tone="watch">Waiting on income</Chip> : <Chip tone="good">Covered</Chip>;
  return (
    <Card title="Must-haves" chip={chip} action={{ label: 'Open priorities', href: '/buckets/items' }}>
      <div className={styles.figureGrid} data-cols="3">
        <Figure label="Available now" value={m.availableNow} />
        <Figure label="Still due" value={m.due} />
        <Figure label={m.spareNow >= 0 ? 'Spare' : 'Short now'} value={Math.abs(m.spareNow)} tone={m.spareNow < 0 ? 'bad' : undefined} />
      </div>
      {m.spareNow < 0 && (
        <p className={styles.muted}>
          {m.status === 'waiting' ? `Covered once expected income arrives: ${full(m.spareByMonthEnd)} spare by month end (estimate).` : `${full(-m.spareByMonthEnd)} short even by month end.`}
        </p>
      )}
    </Card>
  );
}

function IncomeCard({ v }: { v: BucketsLogic }) {
  const income = v.lines.Income;
  const t = v.totals.income;
  return (
    <Card title="Coming in" chip={income.length ? <span className={styles.headFigure}>{full(t.received)} / {full(t.expected)}</span> : undefined}>
      {income.length ? (
        <ul className={styles.incomeList}>
          {income.map((i) => (
            <li key={i.key}>
              <span>
                <strong>{i.name}</strong>
                <span className={styles.muted}>
                  {i.due ? i.due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No date'}
                  {i.incomeSubtype && i.incomeSubtype !== 'earned' ? ` · ${INCOME_SUBTYPE_LABEL[i.incomeSubtype]}` : ''}
                </span>
              </span>
              <strong>{full(i.planned)}</strong>
              <Chip tone={i.state === 'Received' ? 'good' : i.state === 'Late' ? 'bad' : 'neutral'}>{i.state}</Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No income planned.</p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Medium screens and up

function bucketColumns(type: FlowType): ColumnDef<BucketRow>[] {
  const actual = type === 'Income' ? 'Received' : type === 'Savings' ? 'Saved' : type === 'Transfer' ? 'Moved' : 'Spent';
  return [
    {
      id: 'name',
      label: 'Name',
      type: 'text',
      width: 260,
      value: (r) => r.name,
      render: (r) => (
        <Link className={bm.relation} href={`/budget/bucket/${r.id}`}>
          {r.name}
          {r.archived ? ' (archived)' : ''}
        </Link>
      ),
    },
    { id: 'items', label: 'Items', type: 'number', width: 80, value: (r) => r.itemCount, calc: 'sum' },
    { id: 'planned', label: type === 'Income' ? 'Expected' : 'Planned', type: 'currency', width: 130, value: (r) => r.planned, calc: 'sum' },
    { id: 'actual', label: actual, type: 'currency', width: 130, value: (r) => r.actual, calc: 'sum', tone: (r) => (type !== 'Income' && r.actual > r.planned + 0.5 ? 'bad' : undefined) },
    { id: 'left', label: type === 'Income' ? 'To come' : 'Left', type: 'currency', width: 130, value: (r) => (type === 'Income' ? Math.max(0, r.left) : r.left), calc: 'sum', tone: (r) => (type !== 'Income' && r.left < -0.5 ? 'bad' : undefined) },
    { id: 'progress', label: 'Progress', type: 'progress', width: 160, value: (r) => r.progress, noQuery: true },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      width: 150,
      value: (r) => r.status,
      options: [...new Set(['On track', 'Expected', 'Paid', 'Received', 'Saved', 'Moved', 'Overdue', 'Late', 'Over plan', 'Leftover', 'Nothing this month'])].map((s) => ({ value: s, label: s })),
      render: (r) => (
        <span className={bm.chip} data-tone={r.statusTone}>
          {r.status}
        </span>
      ),
    },
    { id: 'next', label: 'Next due', type: 'date', width: 130, value: (r) => r.nextDue },
  ];
}

function BucketsPage({ v }: { v: BucketsLogic }) {
  const router = useRouter();
  useBreadcrumb([{ label: 'Money', href: '/home' }, { label: 'Buckets' }]);
  if (v.loading) return <ScreenState loading />;
  const rows = v.byType[v.flow];
  return (
    <div className={bm.page}>
      <NotionPageHeader
        icon={<LayoutGrid size={24} strokeWidth={2} />}
        title="Buckets"
        kind="Each bucket holds one type of money"
        actions={
          <>
            <ActionMenu
              ariaLabel="More"
              triggerClassName={bm.iconLink}
              triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
              items={[
                { key: 'archived', label: 'Archived buckets', icon: <Archive size={14} strokeWidth={2} />, onSelect: () => router.push('/settings/archived-buckets') },
                { key: 'forecast', label: 'Plans forecast', icon: <TrendingUp size={14} strokeWidth={2} />, onSelect: () => router.push('/buckets/forecast') },
              ]}
            />
            <Link href={`/buckets/new?type=${v.flow}`} className={bm.primaryButton}>
              New {FLOW_LABEL[v.flow].toLowerCase()} bucket
            </Link>
          </>
        }
      >
        <PropertiesBlock
          properties={[
            {
              id: 'month',
              label: 'Month',
              display: (
                <span className={bm.inlineGroup}>
                  <button type="button" className={bm.iconLink} onClick={v.previousMonth} aria-label="Previous month">
                    <ChevronLeft size={16} strokeWidth={2.25} />
                  </button>
                  <strong>{v.monthText}</strong>
                  <button type="button" className={bm.iconLink} onClick={v.nextMonth} aria-label="Next month">
                    <ChevronRight size={16} strokeWidth={2.25} />
                  </button>
                </span>
              ),
            },
            {
              id: 'count',
              label: 'Buckets',
              display: FLOW_TYPES.map((t) => `${v.byType[t].length} ${FLOW_LABEL[t].toLowerCase()}`).join(' · '),
            },
            {
              id: 'summary',
              label: 'Month summary',
              display: (
                <Link href={`/budget?month=${v.month}`} className={bm.relation}>
                  Left to plan {formatNumber(v.totals.leftToPlan)} {v.currency} · available now {formatNumber(v.totals.availableNow)} {v.currency}
                </Link>
              ),
            },
          ]}
        />
      </NotionPageHeader>

      <div className={bm.typeTabs} role="tablist" aria-label="Money type">
        {FLOW_TYPES.map((type) => {
          const Icon = FLOW_ICON[type];
          return (
            <button key={type} type="button" role="tab" aria-selected={v.flow === type} className={bm.typeTab} onClick={() => v.setFlow(type)}>
              <Icon size={18} strokeWidth={2.25} aria-hidden />
              {FLOW_LABEL[type]}
              <span className={bm.typeCount}>{v.byType[type].length}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={FLOW_LABEL[v.flow]} className={planning.tokens}>
        <Database<BucketRow>
          key={v.flow}
          id={`buckets.${v.flow.toLowerCase()}`}
          label={`${FLOW_LABEL[v.flow]} buckets`}
          noun={['bucket', 'buckets']}
          rows={rows}
          rowKey={(r) => r.id}
          columns={bucketColumns(v.flow)}
          defaultView="cards"
          presets={[{ id: 'attention', name: 'Needs attention', layout: 'table', filter: (r) => r.statusTone === 'bad' || r.statusTone === 'watch' }]}
          groups={[{ id: 'status', label: 'Status', key: (r) => ({ key: r.status, label: r.status }) }]}
          defaultGroup="none"
          card={{
            title: (r) => r.name,
            render: (r) => <BucketCardView card={r.card} currency={v.currency} month={v.month} extras={extrasOf(r, v)} flow={r.type} />,
          }}
          onOpen={(r) => router.push(`/budget/bucket/${r.id}?month=${v.month}`)}
          onNew={() => router.push(`/buckets/new?type=${v.flow}`)}
          newLabel="New bucket"
          emptyText={`No ${FLOW_LABEL[v.flow].toLowerCase()} buckets yet.`}
        />
      </div>
    </div>
  );
}
