// Time blocking and conflict detection — the one place the scheduling
// rules live (the task form's live availability row, its save button, and
// the time wheels all call checkAvailability).
//
// Rules:
//  - Only timed tasks take part: all-day (date-only) tasks and tasks with
//    no start/end are ignored, as are cancelled tasks. Pending and done
//    tasks count.
//  - Two windows overlap when newStart < existingEnd && newEnd >
//    existingStart — touching edges (10:00 end / 10:00 start) don't.
//  - A blocked task can't overlap anything; a free task can overlap other
//    free tasks but not a blocked one.
//  - A NEW task over one or more free tasks (and no blocked one) is
//    switched to free automatically (forcedMode), whatever was chosen.
//    When editing, the task itself is excluded, and choosing blocked over
//    free tasks is a conflict rather than a silent switch.
// All times are plain local Dates.

import type { TaskStatus, TaskType, TimeMode } from '@/src/shared/firestore/types';

/** A task as the scheduler sees it. */
export interface ScheduledTask {
  id: string;
  title: string;
  start: Date | null;
  end: Date | null;
  mode: TimeMode;
  allDay: boolean;
  status?: TaskStatus;
  /** An occurrence of a recurring series: the series' id. Excluding a
   * series by id excludes every date of it. */
  seriesId?: string;
}

function excluded(task: ScheduledTask, excludeTaskId: string | null) {
  return excludeTaskId !== null && (task.id === excludeTaskId || task.seriesId === excludeTaskId);
}

export type AvailabilityStatus = 'available' | 'shared' | 'conflict';

export interface Slot {
  start: Date;
  end: Date;
}

export interface Availability {
  status: AvailabilityStatus;
  /** Every task whose window overlaps the requested one, earliest first. */
  overlappingTasks: ScheduledTask[];
  /** 'free' when a new task was switched to free because of free overlaps. */
  forcedMode: TimeMode | null;
  /** The mode the task would actually be saved with. */
  effectiveMode: TimeMode;
  /** Up to 3 nearest same-length slots on the same day (conflict only). */
  suggestions: Slot[];
}

/** Meetings and events default to blocked, to-dos (and custom types) to free. */
export function defaultTimeMode(type: TaskType): TimeMode {
  return type === 'Meeting' || type === 'Event' ? 'blocked' : 'free';
}

/** A task's stored mode, or its type's default for one saved before modes existed. */
export function effectiveTimeMode(task: { timeMode?: TimeMode | null; type?: TaskType | null }): TimeMode {
  return task.timeMode ?? defaultTimeMode(task.type ?? 'ToDo');
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

function schedulable(task: ScheduledTask): task is ScheduledTask & { start: Date; end: Date } {
  return !task.allDay && task.status !== 'Cancelled' && task.start !== null && task.end !== null && task.end > task.start;
}

/** Can a window of this mode sit here, ignoring suggestions? */
function evaluate(
  start: Date,
  end: Date,
  mode: TimeMode,
  tasks: ScheduledTask[],
  excludeTaskId: string | null
): Omit<Availability, 'suggestions'> {
  const overlapping = tasks
    .filter((t) => !excluded(t, excludeTaskId) && schedulable(t) && overlaps(start, end, t.start!, t.end!))
    .sort((a, b) => a.start!.getTime() - b.start!.getTime());
  const hitsBlocked = overlapping.some((t) => t.mode === 'blocked');
  const hitsFree = overlapping.some((t) => t.mode === 'free');
  const isNew = excludeTaskId === null;

  // Rule 3: a new task over free tasks (only) is made free.
  const forcedMode: TimeMode | null = isNew && hitsFree && !hitsBlocked && mode === 'blocked' ? 'free' : null;
  const effectiveMode = forcedMode ?? mode;

  let status: AvailabilityStatus;
  if (overlapping.length === 0) status = 'available';
  else if (hitsBlocked || effectiveMode === 'blocked') status = 'conflict';
  else status = 'shared';

  return { status, overlappingTasks: overlapping, forcedMode, effectiveMode };
}

const STEP_MINUTES = 15;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;

/**
 * Up to `limit` nearest same-length slots on the same day, within 07:00 to
 * 22:00, that this mode could take without a conflict: forward from the
 * requested start first (the earliest start of each free gap), then
 * backward (the latest start of each gap). Never returns the requested
 * slot itself.
 */
export function suggestSlots(
  start: Date,
  end: Date,
  mode: TimeMode,
  tasks: ScheduledTask[],
  excludeTaskId: string | null,
  limit = 3
): Slot[] {
  const duration = end.getTime() - start.getTime();
  if (duration <= 0) return [];
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const dayStart = new Date(day.getTime() + DAY_START_HOUR * 3600000);
  const dayEnd = new Date(day.getTime() + DAY_END_HOUR * 3600000);
  const step = STEP_MINUTES * 60000;
  const fits = (s: Date) => {
    const e = new Date(s.getTime() + duration);
    return e <= dayEnd && s >= dayStart && evaluate(s, e, mode, tasks, excludeTaskId).status !== 'conflict';
  };
  // Snap the search origin onto the 15-minute grid.
  const origin = Math.ceil(start.getTime() / step) * step;
  const found: Slot[] = [];

  // Each scan keeps only the first fitting start of every free gap it
  // meets (the nearest one to the requested time), so suggestions are
  // genuinely different windows rather than 15-minute nudges.
  const scan = (from: number, to: number, delta: number) => {
    let previousFit = false;
    for (let t = from; delta > 0 ? t <= to : t >= to; t += delta) {
      if (found.length >= limit) return;
      const ok = t !== start.getTime() && fits(new Date(t));
      if (ok && !previousFit) found.push({ start: new Date(t), end: new Date(t + duration) });
      previousFit = ok;
    }
  };
  scan(origin, dayEnd.getTime() - duration, step); // forward first
  scan(origin - step, dayStart.getTime(), -step); // then backward
  return found;
}

export function checkAvailability(
  start: Date,
  end: Date,
  mode: TimeMode,
  excludeTaskId: string | null,
  tasks: ScheduledTask[]
): Availability {
  const result = evaluate(start, end, mode, tasks, excludeTaskId);
  return {
    ...result,
    suggestions: result.status === 'conflict' ? suggestSlots(start, end, result.effectiveMode, tasks, excludeTaskId) : [],
  };
}

/** Is this moment inside a blocked task's window? (For greying out wheel
 * times — a task can still be scheduled there, it'll just show a conflict.) */
export function isInsideBlocked(at: Date, tasks: ScheduledTask[], excludeTaskId: string | null): boolean {
  const t = at.getTime();
  return tasks.some(
    (task) =>
      !excluded(task, excludeTaskId) &&
      task.mode === 'blocked' &&
      schedulable(task) &&
      t >= task.start!.getTime() &&
      t < task.end!.getTime()
  );
}

export interface OccurrenceCheck {
  start: Date;
  end: Date;
  status: AvailabilityStatus;
  /** Conflict: the first blocked (or, for a blocked window, any) task it clashes with. */
  clashWith: ScheduledTask | null;
  /** 'free' when this date would be switched to free (rule 3). */
  forcedMode: TimeMode | null;
}

function dayOf(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * The availability rules for every date of a recurring task at once —
 * tasks are indexed by day first, so a year of dates stays cheap.
 */
export function checkOccurrences(
  windows: { start: Date; end: Date }[],
  mode: TimeMode,
  excludeTaskId: string | null,
  tasks: ScheduledTask[]
): OccurrenceCheck[] {
  const byDay = new Map<string, ScheduledTask[]>();
  for (const task of tasks) {
    if (excluded(task, excludeTaskId) || !schedulable(task)) continue;
    for (const key of new Set([dayOf(task.start!), dayOf(task.end!)])) {
      const list = byDay.get(key) ?? [];
      list.push(task);
      byDay.set(key, list);
    }
  }
  return windows.map(({ start, end }) => {
    const candidates = [...new Set([...(byDay.get(dayOf(start)) ?? []), ...(byDay.get(dayOf(end)) ?? [])])];
    const result = evaluate(start, end, mode, candidates, excludeTaskId);
    const clashWith =
      result.status === 'conflict'
        ? (result.overlappingTasks.find((t) => t.mode === 'blocked') ?? result.overlappingTasks[0] ?? null)
        : null;
    return { start, end, status: result.status, clashWith, forcedMode: result.forcedMode };
  });
}
