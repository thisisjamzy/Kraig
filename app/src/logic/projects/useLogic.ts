'use client';

// Projects mode's own root/hub screen (see chromeVisibility.ts's navMode) —
// PRD Files/PRD-PROJECTS.md section 11. Just Areas (a plain grid, no tabs)
// plus the Projects carousel and Today's tasks now — Buckets/Archive used
// to live here behind a tab switcher; Buckets are still reachable from
// inside each area, and archived items from their own edit screens
// (areaEdit/projectEdit's archiveArea/archiveProject and their unarchive
// counterparts), just not listed anywhere in this hub any more.
// Every count is computed live from the loaded areas/projects/tasks lists
// rather than a separate stats doc — those exist in the PRD to avoid
// re-summing a large, write-heavy collection (the same reason the ledger
// has statsMonthly/statsHome), but a household's own areas/projects/tasks
// are small enough that a live client-side count is simpler and just as
// correct. Revisit only if that assumption stops holding.
//
// Area/project creation and editing live on their own pages
// (/areas/new, /areas/[id]/edit, /projects/new, /projects/[id]/edit).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { useBuckets } from '@/src/shared/firestore/queries';
import { areasRef, projectsRef, tasksRef } from '@/src/shared/firestore/refs';
import { defaultBucketId } from '@/src/shared/firestore/buckets';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { overdueCountByProject, isAtRisk } from '@/src/shared/firestore/projectInsights';
import { dailyCompletionActivity } from '@/src/shared/firestore/taskInsights';
import { updateTaskTodayPriority, toDateOnly } from '@/src/shared/firestore/taskWrites';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreArea, FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: areaDocs, loading: areasLoading, error: areasError } = useFirestoreCollection<FirestoreArea>(areasQuery);

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs, loading: projectsLoading, error: projectsError } =
    useFirestoreCollection<FirestoreProject>(projectsQuery);

  const tasksQuery = useMemo(() => (uid ? query(tasksRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: taskDocs, loading: tasksLoading } = useFirestoreCollection<FirestoreTask>(tasksQuery);

  const { data: bucketDocs, loading: bucketsLoading } = useBuckets();
  const bucketName = useMemo(() => new Map(bucketDocs.map((b) => [b.id, b.name])), [bucketDocs]);

  const activeProjects = projectDocs.filter((p) => p.status !== 'Archived');

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

  // total/done per project — ProjectCard/ProjectShowcaseCard's own
  // completion bar.
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
        // A project's bucketId falls back to its own area's default bucket
        // when unset — same rule areaDetail/useLogic.ts and projects hub's
        // own bucket-count derivation already apply.
        const resolvedBucketId = project.bucketId ?? (project.areaId ? defaultBucketId(project.areaId) : null);
        return {
          id: project.id,
          name: project.name,
          emoji: project.emoji ?? null,
          color: project.color,
          description: project.description,
          bucketName: resolvedBucketId ? bucketName.get(resolvedBucketId) ?? null : null,
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
    [activeProjects, areaName, bucketName, taskStatsByProject, overdueByProject]
  );

  // "See your performance" card (Design/task5.JPG) — one box per day over
  // the last ACTIVITY_DAYS days of completed tasks, shaded by how busy
  // that day was.
  const ACTIVITY_DAYS = 30;
  const activityCounts = useMemo(() => dailyCompletionActivity(taskDocs, ACTIVITY_DAYS), [taskDocs]);
  const performance = useMemo(() => {
    const max = Math.max(1, ...activityCounts);
    const cells = activityCounts.map((count) => ({
      count,
      level: count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4)),
    }));
    return { cells };
  }, [activityCounts]);

  // "Today's priorities" — tasks whose priorityDate matches today's own
  // toDateOnly() output (see taskWrites.ts's updateTaskTodayPriority).
  // Completing one drops it from this list entirely (not just crossed out)
  // — the list is "what's left to focus on today", not a running log.
  const todayIso = toDateOnly(new Date());
  const todayPriorityTasks = useMemo(
    () =>
      taskDocs
        .filter((task) => task.priorityDate === todayIso && !task.done)
        .map((task) => ({
          id: task.id,
          title: task.title,
          priority: task.priority ?? DEFAULT_PRIORITY,
          done: task.done,
          status: task.status,
          startTime: task.startTime ? task.startTime.toDate() : null,
          dueDate: task.dueDate ? task.dueDate.toDate() : null,
        })),
    [taskDocs, todayIso]
  );

  // The picker's own source list — every not-yet-done task, regardless of
  // whether it's already a today-priority (so the picker can show it
  // checked and let the user un-pick it from the same list).
  const pendingTasksForPicker = useMemo(
    () =>
      taskDocs
        .filter((task) => !task.done)
        .map((task) => ({
          id: task.id,
          title: task.title,
          priority: task.priority ?? DEFAULT_PRIORITY,
          dueDate: task.dueDate ? task.dueDate.toDate() : null,
          isTodayPriority: task.priorityDate === todayIso,
        }))
        .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)),
    [taskDocs, todayIso]
  );

  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);

  async function toggleTodayPriority(taskId: string) {
    if (!uid) return;
    const current = taskDocs.find((task) => task.id === taskId);
    const isPriority = current?.priorityDate === todayIso;
    await updateTaskTodayPriority(uid, taskId, !isPriority);
  }

  function openProject(id: string) {
    router.push(`/projects/${id}`);
  }
  function openArea(id: string) {
    router.push(`/areas/${id}`);
  }
  function openTaskList(filter: 'today' | 'week' | 'overdue' | 'all') {
    router.push(`/tasks?filter=${filter}`);
  }

  return {
    performance,
    todayPriorityTasks,
    pendingTasksForPicker,
    priorityPickerOpen,
    setPriorityPickerOpen,
    toggleTodayPriority,
    areas,
    projects,

    openProject,
    openArea,
    openTaskList,

    loading: areasLoading || projectsLoading || tasksLoading || bucketsLoading,
    error: areasError || projectsError,
  };
}
