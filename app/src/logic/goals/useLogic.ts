'use client';

// Goals hub — its own bottom-nav tab, split from Debt (src/logic/debtsList
// is Debt's own equivalent hub now) per the "two separate pages" request:
// they used to share one Goals & Debt screen behind an in-page tab. List-
// level data only — a goal's line items live on its own detail screen
// (src/logic/goalDetail).

import { useMemo } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { goalsRef } from '@/src/shared/firestore/refs';
import { useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { archiveGoal as archiveGoalWrite } from '@/src/shared/firestore/aggregation';
import { useGoalLineItemsByGoal } from '@/src/shared/hooks/useGoalLineItemsByGoal';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY, DEFAULT_NECESSITY } from '@/src/viewmodels/projects';
import type { FirestoreGoal } from '@/src/shared/firestore/types';

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const goalsQuery = useMemo(() => (uid ? query(goalsRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: goalDocs, loading: goalsLoading, error: goalsError } = useFirestoreCollection<FirestoreGoal>(goalsQuery);

  const currency = ctx.display;

  const goals = useMemo(
    () =>
      goalDocs
        .map((goal) => {
          const total = round2(toDisplay(ctx, goal.totalAmount, ctx.base));
          const completed = round2(toDisplay(ctx, goal.amountCompleted, ctx.base));
          return {
            id: goal.id,
            name: goal.name,
            total,
            completed,
            remaining: round2(Math.max(total - completed, 0)),
            lineItemCount: goal.lineItemCount,
            completedLineItemCount: goal.completedLineItemCount,
            percent:
              goal.lineItemCount > 0 ? Math.round((goal.completedLineItemCount / goal.lineItemCount) * 100) : 0,
            deadline: goal.deadline ? goal.deadline.toDate() : null,
          };
        })
        .sort((a, b) => b.percent - a.percent),
    [goalDocs, ctx]
  );

  // Every active goal's not-yet-completed line items — the Goals page's
  // gauge card, either grouped by necessity (must have vs nice to have) or
  // by priority (high/medium/low), the user's choice. Same fan-out-per-goal
  // hook the cross-goal "All goal items" list uses (src/logic/goalItems),
  // so the two screens' numbers can never disagree.
  const { itemsByGoal, loading: lineItemsLoading } = useGoalLineItemsByGoal(goalDocs);

  const necessityBreakdown = useMemo(() => {
    let mustHaveCount = 0;
    let niceToHaveCount = 0;
    let mustHaveAmountRemaining = 0;
    for (const goal of goalDocs) {
      for (const item of itemsByGoal[goal.id] ?? []) {
        if (item.completed) continue;
        const necessity = item.necessity ?? DEFAULT_NECESSITY;
        if (necessity === 'MustHave') {
          mustHaveCount += 1;
          mustHaveAmountRemaining += toDisplay(ctx, item.amount, goal.currency);
        } else {
          niceToHaveCount += 1;
        }
      }
    }
    return { mustHaveCount, niceToHaveCount, mustHaveAmountRemaining: round2(mustHaveAmountRemaining) };
  }, [goalDocs, itemsByGoal, ctx]);

  const priorityBreakdown = useMemo(() => {
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let highAmountRemaining = 0;
    for (const goal of goalDocs) {
      for (const item of itemsByGoal[goal.id] ?? []) {
        if (item.completed) continue;
        const priority = item.priority ?? DEFAULT_PRIORITY;
        if (priority === 'High') {
          highCount += 1;
          highAmountRemaining += toDisplay(ctx, item.amount, goal.currency);
        } else if (priority === 'Medium') {
          mediumCount += 1;
        } else {
          lowCount += 1;
        }
      }
    }
    return { highCount, mediumCount, lowCount, highAmountRemaining: round2(highAmountRemaining) };
  }, [goalDocs, itemsByGoal, ctx]);

  async function archiveGoal(id: string) {
    if (!uid) return;
    await archiveGoalWrite(uid, id);
  }

  return {
    currency,
    goals,
    necessityBreakdown,
    priorityBreakdown,
    archiveGoal,
    loading: ctxLoading || goalsLoading,
    lineItemsLoading,
    error: goalsError,
  };
}
