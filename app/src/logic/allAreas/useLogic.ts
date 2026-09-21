'use client';

// "See all areas" — reached from the Projects hub's Areas section (see
// src/screens/Projects/ProjectsScreen.tsx). Same archive semantics as
// areaEdit/useLogic.ts's own archiveArea, just without that hook's
// redirect-after-archive (this list stays put and the live query drops the
// row the instant it archives).

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { query, updateDoc, serverTimestamp, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { areasRef, areaRef, projectsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreArea, FirestoreProject } from '@/src/shared/firestore/types';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: areaDocs, loading: areasLoading, error: areasError } = useFirestoreCollection<FirestoreArea>(areasQuery);

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(projectsQuery);

  const areas = useMemo(
    () =>
      areaDocs
        .map((area) => ({
          id: area.id,
          name: area.name,
          emoji: area.emoji ?? null,
          color: area.color,
          description: area.description,
          projectCount: projectDocs.filter((p) => p.areaId === area.id && p.status !== 'Archived').length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [areaDocs, projectDocs]
  );

  function goBack() {
    router.push('/projects');
  }

  async function archiveArea(id: string) {
    if (!uid) return;
    await updateDoc(areaRef(uid, id), { archived: true, updatedAt: serverTimestamp() });
  }

  return {
    areas,
    archiveArea,
    goBack,
    loading: areasLoading || projectsLoading,
    error: areasError,
  };
}
