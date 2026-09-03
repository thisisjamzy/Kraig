'use client';

// Every stat and chart this feature's own instructions asked for, in one
// place — replaces what used to be a plain Notifications tab. The overdue/
// due-today feed stays (so this doesn't lose the original tap-through
// utility, and ProjectsBottomNav's badge still has something concrete to
// point at), now alongside the numbers a household actually wants to see
// about how their projects and tasks are going.

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { areasRef, projectsRef } from '@/src/shared/firestore/refs';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import {
  overdueTasks,
  dueTodayTasks,
  completedByWeek,
  taskOnTimeVsRescheduled,
} from '@/src/shared/firestore/taskInsights';
import {
  ongoingProjectsPerArea,
  rescheduledProjectsPerArea,
  projectOnTimeVsRescheduled,
  taskCompletionPerArea,
} from '@/src/shared/firestore/projectInsights';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import type { FirestoreArea, FirestoreProject } from '@/src/shared/firestore/types';

const COMPLETED_WEEKS = 6;

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const { data: tasks, loading: tasksLoading } = useAllTasks();
  const areasQuery = useMemo(() => (uid ? query(areasRef(uid)) : null), [uid]);
  const { data: areaDocs, loading: areasLoading } = useFirestoreCollection<FirestoreArea>(areasQuery);
  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(projectsQuery);

  const overdue = overdueTasks(tasks);
  const today = dueTodayTasks(tasks);
  const completedTotal = tasks.filter((t) => t.done).length;

  const completedTrend = useMemo(() => completedByWeek(tasks, COMPLETED_WEEKS), [tasks]);
  const taskReschedule = useMemo(() => taskOnTimeVsRescheduled(tasks), [tasks]);
  const projectReschedule = useMemo(() => projectOnTimeVsRescheduled(projectDocs), [projectDocs]);

  const projectsPerArea = useMemo(() => ongoingProjectsPerArea(projectDocs, areaDocs), [projectDocs, areaDocs]);
  const completionPerArea = useMemo(() => taskCompletionPerArea(tasks, projectDocs, areaDocs), [tasks, projectDocs, areaDocs]);
  const rescheduledPerArea = useMemo(() => rescheduledProjectsPerArea(projectDocs, areaDocs), [projectDocs, areaDocs]);

  const projectsPerAreaSegments = projectsPerArea.map((bucket, index) => ({
    label: bucket.areaName,
    value: bucket.count,
    color: PROJECT_COLORS[index % PROJECT_COLORS.length],
  }));

  const rescheduledByAreaSegments = rescheduledPerArea.map((bucket, index) => ({
    label: bucket.areaName,
    value: bucket.count,
    color: PROJECT_COLORS[index % PROJECT_COLORS.length],
  }));

  function openTask(taskId: string) {
    router.push(`/tasks/${taskId}/edit`);
  }

  return {
    overdue,
    today,
    completedTotal,
    completedTrend,
    taskReschedule,
    projectReschedule,
    projectsPerArea,
    projectsPerAreaSegments,
    completionPerArea,
    rescheduledByAreaSegments,
    openTask,
    loading: tasksLoading || areasLoading || projectsLoading,
  };
}
