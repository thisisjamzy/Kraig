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
import { AlertCircle, ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Plus, Sparkles } from 'lucide-react';
import { useLogic } from '@/src/logic/planningBucket/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { dayMonth, fillOf, money, monthTitle } from '@/src/viewmodels/planning';
import { HistoryRowView, coverHref, reallocateHref } from '@/src/screens/Planning/PlanningParts';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import p from '@/src/screens/Planning/Planning.module.css';
import styles from './PlanningBucketScreen.module.css';

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
  return <PlanningBucketView bucketId={bucketId} b={useLogic(bucketId)} />;
}

/** The page, fed by its logic — presentational, so it can also be
 * rendered with sample data. */
export function PlanningBucketView({ bucketId, b }: { bucketId: string; b: ReturnType<typeof useLogic> }) {
  const router = useRouter();
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
          error={!b.loading ? (b.bucket ? `Nothing planned in this bucket for ${monthTitle(b.month)}.` : 'This bucket could not be found.') : null}
        />
      </div>
    );
  }

  const prompt = card.prompt;
  const over = prompt?.kind === 'over';
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
            <Link href={`/buckets/${bucketId}`} className={p.roundButton} aria-label="Edit bucket">
              <Pencil size={17} strokeWidth={2} />
            </Link>
            <ActionMenu
              ariaLabel="More"
              triggerClassName={p.roundButton}
              triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
              items={[
                { key: 'add', label: 'Add item', icon: <Plus size={14} strokeWidth={2} />, onSelect: () => router.push(`/add-bucket-item/${bucketId}`) },
                {
                  key: 'history',
                  label: 'All transactions',
                  icon: <ArrowRight size={14} strokeWidth={2} />,
                  onSelect: () => router.push(`/budget?tab=history&month=${b.month}&bucket=${bucketId}`),
                },
                { key: 'edit', label: 'Edit bucket', icon: <Pencil size={14} strokeWidth={2} />, onSelect: () => router.push(`/buckets/${bucketId}`) },
              ]}
            />
          </>
        }
      />

      <h1 className={p.heroTitle}>{card.name}</h1>
      <p className={p.heroSub}>{monthTitle(b.month)}</p>

      {/* 1. Segment bar and legend */}
      <div className={styles.segments}>
        {card.items.map((item, i) => {
          const share = (Math.max(0, item.available) / total) * 100;
          const isOver = item.type !== 'Income' && item.remaining < 0;
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
              <span className={styles.dot} style={{ background: item.type !== 'Income' && item.remaining < 0 ? 'var(--p-red)' : shade(i) }} aria-hidden />
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

      {/* 3. Action card — the situation and what to do. */}
      {actionCard && (
        <div className={p.promptCard} data-tone={over ? 'over' : 'leftover'}>
          <span className={p.promptCardText}>
            <span className={p.promptCardTitle}>
              {over ? <AlertCircle size={16} strokeWidth={2.5} aria-hidden /> : <Sparkles size={16} strokeWidth={2.5} aria-hidden />}
              {over ? 'Over budget' : 'Money left over'}
            </span>
            <span className={p.promptCardSub}>
              {over
                ? `Cover ${money(prompt!.amount)} ${currency} from another bucket or add a reason.`
                : `Move ${money(prompt!.amount)} ${currency} to another bucket or savings.`}
            </span>
          </span>
          <Link
            href={over ? coverHref(b.month, bucketId) : reallocateHref(b.month, bucketId)}
            className={p.fillButton}
            data-tone={over ? 'over' : 'blue'}
          >
            {over ? 'Cover or justify' : 'Reallocate'}
          </Link>
        </div>
      )}

      {/* 4. Items */}
      <div className={p.sectionHead}>
        <h2>Items</h2>
        <Link href={`/add-bucket-item/${bucketId}`} className={p.textButton}>
          <Plus size={14} strokeWidth={2.5} aria-hidden />
          Add item
        </Link>
      </div>
      <div className={styles.itemGrid}>
        {b.items.map(({ item, over: itemOver }) => (
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
                : itemOver
                  ? `${money(-item.remaining)} over`
                  : `${money(item.remaining)} left`}
            </span>
            <span className={styles.itemOf}>
              {money(item.actual)} / {money(item.available)} {currency}
            </span>
            <span className={styles.itemBar} role="presentation">
              <span data-tone={itemOver ? 'over' : undefined} style={{ width: `${fillOf(item.actual, item.available) * 100}%` }} />
            </span>
            <span className={styles.itemChips}>
              <span className={styles.statusChip} data-tone={itemOver ? 'over' : undefined}>
                {itemOver ? 'OVER' : item.kind === 'Fixed' ? 'FIXED' : 'PLANNED'}
              </span>
              <span className={styles.categoryChip}>{item.categoryName}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className={p.sectionHead}>
        <h2>Transactions</h2>
        <Link href={`/budget?tab=history&month=${b.month}&bucket=${bucketId}`} className={p.textButton}>
          See all
        </Link>
      </div>
      {b.rows.length === 0 ? (
        <p className={p.empty}>No transactions in this bucket yet this month.</p>
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
          <Link href={`/buckets/${bucketId}`} className={p.squareButton} aria-label="Edit bucket" title="Edit bucket">
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
