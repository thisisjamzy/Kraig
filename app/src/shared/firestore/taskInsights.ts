// Pure, client-side derivations from a live list of a user's non-archived
// tasks — shared by the Focus screen, the Analytics screen, and
// ProjectsBottomNav's notification badge, so the three places that all
// answer "what needs attention" agree with each other by construction
// rather than by convention. No stats doc: same reasoning as src/logic/
// projects/useLogic.ts's header — a household's own tasks are a small
// enough list to recompute live on every read.

import type { FirestoreTask, Priority, TaskStatus } from './types';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';

export interface TaskInsight {
  id: string;
  title: string;
  emoji: string | null;
  dueDate: Date;
  projectId: string | null;
  // true once rescheduleCount > 0 and the live dueDate moved later than
  // originalDueDate — false means it moved earlier ("shortened"). Only
  // meaningful when rescheduled is true.
  rescheduled: boolean;
  extended: boolean;
}

function toInsight(task: FirestoreTask & { id: string }): TaskInsight | null {
  if (!task.dueDate) return null;
  const rescheduled = (task.rescheduleCount ?? 0) > 0;
  const extended = rescheduled && task.originalDueDate ? task.dueDate.toMillis() > task.originalDueDate.toMillis() : false;
  return {
    id: task.id,
    title: task.title,
    emoji: task.emoji ?? null,
    dueDate: task.dueDate.toDate(),
    projectId: task.projectId,
    rescheduled,
    extended,
  };
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function overdueTasks(tasks: (FirestoreTask & { id: string })[]): TaskInsight[] {
  const today = startOfDay(new Date());
  return tasks
    .filter((t) => !t.done && t.dueDate && t.dueDate.toDate() < today)
    .map(toInsight)
    .filter((t): t is TaskInsight => t !== null)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function dueTodayTasks(tasks: (FirestoreTask & { id: string })[]): TaskInsight[] {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tasks
    .filter((t) => !t.done && t.dueDate && t.dueDate.toDate() >= today && t.dueDate.toDate() < tomorrow)
    .map(toInsight)
    .filter((t): t is TaskInsight => t !== null)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function dueSoonTasks(tasks: (FirestoreTask & { id: string })[], days: number): TaskInsight[] {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + days);
  return tasks
    .filter((t) => !t.done && t.dueDate && t.dueDate.toDate() >= tomorrow && t.dueDate.toDate() < horizon)
    .map(toInsight)
    .filter((t): t is TaskInsight => t !== null)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function rescheduledTasks(tasks: (FirestoreTask & { id: string })[]): TaskInsight[] {
  return tasks
    .filter((t) => !t.done && (t.rescheduleCount ?? 0) > 0 && t.dueDate)
    .map(toInsight)
    .filter((t): t is TaskInsight => t !== null)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** Weekly completion counts for the last `weeks` weeks (oldest first), keyed off completedAt. */
export function completedByWeek(tasks: (FirestoreTask & { id: string })[], weeks: number): { label: string; value: number }[] {
  const now = new Date();
  const buckets: { start: Date; end: Date; label: string; value: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    buckets.push({ start, end, label: `${start.getMonth() + 1}/${start.getDate()}`, value: 0 });
  }
  for (const task of tasks) {
    if (!task.completedAt) continue;
    const completed = task.completedAt.toDate();
    const bucket = buckets.find((b) => completed >= b.start && completed <= b.end);
    if (bucket) bucket.value += 1;
  }
  return buckets.map((b) => ({ label: b.label, value: b.value }));
}

/** Among finished (done) tasks, how many hit their original due date vs got rescheduled at least once. */
export function taskOnTimeVsRescheduled(tasks: (FirestoreTask & { id: string })[]): { onTime: number; rescheduled: number } {
  const done = tasks.filter((t) => t.done);
  const rescheduled = done.filter((t) => (t.rescheduleCount ?? 0) > 0).length;
  return { onTime: done.length - rescheduled, rescheduled };
}

export interface FocusTaskItem {
  id: string;
  title: string;
  emoji: string | null;
  startTime: Date | null;
  dueDate: Date | null;
  overdue: boolean;
  status?: TaskStatus;
}

/** Every not-done task (any due date, or none), split into High/Medium/Low priority — the Focus screen's worklist. Each bucket is soonest-due first, undated tasks last. */
export function pendingTasksByPriority(
  tasks: (FirestoreTask & { id: string })[]
): Record<Priority, FocusTaskItem[]> {
  const today = startOfDay(new Date());
  const buckets: Record<Priority, FocusTaskItem[]> = { High: [], Medium: [], Low: [] };
  for (const task of tasks) {
    if (task.done) continue;
    const priority = task.priority ?? DEFAULT_PRIORITY;
    const dueDate = task.dueDate ? task.dueDate.toDate() : null;
    buckets[priority].push({
      id: task.id,
      title: task.title,
      emoji: task.emoji ?? null,
      startTime: task.startTime ? task.startTime.toDate() : null,
      dueDate,
      overdue: Boolean(dueDate) && dueDate! < today,
      status: task.status,
    });
  }
  for (const list of Object.values(buckets)) {
    list.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });
  }
  return buckets;
}

/** Per-day completion rate (% of that day's due tasks marked done) for the last `days` days, oldest first, today last — the Focus screen's success trend line. */
export function dailySuccessTrend(tasks: (FirestoreTask & { id: string })[], days: number): { label: string; value: number }[] {
  const today = startOfDay(new Date());
  const buckets: { date: number; label: string; due: number; done: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ date: d.getTime(), label: d.toLocaleDateString('en-US', { weekday: 'short' }), due: 0, done: 0 });
  }
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const dueDay = startOfDay(task.dueDate.toDate()).getTime();
    const bucket = buckets.find((b) => b.date === dueDay);
    if (!bucket) continue;
    bucket.due += 1;
    if (task.done) bucket.done += 1;
  }
  return buckets.map((b) => ({ label: b.label, value: b.due > 0 ? Math.round((b.done / b.due) * 100) : 0 }));
}
