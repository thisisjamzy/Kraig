'use client';

// Bucket details — one bucket in one month, as a full page. Every figure
// is readable in full: amounts never truncate (a cell wraps, or the figure
// steps down a size), only names do. Top to bottom:
//   - title over the period, a slim segmented bar (one segment per item,
//     spent solid, left lighter) with a legend under it (the bucket's
//     totals live once, in the grid below);
//   - a 2 × 2 grid (planned, spent, left, items), then type / category,
//     linked payments (status chips) and last activity as their own rows;
//   - the action card (only when something needs doing);
//   - item cards, latest transactions, and a sticky bar.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Archive, ArrowLeft, ArrowRight, Lock, LockOpen, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/planningBucket/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { dayMonth, fillOf, money, monthTitle } from '@/src/viewmodels/planning';
import { HistoryRowView, coverHref, reallocateHref } from '@/src/screens/Planning/PlanningParts';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import p from '@/src/screens/Planning/Planning.module.css';
import { AdjustmentRow, AdjustmentSheet } from './Adjustments';
import { CloseBucketSheet } from './CloseBucketSheet';
import adj from './Adjustments.module.css';
import styles from './PlanningBucketScreen.module.css';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { BucketPage } from './BucketPage';
import { useFormLink } from '@/src/shared/navigation/useFormLink';

// Distinct brand-blue shades, one per item (segment and legend dot).
const SHADES = ['#3b63f0', '#243a8c', '#7d97f6', '#1c2a6b', '#a9baf9', '#4f6fd8', '#5c6fae', '#c7d3fc'];
const LEGEND_ROWS = 4;

/** An amount with "XAF" after it; the pieces may wrap, never truncate. */
function Amount({ value, currency, prefix }: { value: number; currency: string; prefix?: string }) {
  return (
    <span className={styles.amount}>
      {prefix && <span className={styles.amountPrefix}>{prefix}</span>}
      <span className={styles.amountNumber}>{money(value)}</span>
      <span className={styles.amountUnit}>{currency}</span>
    </span>
  );
}

function scrollToItem(itemId: string) {
  document.getElementById(`item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function PlanningBucketScreen({ bucketId }: { bucketId: string }) {
  const b = useLogic(bucketId);
  // Medium screens and up: the two-column Notion-style page (no in-page
  // header or floating bottom bar). Phones keep the view below.
  const inShell = useHasTopBar();
  if (inShell) {
    if (b.loading || !b.bucket) {
      return <ScreenState loading={b.loading} error={!b.loading ? 'This basket could not be found.' : null} />;
    }
    return <BucketPage bucketId={bucketId} b={b} />;
  }
  return <PlanningBucketView bucketId={bucketId} b={b} />;
}

/** The page, fed by its logic — presentational, so it can also be
 * rendered with sample data. */
export function PlanningBucketView({ bucketId, b }: { bucketId: string; b: ReturnType<typeof useLogic> }) {
  const formLink = useFormLink();
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const card = b.card;
  const currency = b.currency;

  if (b.loading || !card || !b.bucket) {
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

  const prompt = card.prompt;
  // Still needs action: never settled, or settled with part left open.
  const over = prompt?.kind === 'over' || prompt?.kind === 'uncovered';
  const leftover = prompt?.kind === 'leftover';
  const actionCard = over || leftover;
  const left = card.planned - card.spent;
  const spentPct = card.planned > 0 ? Math.round((card.spent / card.planned) * 100) : card.spent > 0 ? 100 : 0;
  const total = Math.max(1, card.items.reduce((s, i) => s + Math.max(0, i.available), 0));
  const legend = card.items.length > LEGEND_ROWS ? card.items.slice(0, LEGEND_ROWS - 1) : card.items;
  const moreCount = card.items.length - legend.length;
  const shade = (i: number) => SHADES[i % SHADES.length];
  const stickyText = money(Math.abs(left));

  return (
    <div className={`${p.page} ${p.detail} ${styles.page}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={b.goBack} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        right={
          <>
            <Link href={`/baskets/${bucketId}`} className={p.roundButton} aria-label="Edit basket">
              <Pencil size={17} strokeWidth={2} />
            </Link>
            <ActionMenu
              ariaLabel="More"
              triggerClassName={p.roundButton}
              triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
              items={[
                { key: 'add', label: 'Add item', icon: <Plus size={14} strokeWidth={2} />, onSelect: () => router.push(formLink('basket-item', { basket: bucketId })) },
                b.closed
                  ? { key: 'reopen', label: 'Reopen basket', icon: <LockOpen size={14} strokeWidth={2} />, onSelect: () => b.reopenBucket() }
                  : { key: 'close', label: `Close basket for ${monthTitle(b.month)}`, icon: <Lock size={14} strokeWidth={2} />, onSelect: () => setClosing(true) },
                {
                  key: 'history',
                  label: 'All transactions',
                  icon: <ArrowRight size={14} strokeWidth={2} />,
                  onSelect: () => router.push(`/transactions?month=${b.month}&bucket=${bucketId}`),
                },
                { key: 'edit', label: 'Edit basket', icon: <Pencil size={14} strokeWidth={2} />, onSelect: () => router.push(`/baskets/${bucketId}`) },
              ]}
            />
          </>
        }
      />

      <h1 className={p.heroTitle}>{card.name}</h1>
      <p className={p.heroSub}>{monthTitle(b.month)}</p>

      {b.archived && (
        <div className={styles.closedBanner}>
          <Archive size={15} strokeWidth={2.25} aria-hidden />
          <span className={styles.closedText}>
            <strong>Archived</strong>
            <span>Its recorded payments still count. Nothing new is expected from it.</span>
          </span>
          <button type="button" className={p.textButton} onClick={() => b.unarchiveBucket()}>
            Unarchive
          </button>
        </div>
      )}

      {b.closed && (
        <div className={styles.closedBanner}>
          <Lock size={15} strokeWidth={2.25} aria-hidden />
          <span className={styles.closedText}>
            <strong>Closed for {monthTitle(b.month)}</strong>
            {b.closed.note ? <span>“{b.closed.note}”</span> : <span>No note added.</span>}
          </span>
          <button type="button" className={p.textButton} onClick={() => b.reopenBucket()}>
            Reopen
          </button>
        </div>
      )}

      {/* 1. Segment bar and legend */}
      <div className={styles.segments}>
        {card.items.map((item, i) => {
          const share = (Math.max(0, item.available) / total) * 100;
          // Red only for a real overspend (the bucket as a whole went over).
          const isOver = item.type !== 'Income' && item.unfunded > 0;
          return (
            <button
              key={item.key}
              type="button"
              className={styles.segment}
              style={{ flexGrow: Math.max(share, 1.5), ['--c' as string]: isOver ? 'var(--p-red)' : shade(i) }}
              onClick={() => scrollToItem(item.itemId)}
              aria-label={`${item.name}: ${money(item.actual)} of ${money(item.available)} ${currency}`}
            >
              <span className={styles.segmentSpent} style={{ width: `${fillOf(item.actual, item.available) * 100}%` }} />
            </button>
          );
        })}
      </div>
      <ul className={styles.legend}>
        {legend.map((item, i) => (
          <li key={item.key}>
            <button type="button" onClick={() => scrollToItem(item.itemId)}>
              <span className={styles.dot} style={{ background: item.type !== 'Income' && item.unfunded > 0 ? 'var(--p-red)' : shade(i) }} aria-hidden />
              <span className={styles.legendName}>{item.name}</span>
              <span className={styles.legendPair}>
                <strong>{money(item.actual)}</strong> / {money(item.available)}
              </span>
            </button>
          </li>
        ))}
        {moreCount > 0 && <li className={styles.legendMore}>+{moreCount} more</li>}
      </ul>

      {/* 2. Spec card */}
      <section className={styles.spec}>
        <div className={styles.grid}>
          <div className={styles.cell}>
            <span className={p.specLabel}>Planned</span>
            <Amount value={card.planned} currency={currency} />
          </div>
          <div className={styles.cell}>
            <span className={p.specLabel}>Spent</span>
            <Amount value={card.spent} currency={currency} />
            <span className={styles.cellSub}>{spentPct}% of plan</span>
          </div>
          <div className={styles.cell} data-tone={left < 0 ? 'over' : undefined}>
            <span className={styles.cellLabelRow}>
              <span className={p.specLabel}>Left</span>
              {!actionCard && left >= 0 && prompt?.kind !== 'justified' && <span className={p.chip}>On track</span>}
              {prompt?.kind === 'justified' && (
                <span className={p.chip} data-tone="neutral">
                  Justified
                </span>
              )}
            </span>
            {left < 0 ? <Amount value={-left} currency={currency} prefix="Over by" /> : <Amount value={left} currency={currency} />}
          </div>
          <div className={styles.cell}>
            <span className={p.specLabel}>Items</span>
            <span className={styles.amount}>
              <span className={styles.amountNumber}>{card.itemCount}</span>
            </span>
          </div>
        </div>

        <div className={styles.pairRow}>
          <div className={styles.detail}>
            <span className={p.specLabel}>Type</span>
            <span className={styles.detailValue}>{b.bucket.kind === 'Fixed' ? 'Fixed' : 'Planned'}</span>
          </div>
          <div className={styles.detail}>
            <span className={p.specLabel}>Category</span>
            <span className={styles.detailValue}>{b.category}</span>
          </div>
        </div>

        <Link href={b.paymentsHref} className={styles.lineRow}>
          <span className={p.specLabel}>Linked payments</span>
          <span className={styles.lineValue}>
            {b.upcomingCount > 0 && <span className={p.chip}>{b.upcomingCount} upcoming</span>}
            {b.overdueCount > 0 && (
              <span className={p.chip} data-tone="over">
                {b.overdueCount} overdue
              </span>
            )}
            {b.upcomingCount === 0 && b.overdueCount === 0 && <span className={styles.muted}>None due</span>}
            <ArrowRight size={14} strokeWidth={2.25} className={styles.lineArrow} aria-hidden />
          </span>
        </Link>

        <div className={styles.lineRow}>
          <span className={p.specLabel}>Last activity</span>
          <span className={styles.lineValue}>
            {b.lastActivity ? (
              <span className={styles.lastActivity}>
                {dayMonth(b.lastActivity.date)}, {b.lastActivity.what}
              </span>
            ) : (
              <span className={styles.muted}>No spending yet</span>
            )}
          </span>
        </div>
      </section>

      {/* 3. What it needs: a chip and its action (the alert itself is in Notifications). */}
      {actionCard && (
        <p className={p.quietPrompt}>
          <span className={p.chip} data-tone={over ? 'over' : 'neutral'}>
            {over ? (prompt?.kind === 'uncovered' ? 'Still uncovered' : 'Over plan') : 'Money left over'} {money(prompt!.amount)} {currency}
          </span>
          <Link href={over ? coverHref(b.month, bucketId) : reallocateHref(b.month, bucketId)} className={p.quietLink}>
            {over ? 'Cover or justify' : 'Reallocate'}
          </Link>
        </p>
      )}

      {/* 4. Items */}
      <div className={p.sectionHead}>
        <h2>Items</h2>
        <Link href={formLink('basket-item', { basket: bucketId })} className={p.textButton}>
          <Plus size={14} strokeWidth={2.5} aria-hidden />
          Add item
        </Link>
      </div>
      <div className={styles.itemGrid}>
        {b.items.map(({ item, over: itemOver, justified: itemJustified, aboveEstimate, movedOut }) => (
          <Link
            key={item.key}
            id={`item-${item.itemId}`}
            href={`/budget/item/${bucketId}/${item.itemId}?month=${b.month}`}
            className={styles.itemCard}
          >
            <span className={styles.itemName}>{item.name}</span>
            <span className={styles.itemLeft} data-tone={itemOver ? 'over' : undefined}>
              {item.type === 'Income'
                ? `${money(item.actual)} in`
                : item.remaining < 0
                  ? aboveEstimate
                    ? `${money(-item.remaining)} above estimate`
                    : `${money(-item.remaining)} over`
                  : `${money(item.remaining)} left`}
            </span>
            <span className={styles.itemOf}>
              {money(item.actual)} / {money(item.available)} {currency}
              {movedOut > 0 && <span className={styles.itemMoved}> · −{money(movedOut)} moved</span>}
            </span>
            <span className={styles.itemBar} role="presentation">
              <span data-tone={itemOver ? 'over' : undefined} style={{ width: `${fillOf(item.actual, item.available) * 100}%` }} />
            </span>
            <span className={styles.itemChips}>
              <span className={styles.statusChip} data-tone={itemOver ? 'over' : undefined}>
                {itemOver ? 'OVER' : itemJustified ? 'JUSTIFIED' : aboveEstimate ? 'ABOVE ESTIMATE' : item.kind === 'Fixed' ? 'FIXED' : 'PLANNED'}
              </span>
              <span className={styles.categoryChip}>{item.categoryName}</span>
            </span>
          </Link>
        ))}
      </div>

      {b.adjustments.length > 0 && (
        <>
          <div className={p.sectionHead}>
            <h2>Adjustments</h2>
          </div>
          <div className={adj.list}>
            {b.adjustments.map((entry) => (
              <AdjustmentRow key={entry.id} entry={entry} currency={currency} onOpen={() => b.setOpenAdjustment(entry.id)} />
            ))}
          </div>
        </>
      )}
      {closing && (
        <CloseBucketSheet
          month={monthTitle(b.month)}
          currency={currency}
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
          currency={currency}
          busy={b.adjustmentBusy}
          error={b.adjustmentError}
          onClose={() => b.setOpenAdjustment(null)}
          onUndo={() => b.undoAdjustment(b.openAdjustment!)}
          onSave={(fields) => b.editJustification(b.openAdjustment!.justification!.id, fields)}
        />
      )}

      <div className={p.sectionHead}>
        <h2>Transactions</h2>
        <Link href={`/transactions?month=${b.month}&bucket=${bucketId}`} className={p.textButton}>
          See all
        </Link>
      </div>
      {b.rows.length === 0 ? (
        <p className={p.empty}>No transactions in this basket yet this month.</p>
      ) : (
        <div className={p.rows}>
          {b.rows.slice(0, 5).map((row) => (
            <HistoryRowView key={`${row.kind}-${row.id}`} row={row} currency={currency} showDate />
          ))}
        </div>
      )}

      {/* 5. Sticky bar: the amount left, Add expense (or edit), the next step. */}
      <div className={p.sticky}>
        <span className={p.stickyAmount}>
          <span className={p.stickyLabel}>{left < 0 ? 'Over' : 'Left'}</span>
          <span className={`${p.stickyValue} ${styles.stickyValue}`} data-size={stickyText.length > 9 ? 'small' : undefined}>
            {stickyText}
            <small>{currency}</small>
          </span>
        </span>
        {actionCard ? (
          <Link href={b.addExpenseHref} className={p.squareButton} aria-label="Add expense" title="Add expense">
            <Plus size={20} strokeWidth={2.25} />
          </Link>
        ) : (
          <Link href={`/baskets/${bucketId}`} className={p.squareButton} aria-label="Edit basket" title="Edit basket">
            <Pencil size={18} strokeWidth={2} />
          </Link>
        )}
        {over ? (
          <Link href={coverHref(b.month, bucketId)} className={`${p.fillButton} ${p.bigButton}`} data-tone="over">
            Cover overspend
          </Link>
        ) : leftover ? (
          <Link href={reallocateHref(b.month, bucketId)} className={`${p.fillButton} ${p.bigButton}`} data-tone="blue">
            Reallocate
          </Link>
        ) : (
          <Link href={b.addExpenseHref} className={`${p.fillButton} ${p.bigButton}`}>
            Add expense
          </Link>
        )}
      </div>
    </div>
  );
}
