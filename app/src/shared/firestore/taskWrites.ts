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

import { getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { taskRef } from './refs';
import type { TaskType, Priority } from './types';

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
  // when the project has no bucket, or projectId itself is null).
  bucketId: string | null;
  // Required going forward — every task gets a start and an end time now
  // (the create/edit form and TaskQuickActionsMenu's reschedule both
  // enforce this at the UI layer). Stays optional on FirestoreTask itself
  // (types.ts) since older docs written before this rule existed still
  // need to parse.
  startTime: Date;
  dueDate: Date;
  notes: string;
  createdBy: string;
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
    startTime: Timestamp.fromDate(input.startTime),
    dueDate: Timestamp.fromDate(input.dueDate),
    originalDueDate: Timestamp.fromDate(input.dueDate),
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
  notes: string;
}

export async function updateTask(uid: string, taskId: string, input: UpdateTaskInput): Promise<void> {
  const beforeSnap = await getDoc(taskRef(uid, taskId));
  const before = beforeSnap.data();

  const beforeDueMs = before?.dueDate ? before.dueDate.toMillis() : null;
  const newDueMs = input.dueDate.getTime();
  const dueDateChanged = newDueMs !== beforeDueMs;

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
    notes: input.notes,
    updatedAt: serverTimestamp(),
  };
  // originalDueDate is set once, the first time a task ever gets a due
  // date, then left alone — the fixed point rescheduleCount measures
  // against (see types.ts's FirestoreTask header).
  if (!before?.originalDueDate) {
    update.originalDueDate = Timestamp.fromDate(input.dueDate);
  } else if (dueDateChanged && beforeDueMs !== null) {
    update.rescheduleCount = (before?.rescheduleCount ?? 0) + 1;
  }
  if (input.done && !before?.done) update.completedAt = serverTimestamp();
  else if (!input.done && before?.done) update.completedAt = null;

  await updateDoc(taskRef(uid, taskId), update);
}

/** Quick done/not-done toggle without touching the rest of the task — used by the single radio toggle on Project Detail's task rows. */
export async function updateTaskDone(uid: string, taskId: string, done: boolean): Promise<void> {
  const beforeSnap = await getDoc(taskRef(uid, taskId));
  const wasDone = beforeSnap.exists() ? Boolean(beforeSnap.data().done) : false;
  const update: Record<string, unknown> = { done, updatedAt: serverTimestamp() };
  if (done && !wasDone) update.completedAt = serverTimestamp();
  else if (!done && wasDone) update.completedAt = null;
  await updateDoc(taskRef(uid, taskId), update);
}

/** Quick priority change without touching the rest of the task — the
 * priority section of TaskQuickActionsMenu, available wherever a task is
 * rendered. */
export async function updateTaskPriority(uid: string, taskId: string, priority: Priority): Promise<void> {
  await updateDoc(taskRef(uid, taskId), { priority, updatedAt: serverTimestamp() });
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
  const dueDateChanged = newDueDate !== null && newDueDate.toMillis() !== beforeDueMs;

  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
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
  await updateDoc(taskRef(uid, taskId), { archived: true, updatedAt: serverTimestamp() });
}
