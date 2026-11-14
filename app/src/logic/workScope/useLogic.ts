'use client';

// An area page or a folder page (Design-System HANDOFF section 21): the same
// summary with a different scope, from the shared Projects database and the
// area's folders (sections).

import { useMemo } from 'react';
import { useProjectsDb } from '@/src/logic/projectsDb/useProjectsDb';
import { useSections } from '@/src/shared/firestore/queries';
import { scopeSummary } from '@/src/viewmodels/work';

export function useLogic(scope: { kind: 'area'; areaId: string } | { kind: 'folder'; folderId: string }) {
  const { db, rows, loading } = useProjectsDb();
  const { data: sections, loading: sectionsLoading } = useSections();
  const folder = scope.kind === 'folder' ? (sections.find((s) => s.id === scope.folderId) ?? null) : null;
  const areaId = scope.kind === 'area' ? scope.areaId : (folder?.areaId ?? null);
  const area = areaId ? (db.areaDocs.find((a) => a.id === areaId) ?? null) : null;

  const summary = useMemo(
    () =>
      areaId
        ? scopeSummary({ scope: scope.kind, areaId, folderId: scope.kind === 'folder' ? scope.folderId : undefined, sections, projects: rows, tasks: db.taskDocs, now: new Date() })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the scope's own ids are what change
    [scope.kind, areaId, scope.kind === 'folder' ? scope.folderId : null, sections, rows, db.taskDocs]
  );

  return { area, folder, summary, loading: loading || sectionsLoading };
}
