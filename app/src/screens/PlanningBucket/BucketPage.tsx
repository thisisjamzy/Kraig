'use client';

// A basket's page on tablet and web, full width: two columns from 1024px
// (main ~65%, a sticky side column ~35%), one column below with the side
// blocks first.
//   main: the basket's name (no icon) over "Expense basket"; four
//   properties (Month as a dropdown, Category, Account: the default paid
//   from for new items, Automation "3 of 5 items"), more behind "Show more
//   properties" (Type, Created, Items mix, Highest priority); the items
//   database (Table, Cards, Board by Status; New with New item and Import
//   items; row actions Mark paid, Edit, Move to month, Delete; sums and a
//   count in the footer); Upcoming payments with their Ready to pay state;
//   this month's transactions; the adjustments timeline; notes.
//   side: Summary (Planned, Spent, Left, Items; spent against planned; On
//   track, Over plan or Unused), Automation (each automated item and the
//   next one), Payments due (with Open priorities).
// Item-level things (kind, need, priority) live on the items, not here.
// The phone keeps its BASELINE basket screen.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, MoveRight, Pencil, Trash2, Zap } from 'lucide-react';
import type { useLogic as useBucketLogic } from '@/src/logic/planningBucket/useLogic';
import { useBudgetMonth } from '@/src/logic/budgetMonth/useLogic';
import type { LineRow } from '@/src/logic/budgetMonth/lines';
import { itemStatus, itemsMix, highestPriority, nextAutomated, paymentsDue, summaryStatus, upcomingPayments } from '@/src/logic/planningBucket/basketPage';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useReadyToPay } from '@/src/shared/hooks/useReadyToPay';
import { updateBucketFields, updateItemFields } from '@/src/shared/firestore/bucketBudget';
import { deleteBucketLineItem } from '@/src/shared/firestore/aggregation';
import { automationLabel, FLOW_LABEL, FLOW_NOUN, type FlowType } from '@/src/shared/budget/flow';
import { addMonths, monthKeyOf } from '@/src/shared/budget/monthBudget';
import { monthTitle } from '@/src/viewmodels/planning';
import { useBreadcrumb, usePageMenu } from '@/src/widgets/AppShell/breadcrumb';
import { Database } from '@/src/widgets/Database/Database';
import { Block, NotionPageHeader } from '@/src/widgets/Database/NotionPage';
import { MonthPicker } from '@/src/widgets/Database/MonthPicker';
import { PropertiesBlock } from '@/src/widgets/Database/PropertiesBlock';
import { SidePeek, usePeek } from '@/src/widgets/Database/SidePeek';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { Modal } from '@/src/widgets/Modal/Modal';
import { showToast } from '@/src/widgets/Toast/Toast';
import { useFlowLinks } from '@/src/screens/Planning/PlanningParts';
import { LinePeekContent } from '@/src/screens/BudgetMonth/LinePeek';
import { useScopeChooser } from '@/src/screens/BudgetMonth/ScopeChooser';
import type { ColumnContext } from '@/src/screens/BudgetMonth/columns';
import bm from '@/src/screens/BudgetMonth/BudgetMonth.module.css';
import { AdjustmentRow, AdjustmentSheet } from './Adjustments';
import { CloseBucketSheet } from './CloseBucketSheet';
import { basketItemColumns, statusGroup } from './itemColumns';
import styles from './BucketPage.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';

type BucketLogic = ReturnType<typeof useBucketLogic>;
type TxRow = BucketLogic['rows'][number];

const ADD_LABEL: Record<FlowType, string> = { Income: 'Record income', Expense: 'Add expense', Savings: 'Add savings', Transfer: 'Record transfer' };
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function BucketPage({ bucketId, b }: { bucketId: string; b: BucketLogic }) {
  const { coverHref, reallocateHref } = useFlowLinks();
  const formLink = useFormLink();
  const router = useRouter();
  const { user } = useFirebaseUser();
  const v = useBudgetMonth(b.month, b.data);
  const ready = useReadyToPay();
  const scope = useScopeChooser();
  const peek = usePeek<LineRow>((r) => `/budget/item/${r.bucketId}/${r.itemId}?month=${r.month}`);
  const [closing, setClosing] = useState(false);
  const [moving, setMoving] = useState<LineRow | null>(null);
  const bucket = b.bucket;
  const type = (bucket?.type ?? 'Expense') as FlowType;
  useBreadcrumb([{ label: 'Money', href: '/home' }, { label: 'Baskets', href: '/baskets' }, { label: bucket?.name ?? 'Basket' }]);
  // The basket's actions live in the top bar's "..." menu.
  usePageMenu(
    bucket
      ? [
          { label: ADD_LABEL[type], href: b.addExpenseHref },
          ...(bucket.managed ? [] : [{ label: 'New item', href: formLink('basket-item', { basket: bucketId }) }]),
          { label: 'Edit basket', href: formLink('edit-basket', { id: bucketId }) },
          b.closed ? { label: 'Reopen basket', onSelect: () => void b.reopenBucket() } : { label: `Close basket for ${monthTitle(b.month)}`, onSelect: () => setClosing(true) },
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
    editAmount: (line, amount, edit) => v.editAmount(line, amount, edit, scope.askRecorded),
    editDate: v.editDate,
    setField: v.setField,
    markPaid: v.markPaid,
    onError: (message) => showToast(message),
  };

  // Ready to pay's own view of this month (only the current month has one).
  const occurrences = useMemo(
    () => (b.month === monthKeyOf(new Date()) ? ready.all.filter((o) => o.bucketId === bucketId).map((o) => ({ itemId: o.itemId, state: o.state, waitingFor: o.waitingFor })) : []),
    [ready.all, b.month, bucketId]
  );
  const statusOf = useMemo(() => {
    const byItem = new Map(occurrences.map((o) => [o.itemId, o]));
    return (r: LineRow) => itemStatus(r, v.coverage.byKey.get(r.key), byItem.get(r.itemId));
  }, [occurrences, v.coverage]);
  const templates = useMemo(() => new Map(b.templates.map((t) => [t.id, t])), [b.templates]);
  const today = useMemo(() => new Date(), []);

  if (!bucket) return null;
  const planned = lines.reduce((s, l) => s + l.available, 0);
  const actual = lines.reduce((s, l) => s + l.actual, 0);
  const left = planned - actual;
  const money = (n: number) => `${formatNumber(n)} ${b.currency}`;
  const actualLabel = type === 'Income' ? 'Received' : type === 'Savings' ? 'Saved' : type === 'Transfer' ? 'Moved' : 'Spent';
  const automated = lines.filter((l) => l.automation.mode !== 'off');
  const next = nextAutomated(lines, b.templates, b.month, today);
  const status = summaryStatus(planned, actual, type);
  const due = paymentsDue(lines);
  const upcoming = upcomingPayments(lines, occurrences, today);
  const peekLine = peek.row ? (lines.find((r) => r.key === peek.row!.key) ?? peek.row) : null;
  const over = actual > planned + 0.5 && type !== 'Income';

  // The basket's defaults (the New basket form's Category and Default paid from).
  const categoryOptions = b.categories
    .filter((c) => !c.archived && (type === 'Transfer' || c.transactionType === type))
    .map((c) => ({ value: c.id, label: c.name }))
    .sort((x, y) => x.label.localeCompare(y.label));
  const live = v.accounts.filter((a) => !a.archived);
  const paidFromOptions = [
    ...live.map((a) => ({ value: `account:${a.id}`, label: a.name })),
    { value: 'savings', label: 'Savings' },
    { value: 'any_income', label: 'Any income' },
    ...v.incomeLines.map((l) => ({ value: `income:${l.itemId}`, label: `When ${l.name} arrives` })),
  ];
  const paidFromLabel = (key: string | null | undefined) => paidFromOptions.find((o) => o.value === key)?.label ?? null;
  const save = (patch: Record<string, unknown>) => (user ? updateBucketFields(user.uid, bucketId, patch) : undefined);
  const mix = itemsMix(lines);
  const highest = highestPriority(lines);
  const created = bucket.createdAt?.toDate() ?? null;

  const txColumns: ColumnDef<TxRow>[] = [
    { id: 'date', label: 'Date', type: 'date', width: 110, value: (r) => r.date, render: (r) => day(r.date) },
    { id: 'name', label: 'Name', type: 'text', width: 220, value: (r) => r.note || r.name, render: (r) => <Link className={bm.relation} href={r.href}>{r.note || r.name}</Link> },
    { id: 'item', label: 'Item', type: 'text', width: 180, value: (r) => r.name },
    { id: 'account', label: 'Account', type: 'text', width: 160, value: (r) => r.method },
    { id: 'amount', label: 'Amount', type: 'currency', width: 130, value: (r) => Math.abs(r.amount), calc: 'sum' },
  ];

  async function deleteLine(r: LineRow) {
    if (!user) return;
    try {
      // A repeating item leaves this month only; a one-off item goes.
      if (r.recurring) await v.bulkSkip([r]);
      else await deleteBucketLineItem(user.uid, r.bucketId, r.itemId);
      showToast(r.recurring ? `${r.name} removed from ${monthTitle(b.month)}` : `${r.name} deleted`);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'Could not delete that item.');
    }
  }

  return (
    <div className={`${bm.page} ${styles.layout}`}>
      <div className={styles.main}>
        <NotionPageHeader title={bucket.name} kind={`${FLOW_NOUN[type]} basket`}>
          <PropertiesBlock
            visible={4}
            properties={[
              { id: 'month', label: 'Month', display: <MonthPicker value={b.month} onChange={b.setMonth} /> },
              {
                id: 'category',
                label: 'Category',
                display: categoryOptions.find((o) => o.value === bucket.categoryId)?.label ?? (b.category || null),
                ...(type === 'Transfer' ? {} : { edit: { type: 'select' as const, value: bucket.categoryId ?? null, options: categoryOptions, onSave: (next) => save({ categoryId: next || null }) } }),
              },
              {
                id: 'account',
                label: 'Account',
                title: 'Where new items are paid from',
                display: paidFromLabel(bucket.defaultPaidFrom),
                ...(type === 'Income' ? {} : { edit: { type: 'select' as const, value: bucket.defaultPaidFrom ?? null, options: paidFromOptions, onSave: (next) => save({ defaultPaidFrom: next || null }) } }),
              },
              { id: 'automation', label: 'Automation', display: lines.length ? `${automated.length} of ${lines.length} ${lines.length === 1 ? 'item' : 'items'}` : 'No items' },
              { id: 'type', label: 'Type', display: FLOW_LABEL[type] },
              { id: 'created', label: 'Created', display: created ? created.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null },
              { id: 'mix', label: 'Items mix', display: mix },
              { id: 'priority', label: 'Highest priority', display: highest },
            ]}
          />
        </NotionPageHeader>

        {bucket.managed && <p className={styles.managed}>Dreda keeps this basket up to date from your debts&apos; scheduled repayments. Change them on each debt&apos;s page.</p>}

        <Block title="Items">
          <div className={styles.tableBlock}>
            <Database<LineRow>
              id={`basket.page.items.${type.toLowerCase()}`}
              label={`Items in ${bucket.name}`}
              noun={['item', 'items']}
              rows={lines}
              rowKey={(r) => r.key}
              columns={basketItemColumns(type, ctx, statusOf, (r) => templates.get(r.itemId))}
              views={[
                { id: 'table', name: 'Table', layout: 'table' },
                { id: 'cards', name: 'Cards', layout: 'cards' },
                { id: 'board', name: 'Board', layout: 'board', group: 'status' },
              ]}
              groups={[statusGroup(statusOf)]}
              board={{ group: 'status' }}
              defaultGroup="none"
              card={{
                title: (r) => r.name,
                progress: (r) => (r.available > 0 ? { value: r.actual / r.available, over: type !== 'Income' && r.actual > r.available + 0.5 } : null),
              }}
              onOpen={peek.open}
              {...(bucket.managed
                ? {}
                : {
                    onNew: () => router.push(formLink('basket-item', { basket: bucketId })),
                    newTemplates: [
                      { id: 'item', label: 'New item', onSelect: () => router.push(formLink('basket-item', { basket: bucketId })) },
                      { id: 'import', label: 'Import items', onSelect: () => router.push('/settings/import?mode=restore') },
                    ],
                  })}
              rowActions={[
                ...(type !== 'Income' ? [{ id: 'paid', label: 'Mark paid', icon: Check, run: (r: LineRow) => v.markPaid(r), show: (r: LineRow) => r.left > 0.5 }] : []),
                { id: 'edit', label: 'Edit', icon: Pencil, run: (r: LineRow) => router.push(formLink('basket-item', { basket: r.bucketId, item: r.itemId })) },
                { id: 'move', label: 'Move to month', icon: MoveRight, run: (r: LineRow) => setMoving(r), show: (r: LineRow) => !r.recurring && r.actual <= 0 },
                { id: 'delete', label: 'Delete', icon: Trash2, run: deleteLine },
              ]}
              bulkActions={[
                ...(type !== 'Income' ? [{ id: 'paid', label: 'Mark paid', run: (rows: LineRow[]) => v.bulkMarkPaid(rows) }] : []),
                { id: 'skip', label: `Delete from ${monthTitle(b.month).split(' ')[0]}`, danger: true, run: (rows: LineRow[]) => v.bulkSkip(rows) },
              ]}
              emptyText={`Nothing planned in this basket for ${monthTitle(b.month)}.`}
            />
          </div>
        </Block>

        {type !== 'Income' && upcoming.length > 0 && (
          <Block title="Upcoming payments">
            <ul className={styles.upcoming}>
              {upcoming.map((u) => (
                <li key={u.key}>
                  <span className={styles.upDate}>{u.date ? day(u.date) : 'No date'}</span>
                  <span className={styles.upName}>
                    <Link className={bm.relation} href={`/budget/item/${bucketId}/${u.itemId}?month=${b.month}`}>
                      {u.name}
                    </Link>
                    {u.paidFrom && <small>{u.paidFrom}</small>}
                  </span>
                  <span className={styles.upAmount}>{money(u.amount)}</span>
                  <span className={styles.status} data-tone={u.tone}>
                    {u.state}
                  </span>
                </li>
              ))}
            </ul>
          </Block>
        )}

        <Block
          title="Transactions this month"
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
            <span className={styles.status} data-tone={status.tone}>
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
              <dd data-tone={over ? 'bad' : undefined}>{money(actual)}</dd>
            </div>
            <div>
              <dt>{left < 0 ? 'Over' : type === 'Income' ? 'To come' : 'Left'}</dt>
              <dd data-tone={over ? 'bad' : undefined}>{money(Math.abs(left))}</dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>{lines.length}</dd>
            </div>
          </dl>
          <SpentBar planned={planned} actual={actual} label={`${actualLabel} ${money(actual)} of ${money(planned)}`} />
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
              <p>Nothing in this basket is prepared automatically. Set it per item in the Automation column.</p>
            )}
            {next && (
              <p className={styles.next}>
                Next: {next.name}, {money(next.amount)}
                {next.date ? ` on ${day(next.date)}` : ''}
              </p>
            )}
          </section>
        )}

        {type !== 'Income' && (
          <section className={styles.sideCard}>
            <div className={styles.sideHead}>
              <h2>Payments due</h2>
            </div>
            <p>
              {due.count
                ? `${due.count} ${due.count === 1 ? 'payment' : 'payments'} still to pay in ${monthTitle(b.month).split(' ')[0]}: ${money(due.total)}.`
                : `Nothing left to pay in ${monthTitle(b.month).split(' ')[0]}.`}
            </p>
            <Link href="/baskets/items" className={bm.inlineAction}>
              Open priorities
            </Link>
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
      {moving && (
        <Modal title={`Move ${moving.name}`} onClose={() => setMoving(null)}>
          <div className={styles.moveList}>
            {Array.from({ length: 6 }, (_, i) => addMonths(b.month, i + 1)).map((m) => (
              <button
                key={m}
                type="button"
                onClick={async () => {
                  const line = moving;
                  setMoving(null);
                  const [y, mo] = m.split('-').map(Number);
                  const dayOfMonth = line.due ? Math.min(line.due.getDate(), 28) : 1;
                  try {
                    await v.editDate(line, new Date(y, mo - 1, dayOfMonth), 'month');
                    showToast(`${line.name} moved to ${monthTitle(m)}`);
                  } catch (caught) {
                    showToast(caught instanceof Error ? caught.message : 'Could not move that item.');
                  }
                }}
              >
                {monthTitle(m)}
              </button>
            ))}
          </div>
        </Modal>
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

/** Spent against planned: navy on a light grey track, the part over the plan in red. */
function SpentBar({ planned, actual, label }: { planned: number; actual: number; label: string }) {
  const whole = Math.max(planned, actual, 1);
  const within = Math.min(actual, planned);
  const overBy = Math.max(0, actual - planned);
  return (
    <span className={styles.bar} role="img" aria-label={label}>
      <span className={styles.barFill} style={{ width: `${(within / whole) * 100}%` }} />
      {overBy > 0.5 && <span className={styles.barOver} style={{ width: `${(overBy / whole) * 100}%` }} />}
    </span>
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
