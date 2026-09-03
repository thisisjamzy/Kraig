'use client';

// Drill-down from Projects' own overview tiles (src/screens/Projects) and
// its "View all tasks" button — one screen, parameterized by `?filter=`, so
// every tile and the explicit "view all" button reuse the same list/card
// UI instead of each getting a bespoke one.

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { TaskCardTask } from '@/src/widgets/TaskCard/TaskCard';

export type TaskListFilter = 'today' | 'week' | 'overdue' | 'all';

const FILTER_TITLES: Record<TaskListFilter, string> = {
  today: 'Due today',
  week: 'Due this week',
  overdue: 'Overdue',
  all: 'All tasks',
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
        if (task.done) return false;
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
  }, [taskDocs, filter]);

  function openTask(taskId: string) {
    router.push(`/tasks/${taskId}/edit`);
  }
  function goBack() {
    router.back();
  }

  return { title: FILTER_TITLES[filter], tasks, openTask, goBack, loading };
}
