'use client';

// Library (Design-System HANDOFF section 21): Resources and the Archive in
// one home. Archive stays `archived: true` (a project's status `Archived`) in
// place; nothing is deleted by archiving. Restore puts it back. Delete for
// good is offered only where a delete already exists (projects, and people
// while they are in memory), always behind a type-the-name confirmation.
// Resources are not stored yet.

import { useMemo } from 'react';
import { query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useProjectsDb } from '@/src/logic/projectsDb/useProjectsDb';
import { peopleStore, usePeople } from '@/src/logic/people/store';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { deleteProject } from '@/src/shared/firestore/projectWrites';
import { areaRef, sectionRef, sectionsRef, taskRef } from '@/src/shared/firestore/refs';
import type { FirestoreSection } from '@/src/shared/firestore/types';

export type ArchivedKind = 'Project' | 'Folder' | 'Task' | 'Area' | 'Person';

export interface ArchivedItem {
  key: string;
  kind: ArchivedKind;
  name: string;
  meta: string;
  restore: () => Promise<void> | void;
  /** Present only where a delete exists. */
  remove?: () => Promise<void> | void;
}

export function useLogic() {
  const { db, rows, setStatus, loading } = useProjectsDb();
  const uid = db.uid;
  const people = usePeople();
  const { data: archivedSections, loading: sectionsLoading } = useFirestoreCollection<FirestoreSection>(
    useMemo(() => (uid ? query(sectionsRef(uid), where('archived', '==', true)) : null), [uid])
  );

  const archive = useMemo<ArchivedItem[]>(() => {
    if (!uid) return [];
    const areaName = (id: string | null) => (id ? (db.areas.get(id)?.name ?? null) : null);
    const projectName = (id: string | null) => (id ? (db.projects.get(id)?.name ?? null) : null);
    const items: ArchivedItem[] = [
      ...rows
        .filter((r) => r.status === 'Archived')
        .map((r) => ({
          key: `p-${r.id}`,
          kind: 'Project' as const,
          name: r.name,
          meta: [r.areaName, `${r.tasks} ${r.tasks === 1 ? 'task' : 'tasks'}${r.tasks && r.done === r.tasks ? ', all done' : ''}`].filter(Boolean).join(' · '),
          restore: () => setStatus(r, 'Active'),
          remove: () => deleteProject(uid, r.id, { deleteTasks: true }),
        })),
      ...archivedSections.map((s) => ({
        key: `f-${s.id}`,
        kind: 'Folder' as const,
        name: s.name,
        meta: areaName(s.areaId) ?? '',
        restore: () => updateDoc(sectionRef(uid, s.id), { archived: false, updatedAt: serverTimestamp() }),
      })),
      ...db.areaDocs
        .filter((a) => a.archived)
        .map((a) => ({ key: `a-${a.id}`, kind: 'Area' as const, name: a.name, meta: a.description ?? '', restore: () => updateDoc(areaRef(uid, a.id), { archived: false, updatedAt: serverTimestamp() }) })),
      ...db.taskDocs
        .filter((t) => t.archived)
        .map((t) => ({
          key: `t-${t.id}`,
          kind: 'Task' as const,
          name: t.title,
          meta: [areaName(t.areaId), projectName(t.projectId)].filter(Boolean).join(' / '),
          restore: () => updateDoc(taskRef(uid, t.id), { archived: false, updatedAt: serverTimestamp() }),
        })),
      ...people
        .filter((p) => p.archived)
        .map((p) => ({ key: `h-${p.id}`, kind: 'Person' as const, name: p.name, meta: p.category, restore: () => peopleStore.update(p.id, { archived: false }) })),
    ];
    return items;
  }, [uid, rows, archivedSections, db.areaDocs, db.taskDocs, db.areas, db.projects, people, setStatus]);

  return { archive, loading: loading || sectionsLoading };
}
