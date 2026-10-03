'use client';

// Plain direct writes for a task — no runTransaction()/stats-increment
// dance the way the ledger's aggregation.ts needs, because area/project/
// task counts are all computed live from the loaded lists (see src/logic/
// projects/useLogic.ts's header for why that's a reasonable simplification
// here) rather than introducing statsProjectsHome/statsPerProject yet.
// Shared by every screen that creates or edits a task (project detail, the
// standalone /tasks/new and /tasks/[id]/edit pages, Focus, Calendar,
// Analytics) — one place that gets the completedAt/rescheduleCount/
// originalDueDate bookkeeping right, rather than every call site
// re-deriving it.

import { arrayUnion, deleteField, FieldPath, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { taskRef } from './refs';
import type { TaskException, TaskType, Priority, TaskStatus, Quadrant, TimeMode, TaskSubtask } from './types';
import { parseOccurrenceId } from '@/src/shared/tasks/recurringTasks';
import { isPushableNow, touchesGoogleCopy } from '@/src/shared/calendarSync/pending';

// Google Calendar sync (src/shared/calendarSync): a write that creates a
// pushable task, or changes its time, title or mode, also sets
// googleSync.state to 'pending' — in the same write, so the task shows
// "syncing" until the next push lands. Deleting just deletes (archives);
// the next full push removes it from Google.
const PENDING = 'pending' as const;

// Recurring tasks: every quick write below also accepts an occurrence id
// ("seriesId@YYYY-MM-DD", src/shared/tasks/recurringTasks.ts) and then
// changes only that date — written onto the series doc's exceptions map,
// never onto the series itself.

// Tasks are day-bound — a single date, plus a start and an end time of day
// on that same date (never spanning midnight into a second day) — so the
// create/edit form and the quick-reschedule popover both read/write a plain
// "YYYY-MM-DD" date and two "HH:mm" times rather than two independent
// <input type="datetime-local">s that could drift onto different days.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "YYYY-MM-DD", the value <input type="date"> reads and writes — local
 * time, no timezone suffix. */
export function toDateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "HH:mm", the value <input type="time"> reads and writes. */
export function toTimeOnly(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Combines a "YYYY-MM-DD" date with an "HH:mm" time-of-day into one Date —
 * the inverse of toDateOnly()/toTimeOnly() together. */
export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

/** One entry for FirestoreTask.statusLog (Insights rebuilds trends from it). */
function logEntry(status: TaskStatus, key?: string) {
  return arrayUnion({ at: Timestamp.now(), status, ...(key ? { key } : {}) });
}

/** Sets (or, with deleteField(), clears) fields of one date's exception on
 * a series — a nested write, so the rest of the exceptions map stays. */
export async function writeOccurrence(
  uid: string,
  seriesId: string,
  key: string,
  fields: Record<string, unknown>,
  seriesFields: Record<string, unknown> = {}
): Promise<void> {
  const pairs: unknown[] = [];
  for (const [field, value] of Object.entries(fields)) pairs.push(new FieldPath('exceptions', key, field), value);
  for (const [field, value] of Object.entries(seriesFields)) pairs.push(field, value);
  pairs.push('updatedAt', serverTimestamp());
  const [first, firstValue, ...rest] = pairs;
  await updateDoc(taskRef(uid, seriesId), first as FieldPath, firstValue, ...rest);
}

/** Replaces one date's exception wholesale ("this task" edits). */
export async function replaceOccurrence(uid: string, seriesId: string, key: string, exception: TaskException): Promise<void> {
  const series = (await getDoc(taskRef(uid, seriesId)).catch(() => null))?.data();
  const pending = series && isPushableNow({ ...series, ...exception, rrule: null }) ? ['googleSync.state', PENDING] : [];
  await updateDoc(taskRef(uid, seriesId), new FieldPath('exceptions', key), exception, 'updatedAt', serverTimestamp(), ...pending);
}

export interface CreateTaskInput {
  title: string;
  emoji: string | null;
  type: TaskType;
  priority: Priority;
  // Fully standalone (both null) or belongs to a project (both set,
  // areaId mirrored from that project's own areaId) — never area-only.
  projectId: string | null;
  areaId: string | null;
  // Same mirroring convention as areaId — the project's own bucketId (null
  // when the project has no section, or projectId itself is null).
  bucketId: string | null;
  // Required going forward — every task gets a start and an end time now
  // (the create/edit form and TaskQuickActionsMenu's reschedule both
  // enforce this at the UI layer). Stays optional on FirestoreTask itself
  // (types.ts) since older docs written before this rule existed still
  // need to parse.
  startTime: Date;
  dueDate: Date;
  // See FirestoreTask.allDay — the caller passes the day's 00:00/23:59 as
  // startTime/dueDate when this is true.
  allDay?: boolean;
  // A quadrant picked on the form (FirestoreTask.quadrant); null = derive.
  quadrant?: Quadrant | null;
  // See FirestoreTask.timeMode.
  timeMode?: TimeMode;
  notes: string;
  createdBy: string;
  // Recurring series (FirestoreTask.rrule / exceptions); absent = one-off.
  rrule?: string | null;
  exceptions?: Record<string, TaskException>;
}

export async function createTask(uid: string, input: CreateTaskInput): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(taskRef(uid, id), {
    title: input.title,
    emoji: input.emoji,
    type: input.type,
    priority: input.priority,
    projectId: input.projectId,
    areaId: input.areaId,
    bucketId: input.bucketId,
    parentTaskId: null,
    done: false,
    status: 'Pending',
    startTime: Timestamp.fromDate(input.startTime),
    dueDate: Timestamp.fromDate(input.dueDate),
    allDay: input.allDay ?? false,
    quadrant: input.quadrant ?? null,
    ...(input.timeMode ? { timeMode: input.timeMode } : {}),
    ...(input.rrule ? { rrule: input.rrule, exceptions: input.exceptions ?? {} } : {}),
    ...(isPushableNow({
      startTime: Timestamp.fromDate(input.startTime),
      dueDate: Timestamp.fromDate(input.dueDate),
      allDay: input.allDay ?? false,
      timeMode: input.timeMode,
      type: input.type,
    })
      ? { googleSync: { state: PENDING } }
      : {}),
    originalDueDate: Timestamp.fromDate(input.dueDate),
    originalStartTime: Timestamp.fromDate(input.startTime),
    rescheduleCount: 0,
    completedAt: null,
    calendarEventId: null,
    dependsOnTaskId: null,
    estimatedCost: null,
    linkedTransactionId: null,
    notes: input.notes,
    tags: [],
    archived: false,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export interface UpdateTaskInput {
  title: string;
  emoji: string | null;
  type: TaskType;
  priority: Priority;
  projectId: string | null;
  areaId: string | null;
  bucketId: string | null;
  done: boolean;
  startTime: Date;
  dueDate: Date;
  allDay?: boolean;
  quadrant?: Quadrant | null;
  timeMode?: TimeMode;
  notes: string;
  // undefined = leave as is; null = no longer recurring.
  rrule?: string | null;
  exceptions?: Record<string, TaskException>;
}

export async function updateTask(uid: string, taskId: string, input: UpdateTaskInput): Promise<void> {
  const beforeSnap = await getDoc(taskRef(uid, taskId));
  const before = beforeSnap.data();

  const beforeDueMs = before?.dueDate ? before.dueDate.toMillis() : null;
  const beforeStartMs = before?.startTime ? before.startTime.toMillis() : null;
  const newDueMs = input.dueDate.getTime();
  // Insights counts a reschedule only when the date or time moves later.
  const movedLater =
    (beforeDueMs !== null && newDueMs > beforeDueMs) ||
    (beforeStartMs !== null && input.startTime.getTime() > beforeStartMs);

  const update: Record<string, unknown> = {
    title: input.title,
    emoji: input.emoji,
    type: input.type,
    priority: input.priority,
    projectId: input.projectId,
    areaId: input.areaId,
    bucketId: input.bucketId,
    done: input.done,
    startTime: Timestamp.fromDate(input.startTime),
    dueDate: Timestamp.fromDate(input.dueDate),
    allDay: input.allDay ?? false,
    quadrant: input.quadrant ?? null,
    ...(input.timeMode ? { timeMode: input.timeMode } : {}),
    notes: input.notes,
    updatedAt: serverTimestamp(),
  };
  if (input.rrule !== undefined) {
    update.rrule = input.rrule ?? deleteField();
    if (!input.rrule) update.exceptions = deleteField();
  }
  if (input.exceptions !== undefined && input.rrule !== null) update.exceptions = input.exceptions;
  // originalDueDate is set once, the first time a task ever gets a due
  // date, then left alone — the fixed point rescheduleCount measures
  // against (see types.ts's FirestoreTask header).
  if (!before?.originalDueDate) {
    update.originalDueDate = Timestamp.fromDate(input.dueDate);
  } else if (movedLater) {
    update.rescheduleCount = (before?.rescheduleCount ?? 0) + 1;
  }
  if (!before?.originalStartTime) {
    update.originalStartTime = before?.startTime ?? Timestamp.fromDate(input.startTime);
  }
  const after = {
    title: input.title,
    startTime: update.startTime as Timestamp,
    dueDate: update.dueDate as Timestamp,
    allDay: input.allDay ?? false,
    timeMode: input.timeMode ?? before?.timeMode,
    type: input.type,
    rrule: input.rrule === undefined ? before?.rrule : input.rrule,
  };
  if (isPushableNow(after) && (touchesGoogleCopy(before, after) || !before?.googleSync)) update['googleSync.state'] = PENDING;
  if (input.done !== Boolean(before?.done)) update.statusLog = logEntry(input.done ? 'Done' : 'Pending');
  if (input.done && !before?.done) update.completedAt = serverTimestamp();
  else if (!input.done && before?.done) update.completedAt = null;
  // Keep status in sync with the done checkbox here too, same rule as
  // updateTaskDone below — otherwise saving the full edit form with the
  // checkbox unticked could leave a stale status: 'Done' behind.
  if (input.done && !before?.done) update.status = 'Done';
  else if (!input.done && before?.done) update.status = 'Pending';

  await updateDoc(taskRef(uid, taskId), update);
}

/** Quick done/not-done toggle without touching the rest of the task — used
 * by the single radio toggle on Project Detail's task rows, and
 * TaskQuickActionsMenu's own checkbox. Ticking it always resolves status to
 * 'Done'; unticking it resets status to 'Pending' — the checkbox is a
 * binary shortcut, not aware of the in-between statuses (Stuck, In Review)
 * that only the status picker (updateTaskStatus below) sets. */
export async function updateTaskDone(uid: string, taskId: string, done: boolean): Promise<void> {
  const occurrence = parseOccurrenceId(taskId);
  if (occurrence) {
    await writeOccurrence(
      uid,
      occurrence.seriesId,
      occurrence.key,
      {
        status: done ? 'Done' : deleteField(),
        completedAt: done ? serverTimestamp() : deleteField(),
        cancelledAt: deleteField(),
      },
      { statusLog: logEntry(done ? 'Done' : 'Pending', occurrence.key) }
    );
    return;
  }
  const beforeSnap = await getDoc(taskRef(uid, taskId));
  const wasDone = beforeSnap.exists() ? Boolean(beforeSnap.data().done) : false;
  const update: Record<string, unknown> = {
    done,
    status: done ? 'Done' : 'Pending',
    cancelledAt: null,
    statusLog: logEntry(done ? 'Done' : 'Pending'),
    updatedAt: serverTimestamp(),
  };
  if (done && !wasDone) update.completedAt = serverTimestamp();
  else if (!done && wasDone) update.completedAt = null;
  await updateDoc(taskRef(uid, taskId), update);
}

/** Sets status directly (TaskQuickActionsMenu's status picker) — kept in
 * sync with `done` the other way round from updateTaskDone: status
 * 'Done' means done:true, any other status means done:false. */
export async function updateTaskStatus(uid: string, taskId: string, status: TaskStatus): Promise<void> {
  const occurrence = parseOccurrenceId(taskId);
  if (occurrence) {
    // A date is pending, done or cancelled — nothing in between.
    const kept = status === 'Done' || status === 'Cancelled';
    await writeOccurrence(
      uid,
      occurrence.seriesId,
      occurrence.key,
      {
        status: kept ? status : deleteField(),
        completedAt: status === 'Done' ? serverTimestamp() : deleteField(),
        cancelledAt: status === 'Cancelled' ? serverTimestamp() : deleteField(),
      },
      { statusLog: logEntry(status, occurrence.key) }
    );
    return;
  }
  const beforeSnap = await getDoc(taskRef(uid, taskId));
  const wasDone = beforeSnap.exists() ? Boolean(beforeSnap.data().done) : false;
  const done = status === 'Done';
  const update: Record<string, unknown> = {
    status,
    done,
    cancelledAt: status === 'Cancelled' ? serverTimestamp() : null,
    statusLog: logEntry(status),
    updatedAt: serverTimestamp(),
  };
  if (done && !wasDone) update.completedAt = serverTimestamp();
  else if (!done && wasDone) update.completedAt = null;
  await updateDoc(taskRef(uid, taskId), update);
}

/** The Focus board's drag between columns: the task's quadrant, and its
 * priority kept in line with that quadrant's importance
 * (eisenhower.ts's priorityForQuadrant), in one write. */
export async function updateTaskQuadrant(uid: string, taskId: string, quadrant: Quadrant, priority: Priority): Promise<void> {
  const occurrence = parseOccurrenceId(taskId);
  if (occurrence) {
    await writeOccurrence(uid, occurrence.seriesId, occurrence.key, { quadrant, priority });
    return;
  }
  await updateDoc(taskRef(uid, taskId), { quadrant, priority, updatedAt: serverTimestamp() });
}

/** Quick priority change without touching the rest of the task — the
 * priority section of TaskQuickActionsMenu, available wherever a task is
 * rendered. */
export async function updateTaskPriority(uid: string, taskId: string, priority: Priority): Promise<void> {
  const occurrence = parseOccurrenceId(taskId);
  if (occurrence) {
    await writeOccurrence(uid, occurrence.seriesId, occurrence.key, { priority });
    return;
  }
  await updateDoc(taskRef(uid, taskId), { priority, updatedAt: serverTimestamp() });
}

/** Marks/unmarks a task as one of today's top priorities (the Time hub's
 * own "Today's priorities" picker) — sets priorityDate to today's own
 * toDateOnly() when marking, null when unmarking. A no-op collection to
 * write into per day (no separate "priorities/{date}" doc), so toggling is
 * just this one field on the task itself. */
export async function updateTaskTodayPriority(uid: string, taskId: string, isPriority: boolean): Promise<void> {
  // A series' dates already show on their own days — no pinning.
  if (parseOccurrenceId(taskId)) return;
  await updateDoc(taskRef(uid, taskId), {
    priorityDate: isPriority ? toDateOnly(new Date()) : null,
    updatedAt: serverTimestamp(),
  });
}

/** Quick reschedule — moves a task to a different date while keeping both
 * its start and end times of day (and so its duration) exactly as they
 * were, staying day-bound by construction. Same originalDueDate/
 * rescheduleCount bookkeeping as updateTask()'s own due-date branch (see
 * types.ts's FirestoreTask header), factored out so a context menu can
 * reschedule a task without needing the rest of its fields on hand. A
 * legacy task missing a start and/or due date (written before both were
 * required) only has whichever one it already has moved — reschedule isn't
 * the place to invent a missing time of day, the full edit form is. */
export async function rescheduleTask(uid: string, taskId: string, dateStr: string): Promise<void> {
  const occurrence = parseOccurrenceId(taskId);
  if (occurrence) {
    // Moves this one date: same times of day, on the new day.
    const snap = await getDoc(taskRef(uid, occurrence.seriesId));
    const series = snap.data();
    const exception = series?.exceptions?.[occurrence.key] ?? {};
    const moved = (ts: Timestamp | null | undefined) => {
      if (!ts) return undefined;
      const d = ts.toDate();
      return Timestamp.fromDate(combineDateAndTime(dateStr, `${pad(d.getHours())}:${pad(d.getMinutes())}`));
    };
    const fields: Record<string, unknown> = {};
    const start = moved(exception.startTime ?? series?.startTime);
    const due = moved(exception.dueDate ?? series?.dueDate);
    if (start) fields.startTime = start;
    if (due) fields.dueDate = due;
    const pending = series && isPushableNow({ ...series, ...exception, rrule: null }) ? { 'googleSync.state': PENDING } : {};
    if (Object.keys(fields).length) await writeOccurrence(uid, occurrence.seriesId, occurrence.key, fields, pending);
    return;
  }
  const beforeSnap = await getDoc(taskRef(uid, taskId));
  const before = beforeSnap.data();

  const onNewDate = (ts: Timestamp | null | undefined): Timestamp | null => {
    if (!ts) return null;
    const d = ts.toDate();
    return Timestamp.fromDate(combineDateAndTime(dateStr, `${pad(d.getHours())}:${pad(d.getMinutes())}`));
  };
  const newStartTime = onNewDate(before?.startTime);
  const newDueDate = onNewDate(before?.dueDate);

  const beforeDueMs = before?.dueDate ? before.dueDate.toMillis() : null;
  // Only a move later counts as a reschedule (Insights).
  const dueDateChanged = newDueDate !== null && beforeDueMs !== null && newDueDate.toMillis() > beforeDueMs;

  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (before && isPushableNow(before)) update['googleSync.state'] = PENDING;
  if (newStartTime) update.startTime = newStartTime;
  if (newDueDate) update.dueDate = newDueDate;
  if (!before?.originalDueDate && newDueDate) {
    update.originalDueDate = newDueDate;
  } else if (dueDateChanged && beforeDueMs !== null) {
    update.rescheduleCount = (before?.rescheduleCount ?? 0) + 1;
  }
  await updateDoc(taskRef(uid, taskId), update);
}

export async function archiveTask(uid: string, taskId: string): Promise<void> {
  // An occurrence id removes just that date from its series.
  const occurrence = parseOccurrenceId(taskId);
  if (occurrence) {
    await writeOccurrence(uid, occurrence.seriesId, occurrence.key, { deleted: true });
    return;
  }
  await updateDoc(taskRef(uid, taskId), { archived: true, updatedAt: serverTimestamp() });
}

/** The optional "how long did it take?" after ticking a task done —
 * minutes, on the task or (for an occurrence id) on that date only. */
export async function setActualMinutes(uid: string, taskId: string, minutes: number): Promise<void> {
  const value = Math.max(1, Math.round(minutes));
  const occurrence = parseOccurrenceId(taskId);
  if (occurrence) {
    await writeOccurrence(uid, occurrence.seriesId, occurrence.key, { actualMinutes: value });
    return;
  }
  await updateDoc(taskRef(uid, taskId), { actualMinutes: value, updatedAt: serverTimestamp() });
}

/** A new time window for a task (dragging or resizing it on a timeline,
 * or dropping it there from a list): start and end, optionally turning a
 * date-only task into a timed one. Same originalDueDate/rescheduleCount
 * bookkeeping and Google push as rescheduleTask. */
export async function updateTaskTimes(uid: string, taskId: string, start: Date, end: Date, allDay = false): Promise<void> {
  const occurrence = parseOccurrenceId(taskId);
  if (occurrence) {
    const snap = await getDoc(taskRef(uid, occurrence.seriesId));
    const series = snap.data();
    const exception = series?.exceptions?.[occurrence.key] ?? {};
    const pending = series && isPushableNow({ ...series, ...exception, rrule: null }) ? { 'googleSync.state': PENDING } : {};
    await writeOccurrence(uid, occurrence.seriesId, occurrence.key, { startTime: Timestamp.fromDate(start), dueDate: Timestamp.fromDate(end), allDay }, pending);
    return;
  }
  const beforeSnap = await getDoc(taskRef(uid, taskId));
  const before = beforeSnap.data();
  const beforeDueMs = before?.dueDate ? before.dueDate.toMillis() : null;
  const update: Record<string, unknown> = {
    startTime: Timestamp.fromDate(start),
    dueDate: Timestamp.fromDate(end),
    allDay,
    updatedAt: serverTimestamp(),
  };
  if (before && isPushableNow({ ...before, allDay })) update['googleSync.state'] = PENDING;
  if (!before?.originalDueDate) update.originalDueDate = Timestamp.fromDate(end);
  else if (beforeDueMs !== null && end.getTime() > beforeDueMs) update.rescheduleCount = (before?.rescheduleCount ?? 0) + 1;
  await updateDoc(taskRef(uid, taskId), update);
}

/** Inline property edits on a task page or a database cell: the fields
 * that need no bookkeeping. A project change brings its area and bucket
 * along (they mirror the project's, see FirestoreTask). */
export interface TaskFieldsPatch {
  title?: string;
  type?: TaskType;
  timeMode?: TimeMode;
  notes?: string;
  project?: { id: string | null; areaId: string | null; bucketId: string | null };
}

export async function updateTaskFields(uid: string, taskId: string, patch: TaskFieldsPatch): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.type !== undefined) fields.type = patch.type;
  if (patch.timeMode !== undefined) fields.timeMode = patch.timeMode;
  if (patch.notes !== undefined) fields.notes = patch.notes;
  if (patch.project) {
    fields.projectId = patch.project.id;
    fields.areaId = patch.project.id ? patch.project.areaId : null;
    fields.bucketId = patch.project.id ? patch.project.bucketId : null;
  }
  const occurrence = parseOccurrenceId(taskId);
  if (occurrence) {
    // A date of a series keeps the series' project; its own type, mode and title can differ.
    const own = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'projectId' && k !== 'areaId' && k !== 'bucketId'));
    if (Object.keys(own).length) await writeOccurrence(uid, occurrence.seriesId, occurrence.key, own);
    return;
  }
  const beforeSnap = await getDoc(taskRef(uid, taskId));
  const before = beforeSnap.data();
  const update: Record<string, unknown> = { ...fields, updatedAt: serverTimestamp() };
  if (before && (fields.title !== undefined || fields.timeMode !== undefined) && isPushableNow({ ...before, ...fields })) update['googleSync.state'] = PENDING;
  await updateDoc(taskRef(uid, taskId), update);
}

/** The task page's checklist. A date of a series keeps the series' list. */
export async function updateTaskSubtasks(uid: string, taskId: string, subtasks: TaskSubtask[]): Promise<void> {
  const occurrence = parseOccurrenceId(taskId);
  await updateDoc(taskRef(uid, occurrence ? occurrence.seriesId : taskId), { subtasks, updatedAt: serverTimestamp() });
}
