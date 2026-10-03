'use client';

// The Tasks database: one live query of every task (useAllTasks), the
// projects and areas they belong to, and the writes every task view uses.
// Today, Focus, Calendar and the project and area pages each read their
// rows from here, so an edit in a side peek shows everywhere at once.

import { useCallback, useMemo } from 'react';
import { query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { areasRef, projectsRef } from '@/src/shared/firestore/refs';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { isCalendarSyncEnabled } from '@/src/shared/calendarSync/runner';
import { useCalendarSyncStatus } from '@/src/shared/calendarSync/status';
import { syncBadgeFor } from '@/src/shared/calendarSync/badge';
import {
  updateTaskDone,
  updateTaskFields,
  updateTaskQuadrant,
  updateTaskStatus,
  updateTaskTimes,
  updateTaskSubtasks,
  archiveTask,
  rescheduleTask,
  toDateOnly,
} from '@/src/shared/firestore/taskWrites';
import { priorityForQuadrant } from '@/src/viewmodels/eisenhower';
import { toTaskRow, type TaskRow, type TaskRowStatus, type TaskRowType } from '@/src/viewmodels/taskRow';
import { actionableTasks, type TaskItem } from '@/src/shared/tasks/recurringTasks';
import type { FirestoreArea, FirestoreProject, Quadrant, TaskSubtask, TimeMode } from '@/src/shared/firestore/types';

export function useTasksDb() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: taskDocs, loading: tasksLoading } = useAllTasks();
  const { data: projectDocs, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]));
  const { data: areaDocs, loading: areasLoading } = useFirestoreCollection<FirestoreArea>(useMemo(() => (uid ? query(areasRef(uid)) : null), [uid]));
  const syncEnabled = isCalendarSyncEnabled();
  const { includeFree } = useCalendarSyncStatus();

  const projects = useMemo(() => new Map(projectDocs.map((p) => [p.id, p])), [projectDocs]);
  const areas = useMemo(() => new Map(areaDocs.map((a) => [a.id, a])), [areaDocs]);

  const toRow = useCallback(
    (t: TaskItem, now = new Date()): TaskRow =>
      toTaskRow(t, {
        projects,
        areas,
        now,
        syncOf: syncEnabled
          ? (task) => {
              const badge = syncBadgeFor(task, { includeFree, now });
              if (badge) return badge.kind === 'pending' ? 'Waiting' : badge.kind === 'error' ? 'Not synced' : 'Conflict';
              return task.googleSync ? 'Synced' : null;
            }
          : undefined,
      }),
    [projects, areas, syncEnabled, includeFree]
  );

  // Undated lists (Focus, overdue counts): one-off tasks, and each
  // series' recent and missed dates (recurringTasks.ts's actionableTasks).
  const actionable = useMemo(() => {
    const now = new Date();
    return actionableTasks(taskDocs, now).map((t) => toRow(t, now));
  }, [taskDocs, toRow]);
  /** Pending tasks whose time has passed before today. */
  const overdueEarlier = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return actionable.filter((r) => r.overdue && r.date !== null && r.date < todayStart);
  }, [actionable]);

  const actions = useMemo(() => {
    const need = () => {
      if (!uid) throw new Error('Sign in to change tasks.');
      return uid;
    };
    return {
      setDone: (row: Pick<TaskRow, 'id'>, done: boolean) => updateTaskDone(need(), row.id, done),
      setStatus: (row: Pick<TaskRow, 'id'>, status: TaskRowStatus) => updateTaskStatus(need(), row.id, status),
      setImportance: (row: Pick<TaskRow, 'id' | 'priority' | 'importance'>, q: Quadrant) =>
        row.importance === q ? Promise.resolve() : updateTaskQuadrant(need(), row.id, q, priorityForQuadrant(row.priority, q)),
      setType: (row: Pick<TaskRow, 'id'>, type: TaskRowType) => updateTaskFields(need(), row.id, { type }),
      setTimeMode: (row: Pick<TaskRow, 'id'>, timeMode: TimeMode) => updateTaskFields(need(), row.id, { timeMode }),
      setTitle: (row: Pick<TaskRow, 'id'>, title: string) => updateTaskFields(need(), row.id, { title: title.trim() || 'Untitled' }),
      setNotes: (row: Pick<TaskRow, 'id'>, notes: string) => updateTaskFields(need(), row.id, { notes }),
      setProject: (row: Pick<TaskRow, 'id'>, projectId: string | null) => {
        const p = projectId ? projects.get(projectId) : undefined;
        return updateTaskFields(need(), row.id, { project: { id: projectId, areaId: p?.areaId ?? null, bucketId: p?.bucketId ?? null } });
      },
      /** Same times of day on another date. */
      setDate: (row: Pick<TaskRow, 'id'>, date: Date) => rescheduleTask(need(), row.id, toDateOnly(date)),
      setTimes: (row: Pick<TaskRow, 'id'>, start: Date, end: Date, allDay = false) => updateTaskTimes(need(), row.id, start, end, allDay),
      setSubtasks: (row: Pick<TaskRow, 'id'>, subtasks: TaskSubtask[]) => updateTaskSubtasks(need(), row.id, subtasks),
      archive: (row: Pick<TaskRow, 'id'>) => archiveTask(need(), row.id),
    };
  }, [uid, projects]);

  return {
    uid,
    taskDocs,
    projects,
    projectDocs,
    areas,
    areaDocs,
    toRow,
    actionable,
    overdueEarlier,
    actions,
    loading: tasksLoading || projectsLoading || areasLoading,
  };
}

export type TasksDb = ReturnType<typeof useTasksDb>;
