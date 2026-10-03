'use client';

// Areas: each area with its active projects, open and overdue tasks, at
// risk projects and last activity, from the shared Projects and Tasks
// databases (logic/projectsDb, logic/tasksDb).

import { useMemo } from 'react';
import { serverTimestamp, updateDoc } from 'firebase/firestore';
import { areaRef } from '@/src/shared/firestore/refs';
import { useProjectsDb } from '@/src/logic/projectsDb/useProjectsDb';

export interface AreaRow {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  description: string;
  projects: number;
  openTasks: number;
  overdue: number;
  atRisk: number;
  lastActivity: Date | null;
}

export function useLogic() {
  const { db, rows: projects, loading } = useProjectsDb();

  const areas = useMemo<AreaRow[]>(() => {
    return db.areaDocs
      .filter((a) => !a.archived)
      .map((a) => {
        const mine = projects.filter((p) => p.areaId === a.id && p.status === 'Active');
        const tasks = db.actionable.filter((t) => t.areaId === a.id && t.status === 'Pending');
        const last = Math.max(0, ...projects.filter((p) => p.areaId === a.id).map((p) => p.lastActivity?.getTime() ?? 0));
        return {
          id: a.id,
          name: a.name,
          emoji: a.emoji ?? null,
          color: a.color,
          description: a.description ?? '',
          projects: mine.length,
          openTasks: tasks.length,
          overdue: tasks.filter((t) => t.overdue).length,
          atRisk: mine.filter((p) => p.health === 'At risk').length,
          lastActivity: last ? new Date(last) : null,
        };
      })
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [db.areaDocs, db.actionable, projects]);

  async function archiveArea(id: string) {
    if (!db.uid) return;
    await updateDoc(areaRef(db.uid, id), { archived: true, updatedAt: serverTimestamp() });
  }

  const activeProjects = projects.filter((p) => p.status === 'Active');
  return {
    areas,
    activeProjects: activeProjects.length,
    atRiskProjects: activeProjects.filter((p) => p.health === 'At risk').length,
    openTasks: db.actionable.filter((t) => t.status === 'Pending').length,
    archiveArea,
    loading,
  };
}
