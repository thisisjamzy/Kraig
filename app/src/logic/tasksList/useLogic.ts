'use client';

// Drill-down from Projects' own overview tiles (src/screens/Projects) and
// its "View all tasks" button — one screen, parameterized by `?filter=`, so
// every tile and the explicit "view all" button reuse the same list/card
// UI instead of each getting a bespoke one. The date-window filter (which
// tile you tapped) narrows WHEN a task is due; the status and priority
// filters below narrow WHAT it looks like, and apply on top regardless of
// which tile got you here.
//
// Insights drills in here too: ?from=&to= (or ?date=) with optional
// status (done/pending/cancelled), quadrant, hour (completed in that hour)
// and projectId — the tasks behind a chart bar or point.

import { useMemo, useState } from 'react';
import { rescheduleTask, toDateOnly } from '@/src/shared/firestore/taskWrites';
import { taskQuadrant, isQuadrant } from '@/src/viewmodels/eisenhower';
import type { Quadrant } from '@/src/shared/firestore/types';
import { query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { useSections } from '@/src/shared/firestore/queries';
import { areasRef, projectsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { PRIORITY_LEVELS, DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { Priority, FirestoreArea, FirestoreProject } from '@/src/shared/firestore/types';
import type { TaskCheckRowTask } from '@/src/widgets/TaskCheckRow/TaskCheckRow';
import { effectiveTimeMode } from '@/src/viewmodels/scheduling';
import { actionableTasks, expandTasks } from '@/src/shared/tasks/recurringTasks';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

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
  Urgent: 'Very important',
  High: 'Important',
  Medium: 'Normal priority',
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

export interface DrillDown {
  from: Date;
  to: Date;
  status: 'done' | 'pending' | 'cancelled' | null;
  quadrant: Quadrant | null;
  hour: number | null;
  projectId: string | null;
  title: string;
}

function dayFrom(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Insights' drill-down parameters, or null for the plain list. */
function drillFromSearch(): DrillDown | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const date = dayFrom(params.get('date'));
  const from = date ?? dayFrom(params.get('from'));
  const toDay = date ?? dayFrom(params.get('to'));
  if (!from || !toDay) return null;
  const to = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate(), 23, 59, 59, 999);
  const rawStatus = params.get('status');
  const status = rawStatus === 'done' || rawStatus === 'pending' || rawStatus === 'cancelled' ? rawStatus : null;
  const rawQuadrant = params.get('quadrant');
  const rawHour = params.get('hour');
  const hour = rawHour !== null && /^\d{1,2}$/.test(rawHour) ? Number(rawHour) : null;
  const label = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    from,
    to,
    status,
    quadrant: isQuadrant(rawQuadrant) ? rawQuadrant : null,
    hour,
    projectId: params.get('projectId'),
    title: params.get('title') ?? (toDateOnly(from) === toDateOnly(toDay) ? label(from) : `${label(from)} to ${label(toDay)}`),
  };
}

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: taskDocs, loading } = useAllTasks();

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs } = useFirestoreCollection<FirestoreProject>(projectsQuery);
  const projectName = useMemo(() => new Map(projectDocs.map((p) => [p.id, p.name])), [projectDocs]);

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid)) : null), [uid]);
  const { data: areaDocs } = useFirestoreCollection<FirestoreArea>(areasQuery);
  const areaName = useMemo(() => new Map(areaDocs.map((a) => [a.id, a.name])), [areaDocs]);

  const { data: bucketDocs } = useSections();
  const bucketName = useMemo(() => new Map(bucketDocs.map((b) => [b.id, b.name])), [bucketDocs]);

  const filter = filterFromSearch();
  const [drill] = useState<DrillDown | null>(drillFromSearch);
  // Defaults to "not done" so a tile's own count (all of which count only
  // pending tasks — see src/logic/projects/useLogic.ts's overview) still
  // matches what this list shows before the user touches the filter.
  // (A drill-down brings its own status, so it starts on "any status".)
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>(() => (drillFromSearch() ? 'all' : 'notDone'));
  const [priorityFilter, setPriorityFilter] = useState<TaskPriorityFilter>('All');

  const tasks = useMemo<TaskCheckRowTask[]>(() => {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Same 7-day horizon as src/logic/projects/useLogic.ts's own
    // scheduleThisWeekCount, so the tile's number and this list agree.
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Recurring tasks: every date in a day/week list; otherwise what's
    // actionable (today's, overdue, and — for All — the next date).
    const base = drill
      ? expandTasks(taskDocs, drill.from, drill.to)
      : filter === 'today' || filter === 'week'
        ? expandTasks(taskDocs, today, new Date(weekEnd.getTime() - 1))
        : actionableTasks(taskDocs, now, { includeUpcoming: filter === 'all' });
    const inDrill = (task: (typeof base)[number]) => {
      if (!drill) return true;
      const cancelled = task.status === 'Cancelled';
      if (drill.status === 'done' && !task.done) return false;
      if (drill.status === 'cancelled' && !cancelled) return false;
      if (drill.status === 'pending' && (task.done || cancelled)) return false;
      if (drill.projectId && task.projectId !== drill.projectId) return false;
      if (drill.hour !== null) {
        const completed = task.completedAt?.toDate();
        return Boolean(task.done && completed && completed >= drill.from && completed <= drill.to && completed.getHours() === drill.hour);
      }
      const anchor = (task.dueDate ?? task.startTime)?.toDate();
      if (!anchor || anchor < drill.from || anchor > drill.to) return false;
      if (drill.quadrant) {
        const q = taskQuadrant(
          { quadrant: task.quadrant, priority: task.priority ?? DEFAULT_PRIORITY, dueDate: task.dueDate?.toDate() ?? null, startTime: task.startTime?.toDate() ?? null },
          now
        );
        if (q !== drill.quadrant) return false;
      }
      return true;
    };
    return base
      .filter((task) => {
        if (!inDrill(task)) return false;
        if (drill && drill.hour !== null) return true;
        if (statusFilter === 'notDone' && task.done) return false;
        if (statusFilter === 'done' && !task.done) return false;
        if (priorityFilter !== 'All' && (task.priority ?? DEFAULT_PRIORITY) !== priorityFilter) return false;
        if (drill || filter === 'all') return true;
        if (!task.dueDate) return false;
        const due = task.dueDate.toDate();
        if (filter === 'today') return due >= today && due < tomorrow;
        if (filter === 'week') return due >= today && due < weekEnd;
        // overdue — same "due < now" signal src/logic/projects/useLogic.ts's
        // own overdueTaskCount tile is built from, so the tile's number and
        // this list always agree.
        return due < now;
      })
      .map((task): TaskCheckRowTask => {
        const startTime = task.startTime ? task.startTime.toDate() : null;
        const dueDate = task.dueDate ? task.dueDate.toDate() : null;
        const end = dueDate ?? startTime;
        const context = [
          task.projectId ? projectName.get(task.projectId) : null,
          task.bucketId ? bucketName.get(task.bucketId) : null,
          task.areaId ? areaName.get(task.areaId) : null,
        ].filter(Boolean);
        return {
          id: task.id,
          title: task.title,
          priority: task.priority ?? DEFAULT_PRIORITY,
          done: task.done,
          startTime,
          dueDate,
          allDay: Boolean(task.allDay),
          timeMode: effectiveTimeMode(task),
          recurring: Boolean(task.seriesId),
          overdue: !task.done && end !== null && end < now,
          context: context.length > 0 ? context.join(' · ') : null,
        };
      })
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.getTime() - b.dueDate.getTime();
      });
  }, [taskDocs, filter, drill, statusFilter, priorityFilter, projectName, bucketName, areaName]);

  // The evening nudge's "reschedule leftovers": today's unfinished tasks
  // move to tomorrow, same times of day.
  const leftovers = filter === 'today' && !drill ? tasks.filter((t) => !t.done) : [];
  const [movingLeftovers, setMovingLeftovers] = useState(false);
  async function moveLeftoversToTomorrow() {
    if (!uid || movingLeftovers) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setMovingLeftovers(true);
    try {
      for (const task of leftovers) await rescheduleTask(uid, task.id, toDateOnly(tomorrow));
    } finally {
      setMovingLeftovers(false);
    }
  }

  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/projects');
  }

  return {
    title: drill ? drill.title : FILTER_TITLES[filter],
    leftoverCount: leftovers.length,
    movingLeftovers,
    moveLeftoversToTomorrow,
    tasks,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    goBack,
    loading,
  };
}
