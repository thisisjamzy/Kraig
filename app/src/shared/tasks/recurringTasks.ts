// Recurring tasks — the task side: turns a series doc (FirestoreTask with an
// rrule) into its occurrences for the range a screen shows. An occurrence
// is shaped exactly like a FirestoreTask (so every listing, card and date
// filter handles it unchanged) with:
//   - id "seriesId@YYYY-MM-DD" (occurrenceId below) — taskWrites.ts routes
//     writes to such an id onto the series' exceptions, and the edit page
//     opens that one date;
//   - its own startTime/dueDate on that date (same times and length as the
//     series, or its "this task" edit), and its own done/status.
// Non-recurring tasks pass through untouched.
//
// Which occurrences a screen lists:
//   - a day or a week (Time hub's today, Calendar, This week): every
//     occurrence in it — expandTasks();
//   - an undated list (project, area, All tasks, Focus): what's actionable
//     — today's occurrence and pending overdue ones (up to OVERDUE_DAYS
//     back), plus the next upcoming one when asked, so a daily task never
//     floods a list — actionableTasks().
// Counts that treat a task as one unit (project completion, section
// stats) see a series once — summarizeSeries().

import { Timestamp } from 'firebase/firestore';
import type { FirestoreTask, TaskException } from '@/src/shared/firestore/types';
import { addDays, dateKey, describeRule, expandRule, keyToDate, parseRRule, type RecurrenceRule } from '../../viewmodels/recurrence';

/** A task or one date of a series. */
export type TaskItem = FirestoreTask & {
  /** Set on an occurrence: the series doc's id. */
  seriesId?: string;
  /** Set on an occurrence: the date the rule generated, "YYYY-MM-DD". */
  occurrenceKey?: string;
};

const SEPARATOR = '@';
/** How far back a pending occurrence still shows as overdue. */
export const OVERDUE_DAYS = 7;
/** Moved occurrences can land up to this far from their own date. */
const MOVE_PADDING_DAYS = 31;

export function occurrenceId(seriesId: string, key: string): string {
  return `${seriesId}${SEPARATOR}${key}`;
}

/** "abc@2026-09-27" → { seriesId: 'abc', key: '2026-09-27' }; null for a
 * plain task id. Firestore auto/UUID ids never contain "@". */
export function parseOccurrenceId(id: string): { seriesId: string; key: string } | null {
  const decoded = id.includes('%40') ? decodeURIComponent(id) : id;
  const at = decoded.lastIndexOf(SEPARATOR);
  if (at <= 0) return null;
  const key = decoded.slice(at + 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return { seriesId: decoded.slice(0, at), key };
}

export function isRecurring(task: Pick<FirestoreTask, 'rrule'>): boolean {
  return Boolean(task.rrule && parseRRule(task.rrule));
}

/** The series' first date and time (DTSTART). */
export function seriesStart(task: FirestoreTask): Date | null {
  const anchor = task.startTime ?? task.dueDate;
  return anchor ? anchor.toDate() : null;
}

function seriesRule(task: FirestoreTask): RecurrenceRule | null {
  return task.rrule ? parseRRule(task.rrule) : null;
}

/** Length of one occurrence: the series' own start-to-due span. */
function seriesDuration(task: FirestoreTask): number {
  if (task.startTime && task.dueDate) return Math.max(0, task.dueDate.toMillis() - task.startTime.toMillis());
  return 0;
}

/** One generated date → the occurrence as a task. */
function buildOccurrence(series: FirestoreTask, generated: Date, exception: TaskException | undefined): TaskItem {
  const key = dateKey(generated);
  const duration = seriesDuration(series);
  const hasStart = Boolean(series.startTime);
  const start = exception?.startTime ?? (hasStart ? Timestamp.fromDate(generated) : null);
  const due =
    exception?.dueDate ??
    (series.dueDate ? Timestamp.fromDate(new Date(generated.getTime() + (hasStart ? duration : 0))) : null);
  const status = exception?.status;
  return {
    ...series,
    ...(exception?.title !== undefined ? { title: exception.title } : {}),
    ...(exception?.notes !== undefined ? { notes: exception.notes } : {}),
    ...(exception?.type !== undefined ? { type: exception.type } : {}),
    ...(exception?.priority !== undefined ? { priority: exception.priority } : {}),
    ...(exception?.quadrant !== undefined ? { quadrant: exception.quadrant } : {}),
    ...(exception?.timeMode !== undefined ? { timeMode: exception.timeMode } : {}),
    ...(exception?.allDay !== undefined ? { allDay: exception.allDay } : {}),
    id: occurrenceId(series.id, key),
    seriesId: series.id,
    occurrenceKey: key,
    startTime: start,
    dueDate: due,
    done: status === 'Done',
    status: status ?? 'Pending',
    completedAt: status === 'Done' ? exception?.completedAt ?? null : null,
    cancelledAt: status === 'Cancelled' ? exception?.cancelledAt ?? null : null,
    actualMinutes: exception?.actualMinutes ?? null,
    // As generated — a "this task" time change is a move (Insights counts
    // a later one as a reschedule).
    originalStartTime: hasStart ? Timestamp.fromDate(generated) : null,
    originalDueDate: series.dueDate
      ? Timestamp.fromDate(new Date(generated.getTime() + (hasStart ? duration : 0)))
      : null,
    // A pin (priorityDate) belongs to one-off tasks.
    priorityDate: null,
  };
}

function anchorMs(task: TaskItem): number | null {
  const anchor = task.startTime ?? task.dueDate;
  return anchor ? anchor.toMillis() : null;
}

/** A series' occurrences starting within [from, to], deleted ones left out. */
export function occurrencesInRange(series: FirestoreTask, from: Date, to: Date): TaskItem[] {
  const rule = seriesRule(series);
  const start = seriesStart(series);
  if (!rule || !start) return [];
  const exceptions = series.exceptions ?? {};
  const generated = expandRule(rule, start, addDays(to, MOVE_PADDING_DAYS), addDays(from, -MOVE_PADDING_DAYS));
  const out: TaskItem[] = [];
  for (const date of generated) {
    const exception = exceptions[dateKey(date)];
    if (exception?.deleted) continue;
    const occurrence = buildOccurrence(series, date, exception);
    const at = anchorMs(occurrence);
    if (at !== null && at >= from.getTime() && at <= to.getTime()) out.push(occurrence);
  }
  return out;
}

/** One date of a series by its key — null if the rule doesn't generate it
 * or it was deleted. */
export function occurrenceFor(series: FirestoreTask, key: string): TaskItem | null {
  const rule = seriesRule(series);
  const start = seriesStart(series);
  if (!rule || !start) return null;
  const day = keyToDate(key);
  const generated = expandRule(rule, start, addDays(day, 1), day).find((d) => dateKey(d) === key);
  if (!generated || series.exceptions?.[key]?.deleted) return null;
  return buildOccurrence(series, generated, series.exceptions?.[key]);
}

/** Every task in the range: one-off tasks untouched (callers still filter
 * them by date), series swapped for their occurrences in [from, to]. */
export function expandTasks(tasks: FirestoreTask[], from: Date, to: Date): TaskItem[] {
  return tasks.flatMap((task) => (isRecurring(task) ? occurrencesInRange(task, from, to) : [task]));
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * For undated lists: one-off tasks untouched; each series as today's
 * occurrences (any status — a ticked one stays listed, like one-off tasks
 * do) plus pending ones from the last OVERDUE_DAYS, and — with
 * includeUpcoming — its next date when nothing is due today.
 */
export function actionableTasks(
  tasks: FirestoreTask[],
  now = new Date(),
  { includeUpcoming = false }: { includeUpcoming?: boolean } = {}
): TaskItem[] {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const out: TaskItem[] = [];
  for (const task of tasks) {
    if (!isRecurring(task)) {
      out.push(task);
      continue;
    }
    const recent = occurrencesInRange(task, addDays(todayStart, -OVERDUE_DAYS), todayEnd).filter((o) => {
      const at = anchorMs(o) ?? 0;
      return at >= todayStart.getTime() || (!o.done && o.status !== 'Cancelled');
    });
    out.push(...recent);
    const hasToday = recent.some((o) => (anchorMs(o) ?? 0) >= todayStart.getTime());
    if (includeUpcoming && !hasToday) {
      const next = occurrencesInRange(task, new Date(todayEnd.getTime() + 1), addDays(todayEnd, 400)).find(
        (o) => !o.done && o.status !== 'Cancelled'
      );
      if (next) out.push(next);
    }
  }
  return out;
}

export interface SeriesProgress {
  done: number;
  /** COUNT when the series has one, else its dates up to today. */
  total: number;
  /** No pending dates left, and none to come. */
  finished: boolean;
}

/** "7 of 10 done" — deleted dates don't count, cancelled ones neither. */
export function seriesProgress(series: FirestoreTask, now = new Date()): SeriesProgress {
  const rule = seriesRule(series);
  const start = seriesStart(series);
  if (!rule || !start) return { done: 0, total: 0, finished: false };
  const exceptions = series.exceptions ?? {};
  const counted = (d: Date) => {
    const e = exceptions[dateKey(d)];
    return !e?.deleted && e?.status !== 'Cancelled';
  };
  const toDate = expandRule(rule, start, endOfDay(now));
  const done = toDate.filter((d) => exceptions[dateKey(d)]?.status === 'Done').length;
  const pendingSoFar = toDate.some((d) => counted(d) && exceptions[dateKey(d)]?.status !== 'Done');
  // An endless rule always has more dates; an ending one is bounded, so
  // walking it to the end is cheap.
  const ends = Boolean(rule.count || rule.until);
  const allDates = ends ? expandRule(rule, start, addDays(start, 36600)) : null;
  const upcoming = allDates ? allDates.some((d) => d.getTime() > endOfDay(now).getTime()) : true;
  const total = rule.count && allDates ? allDates.filter(counted).length : toDate.filter(counted).length;
  return { done, total, finished: !pendingSoFar && !upcoming };
}

/** "Repeats weekly on Tuesday, 7 of 10 done" */
export function describeSeries(series: FirestoreTask, now = new Date()): string | null {
  const rule = seriesRule(series);
  const start = seriesStart(series);
  if (!rule || !start) return null;
  const text = describeRule(rule, start);
  const { done, total } = seriesProgress(series, now);
  return `Repeats ${text.charAt(0).toLowerCase()}${text.slice(1)} · ${done} of ${total} done`;
}

/** For counts that see a task as one unit (a project's completion bar,
 * section stats): each series once, done when it has nothing left. */
export function summarizeSeries(tasks: FirestoreTask[], now = new Date()): FirestoreTask[] {
  return tasks.map((task) => {
    if (!isRecurring(task)) return task;
    const finished = seriesProgress(task, now).finished;
    return { ...task, done: finished, status: finished ? 'Done' : 'Pending' };
  });
}

/** Exceptions moved along with a series shifted by `days` (an "all tasks"
 * edit that changes the date) — only per-date status and deletions carry
 * over; one-date field edits are dropped with the old schedule. */
export function carryExceptions(
  exceptions: Record<string, TaskException> | undefined,
  days: number,
  keep: (key: string) => boolean = () => true
): Record<string, TaskException> {
  const out: Record<string, TaskException> = {};
  for (const [key, exception] of Object.entries(exceptions ?? {})) {
    if (!keep(key)) continue;
    const kept: TaskException = {};
    if (exception.deleted) kept.deleted = true;
    if (exception.status) kept.status = exception.status;
    if (exception.status === 'Done' && exception.completedAt) kept.completedAt = exception.completedAt;
    if (Object.keys(kept).length === 0) continue;
    out[days === 0 ? key : dateKey(addDays(keyToDate(key), days))] = kept;
  }
  return out;
}

