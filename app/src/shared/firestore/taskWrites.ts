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

export interface CreateTaskInput {
  title: string;
  emoji: string | null;
  type: TaskType;
  priority: Priority;
  // Fully standalone (both null) or belongs to a project (both set,
  // areaId mirrored from that project's own areaId) — never area-only.
  projectId: string | null;
  areaId: string | null;
  startTime: Date | null;
  dueDate: Date | null;
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
    parentTaskId: null,
    done: false,
    startTime: input.startTime ? Timestamp.fromDate(input.startTime) : null,
    dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : null,
    originalDueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : null,
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
  done: boolean;
  startTime: Date | null;
  dueDate: Date | null;
  notes: string;
}

export async function updateTask(uid: string, taskId: string, input: UpdateTaskInput): Promise<void> {
  const beforeSnap = await getDoc(taskRef(uid, taskId));
  const before = beforeSnap.data();

  const beforeDueMs = before?.dueDate ? before.dueDate.toMillis() : null;
  const newDueMs = input.dueDate ? input.dueDate.getTime() : null;
  const dueDateChanged = newDueMs !== null && newDueMs !== beforeDueMs;

  const update: Record<string, unknown> = {
    title: input.title,
    emoji: input.emoji,
    type: input.type,
    priority: input.priority,
    projectId: input.projectId,
    areaId: input.areaId,
    done: input.done,
    startTime: input.startTime ? Timestamp.fromDate(input.startTime) : null,
    dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : null,
    notes: input.notes,
    updatedAt: serverTimestamp(),
  };
  // originalDueDate is set once, the first time a task ever gets a due
  // date, then left alone — the fixed point rescheduleCount measures
  // against (see types.ts's FirestoreTask header).
  if (!before?.originalDueDate && input.dueDate) {
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

export async function archiveTask(uid: string, taskId: string): Promise<void> {
  await updateDoc(taskRef(uid, taskId), { archived: true, updatedAt: serverTimestamp() });
}
