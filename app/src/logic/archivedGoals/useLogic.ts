'use client';

// Settings' own "Archived goals" screen — everything archiveGoal
// (aggregation.ts) has ever set archived: true on. Archiving never
// deletes a goal, this is where it can always be found and brought back.

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { goalsRef } from '@/src/shared/firestore/refs';
import { useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { restoreGoal as restoreGoalWrite, deleteGoal as deleteGoalWrite } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreGoal } from '@/src/shared/firestore/types';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const archivedGoalsQuery = useMemo(
    () => (uid ? query(goalsRef(uid), where('archived', '==', true)) : null),
    [uid]
  );
  const { data: goalDocs, loading: goalsLoading, error } = useFirestoreCollection<FirestoreGoal>(archivedGoalsQuery);

  const goals = useMemo(
    () =>
      goalDocs
        .map((goal) => ({
          id: goal.id,
          name: goal.name,
          kind: goal.kind ?? 'Variable',
          total: round2(toDisplay(ctx, goal.totalAmount, ctx.base)),
          currency: ctx.display,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [goalDocs, ctx]
  );

  async function restoreGoal(id: string) {
    if (!uid) return;
    await restoreGoalWrite(uid, id);
  }

  async function deleteGoal(id: string) {
    if (!uid) return;
    await deleteGoalWrite(uid, id);
  }

  function goBack() {
    router.push('/settings');
  }

  return {
    goals,
    restoreGoal,
    deleteGoal,
    goBack,
    loading: ctxLoading || goalsLoading,
    error,
  };
}
