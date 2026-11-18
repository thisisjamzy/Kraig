// A task as Time v1.0's lists and tables show it (Tasks, the area, folder
// and project pages): the check row's fields, what the list filters on, and
// the words of the v1.0 table (status, time block, due, done at). Pure.

import type { FirestoreProject, Priority, Quadrant, TaskStatus, TaskType, TimeMode } from '@/src/shared/firestore/types';
import type { TaskItem } from '@/src/shared/tasks/recurringTasks';
import { DEFAULT_PRIORITY, resolveTaskStatus } from './projects';
import { taskQuadrant } from './eisenhower';
import { effectiveTimeMode } from './scheduling';
import { clockText, dayText, lateText, rangeText, statusText } from './todayPlan';

/** A task as the list shows it (TaskCheckRow) plus what it filters on. */
export interface TaskListItem {
  id: string;
  title: string;
  priority: Priority;
  done: boolean;
  startTime: Date | null;
  dueDate: Date | null;
  allDay?: boolean;
  timeMode?: TimeMode;
  recurring?: boolean;
  overdue?: boolean;
  /** "Project · Folder · Area" */
  context?: string | null;
  status: 'pending' | 'done' | 'cancelled';
  quadrant: Quadrant;
  type: TaskType;
  projectId: string | null;
  anchor: Date | null;
  startMinutes: number | null;
  mode: TimeMode;
  createdAt: Date | null;
  completedAt: Date | null;
  // Time v1.0 table and rows.
  projectName: string | null;
  projectColor: string | null;
  /** The stored type name ("Deep work"), for TypePill. */
  typeName: string;
  rawStatus: TaskStatus;
  /** "To do", "In progress", "Waiting", "Done". */
  statusText: string;
  /** Its time block: "9:00 to 11:00", "14:00", or null. */
  blockText: string | null;
  /** "2 days late", "Yesterday", "Today", "Wed 18 Nov", or null. */
  dueText: string | null;
  late: boolean;
  /** "8:40", when done. */
  doneAt: string | null;
  minutes: number;
}


export interface ListItemContext {
  projects: Map<string, Pick<FirestoreProject, 'name' | 'color'>>;
  projectName: Map<string, string>;
  bucketName: Map<string, string>;
  areaName: Map<string, string>;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toListItem(task: TaskItem, ctx: ListItemContext, now: Date): TaskListItem {
  const today = startOfDay(now);
  const { projectName, bucketName, areaName } = ctx;
  const startTime = task.startTime ? task.startTime.toDate() : null;
  const dueDate = task.dueDate ? task.dueDate.toDate() : null;
  const end = dueDate ?? startTime;
  const priority = task.priority ?? DEFAULT_PRIORITY;
  const project = task.projectId ? ctx.projects.get(task.projectId) : undefined;
  const rawStatus = resolveTaskStatus(task);
  const timed = !task.allDay && (startTime || dueDate);
  const done = task.done;
  const isLate = !done && task.status !== 'Cancelled' && end !== null && startOfDay(end) < today;
  const context = [
    task.projectId ? projectName.get(task.projectId) : null,
    task.bucketId ? bucketName.get(task.bucketId) : null,
    task.areaId ? areaName.get(task.areaId) : null,
  ].filter(Boolean);
  return {
    id: task.id,
    title: task.title,
    priority,
    done: task.done,
    startTime,
    dueDate,
    allDay: Boolean(task.allDay),
    timeMode: effectiveTimeMode(task),
    recurring: Boolean(task.seriesId),
    overdue: !task.done && task.status !== 'Cancelled' && end !== null && end < now,
    context: context.length > 0 ? context.join(' · ') : null,
    status: task.done ? 'done' : task.status === 'Cancelled' ? 'cancelled' : 'pending',
    quadrant: taskQuadrant({ quadrant: task.quadrant, priority, dueDate, startTime }, now),
    type: task.type ?? 'ToDo',
    projectId: task.projectId ?? null,
    anchor: startTime ?? dueDate,
    startMinutes: startTime && !task.allDay ? startTime.getHours() * 60 + startTime.getMinutes() : null,
    mode: effectiveTimeMode(task),
    createdAt: task.createdAt ? task.createdAt.toDate() : null,
    completedAt: task.completedAt ? task.completedAt.toDate() : null,
    projectName: project?.name ?? null,
    projectColor: project?.color ?? null,
    typeName: task.type || 'ToDo',
    rawStatus,
    statusText: statusText({ rawStatus, status: done ? 'Done' : task.status === 'Cancelled' ? 'Cancelled' : 'Pending', start: startTime, end: dueDate, allDay: Boolean(task.allDay) }, now),
    blockText: timed ? (startTime ? rangeText(startTime, dueDate) : clockText(dueDate!)) : null,
    dueText: end ? (isLate ? lateText(end, now) : dayText(end, now)) : null,
    late: isLate,
    doneAt: done && task.completedAt ? clockText(task.completedAt.toDate()) : null,
    minutes: timed && startTime && dueDate && dueDate > startTime ? Math.round((dueDate.getTime() - startTime.getTime()) / 60000) : 0,
  };
}
