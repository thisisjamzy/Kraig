'use client';

// Buckets — one month's buckets as a page, on every screen size: the title
// "Buckets", properties (Month as a dropdown, how many buckets of each
// type), then one database whose only tabs are the types (a bucket holds
// one type). Default view: Cards — square cards showing the properties
// chosen in View settings (name, items, need, actual of planned, progress,
// available, next due) and the one action the bucket needs along the
// bottom. One "New" button, for the current type. Each bucket opens its
// own page.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { useLogic, type BucketRow } from '@/src/logic/buckets/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { FLOW_LABEL, FLOW_NOUN, FLOW_TYPES, type FlowType } from '@/src/shared/budget/flow';
import { Database } from '@/src/widgets/Database/Database';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { MonthPicker } from '@/src/widgets/Database/MonthPicker';
import { TypeTabs } from '@/src/widgets/Database/TypeTabs';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { FLOW_ICON } from '@/src/screens/BudgetMonth/BudgetMonthPage';
import { coverHref, reallocateHref } from '@/src/screens/Planning/PlanningParts';
import bm from '@/src/screens/BudgetMonth/BudgetMonth.module.css';
import styles from './BucketsScreen.module.css';

// Kept here for the screens that already import it from this file.
export { formatAmount } from '@/src/viewmodels/format';

const STATUSES = ['On track', 'Expected', 'Paid', 'Received', 'Saved', 'Moved', 'Overdue', 'Late', 'Over plan', 'Leftover', 'Nothing this month'];

function bucketColumns(type: FlowType, month: string): ColumnDef<BucketRow>[] {
  const actual = type === 'Income' ? 'Received' : type === 'Savings' ? 'Saved' : type === 'Transfer' ? 'Moved' : 'Spent';
  const need = type === 'Expense' || type === 'Savings';
  return [
    {
      id: 'name',
      label: 'Name',
      type: 'text',
      width: 260,
      value: (r) => r.name,
      render: (r) => (
        <Link className={bm.relation} href={`/budget/basket/${r.id}?month=${month}`}>
          {r.name}
          {r.archived ? ' (archived)' : ''}
        </Link>
      ),
    },
    { id: 'items', label: 'Items', type: 'number', width: 80, value: (r) => r.itemCount, calc: 'sum', onCard: true },
    ...(need
      ? [
          {
            id: 'need',
            label: 'Need',
            type: 'select' as const,
            width: 120,
            onCard: true,
            value: (r: BucketRow) => r.summary?.topNeed ?? null,
            options: [
              { value: 'must', label: 'Must have' },
              { value: 'nice', label: 'Nice to have' },
            ],
          },
        ]
      : []),
    {
      id: 'progressText',
      label: `${actual} of planned`,
      type: 'text',
      width: 200,
      onCard: true,
      noQuery: true,
      value: (r) => `${formatNumber(r.actual)} of ${formatNumber(r.planned)}`,
      render: (r) => (
        <span className={styles.figure}>
          {formatNumber(r.actual)} <span>of {formatNumber(r.planned)}</span>
        </span>
      ),
    },
    { id: 'planned', label: type === 'Income' ? 'Expected' : 'Planned', type: 'currency', width: 130, value: (r) => r.planned, calc: 'sum', hidden: true },
    { id: 'actual', label: actual, type: 'currency', width: 130, value: (r) => r.actual, calc: 'sum', hidden: true, tone: (r) => (type !== 'Income' && r.actual > r.planned + 0.5 ? 'bad' : undefined) },
    {
      id: 'left',
      label: type === 'Income' ? 'To come' : type === 'Savings' ? 'Still to save' : type === 'Transfer' ? 'Still to move' : 'Available',
      type: 'currency',
      width: 130,
      onCard: true,
      value: (r) => (type === 'Income' ? Math.max(0, r.left) : r.left),
      calc: 'sum',
      tone: (r) => (type !== 'Income' && r.left < -0.5 ? 'bad' : undefined),
    },
    { id: 'progress', label: 'Progress', type: 'progress', width: 160, value: (r) => r.progress, noQuery: true },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      width: 150,
      onCard: true,
      value: (r) => r.status,
      options: STATUSES.map((s) => ({ value: s, label: s })),
      render: (r) => (
        <span className={bm.chip} data-tone={r.statusTone}>
          {r.status}
        </span>
      ),
    },
    { id: 'next', label: 'Next due', type: 'date', width: 130, value: (r) => r.nextDue, onCard: true },
  ];
}

export function BucketsScreen() {
  const v = useLogic();
  const router = useRouter();
  const swipeRef = useSwipeModeSwitch('money');
  const counts = FLOW_TYPES.map((t) => {
    const n = v.byType[t].length;
    const noun = t === 'Income' ? 'income' : t === 'Savings' ? 'savings' : t === 'Expense' ? (n === 1 ? 'expense' : 'expenses') : n === 1 ? 'transfer' : 'transfers';
    return `${n} ${noun}`;
  }).join(', ');

  const tabs = (
    <TypeTabs
      label="Money type"
      value={v.flow}
      onChange={v.setFlow}
      tabs={FLOW_TYPES.map((t) => ({ key: t, label: FLOW_LABEL[t], icon: FLOW_ICON[t], count: v.byType[t].length }))}
    />
  );

  return (
    <div ref={swipeRef}>
      <NotionPage
        title="Baskets"
        icon={<LayoutGrid strokeWidth={1.75} />}
        crumbs={[{ label: 'Money', href: '/home' }, { label: 'Baskets' }]}
        properties={[
          { id: 'month', label: 'Month', display: <MonthPicker value={v.month} onChange={v.setMonth} /> },
          { id: 'count', label: 'Baskets', display: counts },
          { id: 'left', label: 'Left to plan', display: `${formatNumber(v.totals.leftToPlan)} ${v.currency}`, tone: v.totals.leftToPlan < 0 ? 'bad' : 'neutral' },
          { id: 'available', label: 'Available now', display: `${formatNumber(v.totals.availableNow)} ${v.currency}`, tone: v.totals.availableNow > 0 ? 'good' : v.totals.availableNow < 0 ? 'bad' : 'neutral' },
        ]}
      >
        <Callout>
          <p>
            Left to plan {formatNumber(v.totals.leftToPlan)} {v.currency} and available now {formatNumber(v.totals.availableNow)} {v.currency}.{' '}
            <Link href={`/budget?month=${v.month}`} className={bm.relation}>
              See the month on the Budget page
            </Link>
            .
          </p>
        </Callout>
        {v.loading ? (
          <ScreenState loading />
        ) : (
          <div role="tabpanel" aria-label={FLOW_LABEL[v.flow]}>
            <Database<BucketRow>
              key={v.flow}
              id={`buckets.${v.flow.toLowerCase()}`}
              label={`${FLOW_LABEL[v.flow]} baskets`}
              noun={['basket', 'baskets']}
              tabs={tabs}
              rows={v.byType[v.flow]}
              rowKey={(r) => r.id}
              columns={bucketColumns(v.flow, v.month)}
              views={[
                { id: 'cards', name: 'Cards', layout: 'cards' },
                { id: 'table', name: 'Table', layout: 'table' },
                { id: 'attention', name: 'Needs attention', layout: 'cards', filter: (r) => r.statusTone === 'bad' || r.statusTone === 'watch' },
              ]}
              groups={[{ id: 'status', label: 'Status', key: (r) => ({ key: r.status, label: r.status }), order: STATUSES }]}
              defaultGroup="none"
              currency={v.currency}
              subtotalColumn="left"
              card={{
                title: (r) => r.name,
                progress: (r) => (r.progress === null ? null : { value: r.progress, over: r.type !== 'Income' && r.actual > r.planned + 0.5 }),
              }}
              // What a bucket needs is its status chip; the action is in its "..." menu.
              rowActions={[
                { id: 'paid', label: 'Mark overdue paid', show: (r) => Boolean(r.summary?.overdue.length) && (r.type === 'Expense' || r.type === 'Savings'), run: () => router.push('/baskets/items') },
                { id: 'cover', label: 'Cover or justify', show: (r) => r.card.prompt?.kind === 'over' || r.card.prompt?.kind === 'uncovered', run: (r) => router.push(coverHref(v.month, r.id)) },
                { id: 'reallocate', label: 'Reallocate', show: (r) => r.card.prompt?.kind === 'leftover', run: (r) => router.push(reallocateHref(v.month, r.id)) },
              ]}
              onOpen={(r) => router.push(`/budget/basket/${r.id}?month=${v.month}`)}
              onNew={() => router.push(`/baskets/new?type=${v.flow}`)}
              newLabel={`New ${FLOW_NOUN[v.flow].toLowerCase()} basket`}
              emptyText={`No ${FLOW_LABEL[v.flow].toLowerCase()} baskets yet.`}
            />
          </div>
        )}
      </NotionPage>
    </div>
  );
}
