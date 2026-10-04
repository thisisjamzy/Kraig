'use client';

// Task creation/editing lives on the shared /tasks/new and /tasks/[id]/edit
// pages (src/logic/taskEdit) — this hook is display-only: the project's own
// fields, its area (if any), its tasks (done/not-done only, no kanban), and
// the done-vs-pending split the Activity donut needs. Editing the project
// itself is /projects/[id]/edit — the New project form in edit mode
// (src/logic/projectForm).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { query, updateDoc, serverTimestamp, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { projectRef, tasksRef, areaRef, areasRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { isAtRisk, projectRescheduleFlag } from '@/src/shared/firestore/projectInsights';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreProject, FirestoreTask, FirestoreArea, ProjectStatus } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { effectiveTimeMode } from '@/src/viewmodels/scheduling';
import { actionableTasks, isRecurring, occurrencesInRange } from '@/src/shared/tasks/recurringTasks';

export type TaskFilterTab = 'all' | 'done' | 'pending' | 'archived';

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** How far back a repeating task's completed dates are listed. */
const COMPLETED_DAYS = 90;

function withCompletedDates<T extends { id: string }>(
  listed: T[],
  docs: FirestoreTask[]
): ((T | ReturnType<typeof occurrencesInRange>[number]) & { history?: boolean })[] {
  const ids = new Set(listed.map((t) => t.id));
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - COMPLETED_DAYS);
  const done = docs
    .filter(isRecurring)
    .flatMap((series) => occurrencesInRange(series, from, now))
    .filter((o) => o.done && !ids.has(o.id))
    .map((o) => ({ ...o, history: true }));
  return [...listed, ...done];
}

export function useLogic(projectId: string) {
  const router = useRouter();
  const taskPanel = useTaskPanel();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const projectDocRef = useMemo(() => (uid ? projectRef(uid, projectId) : null), [uid, projectId]);
  const { data: project, loading: projectLoading, error: projectError } = useFirestoreDoc<FirestoreProject>(projectDocRef);

  const projectAreaId = project?.areaId ?? null;
  const areaDocRef = useMemo(() => (uid && projectAreaId ? areaRef(uid, projectAreaId) : null), [uid, projectAreaId]);
  const { data: area } = useFirestoreDoc<FirestoreArea>(areaDocRef);

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: areas } = useFirestoreCollection<FirestoreArea>(areasQuery);

  // No `archived` filter here (unlike most task queries) — the Archived tab
  // below needs those docs too, so this loads every task for the project
  // once and splits it into All/Done/Pending/Archived client-side rather
  // than re-querying per tab.
  const tasksQuery = useMemo(
    () => (uid ? query(tasksRef(uid), where('projectId', '==', projectId)) : null),
    [uid, projectId]
  );
  const { data: taskDocs, loading: tasksLoading } = useFirestoreCollection<FirestoreTask>(tasksQuery);

  const today = useMemo(() => startOfDay(new Date()), []);
  const allTasks = useMemo(
    () =>
      // A recurring task lists as today's / missed dates, or its next one —
      // plus the dates already completed (last COMPLETED_DAYS), so finished
      // work stays visible here like a finished one-off task does.
      withCompletedDates(actionableTasks(taskDocs, new Date(), { includeUpcoming: true }), taskDocs)
        .map((t) => ({
          id: t.id,
          title: t.title,
          emoji: t.emoji ?? null,
          type: t.type ?? 'ToDo',
          priority: t.priority ?? DEFAULT_PRIORITY,
          done: t.done,
          status: t.status,
          archived: t.archived,
          // A past completed date of a repeating task: listed, not counted.
          history: Boolean('history' in t && t.history),
          startTime: t.startTime ? t.startTime.toDate() : null,
          allDay: Boolean(t.allDay),
          timeMode: effectiveTimeMode(t),
          recurring: Boolean(t.seriesId),
          dueDate: t.dueDate ? t.dueDate.toDate() : null,
          overdue: !t.done && Boolean(t.dueDate) && t.dueDate!.toDate() < today,
          ...(() => {
            const flag = { rescheduled: (t.rescheduleCount ?? 0) > 0, extended: false };
            if (flag.rescheduled && t.originalDueDate && t.dueDate) {
              flag.extended = t.dueDate.toMillis() > t.originalDueDate.toMillis();
            }
            return flag;
          })(),
        }))
        // Pending first; completed ones after, most recent first.
        .sort((a, b) => {
          if (a.done !== b.done) return Number(a.done) - Number(b.done);
          if (!a.done) return 0;
          const at = (t: typeof a) => (t.startTime ?? t.dueDate)?.getTime() ?? 0;
          return at(b) - at(a);
        }),
    [taskDocs, today]
  );

  const [taskTab, setTaskTab] = useState<TaskFilterTab>('all');
  const tasks = useMemo(() => {
    switch (taskTab) {
      case 'done':
        return allTasks.filter((t) => !t.archived && t.done);
      case 'pending':
        return allTasks.filter((t) => !t.archived && !t.done);
      case 'archived':
        return allTasks.filter((t) => t.archived);
      default:
        return allTasks.filter((t) => !t.archived);
    }
  }, [allTasks, taskTab]);

  // Counts (activity donut, overdue) see a repeating task's current dates
  // only — its past completed dates are listed but not counted again.
  const activeTasks = useMemo(() => allTasks.filter((t) => !t.archived && !t.history), [allTasks]);
  const completedCount = activeTasks.filter((t) => t.done).length;
  const overdueCount = activeTasks.filter((t) => t.overdue).length;
  const atRisk = isAtRisk(overdueCount);
  const rescheduleFlag = project ? projectRescheduleFlag(project) : { rescheduled: false, extended: false };

  const activitySegments = useMemo(() => {
    if (activeTasks.length === 0) return [];
    const pending = activeTasks.length - completedCount;
    return [
      { label: 'Done', value: completedCount, color: 'var(--color-brand)' },
      { label: 'Pending', value: pending, color: 'var(--color-border)' },
    ].filter((s) => s.value > 0);
  }, [activeTasks.length, completedCount]);

  async function updateStatus(status: ProjectStatus) {
    if (!uid) return;
    await updateDoc(projectRef(uid, projectId), { status, updatedAt: serverTimestamp() });
  }

  async function updateAreaId(newAreaId: string | null) {
    if (!uid) return;
    await updateDoc(projectRef(uid, projectId), { areaId: newAreaId, updatedAt: serverTimestamp() });
  }

  // Back to the page the user came from (skipping forms); '/projects' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/projects');
  }
  function openEditProject() {
    router.push(`/projects/${projectId}/edit`);
  }
  function openAddTask() {
    // Same page as always on a phone; the side panel on wider screens.
    taskPanel.open('new', { projectId });
  }

  return {
    project,
    area,
    areas,
    tasks,
    taskTab,
    setTaskTab,
    completedCount,
    overdueCount,
    atRisk,
    rescheduleFlag,
    activitySegments,

    updateStatus,
    updateAreaId,
    goBack,
    openEditProject,
    openAddTask,
    loading: projectLoading || tasksLoading,
    error: projectError,
  };
}
