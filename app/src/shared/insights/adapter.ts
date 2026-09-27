// Maps Firestore tasks and projects into the plain shapes the Insights
// analytics work on (src/viewmodels/insights/types.ts). Recurring series
// become their dates for the window a screen needs.

import type { FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';
import { expandTasks, summarizeSeries, type TaskItem } from '@/src/shared/tasks/recurringTasks';
import { effectiveTimeMode } from '@/src/viewmodels/scheduling';
import { taskQuadrant } from '@/src/viewmodels/eisenhower';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import { addDays, previousRange, startOfDay } from '@/src/viewmodels/insights/dates';
import type { DateRange, InsightProject, InsightTask } from '@/src/viewmodels/insights/types';

/** How far back recurring dates are generated (streaks, velocity). */
const HISTORY_DAYS = 90;
/** Alerts look this far ahead. */
const LOOKAHEAD_DAYS = 8;

export function toInsightTask(t: TaskItem, now: Date): InsightTask {
  const start = t.startTime ? t.startTime.toDate() : null;
  const end = t.dueDate ? t.dueDate.toDate() : null;
  const originalStart = t.originalStartTime ? t.originalStartTime.toDate() : null;
  const originalEnd = t.originalDueDate ? t.originalDueDate.toDate() : null;
  const movedLater =
    (originalStart !== null && start !== null && start > originalStart) ||
    (originalEnd !== null && end !== null && end > originalEnd);
  const status = t.done || t.status === 'Done' ? 'done' : t.status === 'Cancelled' ? 'cancelled' : 'pending';
  return {
    id: t.id,
    seriesId: t.seriesId ?? null,
    title: t.title,
    projectId: t.projectId ?? null,
    status,
    start,
    end,
    allDay: Boolean(t.allDay),
    mode: effectiveTimeMode(t),
    quadrant: taskQuadrant({ quadrant: t.quadrant, priority: t.priority ?? DEFAULT_PRIORITY, dueDate: end, startTime: start }, now),
    createdAt: t.createdAt ? t.createdAt.toDate() : null,
    completedAt: t.completedAt ? t.completedAt.toDate() : null,
    cancelledAt: t.cancelledAt ? t.cancelledAt.toDate() : null,
    rescheduled: (t.seriesId ? false : (t.rescheduleCount ?? 0) > 0) || movedLater,
    actualMinutes: t.actualMinutes ?? null,
  };
}

export function toInsightProject(p: FirestoreProject): InsightProject {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    status: p.status,
    startDate: p.startDate ? p.startDate.toDate() : null,
    deadline: p.endDate ? p.endDate.toDate() : null,
    createdAt: p.createdAt ? p.createdAt.toDate() : null,
    milestones: (p.milestones ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      due: m.dueDate.toDate(),
      taskIds: m.taskIds ?? [],
      status: m.status,
    })),
  };
}

/** Every task (recurring ones as their dates) the range, its previous
 * period, recent history and the alert look-ahead need. */
export function insightTasks(docs: FirestoreTask[], range: DateRange, now: Date): InsightTask[] {
  const prev = previousRange(range);
  const history = addDays(startOfDay(now), -HISTORY_DAYS);
  const from = prev.from < history ? prev.from : history;
  const ahead = addDays(startOfDay(now), LOOKAHEAD_DAYS + 1);
  const to = range.to > ahead ? range.to : ahead;
  return expandTasks(docs, from, to).map((t) => toInsightTask(t, now));
}

/** Tasks per project — a recurring series counted once (done when finished). */
export function tasksByProject(docs: FirestoreTask[], now: Date): Map<string, InsightTask[]> {
  const map = new Map<string, InsightTask[]>();
  for (const t of summarizeSeries(docs, now)) {
    if (!t.projectId) continue;
    map.set(t.projectId, [...(map.get(t.projectId) ?? []), toInsightTask(t, now)]);
  }
  return map;
}
