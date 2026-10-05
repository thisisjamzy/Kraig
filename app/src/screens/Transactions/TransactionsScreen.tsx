'use client';

// Transactions — a month's money as a page (it replaces History): the title
// "Transactions", properties (Month as a dropdown, Money in, Money out,
// Count), then one database whose only tabs are the types. Default view: a
// full-width Table grouped by day ("Thu 2 Oct" with the day's total), newest
// first; List and Cards in the view selector. Amounts are right-aligned,
// signed and coloured for their type, never cut off; account names stay on
// one line; the time shows only when one was recorded. A row opens the
// transaction in a side peek (its own page on a phone).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { useLogic, type TxRow } from '@/src/logic/transactions/useLogic';
import { FLOW_LABEL, FLOW_TYPES, type FlowType } from '@/src/shared/budget/flow';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { Database } from '@/src/widgets/Database/Database';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { MonthPicker } from '@/src/widgets/Database/MonthPicker';
import { SidePeek, usePeek } from '@/src/widgets/Database/SidePeek';
import { TypeTabs } from '@/src/widgets/Database/TypeTabs';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { FLOW_ICON } from '@/src/screens/BudgetMonth/BudgetMonthPage';
import { TransactionPeekContent } from '@/src/screens/TransactionDetails/TransactionDetailsScreen';
import styles from './Transactions.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(d: Date) {
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

function Amount({ row }: { row: TxRow }) {
  const sign = row.amount > 0 ? (row.flow === 'Transfer' ? '' : '+') : row.amount < 0 ? '−' : '';
  return (
    <span className={styles.amount} data-flow={row.flow} data-negative={row.amount < 0 || undefined} data-excluded={row.excluded || undefined}>
      {sign}
      {formatNumber(Math.abs(row.amount))}
    </span>
  );
}

/** The name; an excluded transaction greyed with its reason. */
function TxName({ row }: { row: TxRow }) {
  if (!row.excluded) return <>{row.name}</>;
  return (
    <span className={styles.excluded} title={row.excludedReason}>
      {row.name}
      <span className={styles.excludedReason}>Excluded{row.excludedReason ? `: ${row.excludedReason}` : ''}</span>
    </span>
  );
}

function dateColumn(): ColumnDef<TxRow> {
  return {
    id: 'date',
    label: 'Date',
    type: 'date',
    width: 120,
    value: (r) => r.date,
    render: (r) => (
      <span className={styles.date}>
        {r.date.getDate()} {MONTH[r.date.getMonth()]}
        {r.timeKnown && <span className={styles.time}>{r.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
      </span>
    ),
  };
}

const text = (id: keyof TxRow & string, label: string, width = 160, hidden = false): ColumnDef<TxRow> => ({
  id,
  label,
  type: 'text',
  width,
  hidden,
  value: (r) => (r[id] as string) || null,
});

function columnsFor(type: FlowType): ColumnDef<TxRow>[] {
  const name: ColumnDef<TxRow> = { id: 'name', label: 'Name', type: 'text', width: 240, value: (r) => r.name, render: (r) => <TxName row={r} /> };
  const amount: ColumnDef<TxRow> = { id: 'amount', label: 'Amount', type: 'currency', width: 140, value: (r) => r.amount, render: (r) => <Amount row={r} />, calc: 'sum' };
  // Date first (the frozen column), then Name, as the columns read.
  if (type === 'Income') return [dateColumn(), name, text('note', 'Note'), text('source', 'Source', 150), text('subtype', 'Subtype', 140), text('account', 'Account', 150), amount];
  if (type === 'Savings') return [dateColumn(), name, text('bucketName', 'Basket', 170), text('from', 'From account', 150), text('to', 'To wallet', 150), amount];
  if (type === 'Transfer')
    return [
      dateColumn(),
      name,
      text('from', 'From', 150),
      text('to', 'To', 150),
      { id: 'fee', label: 'Fee', type: 'currency', width: 110, value: (r) => r.fee || null, render: (r) => (r.fee ? formatNumber(r.fee) : null), calc: 'sum' },
      amount,
    ];
  return [dateColumn(), name, text('note', 'Note', 160, true), text('bucketName', 'Basket', 170), text('itemName', 'Item', 170), text('category', 'Category', 150), text('account', 'Account', 150), amount];
}

export function TransactionsScreen() {
  const formLink = useFormLink();
  const v = useLogic();
  const router = useRouter();
  const compact = useLayout().deviceClass === 'compact';
  const [peekRow, setPeekRow] = useState<TxRow | null>(null);
  const peek = usePeek<TxRow>((r) => r.href);
  const money = (n: number) => `${formatNumber(Math.round(n))} ${v.currency}`;

  const tabs = (
    <TypeTabs
      label="Money type"
      value={v.tab}
      onChange={v.setTab}
      tabs={FLOW_TYPES.map((t) => ({ key: t, label: FLOW_LABEL[t], icon: FLOW_ICON[t], count: v.byType[t].length }))}
    />
  );

  return (
    <NotionPage
      title="Transactions"
      icon={<ArrowLeftRight strokeWidth={1.75} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Transactions', href: '/transactions' }, { label: v.title }]}
      properties={[
        { id: 'month', label: 'Month', display: <MonthPicker value={v.month} onChange={v.setMonth} /> },
        { id: 'in', label: 'Money in', display: money(v.moneyIn), tone: 'in' },
        { id: 'out', label: 'Money out', display: money(v.moneyOut), tone: 'out' },
        { id: 'count', label: 'Count', display: String(v.count) },
      ]}
    >
      {v.filteredBy && (
        <Callout>
          <p>Showing transactions for {v.filteredBy}.</p>
        </Callout>
      )}
      {v.loading ? (
        <ScreenState loading />
      ) : (
        <div role="tabpanel" aria-label={FLOW_LABEL[v.tab]}>
          <Database<TxRow>
            key={v.tab}
            id={`transactions.${v.tab.toLowerCase()}`}
            label={`${FLOW_LABEL[v.tab]} in ${v.title}`}
            noun={['transaction', 'transactions']}
            tabs={tabs}
            rows={v.byType[v.tab]}
            rowKey={(r) => r.id}
            columns={columnsFor(v.tab)}
            above={
              v.excludedCount > 0 || v.showExcluded ? (
                <label className={styles.showExcluded}>
                  <input type="checkbox" checked={v.showExcluded} onChange={(e) => v.setShowExcluded(e.target.checked)} />
                  Show excluded ({v.excludedCount})
                </label>
              ) : undefined
            }
            views={[
              { id: 'table', name: 'Table', layout: 'table' },
              { id: 'list', name: 'List', layout: 'list' },
              { id: 'cards', name: 'Cards', layout: 'cards' },
            ]}
            groups={[
              { id: 'day', label: 'Day', key: (r) => ({ key: r.day, label: dayLabel(r.date) }) },
              { id: 'account', label: 'Account', key: (r) => ({ key: r.account || 'none', label: r.account || 'No account' }) },
              { id: 'bucket', label: 'Basket', key: (r) => ({ key: r.bucketId ?? 'none', label: r.bucketName || 'No basket' }) },
            ]}
            defaultGroup="day"
            subtotalColumn="amount"
            currency={v.currency}
            sortPresets={[
              { id: 'newest', label: 'Newest first', compare: (a, b) => b.date.getTime() - a.date.getTime() },
              { id: 'oldest', label: 'Oldest first', compare: (a, b) => a.date.getTime() - b.date.getTime() },
              { id: 'largest', label: 'Largest first', compare: (a, b) => Math.abs(b.amount) - Math.abs(a.amount) },
            ]}
            list={{
              title: (r) => (r.excluded ? `${r.name} (excluded)` : r.name),
              secondary: (r) => [dayLabel(r.date), r.flow === 'Transfer' || r.flow === 'Savings' ? [r.from, r.to].filter(Boolean).join(' to ') : r.account].filter(Boolean).join(' · '),
              amount: (r) => <Amount row={r} />,
            }}
            card={{ title: (r) => r.name }}
            onOpen={(r) => {
              if (compact || peek.mode === 'full') router.push(r.href);
              else setPeekRow(r);
            }}
            newLabel="Add transaction"
            onNew={() => router.push(formLink('transaction', { month: String(Number(v.month.slice(5)) - 1), year: v.month.slice(0, 4) }))}
            emptyText={`No ${FLOW_LABEL[v.tab].toLowerCase()} recorded in ${v.title}.`}
          />
        </div>
      )}

      {peekRow && (
        <SidePeek title={peekRow.name} mode={peek.mode} onMode={peek.setMode} onClose={() => setPeekRow(null)} fullHref={peekRow.href}>
          <TransactionPeekContent key={peekRow.id} id={peekRow.id} transfer={peekRow.kind === 'transfer'} />
        </SidePeek>
      )}
    </NotionPage>
  );
}
