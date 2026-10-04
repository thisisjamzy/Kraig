'use client';

// Budget — one month, as a Notion-style page on every screen size: the
// title "Budget"; properties (Month as a dropdown, Status, Left to plan,
// Available now, Waiting for income); a neutral callout with the month in
// a sentence or two and a link to its updates in Notifications (the
// month's set-up, late income and Ready to pay are notifications now); four summary blocks (Income, Expenses,
// Savings, Transfers); then one database whose only tabs are the type tabs,
// with Table, Cards and Needs attention in the view selector. Payments and
// Transactions are pages of their own.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Coins, PiggyBank, Receipt, Wallet } from 'lucide-react';
import { useBudgetMonth } from '@/src/logic/budgetMonth/useLogic';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import { needsAttention, type LineRow } from '@/src/logic/budgetMonth/lines';
import { FLOW_LABEL, FLOW_TYPES, type FlowType } from '@/src/shared/budget/flow';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useBudgetMonthDoc } from '@/src/shared/hooks/useBudgetMonthState';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { Database } from '@/src/widgets/Database/Database';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { MonthPicker } from '@/src/widgets/Database/MonthPicker';
import { SidePeek, usePeek } from '@/src/widgets/Database/SidePeek';
import { TypeTabs } from '@/src/widgets/Database/TypeTabs';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { showToast } from '@/src/widgets/Toast/Toast';
import { NotificationsLink } from '@/src/widgets/Notifications/NotificationsLink';
import type { NotificationType } from '@/src/shared/notifications/types';
import { SummaryCards } from './SummaryCards';
import { LinePeekContent } from './LinePeek';
import { useScopeChooser } from './ScopeChooser';
import { groupsFor, lineColumns, viewsFor, type ColumnContext } from './columns';
import styles from './BudgetMonth.module.css';

/** The updates the Budget page links to. */
const BUDGET_TYPES: NotificationType[] = ['payment_overdue', 'payment_due_soon', 'overspend_uncovered', 'leftover_to_reallocate', 'must_haves_short', 'income_late', 'ready_to_pay', 'month_review', 'unassigned_transactions', 'savings_behind'];

export const FLOW_ICON: Record<FlowType, typeof Wallet> = {
  Income: Coins,
  Expense: Receipt,
  Savings: PiggyBank,
  Transfer: ArrowLeftRight,
};

const NEW_LABEL: Record<FlowType, string> = { Income: 'New income line', Expense: 'New expense', Savings: 'New savings line', Transfer: 'New transfer' };

export function BudgetMonthPage({ month, data, onMonth }: { month: string; data: PlanningData; onMonth: (month: string) => void }) {
  const v = useBudgetMonth(month, data);
  const router = useRouter();
  const scope = useScopeChooser();
  const peek = usePeek<LineRow>((r) => `/budget/item/${r.bucketId}/${r.itemId}?month=${r.month}`);
  const [bulk, setBulk] = useState<{ kind: 'account' | 'move'; rows: LineRow[] } | null>(null);
  const { data: monthDoc } = useBudgetMonthDoc(month);

  const totalSaved = useMemo(
    () => Math.round(data.accounts.filter(isSavingsAccount).reduce((s, a) => s + toDisplay(data.ctx, a.currentBalance, a.currency), 0)),
    [data.accounts, data.ctx]
  );

  const ctx: ColumnContext = {
    month,
    daysLeft: v.daysLeft,
    past: v.phase === 'past',
    accounts: v.accounts,
    incomeLines: v.incomeLines.map((l) => ({ itemId: l.itemId, name: l.name })),
    askScope: (line) => scope.ask(line.name, month),
    editAmount: v.editAmount,
    editDate: v.editDate,
    setField: v.setField,
    markPaid: v.markPaid,
    onError: (message) => showToast(message),
  };
  const money = (n: number) => `${Math.round(n).toLocaleString('en-US')} ${v.currency}`;
  const peekLine = peek.row ? (v.rows[peek.row.type].find((r) => r.key === peek.row!.key) ?? peek.row) : null;
  const attention = (r: LineRow) => needsAttention(r, v.coverage.byKey);

  const tabs = (
    <TypeTabs
      label="Money type"
      value={v.tab}
      onChange={v.setTab}
      tabs={FLOW_TYPES.map((t) => ({ key: t, label: FLOW_LABEL[t], icon: FLOW_ICON[t], count: v.rows[t].length }))}
    />
  );

  return (
    <NotionPage
      title="Budget"
      icon={<Wallet strokeWidth={1.75} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Budget', href: '/budget' }, { label: v.title }]}
      menu={[{ label: 'Add transaction', href: `/add-transaction?month=${Number(month.slice(5)) - 1}&year=${month.slice(0, 4)}` }]}
      properties={[
        { id: 'month', label: 'Month', display: <MonthPicker value={month} onChange={onMonth} markers={(m) => (m === month && !monthDoc?.reviewedAt ? ['unreviewed'] : [])} /> },
        {
          id: 'status',
          label: 'Status',
          display: v.reviewed ? (
            <span className={styles.chip} data-tone="good">
              Reviewed
            </span>
          ) : (
            <span className={styles.inlineGroup}>
              <span className={styles.chip}>Not reviewed</span>
              <Link href={`/budget/review?month=${month}`} className={styles.inlineAction}>
                Review
              </Link>
            </span>
          ),
        },
        { id: 'left', label: 'Left to plan', display: money(v.totals.leftToPlan), tone: v.totals.leftToPlan < 0 ? 'bad' : 'neutral' },
        { id: 'available', label: 'Available now', display: money(v.totals.availableNow), tone: v.totals.availableNow > 0 ? 'good' : 'neutral' },
        { id: 'waiting', label: 'Waiting for income', display: v.coverage.waiting ? money(v.coverage.waiting) : 'Nothing waiting', tone: v.coverage.waiting ? 'watch' : 'neutral' },
      ]}
    >
      {v.loading ? (
        <ScreenState loading />
      ) : (
        <>
          <Callout>
            <p>
              {v.summary}
              {v.migrationPending && (
                <>
                  {' '}
                  Your budget now keeps income, expenses, savings and transfers apart:{' '}
                  <Link href="/budget/migration">see what changed</Link>.
                </>
              )}
              <NotificationsLink types={BUDGET_TYPES} about="this month" />
            </p>
          </Callout>

          <SummaryCards totals={v.totals} currency={v.currency} active={v.tab} onOpen={v.setTab} totalSaved={v.isCurrent ? totalSaved : null} />

          <div role="tabpanel" aria-label={FLOW_LABEL[v.tab]}>
            <Database<LineRow>
              key={v.tab}
              id={`budget.${v.tab.toLowerCase()}`}
              label={`${FLOW_LABEL[v.tab]} in ${v.title}`}
              noun={['line', 'lines']}
              tabs={tabs}
              rows={v.rows[v.tab]}
              rowKey={(r) => r.key}
              columns={lineColumns(v.tab, ctx)}
              views={viewsFor(attention)}
              groups={groupsFor(v.tab)}
              defaultGroup="bucket"
              currency={v.currency}
              card={{
                title: (r) => r.name,
                progress: (r) => (r.available > 0 ? { value: r.actual / r.available, over: r.type !== 'Income' && r.actual > r.available + 0.5 } : null),
              }}
              onOpen={(r) => (window.innerWidth < 768 ? router.push(`/budget/item/${r.bucketId}/${r.itemId}?month=${r.month}`) : peek.open(r))}
              onCreate={(values, groupKey) => v.createLine(v.tab, { name: values.name, amount: values.planned ?? values.expected ?? values.amount, due: values.due ?? values.date }, groupKey)}
              newLabel={NEW_LABEL[v.tab]}
              newTemplates={[
                ...v.bucketsOf(v.tab).map((b) => ({ id: b.id, label: `Recurring item in ${b.name}`, onSelect: () => router.push(`/add-bucket-item/${b.id}`) })),
                { id: 'bucket', label: `New ${FLOW_LABEL[v.tab].toLowerCase()} bucket`, onSelect: () => router.push(`/buckets/new?type=${v.tab}`) },
              ]}
              rowActions={
                v.tab === 'Income'
                  ? []
                  : [
                      {
                        id: 'paid',
                        label: v.tab === 'Savings' ? 'Mark saved' : v.tab === 'Transfer' ? 'Mark moved' : 'Mark paid',
                        show: (r) => r.left > 0 && !r.closed,
                        run: (r) => v.markPaid(r),
                      },
                      { id: 'skip', label: `Remove from ${v.title.split(' ')[0]}`, run: (r) => v.bulkSkip([r]) },
                    ]
              }
              bulkActions={[
                ...(v.tab !== 'Income' ? [{ id: 'paid', label: 'Mark paid', run: (rows: LineRow[]) => v.bulkMarkPaid(rows) }] : []),
                { id: 'account', label: 'Change account', run: (rows: LineRow[]) => setBulk({ kind: 'account', rows }) },
                { id: 'move', label: 'Move to bucket', run: (rows: LineRow[]) => setBulk({ kind: 'move', rows }) },
                { id: 'skip', label: `Delete from ${v.title.split(' ')[0]}`, danger: true, run: (rows: LineRow[]) => v.bulkSkip(rows) },
              ]}
              emptyText={`No ${FLOW_LABEL[v.tab].toLowerCase()} lines in ${v.title}.`}
              above={v.tab === 'Expense' ? <MustHavesCard v={v} /> : null}
            />
          </div>
        </>
      )}

      {peekLine && (
        <SidePeek title={peekLine.name} mode={peek.mode} onMode={peek.setMode} onClose={peek.close} fullHref={peek.href}>
          <LinePeekContent
            line={peekLine}
            ctx={ctx}
            currency={v.currency}
            onSkip={async (line) => {
              await v.bulkSkip([line]);
              peek.close();
            }}
          />
        </SidePeek>
      )}

      {bulk && (
        <Modal title={bulk.kind === 'account' ? 'Change account' : 'Move to bucket'} onClose={() => setBulk(null)}>
          <div className={styles.pickList}>
            {(bulk.kind === 'account' ? v.accounts.map((a) => ({ id: a.id, name: a.name })) : v.bucketsOf(v.tab).map((b) => ({ id: b.id, name: b.name }))).map((option) => (
              <button
                key={option.id}
                type="button"
                className={styles.pickRow}
                onClick={async () => {
                  const rows = bulk.rows;
                  setBulk(null);
                  try {
                    if (bulk.kind === 'account') await v.bulkAccount(rows, option.id);
                    else await v.bulkMove(rows, option.id);
                    showToast(`${rows.length} ${rows.length === 1 ? 'line' : 'lines'} updated`);
                  } catch (caught) {
                    showToast(caught instanceof Error ? caught.message : 'Could not do that.');
                  }
                }}
              >
                {option.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {scope.dialog}
    </NotionPage>
  );
}

/** Must-haves still to pay, above the Expenses table, against money actually available. */
function MustHavesCard({ v }: { v: ReturnType<typeof useBudgetMonth> }) {
  const m = v.must;
  if (!m.count) return null;
  const money = (n: number) => Math.round(n).toLocaleString('en-US');
  // A sentence, no strip: when they're short or waiting, it's a notification.
  return (
    <div className={styles.mustCard}>
      <p>
        <strong>Must-haves</strong>: {money(m.due)} {v.currency} still to pay on {m.count} {m.count === 1 ? 'line' : 'lines'}. Available now {money(m.availableNow)} {v.currency}
        {m.status !== 'covered' && <>, estimated by month end {money(m.spareByMonthEnd + m.due)} {v.currency}</>}.
      </p>
      <Link href="/buckets/items" className={styles.inlineAction}>
        Open priorities
      </Link>
    </div>
  );
}
