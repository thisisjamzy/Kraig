'use client';

// A basket in one month on a phone, minimal (Minimal.module.css):
//   - its name over one grey line ("Monthly · Expenses"), the description
//     as one line with More;
//   - Planned, Used and Left in one row;
//   - no alerts: over plan, not covered or left over are in Notifications;
//   - its items as a full-width list grouped by kind: Payments ("5 Oct ·
//     Paid", with Pay for what's still due), Allowances ("22,000 left ·
//     about 1,000 a day"), Set aside ("Saved 27,000 of 120,000 · by Dec");
//     income items with "Add received"; transfers as Moves between wallets
//     ("Not moved yet · fee 500", with Move), never payments;
//   - the month's transactions, with See all;
//   - "Add expense to this basket" at the bottom (the basket chosen, the
//     amount empty). Notes and adjustments are behind More.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ChevronRight, FileDown, Lock, LockOpen, MoreHorizontal, Pencil, Plus, Printer, ArrowRight } from 'lucide-react';
import { useLogic } from '@/src/logic/planningBucket/useLogic';
import { payHref } from '@/src/logic/planning/usePaymentsTab';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { dayMonth, money, monthTitle } from '@/src/viewmodels/planning';
import { ITEM_KIND_GROUP, type ItemKind } from '@/src/shared/budget/itemKinds';
import { occurrenceBuild } from '@/src/shared/budget/cadence';
import type { ItemMonth } from '@/src/shared/budget/monthBudget';
import { InfoButton, MoreText } from '@/src/phone/screens/Planning/MinimalParts';
import { AdjustmentRow, AdjustmentSheet } from '@/src/phone/screens/PlanningBucket/Adjustments';
import { CloseBucketSheet } from '@/src/phone/screens/PlanningBucket/CloseBucketSheet';
import { ReceiptSheet } from '@/src/phone/screens/PlanningBucket/ReceiptSheet';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import m from '@/src/phone/screens/Planning/Minimal.module.css';
import adj from '@/src/phone/screens/PlanningBucket/Adjustments.module.css';

type Group = ItemKind | 'income' | 'move';
const GROUPS: Group[] = ['income', 'payment', 'allowance', 'set_aside', 'move'];
const GROUP_LABEL: Record<Group, string> = { income: 'Income', ...ITEM_KIND_GROUP, move: 'Moves between wallets' };

export function PlanningBucketScreen({ bucketId }: { bucketId: string }) {
  return <PlanningBucketView bucketId={bucketId} b={useLogic(bucketId)} />;
}

/** The page, fed by its logic: presentational, so it can also be rendered with sample data. */
export function PlanningBucketView({ bucketId, b }: { bucketId: string; b: ReturnType<typeof useLogic> }) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const [more, setMore] = useState(false);
  const card = b.card;
  const view = b.view;

  if (b.loading || !card || !b.bucket || !view) {
    return (
      <div className={`${p.page} ${p.detail}`}>
        <ScreenHeader
          left={
            <button type="button" className={p.roundButton} onClick={b.goBack} aria-label="Back">
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
          }
        />
        <ScreenState
          loading={b.loading}
          error={!b.loading ? (b.bucket ? `Nothing planned in this basket for ${monthTitle(b.month)}.` : 'This basket could not be found.') : null}
        />
      </div>
    );
  }

  const income = b.bucket.type === 'Income';
  const entries = b.items.map((x) => x.item);
  const groupOf = (entry: ItemMonth): Group => (entry.type === 'Income' ? 'income' : entry.type === 'Transfer' ? 'move' : (entry.itemKind ?? 'payment'));
  const addLabel = income ? 'Add income to this basket' : b.bucket.type === 'Savings' ? 'Add to this basket' : b.bucket.type === 'Transfer' ? 'Add transfer to this basket' : 'Add expense to this basket';

  return (
    <div className={`${p.page} ${p.detail}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={b.goBack} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        right={
          <ActionMenu
            ariaLabel="More"
            triggerClassName={p.roundButton}
            triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
            items={[
              { key: 'add', label: 'Add item', icon: <Plus size={14} strokeWidth={2} />, onSelect: () => router.push(`/add-basket-item/${bucketId}`) },
              { key: 'edit', label: 'Edit basket', icon: <Pencil size={14} strokeWidth={2} />, onSelect: () => router.push(`/baskets/${bucketId}`) },
              b.closed
                ? { key: 'reopen', label: 'Reopen basket', icon: <LockOpen size={14} strokeWidth={2} />, onSelect: () => b.reopenBucket() }
                : { key: 'close', label: `Close for ${monthTitle(b.month)}`, icon: <Lock size={14} strokeWidth={2} />, onSelect: () => setClosing(true) },
              { key: 'history', label: 'All transactions', icon: <ArrowRight size={14} strokeWidth={2} />, onSelect: () => router.push(`/budget?tab=history&month=${b.month}&bucket=${bucketId}`) },
              { key: 'print', label: 'Print', icon: <Printer size={14} strokeWidth={2} />, onSelect: () => setReceipt(true) },
              { key: 'export', label: 'Export as PDF', icon: <FileDown size={14} strokeWidth={2} />, onSelect: () => setReceipt(true) },
            ]}
          />
        }
      />

      <h1 className={m.title}>{card.name}</h1>
      <p className={m.subtitle}>
        {b.cadenceLine} · {monthTitle(b.month)}
      </p>
      {b.bucket.description && <MoreText title={card.name} text={b.bucket.description} />}

      {b.archived && (
        <p className={m.oneLine}>
          <span>Archived. Its payments still count.</span>
          <button type="button" className={m.textLink} onClick={() => b.unarchiveBucket()}>
            Unarchive
          </button>
        </p>
      )}
      {b.closed && (
        <p className={m.oneLine}>
          <span>Closed for {monthTitle(b.month)}.</span>
          <button type="button" className={m.textLink} onClick={() => b.reopenBucket()}>
            Reopen
          </button>
        </p>
      )}

      <div className={`${m.bleed} ${m.section}`}>
        <div className={m.figures}>
          <div className={m.figureCell}>
            <span className={m.figureLabel}>{income ? 'Expected' : 'Planned'}</span>
            <span className={m.figureValue}>{money(view.planned)}</span>
          </div>
          <div className={m.figureCell}>
            <span className={m.figureLabel}>{income ? 'Received' : 'Used'}</span>
            <span className={m.figureValue}>{money(view.used)}</span>
          </div>
          <div className={m.figureCell}>
            <span className={m.figureLabel}>{view.left < 0 && !income ? 'Over' : income ? 'To come' : 'Left'}</span>
            <span className={m.figureValue} data-tone={view.left < -0.5 && !income ? 'problem' : undefined}>
              {money(Math.abs(view.left))}
            </span>
          </div>
        </div>
      </div>

      {/* Over plan, not covered or left over: in Notifications, not here. */}

      <div className={m.bleed}>
        {GROUPS.map((kind) => {
          const list = entries.filter((e) => groupOf(e) === kind);
          if (!list.length) return null;
          return (
            <section key={kind} className={m.section} aria-label={GROUP_LABEL[kind]}>
              <div className={m.sectionHead}>
                <span className={m.label}>{GROUP_LABEL[kind]}</span>
                {kind === 'allowance' && <InfoButton topic="pace" label="About the daily pace" />}
              </div>
              <div className={m.list}>
                {list.map((entry) => (
                  <ItemRow key={entry.key} entry={entry} b={b} bucketId={bucketId} />
                ))}
              </div>
            </section>
          );
        })}
        <div className={`${m.list} ${m.section}`}>
          <Link href={`/add-basket-item/${bucketId}`} className={m.quiet}>
            <Plus size={16} strokeWidth={2.5} aria-hidden />
            Add item
          </Link>
        </div>

        <section className={m.section} aria-label="Transactions">
          <div className={m.sectionHead}>
            <span className={m.label}>Transactions</span>
            <Link href={`/budget?tab=history&month=${b.month}&bucket=${bucketId}`} className={m.textLink}>
              See all
            </Link>
          </div>
          <div className={m.list}>
            {b.rows.length === 0 ? (
              <p className={m.empty}>Nothing recorded this month.</p>
            ) : (
              b.rows.slice(0, 5).map((row) => (
                <Link key={`${row.kind}-${row.id}`} href={row.href} className={m.row}>
                  <span className={m.main}>
                    <span className={m.name}>{row.note || row.name}</span>
                    <span className={m.line}>
                      {dayMonth(row.date)}
                      {row.method ? ` · ${row.method}` : ''}
                    </span>
                  </span>
                  <span className={m.side}>
                    <span className={m.figure}>
                      {row.kind === 'transaction' ? (row.amount > 0 ? '+' : '-') : ''}
                      {money(Math.abs(row.amount))}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <div className={`${m.list} ${m.section}`}>
          <button type="button" className={m.row} aria-expanded={more} onClick={() => setMore((x) => !x)}>
            <span className={m.main}>
              <span className={m.name}>More</span>
              <span className={m.line}>Notes and adjustments</span>
            </span>
            <ChevronRight size={18} strokeWidth={2} aria-hidden style={{ transform: more ? 'rotate(90deg)' : undefined }} />
          </button>
        </div>
      </div>

      {more && (
        <>
          {b.bucket.notes ? <MoreText title="Notes" text={b.bucket.notes} /> : <p className={m.oneLine}>No notes.</p>}
          {b.adjustments.length > 0 ? (
            <div className={adj.list} style={{ marginTop: 12 }}>
              {b.adjustments.map((entry) => (
                <AdjustmentRow key={entry.id} entry={entry} currency={b.currency} onOpen={() => b.setOpenAdjustment(entry.id)} />
              ))}
            </div>
          ) : (
            <p className={m.oneLine}>No adjustments this month.</p>
          )}
        </>
      )}

      <div className={m.bottomAction}>
        <Link href={b.addToBasketHref} className={m.primary}>
          <Plus size={18} strokeWidth={2.5} aria-hidden />
          {addLabel}
        </Link>
      </div>

      {b.receiving && (
        <Modal title={`Add received · ${b.receiving.name}`} onClose={b.cancelReceiving}>
          <p className={m.sheetText}>
            {money(b.receiving.actual)} received of {money(b.receiving.available)} expected.
          </p>
          <label className={m.sheetField}>
            Amount
            <input inputMode="decimal" value={b.receiveAmount} onChange={(e) => b.setReceiveAmount(e.target.value)} placeholder="0" autoFocus />
          </label>
          <label className={m.sheetField}>
            Received into
            <select value={b.receiveAccountId} onChange={(e) => b.setReceiveAccountId(e.target.value)}>
              {b.receiveAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {b.adjustmentError && <p className={m.error}>{b.adjustmentError}</p>}
          <button type="button" className={m.primary} style={{ width: '100%' }} disabled={!(Number(b.receiveAmount) > 0) || !b.receiveAccountId || b.adjustmentBusy} onClick={() => void b.confirmReceived()}>
            {b.adjustmentBusy ? 'Saving…' : 'Add received'}
          </button>
        </Modal>
      )}
      {receipt && <ReceiptSheet bucketId={bucketId} month={b.month} onClose={() => setReceipt(false)} />}
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
    </div>
  );
}

/** One item: name, its one line, the figure on the right, and its one action (Pay, Add received). */
function ItemRow({ entry, b, bucketId }: { entry: ItemMonth; b: ReturnType<typeof useLogic>; bucketId: string }) {
  const row = b.rowsByItem.get(entry.key);
  if (!row) return null;
  const href = `/budget/item/${bucketId}/${entry.itemId}?month=${b.month}`;
  const build = occurrenceBuild(entry.occurrences, entry.frequency, entry.unitAmount);
  const figure =
    row.kind === 'payment' ? (
      <span className={m.figure} data-tone={row.problem ? 'problem' : undefined}>
        {money(row.planned)}
      </span>
    ) : (
      <span className={m.figure} data-tone={row.problem ? 'problem' : undefined}>
        {money(row.used)}
        <small> / {money(row.planned)}</small>
      </span>
    );
  const action =
    row.kind === 'payment' && row.payable > 0.5 && !entry.closed ? (
      <Link className={m.action} href={payHref({ bucketId, itemId: entry.itemId, remaining: row.payable, amount: row.planned, due: entry.due ?? new Date() }, b.month)}>
        Pay
      </Link>
    ) : row.kind === 'move' && entry.actual < entry.available - 0.5 && !entry.closed ? (
      // Opens the transfer form for this move; the amount is left to type.
      <Link className={m.action} href={`/add-transaction?bucketItem=${encodeURIComponent(`${bucketId}:${entry.itemId}:${b.month}`)}`}>
        Move
      </Link>
    ) : row.kind === 'income' && !entry.closed ? (
      <button type="button" className={m.action} onClick={() => b.startReceiving(entry)}>
        Add received
      </button>
    ) : null;
  const link = (
    <Link href={href} className={m.row}>
      <span className={m.main}>
        <span className={m.name}>{entry.name}</span>
        <span className={m.line} data-tone={row.problem ? 'problem' : undefined}>
          {row.line}
        </span>
      </span>
      <span className={m.side}>
        {figure}
        {build && <span className={m.line}>{build}</span>}
      </span>
    </Link>
  );
  return action ? (
    <div className={m.rowWrap}>
      {link}
      {action}
    </div>
  ) : (
    link
  );
}
