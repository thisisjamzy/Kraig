'use client';

// A month's setup state (budgetMonths/{yyyy-MM}: the start-of-month banner,
// reviewed or not, "Not yet" answers to income prompts) and the one-time
// flow-type migration report — what the Budget page's banners read.

import { BASKETS_MIGRATION_ID } from '@/src/shared/budget/basketsMigration';
import { useMemo } from 'react';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { budgetMonthRef, migrationRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { FLOW_MIGRATION_ID } from '@/src/shared/budget/flowMigration';
import type { FirestoreBudgetMonth, FirestoreMigration } from '@/src/shared/firestore/types';

export function useBudgetMonthDoc(month: string) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  return useFirestoreDoc<FirestoreBudgetMonth>(useMemo(() => (uid ? budgetMonthRef(uid, month) : null), [uid, month]));
}

export function useFlowMigrationReport() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const state = useFirestoreDoc<FirestoreMigration>(useMemo(() => (uid ? migrationRef(uid, FLOW_MIGRATION_ID) : null), [uid]));
  const doc = state.data;
  return {
    ...state,
    /** Finished, with changes the household hasn't looked at yet. */
    pending: Boolean(doc?.completedAt && !doc.reviewedAt && doc.report?.length),
  };
}

/** The baskets migration's review list ("Check your items"), until it's been looked at. */
export function useBasketsMigrationReview() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const state = useFirestoreDoc<FirestoreMigration>(useMemo(() => (uid ? migrationRef(uid, BASKETS_MIGRATION_ID) : null), [uid]));
  const doc = state.data;
  return { ...state, pending: Boolean(doc?.completedAt && !doc.reviewedAt && doc.report?.length) };
}
