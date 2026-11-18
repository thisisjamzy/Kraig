'use client';

// A project page (Dreda v1.0 `Project detail` 64838 and its phone frame
// 69552): the project's figures (viewmodels/organise.ts), its tasks as list
// rows, its stored document, and saving its notes.

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { serverTimestamp, updateDoc } from 'firebase/firestore';
import { useOrganise } from '@/src/logic/organise/useOrganise';
import { projectRef } from '@/src/shared/firestore/refs';

export function useLogic(projectId: string) {
  const o = useOrganise();
  const row = o.rows.find((r) => r.id === projectId) ?? null;
  const stat = o.projects.find((p) => p.id === projectId) ?? null;
  const doc = o.db.projects.get(projectId) ?? null;
  const tasks = useMemo(() => o.tasksIn(new Set([projectId])), [o, projectId]);
  const uid = o.db.uid;
  const router = useRouter();

  return {
    o,
    row,
    stat,
    doc,
    tasks,
    notes: doc?.notes ?? '',
    saveNotes: (notes: string) => (uid ? updateDoc(projectRef(uid, projectId), { notes, updatedAt: serverTimestamp() }) : Promise.resolve()),
    setDone: o.setDone,
    /** Archive the project (Library > Archive restores it), then go back to Projects. */
    archive: async () => {
      if (!row) return;
      await o.setStatus(row, 'Archived');
      router.replace('/projects/all');
    },
    loading: o.loading,
  };
}
