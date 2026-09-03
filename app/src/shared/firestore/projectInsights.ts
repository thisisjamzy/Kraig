// Pure, client-side derivations from a live list of a user's projects (and,
// for the ones that need it, tasks/areas alongside) — shared by the
// Projects hub's project cards (the At Risk badge) and the Analytics
// screen's charts. Same "small enough to recompute live" stance as
// taskInsights.ts.

import type { FirestoreProject, FirestoreArea, FirestoreTask } from './types';
import { AT_RISK_OVERDUE_THRESHOLD } from '@/src/viewmodels/projects';

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Every non-archived task's overdue count, grouped by projectId — one pass over the tasks list for every project's card. */
export function overdueCountByProject(tasks: (FirestoreTask & { id: string })[]): Map<string, number> {
  const today = startOfDay(new Date());
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.done || !task.projectId || !task.dueDate) continue;
    if (task.dueDate.toDate() >= today) continue;
    counts.set(task.projectId, (counts.get(task.projectId) ?? 0) + 1);
  }
  return counts;
}

export function isAtRisk(overdueCount: number): boolean {
  return overdueCount >= AT_RISK_OVERDUE_THRESHOLD;
}

/** Whether a project's endDate has ever moved, and which direction — same shape as taskInsights.ts's per-task reschedule flag. */
export function projectRescheduleFlag(project: FirestoreProject): { rescheduled: boolean; extended: boolean } {
  const rescheduled = (project.rescheduleCount ?? 0) > 0;
  const extended =
    rescheduled && project.originalEndDate && project.endDate
      ? project.endDate.toMillis() > project.originalEndDate.toMillis()
      : false;
  return { rescheduled, extended };
}

export interface AreaBucket {
  areaId: string | null;
  areaName: string;
  count: number;
}

function bucketByArea<T>(
  items: T[],
  getAreaId: (item: T) => string | null,
  areas: (FirestoreArea & { id: string })[]
): AreaBucket[] {
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const counts = new Map<string, number>();
  for (const item of items) {
    const areaId = getAreaId(item) ?? '__none__';
    counts.set(areaId, (counts.get(areaId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([areaId, count]) => ({
      areaId: areaId === '__none__' ? null : areaId,
      areaName: areaId === '__none__' ? 'No area' : areaName.get(areaId) ?? 'Unknown area',
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Active (non-archived) projects grouped by area — the Analytics screen's "ongoing projects per area" chart. */
export function ongoingProjectsPerArea(
  projects: (FirestoreProject & { id: string })[],
  areas: (FirestoreArea & { id: string })[]
): AreaBucket[] {
  const active = projects.filter((p) => p.status === 'Active');
  return bucketByArea(active, (p) => p.areaId, areas);
}

/** Projects with at least one reschedule, grouped by area — the Analytics screen's rescheduled-by-area pie. */
export function rescheduledProjectsPerArea(
  projects: (FirestoreProject & { id: string })[],
  areas: (FirestoreArea & { id: string })[]
): AreaBucket[] {
  const rescheduled = projects.filter((p) => (p.rescheduleCount ?? 0) > 0 && p.status !== 'Archived');
  return bucketByArea(rescheduled, (p) => p.areaId, areas);
}

/** Among Completed projects, how many hit their original end date vs got rescheduled at least once. */
export function projectOnTimeVsRescheduled(projects: (FirestoreProject & { id: string })[]): {
  onTime: number;
  rescheduled: number;
} {
  const completed = projects.filter((p) => p.status === 'Completed');
  const rescheduled = completed.filter((p) => (p.rescheduleCount ?? 0) > 0).length;
  return { onTime: completed.length - rescheduled, rescheduled };
}

/** Task completion percentage per area — one bar per area on the Analytics screen. */
export function taskCompletionPerArea(
  tasks: (FirestoreTask & { id: string })[],
  projects: (FirestoreProject & { id: string })[],
  areas: (FirestoreArea & { id: string })[]
): { areaName: string; percent: number }[] {
  const projectAreaId = new Map(projects.map((p) => [p.id, p.areaId]));
  const perArea = new Map<string, { total: number; done: number }>();
  for (const task of tasks) {
    const areaId = task.areaId ?? (task.projectId ? projectAreaId.get(task.projectId) : null) ?? '__none__';
    const bucket = perArea.get(areaId) ?? { total: 0, done: 0 };
    bucket.total += 1;
    if (task.done) bucket.done += 1;
    perArea.set(areaId, bucket);
  }
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  return Array.from(perArea.entries())
    .filter(([, bucket]) => bucket.total > 0)
    .map(([areaId, bucket]) => ({
      areaName: areaId === '__none__' ? 'No area' : areaName.get(areaId) ?? 'Unknown area',
      percent: Math.round((bucket.done / bucket.total) * 100),
    }))
    .sort((a, b) => b.percent - a.percent);
}
