'use client';

// The Focus page — an Eisenhower board of every pending task, one column
// per quadrant (src/viewmodels/eisenhower.ts), searchable; dragging a card
// to another column moves it there (and keeps its importance in line).

import { useMemo, useState } from 'react';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { projectsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { updateTaskQuadrant } from '@/src/shared/firestore/taskWrites';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import { QUADRANTS, priorityForQuadrant, taskQuadrant } from '@/src/viewmodels/eisenhower';
import { effectiveTimeMode } from '@/src/viewmodels/scheduling';
import { actionableTasks, handledToday } from '@/src/shared/tasks/recurringTasks';
import type { FirestoreProject, Priority, Quadrant, TimeMode } from '@/src/shared/firestore/types';

export interface FocusTask {
  id: string;
  title: string;
  priority: Priority;
  startTime: Date | null;
  dueDate: Date | null;
  allDay: boolean;
  timeMode: TimeMode;
  recurring: boolean;
  projectName: string | null;
  quadrant: Quadrant;
  overdue: boolean;
  /** Ticked today — stays on the board, shown done, until tomorrow. */
  done: boolean;
  sortKey: number;
}

export function useLogic() {
  const taskPanel = useTaskPanel();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: taskDocs, loading: tasksLoading } = useAllTasks();
  const { data: projectDocs, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(
    useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid])
  );

  const [search, setSearch] = useState('');

  // Pending tasks, plus ones ticked done today — those stay on the board
  // (shown done, and can be unticked) until tomorrow, rather than
  // vanishing the moment they're ticked. Cancelled ones are off the board.
  // A recurring task shows only today's and missed dates, so a daily task
  // doesn't fill a column.
  const tasks = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const project = new Map(projectDocs.map((p) => [p.id, p]));
    return actionableTasks(taskDocs, now)
      .filter((t) => (t.done ? handledToday(t, todayStart) : t.status !== 'Cancelled'))
      .map((t): FocusTask => {
        const startTime = t.startTime ? t.startTime.toDate() : null;
        const dueDate = t.dueDate ? t.dueDate.toDate() : null;
        const priority = t.priority ?? DEFAULT_PRIORITY;
        const p = t.projectId ? project.get(t.projectId) : undefined;
        const anchor = startTime ?? dueDate;
        const end = dueDate ?? startTime;
        return {
          id: t.id,
          title: t.title,
          priority,
          startTime,
          dueDate,
          allDay: Boolean(t.allDay),
          timeMode: effectiveTimeMode(t),
          recurring: Boolean(t.seriesId),
          projectName: p?.name ?? null,
          quadrant: taskQuadrant({ quadrant: t.quadrant, priority, dueDate, startTime }, now),
          overdue: !t.done && end !== null && end < now,
          done: t.done,
          // Soonest first, undated last.
          sortKey: anchor?.getTime() ?? Number.MAX_SAFE_INTEGER,
        };
      });
  }, [taskDocs, projectDocs]);

  const columns = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pending = tasks
      .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.projectName ?? '').toLowerCase().includes(q))
      // Done ones sink to the bottom of their column.
      .sort((a, b) => Number(a.done) - Number(b.done) || a.sortKey - b.sortKey);
    return QUADRANTS.map((quadrant) => ({ ...quadrant, tasks: pending.filter((t) => t.quadrant === quadrant.id) }));
  }, [tasks, search]);

  async function moveToQuadrant(id: string, quadrant: Quadrant) {
    const task = tasks.find((t) => t.id === id);
    if (!uid || !task || task.quadrant === quadrant) return;
    await updateTaskQuadrant(uid, id, quadrant, priorityForQuadrant(task.priority, quadrant));
  }
  function newTask(quadrant?: Quadrant) {
    // Same page as always on a phone; the side panel on wider screens.
    taskPanel.open('new', quadrant ? { quadrant } : undefined);
  }

  return {
    search,
    setSearch,
    columns,
    moveToQuadrant,
    newTask,
    loading: tasksLoading || projectsLoading,
  };
}
