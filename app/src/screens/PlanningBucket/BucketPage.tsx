'use client';

// A bucket's page on medium screens and up, built like a Notion page in
// two columns (one column on medium):
//   main (~65%): the title with its type icon and kind ("Expense bucket")
//   and the actions on the right (add, edit, more — never a floating
//   bottom bar), the properties block, the items database (Table or Cards,
//   with this type's columns and a footer total), this month's
//   transactions, the adjustments timeline, and a notes block;
//   side (~35%, sticky): the summary card, the action card when something
//   needs doing, and the automation card.
// The phone keeps PlanningBucketView (with its sticky bottom bar).

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import type { useLogic as useBucketLogic } from '@/src/logic/planningBucket/useLogic';
import { useBudgetMonth } from '@/src/logic/budgetMonth/useLogic';
import type { LineRow } from '@/src/logic/budgetMonth/lines';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { updateBucketFields, updateItemFields } from '@/src/shared/firestore/bucketBudget';
import { automationLabel, FLOW_LABEL, FLOW_NOUN, hasNeedAndPriority, type FlowType } from '@/src/shared/budget/flow';
import { dayMonth, monthTitle } from '@/src/viewmodels/planning';
import { useBreadcrumb, usePageMenu } from '@/src/widgets/AppShell/breadcrumb';
import { Database } from '@/src/widgets/Database/Database';
import { Block, NotionPageHeader } from '@/src/widgets/Database/NotionPage';
import { PropertiesBlock } from '@/src/widgets/Database/PropertiesBlock';
import { SidePeek, usePeek } from '@/src/widgets/Database/SidePeek';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { showToast } from '@/src/widgets/Toast/Toast';
import { coverHref, reallocateHref } from '@/src/screens/Planning/PlanningParts';
import { FLOW_ICON } from '@/src/screens/BudgetMonth/BudgetMonthPage';
import { LinePeekContent } from '@/src/screens/BudgetMonth/LinePeek';
import { useScopeChooser } from '@/src/screens/BudgetMonth/ScopeChooser';
import { lineColumns, viewsFor, type ColumnContext } from '@/src/screens/BudgetMonth/columns';
import { needsAttention } from '@/src/logic/budgetMonth/lines';
import bm from '@/src/screens/BudgetMonth/BudgetMonth.module.css';
import { AdjustmentRow, AdjustmentSheet } from './Adjustments';
import { CloseBucketSheet } from './CloseBucketSheet';
import styles from './BucketPage.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';

type BucketLogic = ReturnType<typeof useBucketLogic>;
type TxRow = BucketLogic['rows'][number];

const ADD_LABEL: Record<FlowType, string> = { Income: 'Record income', Expense: 'Add expense', Savings: 'Add savings', Transfer: 'Record transfer' };

export function BucketPage({ bucketId, b }: { bucketId: string; b: BucketLogic }) {
  const formLink = useFormLink();
  const router = useRouter();
  const v = useBudgetMonth(b.month, b.data);
  const scope = useScopeChooser();
  const peek = usePeek<LineRow>((r) => `/budget/item/${r.bucketId}/${r.itemId}?month=${r.month}`);
  const [closing, setClosing] = useState(false);
  const bucket = b.bucket;
  const type = (bucket?.type ?? 'Expense') as FlowType;
  useBreadcrumb([{ label: 'Money', href: '/home' }, { label: 'Baskets', href: '/baskets' }, { label: bucket?.name ?? 'Basket' }]);
  // The bucket's actions live in the top bar's "..." menu.
  usePageMenu(
    bucket
      ? [
          { label: ADD_LABEL[type], href: b.addExpenseHref },
          { label: 'Add item', href: formLink('basket-item', { basket: bucketId }) },
          { label: 'Edit basket', href: `/baskets/${bucketId}` },
          b.closed ? { label: 'Reopen basket', onSelect: () => void b.reopenBucket() } : { label: `Close basket for ${monthTitle(b.month)}`, onSelect: () => setClosing(true) },
          // What the bucket needs: its status chip says so, the action is here.
          ...(b.card?.prompt?.kind === 'over' || b.card?.prompt?.kind === 'uncovered' ? [{ label: 'Cover or justify', href: coverHref(b.month, bucketId) }] : []),
          ...(b.card?.prompt?.kind === 'leftover' ? [{ label: 'Reallocate', href: reallocateHref(b.month, bucketId) }] : []),
          { label: 'All transactions', href: `/transactions?month=${b.month}&bucket=${bucketId}` },
        ]
      : undefined
  );

  const lines = useMemo(() => v.rows[type].filter((r) => r.bucketId === bucketId), [v.rows, type, bucketId]);
  const ctx: ColumnContext = {
    month: b.month,
    daysLeft: v.daysLeft,
    past: v.phase === 'past',
    accounts: v.accounts,
    incomeLines: v.incomeLines.map((l) => ({ itemId: l.itemId, name: l.name })),
    askScope: (line) => scope.ask(line.name, b.month),
    editAmount: v.editAmount,
    editDate: v.editDate,
    setField: v.setField,
    markPaid: v.markPaid,
    onError: (message) => showToast(message),
  };

  if (!bucket) return null;
  const Icon = FLOW_ICON[type];
  const card = b.card;
  const planned = lines.reduce((s, l) => s + l.available, 0);
  const actual = lines.reduce((s, l) => s + l.actual, 0);
  const left = planned - actual;
  const money = (n: number) => `${formatNumber(n)} ${b.currency}`;
  const actualLabel = type === 'Income' ? 'Received' : type === 'Savings' ? 'Saved' : type === 'Transfer' ? 'Moved' : 'Spent';
  const prompt = card?.prompt ?? null;
  const over = prompt?.kind === 'over' || prompt?.kind === 'uncovered';
  const overdue = lines.filter((l) => l.state === 'Overdue' || l.state === 'Late');
  const automated = lines.filter((l) => l.automation.mode !== 'off');
  const nextPrepared = lines.find((l) => l.automation.mode === 'prepare' && l.left > 0 && !l.closed);
  const needs = [...new Set(lines.map((l) => l.necessity).filter(Boolean))];
  const priorities = [...new Set(lines.map((l) => l.priority).filter(Boolean))];
  const accounts = [...new Set(lines.map((l) => l.accountName).filter(Boolean))];
  const peekLine = peek.row ? (lines.find((r) => r.key === peek.row!.key) ?? peek.row) : null;
  const status = over
    ? { text: 'Over plan', tone: 'bad' }
    : overdue.length
      ? { text: `${overdue.length} ${type === 'Income' ? 'late' : 'overdue'}`, tone: 'bad' }
      : left <= 0.5 && planned > 0
        ? { text: type === 'Income' ? 'All received' : 'Done', tone: 'good' }
        : { text: 'On track', tone: 'neutral' };

  const txColumns: ColumnDef<TxRow>[] = [
    { id: 'date', label: 'Date', type: 'date', width: 120, value: (r) => r.date },
    { id: 'name', label: 'Name', type: 'text', width: 220, value: (r) => r.note || r.name, render: (r) => <Link className={bm.relation} href={r.href}>{r.note || r.name}</Link> },
    { id: 'item', label: 'Item', type: 'text', width: 180, value: (r) => r.name },
    { id: 'amount', label: 'Amount', type: 'currency', width: 130, value: (r) => Math.abs(r.amount), calc: 'sum' },
    { id: 'account', label: 'Account', type: 'text', width: 160, value: (r) => r.method },
  ];

  return (
    <div className={`${bm.page} ${styles.layout}`}>
      <div className={styles.main}>
        <NotionPageHeader
          icon={<Icon size={24} strokeWidth={2} />}
          title={bucket.name}
          kind={`${FLOW_NOUN[type]} basket · ${monthTitle(b.month)}`}
        >
          <PropertiesBlock
            properties={[
              { id: 'type', label: 'Type', display: FLOW_LABEL[type] },
              { id: 'kind', label: 'Kind', display: bucket.kind === 'Fixed' ? 'Recurring' : 'One-off items' },
              { id: 'category', label: 'Category', display: b.category === '' ? null : b.category },
              { id: 'month', label: 'Month', display: monthTitle(b.month) },
              ...(hasNeedAndPriority(type)
                ? [
                    { id: 'need', label: 'Need', display: needs.length ? needs.map((n) => (n === 'MustHave' ? 'Must have' : 'Nice to have')).join(', ') : null },
                    { id: 'priority', label: 'Priority', display: priorities.length ? priorities.join(', ') : null },
                  ]
                : []),
              { id: 'account', label: 'Account', display: accounts.length ? accounts.join(', ') : null },
              { id: 'automation', label: 'Automation', display: automated.length ? `${automated.length} of ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}` : 'Off' },
              {
                id: 'payments',
                label: 'Linked payments',
                display:
                  b.upcomingCount || b.overdueCount ? (
                    <Link href={b.paymentsHref} className={bm.relation}>
                      {[b.overdueCount ? `${b.overdueCount} overdue` : null, b.upcomingCount ? `${b.upcomingCount} upcoming` : null].filter(Boolean).join(' · ')}
                    </Link>
                  ) : null,
              },
              { id: 'activity', label: 'Last activity', display: b.lastActivity ? `${dayMonth(b.lastActivity.date)} · ${b.lastActivity.what}` : null },
            ]}
          />
        </NotionPageHeader>

        <Block title="Items">
          <Database<LineRow>
            id={`basket.items.${type.toLowerCase()}`}
            label={`Items in ${bucket.name}`}
            noun={['item', 'items']}
            rows={lines}
            rowKey={(r) => r.key}
            columns={lineColumns(type, ctx, { bucket: false })}
            views={viewsFor((r) => needsAttention(r, v.coverage.byKey))}
            defaultGroup="none"
            card={{
              title: (r) => r.name,
              progress: (r) => (r.available > 0 ? { value: r.actual / r.available, over: type !== 'Income' && r.actual > r.available + 0.5 } : null),
            }}
            onOpen={peek.open}
            onCreate={(values) => v.createLine(type, { name: values.name, amount: values.planned ?? values.expected ?? values.amount, due: values.due ?? values.date }, bucketId)}
            newTemplates={[
              { id: 'recurring', label: 'Recurring item', onSelect: () => router.push(formLink('basket-item', { basket: bucketId })) },
            ]}
            bulkActions={[
              ...(type !== 'Income' ? [{ id: 'paid', label: 'Mark paid', run: (rows: LineRow[]) => v.bulkMarkPaid(rows) }] : []),
              { id: 'skip', label: `Delete from ${monthTitle(b.month).split(' ')[0]}`, danger: true, run: (rows: LineRow[]) => v.bulkSkip(rows) },
            ]}
            emptyText={`Nothing planned in this basket for ${monthTitle(b.month)}.`}
          />
        </Block>

        <Block
          title="Transactions"
          actions={
            <Link href={`/transactions?bucket=${bucketId}`} className={bm.inlineAction}>
              See all months
            </Link>
          }
        >
          <Database<TxRow>
            id="bucket.transactions"
            label={`Transactions in ${bucket.name} this month`}
            noun={['transaction', 'transactions']}
            rows={b.rows}
            rowKey={(r) => r.id}
            columns={txColumns}
            views={[
              { id: 'table', name: 'Table', layout: 'table' },
              { id: 'list', name: 'List', layout: 'list' },
            ]}
            defaultGroup="none"
            card={{ title: (r) => r.note || r.name }}
            onOpen={(r) => router.push(r.href)}
            emptyText={`No transactions in ${monthTitle(b.month)} yet.`}
          />
        </Block>

        {b.adjustments.length > 0 && (
          <Block title="Adjustments and justifications">
            <div className={styles.timeline}>
              {b.adjustments.map((entry) => (
                <AdjustmentRow key={entry.id} entry={entry} currency={b.currency} onOpen={() => b.setOpenAdjustment(entry.id)} />
              ))}
            </div>
          </Block>
        )}

        <Block title="Notes">
          <NotesBlock bucketId={bucketId} initial={bucket.notes ?? ''} />
        </Block>
      </div>

      <aside className={styles.side} aria-label="Summary">
        <section className={styles.sideCard}>
          <div className={styles.sideHead}>
            <h2>Summary</h2>
            <span className={bm.chip} data-tone={status.tone}>
              {status.text}
            </span>
          </div>
          <dl className={styles.grid}>
            <div>
              <dt>{type === 'Income' ? 'Expected' : 'Planned'}</dt>
              <dd>{money(planned)}</dd>
            </div>
            <div>
              <dt>{actualLabel}</dt>
              <dd data-tone={type !== 'Income' && left < -0.5 ? 'bad' : undefined}>{money(actual)}</dd>
            </div>
            <div>
              <dt>{left < 0 ? 'Over' : type === 'Income' ? 'To come' : 'Left'}</dt>
              <dd data-tone={left < -0.5 && type !== 'Income' ? 'bad' : undefined}>{money(Math.abs(left))}</dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>{lines.length}</dd>
            </div>
          </dl>
          <span className={styles.bar}>
            <span style={{ width: `${planned > 0 ? Math.min(100, (actual / planned) * 100) : 0}%` }} data-over={(type !== 'Income' && actual > planned + 0.5) || undefined} />
          </span>
        </section>

        {type !== 'Income' && (
          <section className={styles.sideCard}>
            <div className={styles.sideHead}>
              <h2>Automation</h2>
              <Zap size={16} strokeWidth={2.25} aria-hidden />
            </div>
            {automated.length ? (
              <ul className={styles.autoList}>
                {automated.map((l) => (
                  <li key={l.key}>
                    <strong>{l.name}</strong>
                    <span>{automationLabel(l.automation, (id) => v.incomeLines.find((i) => i.itemId === id)?.name)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nothing in this basket is prepared automatically. Set it per line in the Automation column.</p>
            )}
            {nextPrepared && (
              <p className={styles.next}>
                Next: {nextPrepared.name}, {money(nextPrepared.left)}
              </p>
            )}
          </section>
        )}
      </aside>

      {peekLine && (
        <SidePeek title={peekLine.name} mode={peek.mode} onMode={peek.setMode} onClose={peek.close} fullHref={peek.href}>
          <LinePeekContent
            line={peekLine}
            ctx={ctx}
            currency={b.currency}
            onSkip={async (line) => {
              await v.bulkSkip([line]);
              peek.close();
            }}
          />
        </SidePeek>
      )}
      {closing && (
        <CloseBucketSheet
          month={monthTitle(b.month)}
          currency={b.currency}
          leftover={b.netLeftover}
          over={b.netOver}
          busy={b.adjustmentBusy}
          error={b.adjustmentError}
          onClose={() => setClosing(false)}
          onConfirm={async (note) => {
            await b.closeBucket(note);
            setClosing(false);
          }}
        />
      )}
      {b.openAdjustment && (
        <AdjustmentSheet
          key={b.openAdjustment.id}
          entry={b.openAdjustment}
          currency={b.currency}
          busy={b.adjustmentBusy}
          error={b.adjustmentError}
          onClose={() => b.setOpenAdjustment(null)}
          onUndo={() => b.undoAdjustment(b.openAdjustment!)}
          onSave={(fields) => b.editJustification(b.openAdjustment!.justification!.id, fields)}
        />
      )}
      {scope.dialog}
    </div>
  );
}

/** Free-text notes, like a Notion page body. Saved when it loses focus. */
export function NotesBlock({ bucketId, itemId, initial }: { bucketId: string; itemId?: string; initial: string }) {
  const { user } = useFirebaseUser();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  // Follow edits from another device while not typing here — "adjust
  // state during render", not an effect.
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
        if (!user || text === saved) return;
        try {
          if (itemId) {
            await updateItemFields(user.uid, bucketId, itemId, { notes: text });
          } else {
            await updateBucketFields(user.uid, bucketId, { notes: text });
          }
          setSaved(text);
        } catch (caught) {
          showToast(caught instanceof Error ? caught.message : 'Could not save the notes.');
        }
      }}
    />
  );
}
