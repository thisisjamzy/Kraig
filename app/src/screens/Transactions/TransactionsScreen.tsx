'use client';

// Transactions — a month's money as a page (it replaces History): the title
// "Transactions", properties (Month as a dropdown, Money in, Money out,
// Count), then one database whose only tabs are the types. Default view: a
// full-width Table grouped by day ("Thu 2 Oct" with the day's total), newest
// first; List and Cards in the view selector. Amounts are right-aligned,
// signed and coloured for their type, never cut off; account names stay on
// one line; the time shows only when one was recorded. A row opens the
// transaction in a side peek (its own page on a phone).

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowDownToLine, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import { TopBarControls } from '@/src/widgets/AppShell/TopBarSlot';
import { useLogic, type TxRow } from '@/src/logic/transactions/useLogic';
import { FLOW_LABEL, FLOW_TYPES, type FlowType } from '@/src/shared/budget/flow';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { Database } from '@/src/widgets/Database/Database';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { MonthPicker } from '@/src/widgets/Database/MonthPicker';
import { SidePeek, usePeek } from '@/src/widgets/Database/SidePeek';
import { TypeTabs } from '@/src/widgets/Database/TypeTabs';
import { formatAmountValue } from '@/src/widgets/Database/format';
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
      {formatAmountValue(Math.abs(row.amount))}
    </span>
  );
}

const BADGE: Record<FlowType, ReactNode> = {
  Expense: <ArrowUpRight size={16} strokeWidth={2} />,
  Income: <ArrowDownLeft size={16} strokeWidth={2} />,
  Transfer: <ArrowLeftRight size={16} strokeWidth={2} />,
  Savings: <ArrowDownToLine size={16} strokeWidth={2} />,
};

/** "Expense · Weekly shop basket" under the name (Dreda.figcraft Table/Row). */
function subtitle(row: TxRow) {
  const kind = FLOW_LABEL[row.flow].replace(/s$/, '');
  const where = row.flow === 'Transfer' || row.flow === 'Savings' ? [row.from, row.to].filter(Boolean).join(' to ') : row.bucketName || row.source || row.subtype;
  return [kind, where].filter(Boolean).join(' · ');
}

/** The name with its type badge and subtitle; an excluded one greyed with its reason. */
function TxName({ row }: { row: TxRow }) {
  if (!row.excluded)
    return (
      <span className={styles.nameCell}>
        <span className={styles.badge} data-flow={row.flow} aria-hidden>
          {BADGE[row.flow]}
        </span>
        <span className={styles.nameText}>
          <span className={styles.nameTitle}>{row.name}</span>
          <span className={styles.nameSub}>{subtitle(row)}</span>
        </span>
      </span>
    );
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
        {r.timeKnown && `, ${r.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
      </span>
    ),
  };
}

const tag = (id: keyof TxRow & string, label: string, width = 160): ColumnDef<TxRow> => ({
  id,
  label,
  type: 'text',
  width,
  value: (r) => (r[id] as string) || null,
  render: (r) => (r[id] ? <span className={styles.tag}>{r[id] as string}</span> : <span className={styles.tag} data-empty>None</span>),
});

const text = (id: keyof TxRow & string, label: string, width = 160, hidden = false): ColumnDef<TxRow> => ({
  id,
  label,
  type: 'text',
  width,
  hidden,
  value: (r) => (r[id] as string) || null,
});

function columnsFor(type: FlowType): ColumnDef<TxRow>[] {
  const name: ColumnDef<TxRow> = { id: 'name', label: 'Name', type: 'text', width: 340, value: (r) => r.name, render: (r) => <TxName row={r} /> };
  const amount: ColumnDef<TxRow> = { id: 'amount', label: 'Amount', type: 'currency', width: 140, value: (r) => r.amount, render: (r) => <Amount row={r} />, calc: 'sum' };
  // Date first (the frozen column), then Name, as the columns read.
  if (type === 'Income') return [name, dateColumn(), text('note', 'Note'), text('source', 'Source', 150), text('subtype', 'Subtype', 140), text('account', 'Account', 150), amount];
  if (type === 'Savings') return [name, dateColumn(), text('bucketName', 'Basket', 170), text('from', 'From account', 150), text('to', 'To wallet', 150), amount];
  if (type === 'Transfer')
    return [
      name,
      dateColumn(),
      text('from', 'From', 150),
      text('to', 'To', 150),
      { id: 'fee', label: 'Fee', type: 'currency', width: 110, value: (r) => r.fee || null, render: (r) => (r.fee ? formatAmountValue(r.fee) : null), calc: 'sum' },
      amount,
    ];
  return [name, tag('category', 'Category', 170), text('account', 'Wallet', 150), dateColumn(), text('note', 'Note', 160, true), text('bucketName', 'Basket', 170, true), text('itemName', 'Item', 170, true), amount];
}

export function TransactionsScreen() {
  const formLink = useFormLink();
  const v = useLogic();
  const router = useRouter();
  const compact = useLayout().deviceClass === 'compact';
  const [peekRow, setPeekRow] = useState<TxRow | null>(null);
  const peek = usePeek<TxRow>((r) => r.href);

  const tabs = (
    <TypeTabs
      label="Money type"
      value={v.tab}
      onChange={v.setTab}
      tabs={FLOW_TYPES.map((t) => ({ key: t, label: FLOW_LABEL[t], icon: FLOW_ICON[t], count: v.byType[t].length }))}
    />
  );

  const transfers = v.byType.Transfer.filter((r) => !r.excluded);
  const moved = transfers.reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const fees = transfers.reduce((sum, r) => sum + r.fee, 0);
  const saved = v.byType.Savings.filter((r) => !r.excluded).reduce((sum, r) => sum + r.amount, 0);

  return (
    <NotionPage
      title="Transactions"
      sub="Every expense, income, transfer and saving in one place."
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Transactions', href: '/transactions' }, { label: v.title }]}
      properties={[
        { id: 'in', label: 'Money in', display: formatAmountValue(Math.round(v.moneyIn)), tone: 'in' },
        { id: 'out', label: 'Money out', display: formatAmountValue(Math.round(v.moneyOut)), tone: 'out' },
        { id: 'transfers', label: fees > 0 ? `Transfers (charges ${formatAmountValue(Math.round(fees))})` : 'Transfers', display: formatAmountValue(Math.round(moved)) },
        { id: 'saved', label: 'Saved', display: formatAmountValue(Math.round(saved)) },
      ]}
    >
      <TopBarControls>
        <MonthPicker value={v.month} onChange={v.setMonth} />
      </TopBarControls>
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
