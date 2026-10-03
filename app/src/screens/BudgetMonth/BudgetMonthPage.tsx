'use client';

// The Budget page for one month on medium screens and up, built like a
// Notion page: breadcrumb in the top bar (Money / Budget / October 2026),
// a large title with the month switcher and "Add transaction" beside it,
// the properties (days left, reviewed, left to plan, available now, ready
// to pay), the four summary cards (one per flow type), then one database
// per flow type under large type tabs — Income, Expenses, Savings and
// Transfers are never listed together.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Coins, PiggyBank, Plus, Receipt, Wallet } from 'lucide-react';
import { useBudgetMonth } from '@/src/logic/budgetMonth/useLogic';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import type { LineRow } from '@/src/logic/budgetMonth/lines';
import { FLOW_LABEL, type FlowType } from '@/src/shared/budget/flow';
import { toDisplay } from '@/src/shared/firestore/currency';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { useBreadcrumb } from '@/src/widgets/AppShell/breadcrumb';
import { Database } from '@/src/widgets/Database/Database';
import { NotionPageHeader } from '@/src/widgets/Database/NotionPage';
import { PropertiesBlock } from '@/src/widgets/Database/PropertiesBlock';
import { SidePeek, usePeek } from '@/src/widgets/Database/SidePeek';
import { ReadyToPayCard } from '@/src/widgets/ReadyToPay/ReadyToPayCard';
import { useReadyToPayCount } from '@/src/shared/hooks/useReadyToPay';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { showToast } from '@/src/widgets/Toast/Toast';
import { MigrationNotice, IncomePrompt, SetupBanner } from './Banners';
import { SummaryCards } from './SummaryCards';
import { LinePeekContent } from './LinePeek';
import { useScopeChooser } from './ScopeChooser';
import { groupsFor, lineColumns, presetsFor, type ColumnContext } from './columns';
import styles from './BudgetMonth.module.css';

export const FLOW_ICON: Record<FlowType, typeof Wallet> = {
  Income: Coins,
  Expense: Receipt,
  Savings: PiggyBank,
  Transfer: ArrowLeftRight,
};

export function BudgetMonthPage({ month, data, onPrevious, onNext }: { month: string; data: PlanningData; onPrevious: () => void; onNext: () => void }) {
  const v = useBudgetMonth(month, data);
  const router = useRouter();
  const scope = useScopeChooser();
  const ready = useReadyToPayCount();
  const peek = usePeek<LineRow>((r) => `/budget/item/${r.bucketId}/${r.itemId}?month=${r.month}`);
  const [bulk, setBulk] = useState<{ kind: 'account' | 'move'; rows: LineRow[] } | null>(null);
  useBreadcrumb([{ label: 'Money', href: '/home' }, { label: 'Budget', href: '/budget' }, { label: v.title }]);

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

  if (v.loading) return <ScreenState loading />;
  const peekLine = peek.row ? (v.rows[peek.row.type].find((r) => r.key === peek.row!.key) ?? peek.row) : null;
  const money = (n: number) => `${Math.round(n).toLocaleString('en-US')} ${v.currency}`;

  return (
    <div className={styles.page}>
      {v.migrationPending && <MigrationNotice />}
      {v.banner && <SetupBanner text={v.banner} month={month} onDismiss={() => void v.dismissBanner()} />}
      {v.prompts.map((line) => (
        <IncomePrompt
          key={line.key}
          line={line}
          currency={v.currency}
          accounts={v.accounts}
          onRecord={(amount, accountId) => v.recordIncome(line, amount, accountId)}
          onNotYet={() => v.notYet(line)}
        />
      ))}
      {v.isCurrent && <ReadyToPayCard />}

      <NotionPageHeader
        icon={<Wallet size={24} strokeWidth={2} />}
        title={v.title}
        kind="Monthly budget"
        actions={
          <>
            <button type="button" onClick={onPrevious} className={styles.iconLink} aria-label="Previous month" title="Previous month">
              <ChevronLeft size={18} strokeWidth={2.25} />
            </button>
            <button type="button" onClick={onNext} className={styles.iconLink} aria-label="Next month" title="Next month">
              <ChevronRight size={18} strokeWidth={2.25} />
            </button>
            <Link href={`/add-transaction?month=${Number(month.slice(5)) - 1}&year=${month.slice(0, 4)}`} className={styles.primaryButton}>
              <Plus size={15} strokeWidth={2.5} aria-hidden /> Add transaction
            </Link>
          </>
        }
      >
        <PropertiesBlock
          properties={[
            {
              id: 'days',
              label: 'Days left',
              display: v.phase === 'current' ? String(v.daysLeft ?? 0) : v.phase === 'past' ? 'Month has ended' : "Hasn't started",
            },
            {
              id: 'status',
              label: 'Status',
              display: v.reviewed ? (
                <span className={styles.chip} data-tone="good">Reviewed</span>
              ) : (
                <span className={styles.inlineGroup}>
                  <span className={styles.chip}>Not reviewed</span>
                  <Link href={`/budget/review?month=${month}`} className={styles.inlineAction}>
                    Review
                  </Link>
                </span>
              ),
            },
            { id: 'left', label: 'Left to plan', display: <span className={styles.toneText} data-tone={v.totals.leftToPlan < 0 ? 'bad' : undefined}>{money(v.totals.leftToPlan)}</span> },
            { id: 'available', label: 'Available now', display: money(v.totals.availableNow) },
            {
              id: 'ready',
              label: 'Ready to pay',
              display: ready ? <Link href="/budget/ready" className={styles.relation}>{ready} {ready === 1 ? 'payment' : 'payments'}</Link> : null,
            },
          ]}
        />
      </NotionPageHeader>

      <SummaryCards totals={v.totals} currency={v.currency} active={v.tab} onOpen={v.setTab} totalSaved={v.isCurrent ? totalSaved : null} />

      <div className={styles.typeTabs} role="tablist" aria-label="Money type">
        {v.types.map((type) => {
          const TabIcon = FLOW_ICON[type];
          return (
            <button key={type} type="button" role="tab" aria-selected={v.tab === type} className={styles.typeTab} onClick={() => v.setTab(type)}>
              <TabIcon size={18} strokeWidth={2.25} aria-hidden />
              {FLOW_LABEL[type]}
              <span className={styles.typeCount}>{v.rows[type].length}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={FLOW_LABEL[v.tab]}>
        <Database<LineRow>
          key={v.tab}
          id={`budget.${v.tab.toLowerCase()}`}
          label={`${FLOW_LABEL[v.tab]} in ${v.title}`}
          noun={['line', 'lines']}
          rows={v.rows[v.tab]}
          rowKey={(r) => r.key}
          columns={lineColumns(v.tab, ctx)}
          presets={presetsFor(v.tab, v.today)}
          groups={groupsFor(v.tab)}
          defaultGroup="bucket"
          card={{
            title: (r) => r.name,
            progress: (r) => (r.available > 0 ? { value: r.actual / r.available, over: r.type !== 'Income' && r.actual > r.available + 0.5 } : null),
          }}
          onOpen={peek.open}
          onCreate={(values, groupKey) => v.createLine(v.tab, { name: values.name, amount: values.planned ?? values.expected ?? values.amount, due: values.due ?? values.date }, groupKey)}
          newTemplates={[
            ...v.bucketsOf(v.tab).map((b) => ({ id: b.id, label: `Recurring item in ${b.name}`, onSelect: () => router.push(`/add-bucket-item/${b.id}`) })),
            { id: 'bucket', label: `New ${FLOW_LABEL[v.tab].toLowerCase()} bucket`, onSelect: () => router.push(`/buckets/new?type=${v.tab}`) },
          ]}
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
    </div>
  );
}

/** Must-haves coverage, above the Expenses table: against money actually available. */
function MustHavesCard({ v }: { v: ReturnType<typeof useBudgetMonth> }) {
  const m = v.must;
  if (!m.count) return null;
  const money = (n: number) => Math.round(n).toLocaleString('en-US');
  const tone = m.status === 'covered' ? 'good' : m.status === 'waiting' ? 'watch' : 'bad';
  return (
    <div className={styles.mustCard}>
      <span className={styles.chip} data-tone={tone}>
        {m.status === 'covered' ? 'Covered' : m.status === 'waiting' ? 'Waiting on income' : 'Short'}
      </span>
      <p>
        <strong>Must-haves</strong>: {money(m.due)} {v.currency} still to pay on {m.count} {m.count === 1 ? 'line' : 'lines'}. Available now {money(m.availableNow)} {v.currency}
        {m.status !== 'covered' && <> · estimated by month end {money(m.spareByMonthEnd + m.due)} {v.currency}</>}.
      </p>
      <Link href="/buckets/items" className={styles.inlineAction}>
        Open priorities
      </Link>
    </div>
  );
}
