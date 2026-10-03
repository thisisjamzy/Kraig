// The Tasks database's row: every task view in the Time module (Today's
// list, the Focus matrix, the Calendar, a project's or an area's tasks)
// shows these, built from the same live query, so a task edited anywhere
// updates everywhere. Pure, so it can be tested.

import type { FirestoreProject, FirestoreArea, Priority, Quadrant, TaskStatus, TimeMode } from '@/src/shared/firestore/types';
import type { TaskItem } from '@/src/shared/tasks/recurringTasks';
import { DEFAULT_PRIORITY, resolveTaskStatus } from './projects';
import { QUADRANT_BY_ID, taskQuadrant } from './eisenhower';
import { effectiveTimeMode } from './scheduling';

/** The three statuses the Tasks database groups by. Stuck and In Review
 * (set by the older quick menu) read as Pending. */
export type TaskRowStatus = 'Pending' | 'Done' | 'Cancelled';
export type TaskRowType = 'ToDo' | 'Meeting' | 'Event';

export interface TaskRow {
  id: string;
  title: string;
  emoji: string | null;
  status: TaskRowStatus;
  rawStatus: TaskStatus;
  done: boolean;
  importance: Quadrant;
  priority: Priority;
  type: TaskRowType;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  areaId: string | null;
  areaName: string | null;
  /** The day it's on (midnight), from its start or due time. */
  date: Date | null;
  start: Date | null;
  end: Date | null;
  allDay: boolean;
  timeMode: TimeMode;
  recurring: boolean;
  seriesId: string | null;
  overdue: boolean;
  /** "Synced", "Waiting", "Not synced" or null when sync is off or it isn't pushed. */
  sync: string | null;
  created: Date | null;
  completed: Date | null;
  notes: string;
  minutes: number;
}

export interface TaskRowContext {
  projects: Map<string, Pick<FirestoreProject, 'name' | 'color' | 'areaId'>>;
  areas: Map<string, Pick<FirestoreArea, 'name'>>;
  now: Date;
  /** Sync state label, when sync is on. */
  syncOf?: (task: TaskItem) => string | null;
}

export const STATUS_ORDER: TaskRowStatus[] = ['Pending', 'Done', 'Cancelled'];
export const IMPORTANCE_ORDER: Quadrant[] = ['do', 'schedule', 'delegate', 'eliminate'];
export const TYPE_LABEL: Record<TaskRowType, string> = { ToDo: 'Todo', Meeting: 'Meeting', Event: 'Event' };

export function rowStatus(task: { status?: TaskStatus; done: boolean }): TaskRowStatus {
  const s = resolveTaskStatus(task);
  return s === 'Done' ? 'Done' : s === 'Cancelled' ? 'Cancelled' : 'Pending';
}

function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toTaskRow(t: TaskItem, ctx: TaskRowContext): TaskRow {
  const start = t.startTime ? t.startTime.toDate() : null;
  const end = t.dueDate ? t.dueDate.toDate() : null;
  const anchor = start ?? end;
  const priority = t.priority ?? DEFAULT_PRIORITY;
  const status = rowStatus(t);
  const project = t.projectId ? ctx.projects.get(t.projectId) : undefined;
  const areaId = t.areaId ?? project?.areaId ?? null;
  const type: TaskRowType = t.type === 'Meeting' || t.type === 'Event' ? t.type : 'ToDo';
  const finish = end ?? start;
  return {
    id: t.id,
    title: t.title,
    emoji: t.emoji ?? null,
    status,
    rawStatus: resolveTaskStatus(t),
    done: status === 'Done',
    importance: taskQuadrant({ quadrant: t.quadrant, priority, dueDate: end, startTime: start }, ctx.now),
    priority,
    type,
    projectId: t.projectId,
    projectName: project?.name ?? null,
    projectColor: project?.color ?? null,
    areaId,
    areaName: areaId ? (ctx.areas.get(areaId)?.name ?? null) : null,
    date: anchor ? dayStart(anchor) : null,
    start,
    end,
    allDay: Boolean(t.allDay),
    timeMode: effectiveTimeMode(t),
    recurring: Boolean(t.seriesId),
    seriesId: t.seriesId ?? null,
    overdue: status === 'Pending' && finish !== null && finish < ctx.now,
    sync: ctx.syncOf?.(t) ?? null,
    created: t.createdAt ? t.createdAt.toDate() : null,
    completed: t.completedAt ? t.completedAt.toDate() : null,
    notes: t.notes ?? '',
    minutes: !t.allDay && start && end && end > start ? Math.round((end.getTime() - start.getTime()) / 60000) : 0,
  };
}

export function importanceLabel(q: Quadrant): string {
  return QUADRANT_BY_ID[q].label;
}

/** "4h", "1.5h", "45m" */
export function hoursText(minutes: number): string {
  if (minutes === 0) return '0h';
  if (minutes < 60) return `${minutes}m`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

/** "9:00 to 10:30", "9:00", "All day", or null. */
export function timeText(row: Pick<TaskRow, 'start' | 'end' | 'allDay'>): string | null {
  if (row.allDay) return row.start || row.end ? 'All day' : null;
  const f = (d: Date) => d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
  if (row.start && row.end && row.end > row.start) return `${f(row.start)} to ${f(row.end)}`;
  const at = row.start ?? row.end;
  return at ? f(at) : null;
}

/** Blocked minutes on a set of rows (timed, blocked, not cancelled). */
export function blockedMinutes(rows: TaskRow[]): number {
  return rows.filter((r) => r.status !== 'Cancelled' && !r.allDay && r.timeMode === 'blocked').reduce((s, r) => s + r.minutes, 0);
}
