'use client';

// The tasks list — one screen for every "see these tasks" link:
//   - ?filter=today|week|overdue|all — the Time hub's tiles and "view all";
//   - ?from=&to= (or ?date=) with optional status / quadrant / hour /
//     projectId — Insights' drill-downs (the tasks behind a chart);
// that scope decides WHICH tasks are loaded. Within it, the Notion-style
// toolbar (src/widgets/ListQuery) filters, sorts and searches — saved per
// user, default: pending tasks by importance (quadrant rank), then date,
// then start time.

import { useMemo, useState } from 'react';
import { query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { useSections } from '@/src/shared/firestore/queries';
import { areasRef, projectsRef } from '@/src/shared/firestore/refs';
import { rescheduleTask, toDateOnly, updateTaskDone } from '@/src/shared/firestore/taskWrites';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { actionableTasks, expandTasks } from '@/src/shared/tasks/recurringTasks';
import { useListQuery } from '@/src/shared/listQuery/useListQuery';
import { applyQuery, type FieldDef, type ListQuery } from '@/src/shared/listQuery/engine';
import { DEFAULT_PRIORITY, TASK_TYPES, taskTypeLabel } from '@/src/viewmodels/projects';
import { QUADRANTS, isQuadrant, taskQuadrant } from '@/src/viewmodels/eisenhower';
import type { FirestoreArea, FirestoreProject, Quadrant } from '@/src/shared/firestore/types';
import { dayText } from '@/src/viewmodels/todayPlan';
import { toListItem, type TaskListItem } from '@/src/viewmodels/taskListItem';
import { styleGuide } from '@/src/styles/tokens/styleGuide';

export type TaskListFilter = 'today' | 'week' | 'overdue' | 'all';

/** Time v1.0's view bar (Tasks / Web 53712): Today (Overdue, then today),
 * Upcoming (by day), Inbox (no date, no project) and All tasks. */
export type TaskTab = 'today' | 'upcoming' | 'inbox' | 'all';
export const TASK_TABS: { id: TaskTab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'all', label: 'All tasks' },
];

export interface TaskGroup {
  id: string;
  label: string;
  /** Overdue reads red, today green. */
  tone: 'danger' | 'positive' | null;
  tasks: TaskListItem[];
}

function tabFromSearch(): TaskTab {
  if (typeof window === 'undefined') return 'today';
  const raw = new URLSearchParams(window.location.search).get('view');
  return raw === 'upcoming' || raw === 'inbox' || raw === 'all' ? raw : 'today';
}

function hasScopeParams(): boolean {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return p.has('filter') || p.has('date') || p.has('from');
}

const FILTER_TITLES: Record<TaskListFilter, string> = {
  today: 'Due today',
  week: 'Due this week',
  overdue: 'Overdue',
  all: 'All tasks',
};

export type { TaskListItem } from '@/src/viewmodels/taskListItem';

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

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Pending tasks, by importance, then date, then start time. */
export const TASK_DEFAULTS: ListQuery = {
  filters: [{ id: 'default-status', kind: 'rule', field: 'status', op: 'is', value: ['pending'] }],
  advanced: null,
  sorts: [
    { id: 'default-importance', field: 'importance', dir: 'asc' },
    { id: 'default-date', field: 'date', dir: 'asc' },
    { id: 'default-start', field: 'start', dir: 'asc' },
  ],
  search: '',
};

/** The v1.0 view bar's list: every status (each tab picks its own), by
 * date, then start time. */
export const TASK_V1_DEFAULTS: ListQuery = {
  filters: [],
  advanced: null,
  sorts: [
    { id: 'default-date', field: 'date', dir: 'asc' },
    { id: 'default-start', field: 'start', dir: 'asc' },
  ],
  search: '',
};

export function taskFields(projects: { id: string; name: string }[]): FieldDef<TaskListItem>[] {
  return [
    { id: 'name', label: 'Name', type: 'text', get: (t) => t.title, searchable: true },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      get: (t) => t.status,
      options: [
        { value: 'pending', label: 'Pending', color: styleGuide.brand.primary },
        { value: 'done', label: 'Done', color: styleGuide.brand.primaryDark },
        { value: 'cancelled', label: 'Cancelled', color: styleGuide.neutrals[400] },
      ],
    },
    {
      // Sorts by quadrant rank (do first, schedule, delegate, eliminate).
      id: 'importance',
      label: 'Importance',
      type: 'select',
      get: (t) => t.quadrant,
      options: QUADRANTS.map((q, i) => ({ value: q.id, label: q.label, color: [styleGuide.destructive, styleGuide.brand.primary, styleGuide.brand.accent, styleGuide.neutrals[400]][i] })),
    },
    {
      id: 'type',
      label: 'Type',
      type: 'select',
      get: (t) => t.type,
      options: TASK_TYPES.map((type) => ({ value: type, label: type === 'ToDo' ? 'To-do' : taskTypeLabel(type) })),
    },
    {
      id: 'project',
      label: 'Project',
      type: 'select',
      get: (t) => t.projectId,
      options: [...projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.id, label: p.name })),
    },
    { id: 'date', label: 'Date', type: 'date', get: (t) => t.anchor },
    { id: 'start', label: 'Start time', type: 'time', get: (t) => t.startMinutes },
    {
      id: 'mode',
      label: 'Time mode',
      type: 'select',
      get: (t) => (t.allDay || !t.startTime ? null : t.mode),
      options: [
        { value: 'blocked', label: 'Blocked' },
        { value: 'free', label: 'Free' },
      ],
    },
    { id: 'recurring', label: 'Recurring', type: 'checkbox', get: (t) => Boolean(t.recurring) },
    { id: 'overdue', label: 'Overdue', type: 'checkbox', get: (t) => Boolean(t.overdue) },
    { id: 'created', label: 'Created', type: 'date', get: (t) => t.createdAt },
    { id: 'completed', label: 'Completed', type: 'date', get: (t) => t.completedAt },
    // Searched, not a filter of its own.
    { id: 'where', label: 'Project name', type: 'text', get: (t) => t.context ?? '', searchable: true, filterable: false, sortable: false },
  ];
}

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: taskDocs, loading } = useAllTasks();

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs } = useFirestoreCollection<FirestoreProject>(projectsQuery);
  const projectName = useMemo(() => new Map(projectDocs.map((p) => [p.id, p.name])), [projectDocs]);
  const projectDoc = useMemo(() => new Map(projectDocs.map((p) => [p.id, p])), [projectDocs]);

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid)) : null), [uid]);
  const { data: areaDocs } = useFirestoreCollection<FirestoreArea>(areasQuery);
  const areaName = useMemo(() => new Map(areaDocs.map((a) => [a.id, a.name])), [areaDocs]);

  const { data: bucketDocs } = useSections();
  const bucketName = useMemo(() => new Map(bucketDocs.map((b) => [b.id, b.name])), [bucketDocs]);

  const [filter] = useState(filterFromSearch);
  const [drill] = useState<DrillDown | null>(drillFromSearch);
  // A link with a scope (?filter=, Insights' drill-downs) keeps the plain
  // list; otherwise the v1.0 view bar.
  const [scoped] = useState(hasScopeParams);
  const [tab, setTab] = useState<TaskTab>(tabFromSearch);

  // The scope: which tasks this link is about (before the toolbar).
  const items = useMemo<TaskListItem[]>(() => {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const weekEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    const base = drill
      ? expandTasks(taskDocs, drill.from, drill.to)
      : filter === 'today' || filter === 'week'
        ? expandTasks(taskDocs, today, new Date(weekEnd.getTime() - 1))
        : actionableTasks(taskDocs, now, { includeUpcoming: filter === 'all' || !scoped });
    return base
      .filter((task) => {
        const due = (task.dueDate ?? task.startTime)?.toDate() ?? null;
        if (drill) {
          const cancelled = task.status === 'Cancelled';
          if (drill.status === 'done' && !task.done) return false;
          if (drill.status === 'cancelled' && !cancelled) return false;
          if (drill.status === 'pending' && (task.done || cancelled)) return false;
          if (drill.projectId && task.projectId !== drill.projectId) return false;
          if (drill.hour !== null) {
            const completed = task.completedAt?.toDate();
            return Boolean(task.done && completed && completed >= drill.from && completed <= drill.to && completed.getHours() === drill.hour);
          }
          if (!due || due < drill.from || due > drill.to) return false;
          if (drill.quadrant) {
            const q = taskQuadrant(
              { quadrant: task.quadrant, priority: task.priority ?? DEFAULT_PRIORITY, dueDate: task.dueDate?.toDate() ?? null, startTime: task.startTime?.toDate() ?? null },
              now
            );
            if (q !== drill.quadrant) return false;
          }
          return true;
        }
        if (filter === 'all' || !scoped) return task.status !== 'Cancelled';
        if (!task.dueDate) return false;
        const d = task.dueDate.toDate();
        if (filter === 'today') return d >= today && d < tomorrow;
        if (filter === 'week') return d >= today && d < weekEnd;
        return d < now; // overdue
      })
      .map((task) => toListItem(task, { projects: projectDoc, projectName, bucketName, areaName }, now));
  }, [taskDocs, filter, drill, scoped, projectDoc, projectName, bucketName, areaName]);

  const fields = useMemo(
    () => taskFields(projectDocs.filter((p) => p.status !== 'Archived').map((p) => ({ id: p.id, name: p.name }))),
    [projectDocs]
  );
  const list = useListQuery<TaskListItem>({ listId: scoped ? 'tasks' : 'tasks-v1', fields, defaults: scoped ? TASK_DEFAULTS : TASK_V1_DEFAULTS });
  const queried = useMemo(() => applyQuery(items, list.query, fields, new Date()), [items, list.query, fields]);

  // ---- The v1.0 view bar: each tab's tasks, in groups ----
  const views = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const pending = (t: TaskListItem) => t.status === 'pending';
    const on = (t: TaskListItem) => t.anchor ?? t.dueDate;
    const overdue = queried.filter((t) => pending(t) && t.late);
    const dueToday = queried.filter((t) => {
      const d = on(t);
      return d !== null && d >= today && d < tomorrow && t.status !== 'cancelled';
    });
    const upcoming = queried.filter((t) => pending(t) && on(t) !== null && on(t)! >= tomorrow);
    const inbox = queried.filter((t) => pending(t) && !on(t) && !t.projectId);
    const todayLabel = `Today, ${today.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
    const byDay = new Map<string, TaskListItem[]>();
    for (const t of upcoming) {
      const label = dayText(on(t)!, now);
      byDay.set(label, [...(byDay.get(label) ?? []), t]);
    }
    const groups: Record<TaskTab, TaskGroup[]> = {
      today: [
        { id: 'overdue', label: 'Overdue', tone: 'danger' as const, tasks: overdue },
        { id: 'today', label: todayLabel, tone: 'positive' as const, tasks: dueToday },
      ].filter((g) => g.tasks.length > 0),
      upcoming: [...byDay.entries()].map(([label, tasks]) => ({ id: label, label, tone: null, tasks })),
      inbox: inbox.length ? [{ id: 'inbox', label: 'No date, no project', tone: null, tasks: inbox }] : [],
      all: [
        { id: 'pending', label: 'Open', tone: null, tasks: queried.filter(pending) },
        { id: 'done', label: 'Done', tone: null, tasks: queried.filter((t) => t.status === 'done') },
      ].filter((g) => g.tasks.length > 0),
    };
    return {
      groups,
      counts: { today: overdue.length + dueToday.filter(pending).length, upcoming: upcoming.length, inbox: inbox.length, all: queried.filter(pending).length } as Record<TaskTab, number>,
      open: items.filter(pending).length,
      overdue: items.filter((t) => pending(t) && t.late).length,
      dueToday: items.filter((t) => {
        const d = on(t);
        return pending(t) && d !== null && d >= today && d < tomorrow;
      }).length,
    };
  }, [queried, items]);
  const tasks = scoped ? queried : views.groups[tab].flatMap((g) => g.tasks);

  // The evening nudge's "reschedule leftovers": today's unfinished tasks
  // move to tomorrow, same times of day.
  const leftovers = filter === 'today' && !drill ? items.filter((t) => t.status === 'pending') : [];
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
  return {
    title: drill ? drill.title : FILTER_TITLES[filter],
    tasks,
    total: items.length,
    fields,
    list,
    leftoverCount: leftovers.length,
    movingLeftovers,
    moveLeftoversToTomorrow,
    goBack: () => navigateBack('/projects'),
    loading,
    /** True for a scoped link (?filter=, a drill-down): the plain list. */
    scoped,
    tab,
    setTab: (next: TaskTab) => {
      setTab(next);
      const url = new URL(window.location.href);
      if (next === 'today') url.searchParams.delete('view');
      else url.searchParams.set('view', next);
      window.history.replaceState(window.history.state, '', url);
    },
    groups: views.groups[tab],
    counts: views.counts,
    openCount: views.open,
    overdueCount: views.overdue,
    todayCount: views.dueToday,
    setDone: (task: TaskListItem, done: boolean) => (uid ? updateTaskDone(uid, task.id, done) : Promise.resolve()),
  };
}
