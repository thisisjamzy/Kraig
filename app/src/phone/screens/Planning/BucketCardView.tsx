'use client';

// A bucket as a card — the one bucket card, used by Planning's Budget tab
// and the Buckets page alike, so the two can never drift apart. Opens the
// bucket's details (Planning) for the month. Needs Planning's colour
// tokens (Planning.module.css .tokens) on an ancestor.

import Link from 'next/link';
import { money, type BucketCard } from '@/src/viewmodels/planning';
import type { FlowType } from '@/src/shared/budget/flow';
import { Bar, IconCircle, Pair, PromptStrip } from '@/src/phone/screens/Planning/PlanningParts';
import tab from '@/src/phone/screens/Planning/PlanningTabs.module.css';

export interface BucketCardExtras {
  /** The kind-specific line: "2 of 9 paid · next: Bunk bed on 10 Oct". */
  line?: string;
  /** Its highest need, as a chip. */
  topNeed?: 'must' | 'nice' | null;
  /** Overdue items — takes the action strip first ("Mark paid"). */
  overdue?: { count: number; amount: number; href: string };
}

export function BucketCardView({
  card,
  currency,
  month,
  extras,
  flow,
}: {
  card: BucketCard;
  currency: string;
  month: string;
  /** Words the footer for its flow type ("still to save", "still to move"). */
  flow?: FlowType;
  /** The Buckets page's extra detail; Planning's Budget tab leaves it out. */
  extras?: BucketCardExtras;
}) {
  // Red only while it still needs action — a settled overspend reads as a
  // grey "justified" tag instead.
  const flagged = card.prompt?.kind === 'over' || card.prompt?.kind === 'uncovered';
  const over = card.overflow > 0 && flagged;
  const plannedMark = over && card.spent > 0 ? (card.planned / card.spent) * 100 : null;
  return (
    <article className={tab.bucketCard}>
      <Link href={`/budget/bucket/${card.id}?month=${month}`} className={tab.bucketBody}>
        <div className={tab.bucketTop}>
          <IconCircle type={card.income ? 'Income' : undefined} />
          <span className={tab.bucketName}>
            <span>{card.name}</span>
            <span className={tab.bucketMeta}>
              {card.itemCount} {card.itemCount === 1 ? 'item' : 'items'}
              {card.archived && ' · archived'}
              {extras?.topNeed && (
                <span className={tab.needChip} data-need={extras.topNeed}>
                  {extras.topNeed === 'must' ? 'Must have' : 'Nice to have'}
                </span>
              )}
            </span>
          </span>
          <Pair spent={card.spent} planned={card.planned} />
        </div>
        <div className={tab.bucketBar}>
          <Bar spent={card.spent} planned={card.planned} over={over} />
          {plannedMark !== null && <span className={tab.planMark} style={{ left: `${plannedMark}%` }} aria-hidden />}
        </div>
        {card.overflow <= 0 && (
          <span className={tab.bucketAvailable}>
            {card.income
              ? card.available > 0
                ? `${money(card.available)} ${currency} still expected`
                : 'All received'
              : flow === 'Savings'
                ? card.available > 0
                  ? `${money(card.available)} ${currency} still to save`
                  : 'All saved'
                : flow === 'Transfer'
                  ? card.available > 0
                    ? `${money(card.available)} ${currency} still to move`
                    : 'All moved'
                  : `Available ${money(card.available)} ${currency}`}
          </span>
        )}
        {extras?.line && <span className={tab.bucketLine}>{extras.line}</span>}
      </Link>
      {extras?.overdue && extras.overdue.count > 0 ? (
        // One action per card, overdue first.
        <div className={tab.overdueStrip}>
          <span>
            {extras.overdue.count} overdue · {money(extras.overdue.amount)} {currency}
          </span>
          <Link href={extras.overdue.href} onClick={(e) => e.stopPropagation()}>
            Mark paid →
          </Link>
        </div>
      ) : (
        card.prompt && <PromptStrip prompt={card.prompt} currency={currency} month={month} bucketId={card.id} />
      )}
    </article>
  );
}
