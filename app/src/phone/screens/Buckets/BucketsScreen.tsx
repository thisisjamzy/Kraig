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
import { Database } from '@/src/phone/widgets/Database/Database';
import { Callout, NotionPage } from '@/src/phone/widgets/Database/NotionPage';
import { MonthPicker } from '@/src/phone/widgets/Database/MonthPicker';
import { TypeTabs } from '@/src/widgets/Database/TypeTabs';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/phone/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { FLOW_ICON } from '@/src/phone/screens/BudgetMonth/BudgetMonthPage';
import { coverHref, reallocateHref } from '@/src/phone/screens/Planning/PlanningParts';
import bm from '@/src/phone/screens/BudgetMonth/BudgetMonth.module.css';
import styles from '@/src/phone/screens/Buckets/BucketsScreen.module.css';

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
        <Link className={bm.relation} href={`/budget/bucket/${r.id}?month=${month}`}>
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

/** The one action a bucket needs, along its card's bottom edge. */
function ActionStrip({ row, month, currency }: { row: BucketRow; month: string; currency: string }) {
  const prompt = row.card.prompt;
  const overdue = row.summary?.overdue.length ?? 0;
  if (overdue && (row.type === 'Expense' || row.type === 'Savings')) {
    return (
      <Link href="/buckets/items" className={styles.strip} data-tone="bad">
        {overdue} overdue · Mark paid
      </Link>
    );
  }
  if (prompt?.kind === 'over' || prompt?.kind === 'uncovered') {
    return (
      <Link href={coverHref(month, row.id)} className={styles.strip} data-tone="bad">
        {formatNumber(prompt.amount)} {currency} over · Cover or justify
      </Link>
    );
  }
  if (prompt?.kind === 'leftover') {
    return (
      <Link href={reallocateHref(month, row.id)} className={styles.strip}>
        {formatNumber(prompt.amount)} {currency} left · Reallocate
      </Link>
    );
  }
  return null;
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
        title="Buckets"
        icon={<LayoutGrid strokeWidth={1.75} />}
        crumbs={[{ label: 'Money', href: '/home' }, { label: 'Buckets' }]}
        properties={[
          { id: 'month', label: 'Month', display: <MonthPicker value={v.month} onChange={v.setMonth} /> },
          { id: 'count', label: 'Buckets', display: counts },
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
              label={`${FLOW_LABEL[v.flow]} buckets`}
              noun={['bucket', 'buckets']}
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
                footer: (r) => <ActionStrip row={r} month={v.month} currency={v.currency} />,
              }}
              onOpen={(r) => router.push(`/budget/bucket/${r.id}?month=${v.month}`)}
              onNew={() => router.push(`/buckets/new?type=${v.flow}`)}
              newLabel={`New ${FLOW_NOUN[v.flow].toLowerCase()} bucket`}
              emptyText={`No ${FLOW_LABEL[v.flow].toLowerCase()} buckets yet.`}
            />
          </div>
        )}
      </NotionPage>
    </div>
  );
}
