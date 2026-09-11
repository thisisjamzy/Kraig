'use client';

// "What needs my attention today" — every not-done task, filterable by
// priority and by when it's due, plus a quick read on how today (and the
// last week) is going. Everything project-related (Active projects, the old
// completed-trend/reschedule stats) moved to the Analytics screen, which is
// the one place in Projects mode that's specifically about numbers rather
// than action — this one stays a plain worklist plus a single at-a-glance
// trend. The worklist itself is one flat list, not sectioned by priority —
// the priority badge on each TaskCard already says that, a heading
// repeating it just to split the list into blocks would be redundant.

import { useMemo, useState } from 'react';
import { query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { useBuckets } from '@/src/shared/firestore/queries';
import { areasRef, projectsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { pendingTasksByPriority, dailySuccessTrend } from '@/src/shared/firestore/taskInsights';
import { PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import type { Priority, FirestoreArea, FirestoreProject } from '@/src/shared/firestore/types';
import type { TaskCardTask } from '@/src/widgets/TaskCard/TaskCard';

const SUCCESS_TREND_DAYS = 7;

export type FocusPriorityFilter = Priority | 'All';
export type FocusDateFilter = 'all' | 'today' | 'thisWeek' | 'thisMonth' | 'lastWeek' | 'lastMonth';

function timeLeftToday(): string {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const diffMinutes = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfWeek(date: Date): Date {
  // Sunday-start, same convention as ProjectsCalendarScreen's own WEEKDAY_LABELS.
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

/** [start, end) for a date filter, or null for 'all' (no date filtering). */
function dateRangeFor(filter: FocusDateFilter, now: Date): { start: Date; end: Date } | null {
  switch (filter) {
    case 'today': {
      const start = startOfDay(now);
      return { start, end: addDays(start, 1) };
    }
    case 'thisWeek': {
      const start = startOfWeek(now);
      return { start, end: addDays(start, 7) };
    }
    case 'thisMonth': {
      const start = startOfMonth(now);
      return { start, end: addMonths(start, 1) };
    }
    case 'lastWeek': {
      const start = addDays(startOfWeek(now), -7);
      return { start, end: addDays(start, 7) };
    }
    case 'lastMonth': {
      const start = addMonths(startOfMonth(now), -1);
      return { start, end: startOfMonth(now) };
    }
    default:
      return null;
  }
}

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: tasks, loading } = useAllTasks();
  const [priorityFilter, setPriorityFilter] = useState<FocusPriorityFilter>('All');
  const [dateFilter, setDateFilter] = useState<FocusDateFilter>('all');

  // Keyed by task id so the visible list — built from pendingTasksByPriority's
  // own FocusTaskItem shape, which doesn't carry project/bucket/area ids —
  // can still look each task's own context back up.
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs } = useFirestoreCollection<FirestoreProject>(projectsQuery);
  const projectName = useMemo(() => new Map(projectDocs.map((p) => [p.id, p.name])), [projectDocs]);

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid)) : null), [uid]);
  const { data: areaDocs } = useFirestoreCollection<FirestoreArea>(areasQuery);
  const areaName = useMemo(() => new Map(areaDocs.map((a) => [a.id, a.name])), [areaDocs]);

  const { data: bucketDocs } = useBuckets();
  const bucketName = useMemo(() => new Map(bucketDocs.map((b) => [b.id, b.name])), [bucketDocs]);

  const priorityGroups = useMemo(() => pendingTasksByPriority(tasks), [tasks]);

  const visibleTasks = useMemo<TaskCardTask[]>(() => {
    const visiblePriorities = priorityFilter === 'All' ? PRIORITY_LEVELS : [priorityFilter];
    const range = dateRangeFor(dateFilter, new Date());
    return visiblePriorities
      .flatMap((priority) => priorityGroups[priority].map((item) => ({ ...item, priority })))
      .filter((item) => !range || (item.dueDate && item.dueDate >= range.start && item.dueDate < range.end))
      .map((item) => {
        const source = taskById.get(item.id);
        return {
          id: item.id,
          title: item.title,
          priority: item.priority,
          done: false,
          status: item.status,
          startTime: item.startTime,
          dueDate: item.dueDate,
          projectName: source?.projectId ? projectName.get(source.projectId) ?? null : null,
          bucketName: source?.bucketId ? bucketName.get(source.bucketId) ?? null : null,
          areaName: source?.areaId ? areaName.get(source.areaId) ?? null : null,
        };
      })
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.getTime() - b.dueDate.getTime();
      });
  }, [priorityGroups, priorityFilter, dateFilter, taskById, projectName, bucketName, areaName]);

  const successTrend = useMemo(() => dailySuccessTrend(tasks, SUCCESS_TREND_DAYS), [tasks]);
  const todaySuccess = successTrend.length > 0 ? successTrend[successTrend.length - 1].value : 0;

  return {
    visibleTasks,
    priorityFilter,
    setPriorityFilter,
    dateFilter,
    setDateFilter,
    successTrend,
    todaySuccess,
    timeLeftToday: timeLeftToday(),
    loading,
  };
}
