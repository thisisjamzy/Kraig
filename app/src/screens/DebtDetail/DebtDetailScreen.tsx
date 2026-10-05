'use client';

// A debt's page, to the page standard (NotionPage): full width, no back
// arrow on wide screens (the breadcrumb "Money / Debt / Momokash loan"),
// the title with its icon, the properties grid, and a callout with the
// state in plain words. Then, from 1024px, two columns:
//   main: "Is this debt going down?" (owed by month, the plan's projection
//   dashed), the Repayments database, Linked transactions (excluded ones
//   greyed with their reason under "Show excluded"), the Activity log and
//   Notes;
//   side (sticky, ~35%): Summary, Payment plan with "Record next payment",
//   and Wallet effect with "Change".
// 768 to 1023px: one column, the side blocks first. Phone: one column, the
// properties two across, repayments as a list, "Record repayment" in a
// sticky bottom bar. Archive, Mark as paid off and Delete are in the top
// bar's "..." menu.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HandCoins, Undo2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLogic, type LinkedRow, type RepaymentRow } from '@/src/logic/debtDetail/useLogic';
import { WALLET_EFFECT_LABEL } from '@/src/shared/debt/walletEffect';
import { useAmountsHidden, HIDDEN_AMOUNT } from '@/src/shared/hooks/usePrivacy';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { Block, Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { ChartBlock } from '@/src/widgets/Database/ChartBlock';
import { Database } from '@/src/widgets/Database/Database';
import { CompactProgress } from '@/src/widgets/Database/PropertiesBlock';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { formatMoney } from '@/src/widgets/Money/Money';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Tag, type TagColor } from '@/src/widgets/TaskDb/Tag';
import styles from './DebtDetailScreen.module.css';
import { NotificationsLink } from '@/src/widgets/Notifications/NotificationsLink';

const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const PRIORITY_COLOR: Record<keyof typeof PRIORITY_LABEL, TagColor> = { high: 'red', medium: 'yellow', low: 'gray' };
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const when = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function DebtDetailScreen({ debtId }: { debtId: string }) {
  const v = useLogic(debtId);
  const router = useRouter();
  const [hidden] = useAmountsHidden();
  const compact = useLayout().deviceClass === 'compact';
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const money = (n: number) => (hidden ? HIDDEN_AMOUNT : formatMoney(n));
  const axis = (n: number) => (hidden ? '' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const debt = v.debt;
  const name = debt?.name ?? 'Debt';
  const isCash = debt?.debtType === 'cash';
  const open = v.openForm;

  const typeChip = debt ? <Tag color={isCash ? 'blue' : 'gray'}>{WALLET_EFFECT_LABEL[debt.debtType]}</Tag> : null;

  const repaymentColumns: ColumnDef<RepaymentRow>[] = [
    { id: 'date', label: 'Date', type: 'date', width: 120, value: (r) => r.date },
    { id: 'amount', label: 'Amount', type: 'currency', width: 130, value: (r) => r.amount, calc: 'sum', onCard: true },
    { id: 'paidFrom', label: 'Paid from', type: 'text', width: 170, value: (r) => r.paidFrom, onCard: true },
    {
      id: 'linked',
      label: 'Linked transaction',
      type: 'text',
      width: 190,
      value: (r) => r.linked,
      render: (r) =>
        r.transactionId && !r.linkedExcluded ? (
          <Link className={styles.relation} href={`/transactions/${r.transactionId}`}>
            {r.linked}
          </Link>
        ) : (
          <span className={styles.muted}>{r.linked}</span>
        ),
    },
    {
      id: 'method',
      label: 'Method',
      type: 'select',
      width: 110,
      value: (r) => r.method,
      options: [
        { value: 'planned', label: 'Planned' },
        { value: 'manual', label: 'Manual' },
      ],
      render: (r) => <Tag color={r.method === 'planned' ? 'blue' : 'gray'}>{r.method === 'planned' ? 'Planned' : 'Manual'}</Tag>,
    },
    { id: 'note', label: 'Note', type: 'text', width: 200, value: (r) => r.note || null },
  ];

  const linkedColumns: ColumnDef<LinkedRow>[] = [
    { id: 'date', label: 'Date', type: 'date', width: 120, value: (r) => r.date },
    {
      id: 'name',
      label: 'Name',
      type: 'text',
      width: 220,
      value: (r) => r.name,
      render: (r) =>
        r.excluded ? (
          <span className={styles.excluded} title={r.reason}>
            {r.name}
            <span className={styles.excludedReason}>Excluded{r.reason ? `: ${r.reason}` : ''}</span>
          </span>
        ) : (
          <Link className={styles.relation} href={`/transactions/${r.id}`}>
            {r.name}
          </Link>
        ),
    },
    {
      id: 'role',
      label: 'Kind',
      type: 'select',
      width: 120,
      value: (r) => r.role,
      options: [
        { value: 'Borrowing', label: 'Borrowing' },
        { value: 'Repayment', label: 'Repayment' },
      ],
    },
    {
      id: 'amount',
      label: 'Amount',
      type: 'currency',
      width: 130,
      value: (r) => r.amount,
      render: (r) => (
        <span className={styles.amount} data-excluded={r.excluded || undefined} data-negative={r.amount < 0 || undefined}>
          {r.amount > 0 ? '+' : '−'}
          {money(Math.abs(r.amount))}
        </span>
      ),
    },
    { id: 'account', label: 'Account', type: 'text', width: 160, value: (r) => r.account || null },
  ];

  const sideBlocks = debt && (
    <aside className={styles.side} aria-label="Summary">
      <section className={`${styles.sideCard} ${styles.summaryCard}`}>
        <div className={styles.sideHead}>
          <h2>Summary</h2>
          {v.balance <= 0 ? <Tag color="green">Paid off</Tag> : v.late ? <Tag color="red">Late</Tag> : <Tag color="blue">Active</Tag>}
        </div>
        <dl className={styles.grid}>
          <div>
            <dt>Balance owed</dt>
            <dd data-tone={v.balance > 0 ? 'bad' : undefined}>{money(v.balance)}</dd>
          </div>
          <div>
            <dt>Repaid</dt>
            <dd data-tone="good">{money(debt.totalRepaid)}</dd>
          </div>
        </dl>
        <CompactProgress value={v.percent} tone="good" />
      </section>

      <section className={styles.sideCard}>
        <div className={styles.sideHead}>
          <h2>Payment plan</h2>
          <button type="button" className={styles.textLink} onClick={() => open('plan', debtId)}>
            {v.plan?.isActive ? 'Edit' : 'Set a plan'}
          </button>
        </div>
        <p>{hidden && v.plan ? 'Hidden' : v.planText}</p>
        {v.next && v.balance > 0 && (
          <p data-tone={v.late ? 'bad' : undefined}>
            Next: {money(v.next.amount)} on {day(v.next.date)}
            {v.late ? `, ${v.late} ${v.late === 1 ? 'day' : 'days'} late` : ''}
          </p>
        )}
        {v.balance > 0 && (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => open('repay', debtId, v.next ? { amount: String(Math.min(v.next.amount, v.balance)) } : undefined)}
          >
            {v.next ? 'Record next payment' : 'Record repayment'}
          </button>
        )}
        {v.scheduled.length > 0 && (
          <ul className={styles.scheduleList} aria-label="Scheduled repayments">
            {v.scheduled.map((r) => (
              <li key={r.id} data-done={r.recorded || undefined}>
                <button type="button" className={styles.scheduleRow} disabled={r.recorded} onClick={() => open('schedule', debtId, { scheduled: r.id })}>
                  <span>
                    {day(r.date)}
                    <small>
                      {r.recorded ? 'Recorded' : r.everything ? 'Everything left' : 'Scheduled'}
                      {r.from ? ` · ${r.from}` : ''}
                      {!r.budgetLine ? ' · on the debt only' : ''}
                    </small>
                  </span>
                  <span>{money(r.amount)}</span>
                </button>
                {!r.recorded && !r.budgetLine && (
                  <button type="button" className={styles.textLink} onClick={() => open('repay', debtId, { amount: String(r.amount), scheduled: r.id })}>
                    Record
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {v.scheduledOverBy > 0 && <p data-tone="bad">Scheduled repayments add up to {money(v.scheduledOverBy)} more than what you owe.</p>}
        {v.balance > 0 && (
          <button type="button" className={styles.textLink} onClick={() => open('schedule', debtId)}>
            Plan a repayment
          </button>
        )}
      </section>

      {v.upcoming.length > 0 && (
        <section className={styles.sideCard}>
          <div className={styles.sideHead}>
            <h2>Upcoming repayments</h2>
          </div>
          <ul className={styles.scheduleList}>
            {v.upcoming.map((u) => (
              <li key={u.key}>
                <span className={styles.scheduleRow}>
                  <span>
                    {day(u.date)}
                    <small>{u.kind === 'repeating' ? 'Repeating plan' : 'Scheduled'}</small>
                  </span>
                  <span>{money(u.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.sideCard}>
        <div className={styles.sideHead}>
          <h2>Wallet effect</h2>
          <button type="button" className={styles.textLink} onClick={() => open('wallet', debtId)}>
            Change
          </button>
        </div>
        <p>{isCash ? 'Counts in your balances.' : 'Record only, not in your balances.'}</p>
        {isCash && v.receivedInto && <p>Received into {v.receivedInto}.</p>}
      </section>
    </aside>
  );

  return (
    <NotionPage
      title={name}
      icon={<HandCoins strokeWidth={1.75} />}
      kind={debt ? `${WALLET_EFFECT_LABEL[debt.debtType]}${debt.lender ? ` · owed to ${debt.lender}` : ''}` : undefined}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Debt', href: '/debts' }, { label: name }]}
      menu={
        debt
          ? [
              // Links, not callbacks: the menu caches its items by label and
              // link, and a form opens differently on a phone and wider.
              ...(v.balance > 0 ? [{ label: 'Record repayment', href: v.formHref('repay', debtId) }] : []),
              { label: 'Edit debt', href: v.formHref('edit', debtId) },
              { label: 'Payment plan', href: v.formHref('plan', debtId) },
              ...(v.balance > 0 ? [{ label: 'Plan a repayment', href: v.formHref('schedule', debtId) }] : []),
              { label: 'Change wallet effect', href: v.formHref('wallet', debtId) },
              ...(v.balance > 0 ? [{ label: 'Mark as paid off', href: v.formHref('repay', debtId, { amount: String(v.balance) }) }] : []),
              { label: 'Archive', onSelect: () => setConfirm('archive') },
              ...(v.canDelete ? [{ label: 'Delete', onSelect: () => setConfirm('delete'), danger: true }] : []),
            ]
          : undefined
      }
      properties={
        debt
          ? [
              {
                id: 'type',
                label: 'Type',
                display: typeChip,
                edit: {
                  type: 'select',
                  value: debt.debtType,
                  options: [
                    { value: 'cash', label: 'Cash debt' },
                    { value: 'existing', label: 'Record only' },
                  ],
                  // Switching asks what to do with repayments and shows every change first.
                  onSave: (next) => {
                    if (next && next !== debt.debtType) open('wallet', debtId, { to: String(next) });
                  },
                },
              },
              { id: 'owed', label: 'Balance owed', tone: v.balance > 0 ? 'bad' : 'good', display: money(v.balance) },
              { id: 'borrowed', label: 'Borrowed', display: money(debt.principalAmount), sub: v.borrowedOn ? day(v.borrowedOn) : undefined },
              { id: 'repaid', label: 'Repaid', tone: 'good', display: money(debt.totalRepaid), sub: <CompactProgress value={v.percent} tone="good" /> },
              {
                id: 'priority',
                label: 'Priority',
                display: <Tag color={PRIORITY_COLOR[debt.priority]}>{PRIORITY_LABEL[debt.priority]}</Tag>,
                edit: {
                  type: 'select',
                  value: debt.priority,
                  options: (['high', 'medium', 'low'] as const).map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
                  onSave: (next) => v.setPriority(next as keyof typeof PRIORITY_LABEL),
                },
              },
              {
                id: 'next',
                label: 'Next payment',
                tone: v.late ? 'bad' : 'neutral',
                display: v.next && v.balance > 0 ? day(v.next.date) : v.balance > 0 ? 'No plan set' : 'None',
                sub: v.next && v.balance > 0 ? `${money(v.next.amount)}${v.late ? `, ${v.late} ${v.late === 1 ? 'day' : 'days'} late` : ''}` : undefined,
              },
              { id: 'lender', label: 'Lender', edit: { type: 'text', value: debt.lender ?? '', onSave: (next) => v.setLender(String(next ?? '')) } },
              ...(isCash ? [{ id: 'into', label: 'Received into', display: v.receivedInto }] : []),
              { id: 'plan', label: 'Payment plan', display: hidden && v.plan ? HIDDEN_AMOUNT : v.planText },
            ]
          : undefined
      }
    >
      {v.loading ? (
        <ScreenState loading />
      ) : !debt ? (
        <ScreenState error={v.error ?? 'This debt no longer exists.'} />
      ) : (
        <>
          <Callout tone={v.balance <= 0 ? 'good' : v.late ? 'bad' : 'watch'}>
            <p>
              {hidden ? 'Amounts are hidden.' : v.sentence}
              <NotificationsLink types={['debt_payment_due', 'debt_payment_late']} about="debts" />
            </p>
          </Callout>

          <div className={styles.columns}>
            <div className={styles.main}>
              <ChartBlock
                id="debt.trend"
                title="Is this debt going down?"
                summary={v.trend.length > 1 && !hidden ? `${money(debt.principalAmount)} borrowed, ${money(v.balance)} owed now.` : null}
                empty={v.trend.length < 2 ? 'Needs two months of history.' : null}
              >
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={v.trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#edf0f6" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={48} tickFormatter={axis} />
                    <Tooltip formatter={(n) => money(Number(n ?? 0))} />
                    <Line dataKey="owed" name="Owed" stroke="#c62f3e" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
                    <Line dataKey="projected" name="At this plan" stroke="#c62f3e" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </ChartBlock>

              <Block title="Repayments">
                <Database<RepaymentRow>
                  id="debt.repayments"
                  label={`Repayments of ${name}`}
                  noun={['repayment', 'repayments']}
                  rows={v.repaymentRows}
                  rowKey={(r) => r.id}
                  columns={repaymentColumns}
                  views={[
                    { id: 'table', name: 'Table', layout: 'table' },
                    { id: 'cards', name: 'Cards', layout: 'cards' },
                  ]}
                  defaultGroup="none"
                  currency={v.currency}
                  card={{ title: (r) => `${money(r.amount)} on ${day(r.date)}` }}
                  list={{ title: (r) => day(r.date), secondary: (r) => [r.paidFrom, r.method === 'planned' ? 'Planned' : 'Manual'].join(' · '), amount: (r) => money(r.amount) }}
                  onOpen={(r) => {
                    if (r.transactionId && !r.linkedExcluded) router.push(`/transactions/${r.transactionId}`);
                  }}
                  onNew={v.balance > 0 ? () => open('repay', debtId) : undefined}
                  newLabel="Record repayment"
                  emptyText="No repayments yet."
                />
              </Block>

              <Block title="Linked transactions">
                <Database<LinkedRow>
                  id="debt.linked"
                  label={`Transactions linked to ${name}`}
                  noun={['transaction', 'transactions']}
                  rows={v.linkedRows}
                  rowKey={(r) => r.id}
                  columns={linkedColumns}
                  views={[
                    { id: 'table', name: 'Table', layout: 'table' },
                    { id: 'list', name: 'List', layout: 'list' },
                  ]}
                  defaultGroup="none"
                  currency={v.currency}
                  card={{ title: (r) => r.name }}
                  list={{
                    title: (r) => (r.excluded ? `${r.name} (excluded)` : r.name),
                    secondary: (r) => [day(r.date), r.role, r.excluded ? r.reason : r.account].filter(Boolean).join(' · '),
                    amount: (r) => `${r.amount > 0 ? '+' : '−'}${money(Math.abs(r.amount))}`,
                  }}
                  above={
                    v.excludedCount > 0 ? (
                      <label className={styles.showExcluded}>
                        <input type="checkbox" checked={v.showExcluded} onChange={(e) => v.setShowExcluded(e.target.checked)} />
                        Show excluded ({v.excludedCount})
                      </label>
                    ) : undefined
                  }
                  emptyText={isCash ? 'No linked transactions.' : 'Record only: nothing here moves your balances.'}
                />
              </Block>

              <Block title="Activity">
                {v.activity.length === 0 ? (
                  <p className={styles.muted}>No changes yet.</p>
                ) : (
                  <ol className={styles.timeline}>
                    {v.activity.map((entry) => (
                      <li key={entry.id} data-undone={entry.undoneAt ? true : undefined}>
                        <div className={styles.timelineHead}>
                          <strong>{entry.title}</strong>
                          <time dateTime={entry.at.toDate().toISOString()}>{when(entry.at.toDate())}</time>
                        </div>
                        {entry.changes.length > 0 && (
                          <ul className={styles.changes}>
                            {entry.changes.map((c) => (
                              <li key={c.label}>
                                {c.label}: <span className={styles.muted}>{hidden ? HIDDEN_AMOUNT : c.from}</span> to {hidden ? HIDDEN_AMOUNT : c.to}
                              </li>
                            ))}
                          </ul>
                        )}
                        {!hidden && entry.lines.length > 0 && <p className={styles.effects}>{entry.lines.join(' ')}</p>}
                        {entry.undoneAt && <p className={styles.muted}>Undone {when(entry.undoneAt.toDate())}</p>}
                        {v.latestUndoable?.id === entry.id && (
                          <button type="button" className={styles.textLink} onClick={() => void v.undo(entry.id)}>
                            <Undo2 size={14} strokeWidth={2} aria-hidden /> Undo
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </Block>

              <Block title="Notes">
                <NotesBlock key={debtId} initial={debt.notes ?? ''} onSave={v.saveNotes} />
              </Block>
            </div>
            {sideBlocks}
          </div>

          {compact && v.balance > 0 && (
            <div className={styles.bottomBar}>
              <button type="button" className={styles.primaryButton} onClick={() => open('repay', debtId, v.next ? { amount: String(Math.min(v.next.amount, v.balance)) } : undefined)}>
                Record repayment
              </button>
            </div>
          )}
        </>
      )}

      {confirm === 'archive' && (
        <ConfirmDialog
          title={`Archive ${name}?`}
          message="It leaves the Debt page and its totals. Its repayments and transactions stay as they are."
          confirmLabel="Archive"
          cancelLabel="Keep"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void v.archive();
          }}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          title={`Delete ${name}?`}
          message={isCash ? 'Its borrowing transaction is deleted too, and the account and month figures go back. This can’t be undone.' : 'This can’t be undone.'}
          confirmLabel="Delete"
          cancelLabel="Keep"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void v.remove();
          }}
        />
      )}
    </NotionPage>
  );
}

/** Free-text notes, saved when the field loses focus. */
function NotesBlock({ initial, onSave }: { initial: string; onSave: (notes: string) => Promise<void> }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  // Follow edits from another device while not typing here.
  if (initial !== saved && text === saved) {
    setText(initial);
    setSaved(initial);
  }
  return (
    <textarea
      className={styles.notes}
      placeholder="Add notes…"
      value={text}
      aria-label="Notes"
      onChange={(e) => setText(e.target.value)}
      onBlur={async () => {
        if (text === saved) return;
        await onSave(text);
        setSaved(text);
      }}
    />
  );
}
