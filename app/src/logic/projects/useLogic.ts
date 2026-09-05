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
import { useBuckets } from '@/src/shared/firestore/queries';
import { areasRef, areaRef, projectsRef, projectRef, tasksRef } from '@/src/shared/firestore/refs';
import { defaultBucketId } from '@/src/shared/firestore/buckets';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { overdueCountByProject, isAtRisk } from '@/src/shared/firestore/projectInsights';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreArea, FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';

export type ProjectsTab = 'areas' | 'buckets' | 'projects' | 'archive';

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

  // Every bucket across every area — the Portfolio's own Buckets tab, sitting
  // between Areas and Projects. Same per-bucket project count derivation as
  // areaDetail/useLogic.ts, just not scoped to one area.
  const { data: bucketDocs, loading: bucketsLoading } = useBuckets();

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

  // A project's bucketId counts toward that bucket if it resolves to one
  // that's actually in ITS OWN area's bucket list; anything else (no
  // bucketId, or a stale/unrecognized one) falls back to that area's
  // default bucket — same rule areaDetail/useLogic.ts applies within a
  // single area, just checked per-project against its own area here since
  // this list spans all of them.
  const bucketsByArea = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const bucket of bucketDocs) {
      if (!map.has(bucket.areaId)) map.set(bucket.areaId, new Set());
      map.get(bucket.areaId)!.add(bucket.id);
    }
    return map;
  }, [bucketDocs]);
  const bucketProjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of activeProjects) {
      if (!project.areaId) continue;
      const knownIds = bucketsByArea.get(project.areaId);
      const id =
        project.bucketId && knownIds?.has(project.bucketId) ? project.bucketId : defaultBucketId(project.areaId);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [activeProjects, bucketsByArea]);
  const buckets = useMemo(
    () =>
      bucketDocs.map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        emoji: bucket.emoji ?? null,
        color: bucket.color,
        description: bucket.description,
        areaName: areaName.get(bucket.areaId) ?? null,
        projectCount: bucketProjectCounts.get(bucket.id) ?? 0,
      })),
    [bucketDocs, areaName, bucketProjectCounts]
  );
  // total/done per project — same shape as areaDetail/useLogic.ts's own
  // taskStatsByProject, needed here too now that ProjectCard (src/widgets/
  // ProjectCard) shows every listing's completion bar, not just Area
  // Detail's.
  const taskStatsByProject = useMemo(() => {
    const stats = new Map<string, { total: number; done: number }>();
    for (const task of taskDocs) {
      if (!task.projectId) continue;
      const entry = stats.get(task.projectId) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (task.done) entry.done += 1;
      stats.set(task.projectId, entry);
    }
    return stats;
  }, [taskDocs]);
  const overdueByProject = useMemo(() => overdueCountByProject(taskDocs), [taskDocs]);

  const projects = useMemo(
    () =>
      activeProjects.map((project) => {
        const overdueCount = overdueByProject.get(project.id) ?? 0;
        const stats = taskStatsByProject.get(project.id) ?? { total: 0, done: 0 };
        return {
          id: project.id,
          name: project.name,
          emoji: project.emoji ?? null,
          color: project.color,
          status: project.status,
          priority: project.priority ?? DEFAULT_PRIORITY,
          areaName: project.areaId ? areaName.get(project.areaId) ?? null : null,
          startDate: project.startDate ? project.startDate.toDate() : null,
          endDate: project.endDate ? project.endDate.toDate() : null,
          taskCount: stats.total,
          completionPercent: stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0,
          atRisk: isAtRisk(overdueCount),
        };
      }),
    [activeProjects, areaName, taskStatsByProject, overdueByProject]
  );

  const overview = useMemo(() => {
    const now = new Date();
    const today = isoDate(now);
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    let todayCount = 0;
    let scheduleThisWeekCount = 0;
    let overdueTaskCount = 0;
    for (const task of taskDocs) {
      if (!task.dueDate) continue;
      const due = task.dueDate.toDate();
      if (isoDate(due) === today) todayCount++;
      if (due >= now && due <= weekFromNow) scheduleThisWeekCount++;
      if (!task.done && due < now) overdueTaskCount++;
    }
    const pendingTaskCount = taskDocs.filter((t) => !t.done).length;
    return {
      todayCount,
      scheduleThisWeekCount,
      activeProjectCount: activeProjects.filter((p) => p.status === 'Active').length,
      allTaskCount: taskDocs.length,
      overdueTaskCount,
      pendingTaskCount,
    };
  }, [taskDocs, activeProjects]);

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
  function openBucket(id: string) {
    router.push(`/buckets/${id}`);
  }
  function openCreateProject() {
    router.push('/projects/new');
  }
  function openCreateArea() {
    router.push('/areas/new');
  }
  function openTaskList(filter: 'today' | 'week' | 'overdue' | 'all') {
    router.push(`/tasks?filter=${filter}`);
  }

  return {
    tab,
    setTab,
    overview,
    areas,
    buckets,
    projects,
    archivedAreas: archivedAreaDocs.map((a) => ({ id: a.id, name: a.name })),
    archivedProjects: archivedProjects.map((p) => ({ id: p.id, name: p.name })),

    restoreArea,
    restoreProject,
    openProject,
    openArea,
    openBucket,
    openCreateProject,
    openCreateArea,
    openTaskList,

    loading: areasLoading || archivedAreasLoading || projectsLoading || tasksLoading || bucketsLoading,
    error: areasError || projectsError,
  };
}
