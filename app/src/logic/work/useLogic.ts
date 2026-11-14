'use client';

// Work: Areas and Projects as one page (Design-System HANDOFF section 21).
// Tree, Table and Timeline are views over the same data: the shared Projects
// database plus every folder (section). The filter tabs narrow the tree.

import { useMemo, useState } from 'react';
import { useProjectsDb } from '@/src/logic/projectsDb/useProjectsDb';
import { useSections } from '@/src/shared/firestore/queries';
import { buildWorkTree, type WorkFilter } from '@/src/viewmodels/work';

export type WorkView = 'tree' | 'table' | 'timeline';

export function useLogic() {
  const projectsDb = useProjectsDb();
  const { data: sections, loading: sectionsLoading } = useSections();
  const [filter, setFilter] = useState<WorkFilter>('everything');
  const [view, setView] = useState<WorkView>('tree');

  const tree = useMemo(
    () => buildWorkTree({ areas: projectsDb.db.areaDocs, sections, projects: projectsDb.rows, tasks: projectsDb.db.taskDocs, filter, now: new Date() }),
    [projectsDb.db.areaDocs, projectsDb.db.taskDocs, projectsDb.rows, sections, filter]
  );

  return { ...projectsDb, tree, filter, setFilter, view, setView, loading: projectsDb.loading || sectionsLoading };
}
