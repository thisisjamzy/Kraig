'use client';

// The counts beside Profile's Organise rows (Dreda v1.0 Profile / Phone):
// areas and folders that are not archived, and active projects.

import { useMemo } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { areasRef, projectsRef, sectionsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreArea, FirestoreProject, FirestoreSection } from '@/src/shared/firestore/types';

export function useTimeCounts(): { areas: number; folders: number; projects: number } {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: areas } = useFirestoreCollection<FirestoreArea>(useMemo(() => (uid ? query(areasRef(uid), where('archived', '==', false)) : null), [uid]));
  const { data: folders } = useFirestoreCollection<FirestoreSection>(useMemo(() => (uid ? query(sectionsRef(uid), where('archived', '==', false)) : null), [uid]));
  const { data: projects } = useFirestoreCollection<FirestoreProject>(
    useMemo(() => (uid ? query(projectsRef(uid), where('status', '==', 'Active')) : null), [uid])
  );
  return { areas: areas.length, folders: folders.length, projects: projects.length };
}
