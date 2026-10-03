'use client';

// Item details — one bucket item in one month: title, spec grid, the
// action it needs, its transactions, money moved in or out (with undo),
// and a sticky bar. Changing just this month's amount or skipping the
// month live in the "…" menu.

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowLeftRight, MoreHorizontal, Pencil, Sparkles, Undo2 } from 'lucide-react';
import { useLogic } from '@/src/logic/planningItem/useLogic';
import { useLogic as useItemMonth } from '@/src/logic/bucketItemMonth/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { money, monthTitle, dayMonth } from '@/src/viewmodels/planning';
import type { ItemMonth } from '@/src/shared/budget/monthBudget';
import { Bar, HistoryRowView, SpecCell, SpecRow, coverHref, reallocateHref } from '@/src/screens/Planning/PlanningParts';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import p from '@/src/screens/Planning/Planning.module.css';
import styles from './PlanningItemScreen.module.css';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { ItemPage } from './ItemPage';

export function PlanningItemScreen({ bucketId, itemId }: { bucketId: string; itemId: string }) {
  const it = useLogic(bucketId, itemId);
  // Medium screens and up: the Notion-style item page (one header: the
  // top bar's breadcrumb). Phones keep the page below.
  const inShell = useHasTopBar();
  if (inShell) {
    if (it.loading) return <ScreenState loading />;
    return <ItemPage bucketId={bucketId} itemId={itemId} it={it} />;
  }
  if (it.loading || !it.entry) {
    return (
      <div className={`${p.page} ${p.detail}`}>
        <ScreenHeader
          left={
            <button type="button" className={p.roundButton} onClick={it.goBack} aria-label="Back">
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
          }
        />
        <ScreenState loading={it.loading} error={!it.loading ? `This item isn't in the budget for ${monthTitle(it.month)}.` : null} />
      </div>
    );
  }
  return <ItemBody it={it} entry={it.entry} />;
}

function ItemBody({ it, entry }: { it: ReturnType<typeof useLogic>; entry: ItemMonth }) {
  const { month, currency, data, prompt } = it;
  const m = useItemMonth({
    entry,
    month,
    budget: data.budget,
    buckets: data.buckets,
    itemsByBucket: data.itemsByBucket,
    allocations: data.allocations,
    transactionsById: data.transactionsById,
    transfersById: data.transfersById,
  });
  const [editingAmount, setEditingAmount] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const income = entry.type === 'Income';
  // Still needs action: never settled, or settled with part left open.
  const over = prompt?.kind === 'over' || prompt?.kind === 'uncovered';
  const leftover = prompt?.kind === 'leftover';
  const left = entry.remaining;
  const moved = entry.allocatedIn - entry.allocatedOut;

  return (
    <div className={`${p.page} ${p.detail} ${styles.page}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={it.goBack} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        right={
          <>
            <Link href={`/edit-bucket-item/${entry.bucketId}/${entry.itemId}`} className={p.roundButton} aria-label="Edit item">
              <Pencil size={17} strokeWidth={2} />
            </Link>
            <ActionMenu
              ariaLabel="More"
              triggerClassName={p.roundButton}
              triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
              items={[
                {
                  key: 'amount',
                  label: `Change ${monthTitle(month)}'s amount`,
                  icon: <Pencil size={14} strokeWidth={2} />,
                  onSelect: () => {
                    m.start('override');
                    setEditingAmount(true);
                  },
                },
                ...(!m.hasPayments && !income
                  ? [{ key: 'skip', label: `Skip ${monthTitle(month)}`, icon: <Undo2 size={14} strokeWidth={2} />, onSelect: () => setConfirmSkip(true) }]
                  : []),
              ]}
            />
          </>
        }
      />

      <h1 className={p.heroTitle}>{entry.name}</h1>
      <p className={p.heroSub}>{monthTitle(month)}</p>

      <div className={styles.heroBar}>
        <Bar spent={entry.actual} planned={entry.available} over={over} />
      </div>
      <p className={styles.heroTotal}>
        <strong>{money(entry.actual)}</strong> of {money(entry.available)} {currency} {income ? 'received' : 'spent'}
      </p>

      {editingAmount && (
        <form
          className={styles.amountForm}
          onSubmit={async (e) => {
            e.preventDefault();
            await m.saveOverride(Number(m.amountString));
            setEditingAmount(false);
          }}
        >
          <label>
            Planned for {monthTitle(month)} ({currency})
            <input inputMode="decimal" value={m.amountString} onChange={(e) => m.setAmountString(e.target.value)} autoFocus />
          </label>
          <div className={styles.amountActions}>
            {entry.isOverride && (
              <button
                type="button"
                className={p.textButton}
                onClick={async () => {
                  await m.saveOverride(null);
                  setEditingAmount(false);
                }}
              >
                Use the usual amount
              </button>
            )}
            <button type="button" className={p.textButton} onClick={() => setEditingAmount(false)}>
              Cancel
            </button>
            <button type="submit" className={p.fillButton} disabled={m.busy}>
              Save
            </button>
          </div>
          {m.error && <p className={styles.error}>{m.error}</p>}
        </form>
      )}

      <section className={p.spec}>
        <SpecRow>
          <SpecCell label="Planned" value={money(entry.available)} />
          <SpecCell label={income ? 'Received' : 'Spent'} value={money(entry.actual)} />
          <SpecCell label={left < 0 ? (over ? 'Over' : 'Above estimate') : 'Left'} value={money(Math.abs(left))} tone={over ? 'over' : undefined} />
        </SpecRow>
        <SpecRow>
          <SpecCell label="Type" value={entry.kind === 'Fixed' ? 'Fixed' : 'Planned'} />
          <SpecCell label="Category" value={entry.categoryName} />
        </SpecRow>
        <SpecRow>
          <SpecCell
            label="Next due"
            value={it.nextDue ? dayMonth(it.nextDue.due) : '—'}
            tone={it.nextDue?.status === 'overdue' ? 'over' : undefined}
          />
          <SpecCell label="Paid from" value={it.account ?? '—'} />
          <SpecCell label="Moved" value={moved === 0 ? '—' : `${moved > 0 ? '+' : '-'}${money(Math.abs(moved))}`} />
        </SpecRow>
        <div className={p.healthRow}>
          <span className={p.specLabel}>Health</span>
          <span className={p.specValue} data-tone={over ? 'over' : 'good'}>
            {over
              ? `Over by ${money(prompt!.amount)}`
              : leftover
                ? `${money(prompt!.amount)} left over`
                : prompt?.kind === 'justified'
                  ? `Over, justified (${prompt.reason})`
                  : !income && left < 0
                    ? `${money(-left)} above its estimate — the rest of the bucket covers it`
                    : entry.isOverride
                    ? 'On track · amount changed this month'
                    : 'On track'}
          </span>
        </div>
      </section>

      {entry.justified && <p className={styles.justifiedNote}>“{entry.justified.note || entry.justified.reason}” — {money(entry.justified.amount)} justified</p>}

      {(over || leftover) && (
        <div className={p.promptCard} data-tone={over ? 'over' : 'leftover'}>
          <span className={p.promptCardText}>
            <span className={p.promptCardTitle}>
              {over ? <AlertCircle size={16} strokeWidth={2.5} aria-hidden /> : <Sparkles size={16} strokeWidth={2.5} aria-hidden />}
              {over ? `Over by ${money(prompt!.amount)} ${currency}` : `${money(prompt!.amount)} ${currency} left over`}
            </span>
          </span>
          <Link
            href={over ? coverHref(month, entry.bucketId, entry.itemId) : reallocateHref(month, entry.bucketId, entry.itemId)}
            className={p.fillButton}
            data-tone={over ? 'over' : 'blue'}
          >
            {over ? 'Cover or justify' : 'Reallocate'}
          </Link>
        </div>
      )}

      <div className={p.sectionHead}>
        <h2>Transactions</h2>
      </div>
      {it.rows.length === 0 ? (
        <p className={p.empty}>Nothing recorded against this item this month.</p>
      ) : (
        <div className={p.rows}>
          {it.rows.map((row) => (
            <HistoryRowView key={`${row.kind}-${row.id}`} row={row} currency={currency} showDate />
          ))}
        </div>
      )}

      {m.fundingTrail.length > 0 && (
        <>
          <div className={p.sectionHead}>
            <h2>Money moved</h2>
          </div>
          <div className={p.rows}>
            {m.fundingTrail.map((move) => (
              <div key={move.id} className={`${p.row} ${styles.move}`}>
                <span className={p.rowIcon} data-flow={move.incoming ? 'in' : 'move'} aria-hidden>
                  <ArrowLeftRight size={16} strokeWidth={2.25} />
                </span>
                <span className={p.rowMain}>
                  <span className={p.rowName}>{move.incoming ? `From ${move.counterpart}` : `To ${move.counterpart}`}</span>
                  <span className={p.rowNote}>
                    {move.reason === 'cover_overspend'
                      ? 'Covered an overspend'
                      : move.reason === 'borrow_next_month'
                        ? 'Borrowed from next month'
                        : move.reason === 'return_to_pool'
                          ? 'Back to unallocated'
                          : 'Leftover moved'}
                    {move.note ? ` · ${move.note}` : ''}
                  </span>
                </span>
                <span className={p.rowSide}>
                  <span className={p.rowAmount} data-flow={move.incoming ? 'in' : undefined}>
                    {move.incoming ? '+' : '-'}
                    {money(move.amount)}
                  </span>
                  <button type="button" className={p.textButton} onClick={() => m.setConfirmUndoId(move.id)}>
                    Undo
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={p.sticky}>
        <span className={p.stickyAmount}>
          <span className={p.stickyLabel}>{left < 0 ? 'Over' : income ? 'Still expected' : 'Left'}</span>
          <span className={p.stickyValue}>
            {money(Math.abs(left))}
            <small>{currency}</small>
          </span>
        </span>
        {!income && left > 0 ? (
          <Link href={reallocateHref(month, entry.bucketId, entry.itemId)} className={p.squareButton} aria-label="Reallocate">
            <ArrowLeftRight size={20} strokeWidth={2} />
          </Link>
        ) : null}
        {over ? (
          <Link href={coverHref(month, entry.bucketId, entry.itemId)} className={`${p.fillButton} ${p.bigButton}`} data-tone="over">
            Cover overspend
          </Link>
        ) : leftover ? (
          <Link href={reallocateHref(month, entry.bucketId, entry.itemId)} className={`${p.fillButton} ${p.bigButton}`} data-tone="blue">
            Reallocate
          </Link>
        ) : (
          <Link href={it.addExpenseHref} className={`${p.fillButton} ${p.bigButton}`}>
            {income ? 'Record income' : 'Add expense'}
          </Link>
        )}
      </div>

      {m.confirmUndoId && (
        <ConfirmDialog
          title="Undo this move?"
          message="The money goes back where it came from (a savings move gets a reversing transfer). A move made while settling an overspend undoes that whole settlement. Nothing is deleted — it stays in the history as reverted."
          confirmLabel="Undo"
          cancelLabel="Keep it"
          onConfirm={() => m.undo(m.confirmUndoId!)}
          onCancel={() => m.setConfirmUndoId(null)}
        />
      )}
      {confirmSkip && (
        <ConfirmDialog
          title={`Skip ${monthTitle(month)}?`}
          message="This item won't be part of this month's budget. Other months stay as they are."
          confirmLabel="Skip"
          cancelLabel="Cancel"
          onConfirm={() => m.skip(() => it.goBack())}
          onCancel={() => setConfirmSkip(false)}
        />
      )}
    </div>
  );
}
