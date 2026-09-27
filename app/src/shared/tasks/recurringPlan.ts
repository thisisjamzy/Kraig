// Recurring tasks — what saving or deleting one date of a series writes,
// for each of the three scopes the form asks about (as in Google Calendar):
//   - 'this': only this date, stored as an exception on the series;
//   - 'following': the series ends the day before this date, and a new
//     series starts on it with the changes;
//   - 'all': the whole series changes, keeping each date's done/cancelled
//     status (moved along if the dates shift).
// planEdit/planDelete are pure (they return the writes); recurringWrites.ts
// performs them — so the rules are testable without Firestore.

import { Timestamp } from 'firebase/firestore';
import type { FirestoreTask, Priority, Quadrant, TaskException, TaskType, TimeMode } from '@/src/shared/firestore/types';
import {
  addDays,
  dateKey,
  dayDiff,
  formatRRule,
  keyToDate,
  normalizeRRule,
  parseRRule,
  splitRule,
} from '../../viewmodels/recurrence';
import { carryExceptions, seriesStart } from './recurringTasks';
import type { UpdateTaskInput } from '@/src/shared/firestore/taskWrites';

export type EditScope = 'this' | 'following' | 'all';

/** Everything the task form saves. */
export interface TaskForm {
  title: string;
  emoji: string | null;
  type: TaskType;
  priority: Priority;
  projectId: string | null;
  areaId: string | null;
  bucketId: string | null;
  startTime: Date;
  dueDate: Date;
  allDay: boolean;
  quadrant: Quadrant | null;
  timeMode?: TimeMode;
  notes: string;
  done: boolean;
  /** null = does not repeat. */
  rrule: string | null;
}

export type SeriesWrite =
  | { kind: 'exception'; seriesId: string; key: string; exception: TaskException }
  | { kind: 'update'; taskId: string; input: UpdateTaskInput }
  | { kind: 'create'; form: TaskForm; exceptions: Record<string, TaskException> }
  | { kind: 'endSeries'; taskId: string; rrule: string; exceptions: Record<string, TaskException> }
  | { kind: 'archive'; taskId: string };

/** The start the rule gave this date (before any "this task" move). */
function generatedStart(series: FirestoreTask, key: string): Date {
  const start = seriesStart(series)!;
  const day = keyToDate(key);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.getHours(), start.getMinutes());
}

function seriesDuration(series: FirestoreTask): number {
  return series.startTime && series.dueDate ? series.dueDate.toMillis() - series.startTime.toMillis() : 0;
}

function withStatus(exception: TaskException, done: boolean): TaskException {
  const next = { ...exception };
  if (done) {
    next.status = 'Done';
    next.completedAt = exception.status === 'Done' ? (exception.completedAt ?? Timestamp.now()) : Timestamp.now();
  } else if (next.status === 'Done') {
    delete next.status;
    delete next.completedAt;
  }
  return next;
}

function updateInput(form: TaskForm, start: Date, due: Date): UpdateTaskInput {
  return {
    title: form.title,
    emoji: form.emoji,
    type: form.type,
    priority: form.priority,
    projectId: form.projectId,
    areaId: form.areaId,
    bucketId: form.bucketId,
    done: false,
    startTime: start,
    dueDate: due,
    allDay: form.allDay,
    quadrant: form.quadrant,
    timeMode: form.timeMode,
    notes: form.notes,
  };
}

/**
 * The writes for saving one date of a series. `extra` are exceptions for
 * the resulting series' dates (conflicting dates skipped, shared dates
 * made free), keyed by the new schedule's dates.
 */
export function planEdit(
  series: FirestoreTask,
  key: string,
  scope: EditScope,
  form: TaskForm,
  extra: Record<string, TaskException> = {}
): SeriesWrite[] {
  const rule = series.rrule ? parseRRule(series.rrule) : null;
  const start = seriesStart(series);
  if (!rule || !start) return [];
  const existing = series.exceptions?.[key] ?? {};

  if (scope === 'this') {
    // Only what differs from the series is stored, so a later "all tasks"
    // edit still reaches the fields this date didn't change.
    const generated = generatedStart(series, key);
    const exception: TaskException = {};
    if (existing.deleted) exception.deleted = true;
    if (existing.status) exception.status = existing.status;
    if (existing.completedAt) exception.completedAt = existing.completedAt;
    if (form.title !== series.title) exception.title = form.title;
    if (form.notes !== (series.notes ?? '')) exception.notes = form.notes;
    if (form.type !== series.type) exception.type = form.type;
    if (form.priority !== series.priority) exception.priority = form.priority;
    if ((form.quadrant ?? null) !== (series.quadrant ?? null)) exception.quadrant = form.quadrant;
    if (form.timeMode && form.timeMode !== series.timeMode) exception.timeMode = form.timeMode;
    if (form.allDay !== Boolean(series.allDay)) exception.allDay = form.allDay;
    if (form.startTime.getTime() !== generated.getTime()) exception.startTime = Timestamp.fromDate(form.startTime);
    if (form.dueDate.getTime() !== generated.getTime() + seriesDuration(series)) {
      exception.dueDate = Timestamp.fromDate(form.dueDate);
    }
    return [{ kind: 'exception', seriesId: series.id, key, exception: withStatus(exception, form.done) }];
  }

  // Days the edited date moved by — the whole (rest of the) series moves
  // with it, keeping per-date statuses on their dates.
  const shift = dayDiff(keyToDate(key), form.startTime);
  const length = form.dueDate.getTime() - form.startTime.getTime();
  const at = (day: Date) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), form.startTime.getHours(), form.startTime.getMinutes());
  const newKey = dateKey(form.startTime);

  if (scope === 'following') {
    const split = splitRule(rule, start, key);
    if (split.before) {
      const earlier: Record<string, TaskException> = {};
      for (const [k, e] of Object.entries(series.exceptions ?? {})) if (k < key) earlier[k] = e;
      const writes: SeriesWrite[] = [
        { kind: 'endSeries', taskId: series.id, rrule: formatRRule(split.before), exceptions: earlier },
      ];
      if (!form.rrule) {
        writes.push({ kind: 'create', form: { ...form, rrule: null }, exceptions: {} });
        return writes;
      }
      // Same rule → the new series carries on the old one (sharing out an
      // "after N" end); a new rule is used as chosen.
      const sameRule = normalizeRRule(form.rrule) === normalizeRRule(series.rrule);
      const nextRule = sameRule ? formatRRule(split.after) : normalizeRRule(form.rrule)!;
      const exceptions = {
        ...carryExceptions(series.exceptions, shift, (k) => k >= key),
        ...extra,
      };
      exceptions[newKey] = withStatus(exceptions[newKey] ?? {}, form.done);
      if (Object.keys(exceptions[newKey]).length === 0) delete exceptions[newKey];
      writes.push({ kind: 'create', form: { ...form, done: false, rrule: nextRule }, exceptions });
      return writes;
    }
    // Cut at the very first date: that's the whole series.
  }

  // 'all'
  if (!form.rrule) {
    // No longer repeats: the task becomes this one date.
    return [
      {
        kind: 'update',
        taskId: series.id,
        input: { ...updateInput(form, form.startTime, form.dueDate), done: form.done, rrule: null },
      },
    ];
  }
  const newStart = at(addDays(start, shift));
  const exceptions = { ...carryExceptions(series.exceptions, shift), ...extra };
  exceptions[newKey] = withStatus(exceptions[newKey] ?? {}, form.done);
  if (Object.keys(exceptions[newKey]).length === 0) delete exceptions[newKey];
  return [
    {
      kind: 'update',
      taskId: series.id,
      input: {
        ...updateInput(form, newStart, new Date(newStart.getTime() + length)),
        rrule: normalizeRRule(form.rrule),
        exceptions,
      },
    },
  ];
}

/** The writes for deleting one date of a series. */
export function planDelete(series: FirestoreTask, key: string, scope: EditScope): SeriesWrite[] {
  if (scope === 'this') {
    return [{ kind: 'exception', seriesId: series.id, key, exception: { ...(series.exceptions?.[key] ?? {}), deleted: true } }];
  }
  if (scope === 'following') {
    const rule = series.rrule ? parseRRule(series.rrule) : null;
    const start = seriesStart(series);
    const split = rule && start ? splitRule(rule, start, key) : null;
    if (split?.before) {
      const earlier: Record<string, TaskException> = {};
      for (const [k, e] of Object.entries(series.exceptions ?? {})) if (k < key) earlier[k] = e;
      return [{ kind: 'endSeries', taskId: series.id, rrule: formatRRule(split.before), exceptions: earlier }];
    }
  }
  return [{ kind: 'archive', taskId: series.id }];
}
