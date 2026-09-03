'use client';

// Every active goal's line items, fanned out as one onSnapshot per goal id
// (same shape as src/logic/goals/useLogic.ts's own repaymentsByDebt fan-out)
// rather than a collectionGroup('lineItems') query — that would need a
// collection-group index enabled and deployed just for this, where a
// handful of per-goal listeners does the same job with zero new Firebase
// config. Shared by the cross-goal "All goal items" list (src/logic/
// goalItems) and the Goals tab's must-have/nice-to-have gauge
// (src/logic/goals), so the two agree on the same underlying data.

import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { goalLineItemsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreGoalLineItem } from '@/src/shared/firestore/types';

export function useGoalLineItemsByGoal(goals: { id: string }[]) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const [itemsByGoal, setItemsByGoal] = useState<Record<string, (FirestoreGoalLineItem & { id: string })[]>>({});
  const [loading, setLoading] = useState(true);
  const goalIdsKey = goals.map((goal) => goal.id).sort().join(',');

  useEffect(() => {
    if (!uid || goals.length === 0) {
      setItemsByGoal({});
      setLoading(false);
      return;
    }
    setLoading(true);
    let pending = goals.length;
    const unsubscribers = goals.map((goal) =>
      onSnapshot(goalLineItemsRef(uid, goal.id), (snap) => {
        setItemsByGoal((current) => ({
          ...current,
          [goal.id]: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FirestoreGoalLineItem, 'id'>) })),
        }));
        pending = Math.max(0, pending - 1);
        if (pending === 0) setLoading(false);
      })
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, goalIdsKey]);

  return { itemsByGoal, loading };
}
