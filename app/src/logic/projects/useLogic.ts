'use client';

// Areas / Projects / Archive hub — PRD Files/PRD-PROJECTS.md section 11,
// Projects mode's own root/hub screen (see chromeVisibility.ts's navMode).
// Resources tab is a later build step (section 23 step 3), left out here.
// Every count (Overview tiles, per-area project count) is computed live
// from the loaded areas/projects/tasks lists rather than a separate
// statsProjectsHome/statsPerProject doc — those docs exist in the PRD to
// avoid re-summing a large, write-heavy collection (the same reason the
// ledger has statsMonthly/statsHome), but a household's own areas/
// projects/tasks are small enough that a live client-side count is simpler
// and just as correct, without a runTransaction()-based increment/decrement
// path to keep in sync. Revisit only if that assumption stops holding.
//
// Area/project creation and editing live on their own pages now
// (/areas/new, /areas/[id]/edit, /projects/new, /projects/[id]/edit) —
// this hook is just the three tabs' read models plus the restore actions
// the Archive tab needs.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, updateDoc, serverTimestamp, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { areasRef, areaRef, projectsRef, projectRef, tasksRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { overdueCountByProject, isAtRisk } from '@/src/shared/firestore/projectInsights';
import type { FirestoreArea, FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';

export type ProjectsTab = 'areas' | 'projects' | 'archive';

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const [tab, setTab] = useState<ProjectsTab>('areas');

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: areaDocs, loading: areasLoading, error: areasError } = useFirestoreCollection<FirestoreArea>(areasQuery);

  const archivedAreasQuery = useMemo(() => (uid ? query(areasRef(uid), where('archived', '==', true)) : null), [uid]);
  const { data: archivedAreaDocs, loading: archivedAreasLoading } =
    useFirestoreCollection<FirestoreArea>(archivedAreasQuery);

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs, loading: projectsLoading, error: projectsError } =
    useFirestoreCollection<FirestoreProject>(projectsQuery);

  const tasksQuery = useMemo(() => (uid ? query(tasksRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: taskDocs, loading: tasksLoading } = useFirestoreCollection<FirestoreTask>(tasksQuery);

  const activeProjects = projectDocs.filter((p) => p.status !== 'Archived');
  const archivedProjects = projectDocs.filter((p) => p.status === 'Archived');

  const areas = useMemo(
    () =>
      areaDocs.map((area) => ({
        id: area.id,
        name: area.name,
        emoji: area.emoji ?? null,
        color: area.color,
        projectCount: activeProjects.filter((p) => p.areaId === area.id).length,
      })),
    [areaDocs, activeProjects]
  );

  const areaName = useMemo(() => new Map(areaDocs.map((a) => [a.id, a.name])), [areaDocs]);
  const taskCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of taskDocs) {
      if (!task.projectId) continue;
      counts.set(task.projectId, (counts.get(task.projectId) ?? 0) + 1);
    }
    return counts;
  }, [taskDocs]);
  const overdueByProject = useMemo(() => overdueCountByProject(taskDocs), [taskDocs]);

  const projects = useMemo(
    () =>
      activeProjects.map((project) => {
        const overdueCount = overdueByProject.get(project.id) ?? 0;
        return {
          id: project.id,
          name: project.name,
          emoji: project.emoji ?? null,
          color: project.color,
          status: project.status,
          areaName: project.areaId ? areaName.get(project.areaId) ?? null : null,
          startDate: project.startDate ? project.startDate.toDate() : null,
          endDate: project.endDate ? project.endDate.toDate() : null,
          taskCount: taskCountByProject.get(project.id) ?? 0,
          atRisk: isAtRisk(overdueCount),
        };
      }),
    [activeProjects, areaName, taskCountByProject, overdueByProject]
  );

  const overview = useMemo(() => {
    const today = isoDate(new Date());
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    let todayCount = 0;
    let scheduleThisWeekCount = 0;
    for (const task of taskDocs) {
      if (!task.dueDate) continue;
      const due = task.dueDate.toDate();
      if (isoDate(due) === today) todayCount++;
      if (due >= new Date() && due <= weekFromNow) scheduleThisWeekCount++;
    }
    const atRiskProjectCount = activeProjects.filter(
      (p) => p.status === 'Active' && isAtRisk(overdueByProject.get(p.id) ?? 0)
    ).length;
    const pendingTaskCount = taskDocs.filter((t) => !t.done).length;
    return {
      todayCount,
      scheduleThisWeekCount,
      activeProjectCount: activeProjects.filter((p) => p.status === 'Active').length,
      allTaskCount: taskDocs.length,
      atRiskProjectCount,
      pendingTaskCount,
    };
  }, [taskDocs, activeProjects, overdueByProject]);

  async function restoreArea(id: string) {
    if (!uid) return;
    await updateDoc(areaRef(uid, id), { archived: false, updatedAt: serverTimestamp() });
  }

  async function restoreProject(id: string) {
    if (!uid) return;
    await updateDoc(projectRef(uid, id), { status: 'Active', updatedAt: serverTimestamp() });
  }

  function openProject(id: string) {
    router.push(`/projects/${id}`);
  }
  function openArea(id: string) {
    router.push(`/areas/${id}`);
  }
  function openCreateProject() {
    router.push('/projects/new');
  }
  function openCreateArea() {
    router.push('/areas/new');
  }
  function openTaskList(filter: 'today' | 'week' | 'atRisk' | 'all') {
    router.push(`/tasks?filter=${filter}`);
  }

  return {
    tab,
    setTab,
    overview,
    areas,
    projects,
    archivedAreas: archivedAreaDocs.map((a) => ({ id: a.id, name: a.name })),
    archivedProjects: archivedProjects.map((p) => ({ id: p.id, name: p.name })),

    restoreArea,
    restoreProject,
    openProject,
    openArea,
    openCreateProject,
    openCreateArea,
    openTaskList,

    loading: areasLoading || archivedAreasLoading || projectsLoading || tasksLoading,
    error: areasError || projectsError,
  };
}
