'use client';

// Projects mode's own root/hub screen (see chromeVisibility.ts's navMode) —
// PRD Files/PRD-PROJECTS.md section 11. Two things only: the active
// projects carousel, and the day's task checklist. Areas (/areas) and the
// performance analytics (/projects/analytics) have their own screens and
// are no longer surfaced here.
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
import { useSections } from '@/src/shared/firestore/queries';
import { areasRef, projectsRef, tasksRef } from '@/src/shared/firestore/refs';
import { defaultSectionId } from '@/src/shared/firestore/sections';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { overdueCountByProject, isAtRisk } from '@/src/shared/firestore/projectInsights';
import { updateTaskTodayPriority, toDateOnly } from '@/src/shared/firestore/taskWrites';
import { DEFAULT_PRIORITY, PRIORITY_RANK } from '@/src/viewmodels/projects';
import type { FirestoreArea, FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';
import { effectiveTimeMode } from '@/src/viewmodels/scheduling';
import { actionableTasks, expandTasks, isRecurring, summarizeSeries } from '@/src/shared/tasks/recurringTasks';

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

  const { data: bucketDocs, loading: bucketsLoading } = useSections();
  const bucketName = useMemo(() => new Map(bucketDocs.map((b) => [b.id, b.name])), [bucketDocs]);

  const activeProjects = projectDocs.filter((p) => p.status !== 'Archived');

  const areaName = useMemo(() => new Map(areaDocs.map((a) => [a.id, a.name])), [areaDocs]);

  // total/done per project — ProjectCard's own
  // completion bar.
  const taskStatsByProject = useMemo(() => {
    const stats = new Map<string, { total: number; done: number }>();
    // A recurring series counts once (recurringTasks.ts's summarizeSeries).
    for (const task of summarizeSeries(taskDocs)) {
      if (!task.projectId) continue;
      const entry = stats.get(task.projectId) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (task.done) entry.done += 1;
      stats.set(task.projectId, entry);
    }
    return stats;
  }, [taskDocs]);
  const overdueByProject = useMemo(() => overdueCountByProject(actionableTasks(taskDocs)), [taskDocs]);

  const projects = useMemo(
    () =>
      activeProjects.map((project) => {
        const overdueCount = overdueByProject.get(project.id) ?? 0;
        const stats = taskStatsByProject.get(project.id) ?? { total: 0, done: 0 };
        // A project's bucketId falls back to its own area's default section
        // when unset — same rule areaDetail/useLogic.ts and projects hub's
        // own section-count derivation already apply.
        const resolvedBucketId = project.bucketId ?? (project.areaId ? defaultSectionId(project.areaId) : null);
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

  // The day's checklist: every task scheduled or due today (its start or
  // due date falls on today) plus every task pinned as one of today's
  // priorities (priorityDate, see taskWrites.ts's updateTaskTodayPriority)
  // whatever its date. Completed ones stay listed — ticked and struck
  // through, sorted to the bottom — so checking a task off doesn't make it
  // vanish mid-tap; the list is today's plan, done and not.
  const todayIso = toDateOnly(new Date());
  const todayTasks = useMemo(() => {
    const isToday = (date: Date | null) => date !== null && toDateOnly(date) === todayIso;
    const now = new Date();
    // A recurring task shows as today's date of it (its own done state).
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return expandTasks(taskDocs, dayStart, dayEnd)
      // A cancelled task is off today's plan (the Focus page's swipe-left).
      .filter((task) => task.status !== 'Cancelled')
      .map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority ?? DEFAULT_PRIORITY,
        done: task.done,
        startTime: task.startTime ? task.startTime.toDate() : null,
        allDay: Boolean(task.allDay),
        timeMode: effectiveTimeMode(task),
        recurring: Boolean(task.seriesId),
        dueDate: task.dueDate ? task.dueDate.toDate() : null,
        pinned: task.priorityDate === todayIso,
        overdue: !task.done && (task.dueDate ?? task.startTime) !== null && (task.dueDate ?? task.startTime)!.toDate() < now,
      }))
      .filter((task) => task.pinned || isToday(task.startTime) || isToday(task.dueDate))
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        // Timed tasks in time order first, then untimed by priority.
        // Date-only tasks have no time of day — after the timed ones.
        const at = a.allDay ? Infinity : ((a.startTime ?? a.dueDate)?.getTime() ?? Infinity);
        const bt = b.allDay ? Infinity : ((b.startTime ?? b.dueDate)?.getTime() ?? Infinity);
        if (at !== bt) return at - bt;
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      });
  }, [taskDocs, todayIso]);
  const todayDoneCount = todayTasks.filter((task) => task.done).length;

  // The picker's own source list — every not-yet-done task, regardless of
  // whether it's already a today-priority (so the picker can show it
  // checked and let the user un-pick it from the same list).
  const pendingTasksForPicker = useMemo(
    () =>
      taskDocs
        // Recurring tasks already show on their own days — not pinnable.
        .filter((task) => !task.done && !isRecurring(task))
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
  function openTaskList(filter: 'today' | 'week' | 'overdue' | 'all') {
    router.push(`/tasks?filter=${filter}`);
  }

  return {
    todayTasks,
    todayDoneCount,
    pendingTasksForPicker,
    priorityPickerOpen,
    setPriorityPickerOpen,
    toggleTodayPriority,
    projects,

    openProject,
    openTaskList,

    loading: areasLoading || projectsLoading || tasksLoading || bucketsLoading,
    error: areasError || projectsError,
  };
}
