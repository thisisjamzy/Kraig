'use client';

// One shared live query for "every one of this user's non-archived tasks"
// — a single-field where('archived','==',false), no composite index needed
// — reused by Focus, Calendar, Notifications, and ProjectsBottomNav's badge
// so they all agree on the same underlying data (src/shared/firestore/
// taskInsights.ts's pure functions then each derive their own view of it).

import { useMemo } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { tasksRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreTask } from '@/src/shared/firestore/types';

export function useAllTasks() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const tasksQuery = useMemo(() => (uid ? query(tasksRef(uid), where('archived', '==', false)) : null), [uid]);
  return useFirestoreCollection<FirestoreTask>(tasksQuery);
}
