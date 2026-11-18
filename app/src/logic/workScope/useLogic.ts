'use client';

// An area page or a folder page (Dreda v1.0 `Area detail` 63068, `Folder
// detail` 63631, and their phone frames): the area or folder with its
// folders, projects and figures (viewmodels/organise.ts), its tasks as list
// rows, and the stored area or folder for About.

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { serverTimestamp, updateDoc } from 'firebase/firestore';
import { areaRef, sectionRef } from '@/src/shared/firestore/refs';
import { useOrganise } from '@/src/logic/organise/useOrganise';

export type Scope = { kind: 'area'; areaId: string } | { kind: 'folder'; folderId: string };

export function useLogic(scope: Scope) {
  const o = useOrganise();
  const folder = scope.kind === 'folder' ? (o.folders.find((f) => f.id === scope.folderId) ?? null) : null;
  const areaId = scope.kind === 'area' ? scope.areaId : (folder?.areaId ?? null);
  const area = areaId ? (o.areas.find((a) => a.id === areaId) ?? null) : null;
  const areaDoc = areaId ? (o.db.areaDocs.find((a) => a.id === areaId) ?? null) : null;
  const folderDoc = scope.kind === 'folder' ? (o.sections.find((s) => s.id === scope.folderId) ?? null) : null;
  const projects = useMemo(() => (scope.kind === 'folder' ? (folder?.projects ?? []) : (area?.projects ?? [])), [scope.kind, folder, area]);
  const tasks = useMemo(() => o.tasksIn(new Set(projects.map((p) => p.id))), [o, projects]);

  const router = useRouter();
  /** Archive this area or folder (Library > Archive restores it), then go
   * back to the list. */
  async function archive() {
    const uid = o.db.uid;
    if (!uid) return;
    if (scope.kind === 'area') await updateDoc(areaRef(uid, scope.areaId), { archived: true, updatedAt: serverTimestamp() });
    else await updateDoc(sectionRef(uid, scope.folderId), { archived: true, updatedAt: serverTimestamp() });
    router.replace(scope.kind === 'area' ? '/areas' : '/sections');
  }

  return {
    archive,
    area,
    folder,
    areaDoc,
    folderDoc,
    projects,
    tasks,
    setDone: o.setDone,
    loading: o.loading,
  };
}

export type ScopeLogic = ReturnType<typeof useLogic>;
