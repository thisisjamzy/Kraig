'use client';

// Planning > Budget on a phone, minimal (Minimal.module.css), top to bottom:
//   1. the month card, laid out like Home's balance card: the total
//      budgeted as the main figure, a bar against income, then Coming in,
//      Not planned (or Over income, in red) and Available in smaller type;
//      Details opens the full breakdown;
//   2. "Needs you", one line, only when something does (overdue payments
//      first); everything else is in Notifications;
//   3. the baskets, grouped under Income, Expenses, Savings and Transfers
//      (empty groups hidden, each collapsible), no second row of tabs;
//   4. "+ New basket" as a quiet row at the end.
// Wide screens get the Budget page instead (src/screens/BudgetMonth).

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCategories } from '@/src/shared/firestore/queries';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { migrationRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { BASKETS_MIGRATION_ID } from '@/src/shared/budget/basketsMigration';
import { basketList, monthSummary, needsYou } from '@/src/logic/planning/basketList';
import { monthPayments } from '@/src/logic/planning/usePaymentsTab';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import type { FirestoreMigration } from '@/src/shared/firestore/types';
import { BasketGroups, BudgetCard, NeedsYouRow } from '@/src/phone/screens/Planning/MinimalParts';
import m from '@/src/phone/screens/Planning/Minimal.module.css';

export function BudgetTab({ month, data, onOpenPayments }: { month: string; data: PlanningData; onOpenPayments?: () => void }) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: categories } = useCategories();
  const groups = useMemo(() => basketList(data.budget, data.buckets, new Date()), [data.budget, data.buckets]);
  const payments = useMemo(() => monthPayments(month, data, categories), [month, data, categories]);
  const summary = monthSummary(data.totals);
  // The baskets migration's one-time review list, until it's been looked at.
  const { data: review } = useFirestoreDoc<FirestoreMigration>(useMemo(() => (uid ? migrationRef(uid, BASKETS_MIGRATION_ID) : null), [uid]));
  const reviewPending = Boolean(review?.completedAt && !review.reviewedAt && review.report?.length);
  const needs = needsYou(payments, groups);

  return (
    <>
      <BudgetCard summary={summary} totals={data.totals} currency={data.ctx.display} month={month} />

      {needs ? (
        <NeedsYouRow
          text={needs.text}
          amount={needs.amount}
          onOpen={() => (needs.target === 'payments' ? (onOpenPayments ? onOpenPayments() : router.push(`/budget?tab=payments&month=${month}`)) : router.push(`/baskets?month=${month}`))}
        />
      ) : (
        reviewPending && <NeedsYouRow text="Check how your items are sorted" amount={null} onOpen={() => router.push('/budget/item-kinds')} />
      )}

      {groups.length === 0 ? (
        <div className={`${m.bleed} ${m.section}`}>
          <p className={m.empty}>Nothing planned for this month yet.</p>
        </div>
      ) : null}
      <BasketGroups groups={groups} month={month} newHref="/baskets/new" />
    </>
  );
}
