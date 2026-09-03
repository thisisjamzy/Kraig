'use client';

// Drill-down from Projects' own overview tiles (src/screens/Projects) and
// its "View all tasks" button — one screen, parameterized by `?filter=`, so
// every tile and the explicit "view all" button reuse the same list/card
// UI instead of each getting a bespoke one. The date-window filter (which
// tile you tapped) narrows WHEN a task is due; the status and priority
// filters below narrow WHAT it looks like, and apply on top regardless of
// which tile got you here.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { PRIORITY_LEVELS, DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { Priority } from '@/src/shared/firestore/types';
import type { TaskCardTask } from '@/src/widgets/TaskCard/TaskCard';

export type TaskListFilter = 'today' | 'week' | 'overdue' | 'all';
export type TaskStatusFilter = 'notDone' | 'done' | 'all';
export type TaskPriorityFilter = Priority | 'All';

const FILTER_TITLES: Record<TaskListFilter, string> = {
  today: 'Due today',
  week: 'Due this week',
  overdue: 'Overdue',
  all: 'All tasks',
};

export const STATUS_FILTERS: TaskStatusFilter[] = ['notDone', 'done', 'all'];
export const STATUS_FILTER_LABEL: Record<TaskStatusFilter, string> = {
  notDone: 'Not done',
  done: 'Done',
  all: 'Any status',
};

export const PRIORITY_FILTERS: TaskPriorityFilter[] = ['All', ...PRIORITY_LEVELS];
export const PRIORITY_FILTER_LABEL: Record<TaskPriorityFilter, string> = {
  All: 'Any priority',
  High: 'High priority',
  Medium: 'Medium priority',
  Low: 'Low priority',
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Read directly off window.location.search (not useSearchParams()) so this
// screen never needs a Suspense boundary — same precedent as
// src/logic/taskEdit/useLogic.ts's projectIdFromSearch.
function filterFromSearch(): TaskListFilter {
  if (typeof window === 'undefined') return 'all';
  const raw = new URLSearchParams(window.location.search).get('filter');
  return raw === 'today' || raw === 'week' || raw === 'overdue' ? raw : 'all';
}

export function useLogic() {
  const router = useRouter();
  const { data: taskDocs, loading } = useAllTasks();
  const filter = filterFromSearch();
  // Defaults to "not done" so a tile's own count (all of which count only
  // pending tasks — see src/logic/projects/useLogic.ts's overview) still
  // matches what this list shows before the user touches the filter.
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('notDone');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriorityFilter>('All');

  const tasks = useMemo<TaskCardTask[]>(() => {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Same 7-day horizon as src/logic/projects/useLogic.ts's own
    // scheduleThisWeekCount, so the tile's number and this list agree.
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return taskDocs
      .filter((task) => {
        if (statusFilter === 'notDone' && task.done) return false;
        if (statusFilter === 'done' && !task.done) return false;
        if (priorityFilter !== 'All' && (task.priority ?? DEFAULT_PRIORITY) !== priorityFilter) return false;
        if (filter === 'all') return true;
        if (!task.dueDate) return false;
        const due = task.dueDate.toDate();
        if (filter === 'today') return due >= today && due < tomorrow;
        if (filter === 'week') return due >= today && due < weekEnd;
        // overdue — same "due < now" signal src/logic/projects/useLogic.ts's
        // own overdueTaskCount tile is built from, so the tile's number and
        // this list always agree.
        return due < now;
      })
      .map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority ?? DEFAULT_PRIORITY,
        done: task.done,
        startTime: task.startTime ? task.startTime.toDate() : null,
        dueDate: task.dueDate ? task.dueDate.toDate() : null,
      }))
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.getTime() - b.dueDate.getTime();
      });
  }, [taskDocs, filter, statusFilter, priorityFilter]);

  function openTask(taskId: string) {
    router.push(`/tasks/${taskId}/edit`);
  }
  function goBack() {
    router.back();
  }

  return {
    title: FILTER_TITLES[filter],
    tasks,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    openTask,
    goBack,
    loading,
  };
}
