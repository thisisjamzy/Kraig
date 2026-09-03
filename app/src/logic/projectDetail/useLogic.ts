'use client';

// Task creation/editing lives on the shared /tasks/new and /tasks/[id]/edit
// pages (src/logic/taskEdit) — this hook is display-only: the project's own
// fields, its area (if any), its tasks (done/not-done only, no kanban), and
// the done-vs-pending split the Activity donut needs. Editing the project
// itself is /projects/[id]/edit (src/logic/projectEdit).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, updateDoc, serverTimestamp, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { projectRef, tasksRef, areaRef, areasRef } from '@/src/shared/firestore/refs';
import { updateTaskDone } from '@/src/shared/firestore/taskWrites';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { isAtRisk, projectRescheduleFlag } from '@/src/shared/firestore/projectInsights';
import type { FirestoreProject, FirestoreTask, FirestoreArea, ProjectStatus } from '@/src/shared/firestore/types';

export type TaskFilterTab = 'all' | 'done' | 'pending' | 'archived';

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useLogic(projectId: string) {
  const router = useRouter();
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
      taskDocs
        .map((t) => ({
          id: t.id,
          title: t.title,
          emoji: t.emoji ?? null,
          type: t.type ?? 'ToDo',
          done: t.done,
          archived: t.archived,
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
        .sort((a, b) => Number(a.done) - Number(b.done)),
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

  const activeTasks = useMemo(() => allTasks.filter((t) => !t.archived), [allTasks]);
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

  async function toggleTaskDone(taskId: string, done: boolean) {
    if (!uid) return;
    await updateTaskDone(uid, taskId, done);
  }

  async function updateStatus(status: ProjectStatus) {
    if (!uid) return;
    await updateDoc(projectRef(uid, projectId), { status, updatedAt: serverTimestamp() });
  }

  async function updateAreaId(newAreaId: string | null) {
    if (!uid) return;
    await updateDoc(projectRef(uid, projectId), { areaId: newAreaId, updatedAt: serverTimestamp() });
  }

  function goBack() {
    router.push('/projects');
  }
  function openEditProject() {
    router.push(`/projects/${projectId}/edit`);
  }
  function openAddTask() {
    router.push(`/tasks/new?projectId=${projectId}`);
  }
  function openTask(taskId: string) {
    router.push(`/tasks/${taskId}/edit`);
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

    toggleTaskDone,
    updateStatus,
    updateAreaId,
    goBack,
    openEditProject,
    openAddTask,
    openTask,
    loading: projectLoading || tasksLoading,
    error: projectError,
  };
}
