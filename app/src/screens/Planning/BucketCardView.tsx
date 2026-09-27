'use client';

// A bucket as a card — the one bucket card, used by Planning's Budget tab
// and the Buckets page alike, so the two can never drift apart. Opens the
// bucket's details (Planning) for the month. Needs Planning's colour
// tokens (Planning.module.css .tokens) on an ancestor.

import Link from 'next/link';
import { money, type BucketCard } from '@/src/viewmodels/planning';
import { Bar, IconCircle, Pair, PromptStrip } from './PlanningParts';
import tab from './PlanningTabs.module.css';

export function BucketCardView({ card, currency, month }: { card: BucketCard; currency: string; month: string }) {
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
              : `Available ${money(card.available)} ${currency}`}
          </span>
        )}
      </Link>
      {card.prompt && <PromptStrip prompt={card.prompt} currency={currency} month={month} bucketId={card.id} />}
    </article>
  );
}
