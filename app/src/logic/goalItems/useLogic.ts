'use client';

// The cross-goal "everything left to do" list — every not-yet-completed
// line item across every active goal, in one place, rankable by the user.
// Fans out one onSnapshot per goal id for line items (same shape as
// src/logic/goals/useLogic.ts's own repaymentsByDebt fan-out) rather than a
// collectionGroup('lineItems') query — that would need a collection-group
// index enabled and deployed for a feature this small, where a handful of
// per-goal listeners does the same job with zero new Firebase config.
//
// Two ways to rank:
//  - Apply a sort ("Priority" = nearest goal deadline first, "Ease" =
//    smallest cost first) as the new custom order — writes sequential rank
//    values (0, 1, 2, ...) so the list becomes exactly that order, and the
//    user can then fine-tune it from there.
//  - Manually nudge one item up/down (only while sorted by "Custom") — a
//    plain swap of the two adjacent items' rank values.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { goalsRef } from '@/src/shared/firestore/refs';
import { setGoalLineItemRanks } from '@/src/shared/firestore/aggregation';
import { useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { useGoalLineItemsByGoal } from '@/src/shared/hooks/useGoalLineItemsByGoal';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY, DEFAULT_NECESSITY } from '@/src/viewmodels/projects';
import type { FirestoreGoal, Priority, GoalItemNecessity } from '@/src/shared/firestore/types';

export type GoalItemSort = 'custom' | 'priority' | 'ease';

interface GoalItemRow {
  id: string;
  goalId: string;
  goalName: string;
  name: string;
  amount: number;
  rank: number;
  priority: Priority;
  necessity: GoalItemNecessity;
  deadline: Date | null;
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const goalsQuery = useMemo(() => (uid ? query(goalsRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: goalDocs, loading: goalsLoading } = useFirestoreCollection<FirestoreGoal>(goalsQuery);

  const { itemsByGoal, loading: itemsLoading } = useGoalLineItemsByGoal(goalDocs);

  const pendingItems = useMemo(() => {
    const list: GoalItemRow[] = [];
    for (const goal of goalDocs) {
      for (const item of itemsByGoal[goal.id] ?? []) {
        if (item.completed) continue;
        list.push({
          id: item.id,
          goalId: goal.id,
          goalName: goal.name,
          name: item.name,
          amount: round2(toDisplay(ctx, item.amount, goal.currency)),
          rank: item.rank ?? 0,
          priority: item.priority ?? DEFAULT_PRIORITY,
          necessity: item.necessity ?? DEFAULT_NECESSITY,
          deadline: goal.deadline ? goal.deadline.toDate() : null,
        });
      }
    }
    return list;
  }, [goalDocs, itemsByGoal, ctx]);

  const [sortMode, setSortMode] = useState<GoalItemSort>('custom');
  const sortedItems = useMemo(() => {
    const list = [...pendingItems];
    if (sortMode === 'priority') {
      list.sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.getTime() - b.deadline.getTime();
      });
    } else if (sortMode === 'ease') {
      list.sort((a, b) => a.amount - b.amount);
    } else {
      list.sort((a, b) => a.rank - b.rank);
    }
    return list;
  }, [pendingItems, sortMode]);

  // Empty selection means "no filter" (show everything) for that group —
  // checking a box narrows to just what's checked, unchecking the last one
  // falls back to showing all again, rather than showing nothing.
  const [priorityFilter, setPriorityFilter] = useState<Priority[]>([]);
  const [necessityFilter, setNecessityFilter] = useState<GoalItemNecessity[]>([]);

  function togglePriorityFilter(priority: Priority) {
    setPriorityFilter((current) =>
      current.includes(priority) ? current.filter((p) => p !== priority) : [...current, priority]
    );
  }
  function toggleNecessityFilter(necessity: GoalItemNecessity) {
    setNecessityFilter((current) =>
      current.includes(necessity) ? current.filter((n) => n !== necessity) : [...current, necessity]
    );
  }

  const items = useMemo(
    () =>
      sortedItems.filter(
        (item) =>
          (priorityFilter.length === 0 || priorityFilter.includes(item.priority)) &&
          (necessityFilter.length === 0 || necessityFilter.includes(item.necessity))
      ),
    [sortedItems, priorityFilter, necessityFilter]
  );

  async function applySortAsCustomOrder() {
    if (!uid || sortMode === 'custom') return;
    await setGoalLineItemRanks(
      uid,
      items.map((item, index) => ({ goalId: item.goalId, lineItemId: item.id, rank: index }))
    );
    setSortMode('custom');
  }

  async function moveItem(index: number, direction: -1 | 1) {
    if (!uid || sortMode !== 'custom') return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const a = items[index];
    const b = items[targetIndex];
    await setGoalLineItemRanks(uid, [
      { goalId: a.goalId, lineItemId: a.id, rank: b.rank },
      { goalId: b.goalId, lineItemId: b.id, rank: a.rank },
    ]);
  }

  function openGoal(goalId: string) {
    router.push(`/goals/${goalId}`);
  }
  function goBack() {
    router.push('/goals');
  }

  return {
    items,
    sortMode,
    setSortMode,
    priorityFilter,
    togglePriorityFilter,
    necessityFilter,
    toggleNecessityFilter,
    applySortAsCustomOrder,
    moveItem,
    currency: ctx.display,
    openGoal,
    goBack,
    loading: ctxLoading || goalsLoading || itemsLoading,
  };
}
