'use client';

// The Projects database: every project with its progress, health and
// forecast (Insights' project stats, viewmodels/insights/metrics.ts), its
// area, task counts and last activity. The Projects page, the area pages
// and the sidebar read the same rows.

import { useMemo } from 'react';
import { serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { projectRef } from '@/src/shared/firestore/refs';
import { tasksByProject, toInsightProject } from '@/src/shared/insights/adapter';
import { projectStat } from '@/src/viewmodels/insights/metrics';
import type { ProjectHealth, ProjectRow } from '@/src/viewmodels/projectRow';
import { DEFAULT_THRESHOLDS } from '@/src/viewmodels/insights/settings';
import { useTasksDb } from '@/src/logic/tasksDb/useTasksDb';
import type { FirestoreProject } from '@/src/shared/firestore/types';

export type { ProjectHealth, ProjectRow } from '@/src/viewmodels/projectRow';
export { HEALTH_ORDER, atRiskSentence, healthSentence } from '@/src/viewmodels/projectRow';

export function useProjectsDb() {
  const db = useTasksDb();

  const rows = useMemo<ProjectRow[]>(() => {
    const now = new Date();
    const tasks = tasksByProject(db.taskDocs, now);
    const last = new Map<string, number>();
    const lastDone = new Map<string, number>();
    for (const t of db.taskDocs) {
      if (!t.projectId) continue;
      const at = Math.max(t.completedAt?.toMillis() ?? 0, t.updatedAt?.toMillis() ?? 0);
      last.set(t.projectId, Math.max(last.get(t.projectId) ?? 0, at));
      if (t.completedAt) lastDone.set(t.projectId, Math.max(lastDone.get(t.projectId) ?? 0, t.completedAt.toMillis()));
    }
    return db.projectDocs.map((p) => {
      const stat = projectStat(toInsightProject(p), tasks.get(p.id) ?? [], now, DEFAULT_THRESHOLDS);
      const health: ProjectHealth =
        stat.risk === 'done' ? 'Done' : stat.risk === 'overdue' || stat.risk === 'at risk' ? 'At risk' : stat.risk === 'watch' ? 'Watch' : 'On track';
      const lastMs = Math.max(last.get(p.id) ?? 0, p.updatedAt?.toMillis() ?? 0);
      return {
        id: p.id,
        name: p.name,
        emoji: p.emoji ?? null,
        color: p.color,
        description: p.description ?? '',
        areaId: p.areaId ?? null,
        areaName: p.areaId ? (db.areas.get(p.areaId)?.name ?? null) : null,
        status: p.status,
        start: p.startDate ? p.startDate.toDate() : null,
        end: p.endDate ? p.endDate.toDate() : null,
        progress: stat.progress,
        tasks: stat.total,
        done: stat.done,
        overdue: stat.overdue,
        health,
        reasons: stat.reasons,
        forecast: stat.forecast,
        slackDays: stat.slackDays,
        milestones: stat.milestones,
        lastActivity: lastMs ? new Date(lastMs) : null,
        lastDone: lastDone.has(p.id) ? new Date(lastDone.get(p.id)!) : null,
      };
    });
  }, [db.taskDocs, db.projectDocs, db.areas]);

  /** New start and end dates (the Timeline's drag), same bookkeeping as the project form. */
  async function setDates(row: Pick<ProjectRow, 'id' | 'end'>, start: Date | null, end: Date | null) {
    if (!db.uid) return;
    const doc = db.projects.get(row.id);
    const update: Record<string, unknown> = {
      startDate: start ? Timestamp.fromDate(start) : null,
      endDate: end ? Timestamp.fromDate(end) : null,
      updatedAt: serverTimestamp(),
    };
    if (end && !doc?.originalEndDate) update.originalEndDate = Timestamp.fromDate(end);
    else if (end && row.end && end.getTime() !== row.end.getTime()) update.rescheduleCount = (doc?.rescheduleCount ?? 0) + 1;
    await updateDoc(projectRef(db.uid, row.id), update);
  }

  async function setStatus(row: Pick<ProjectRow, 'id'>, status: FirestoreProject['status']) {
    if (!db.uid) return;
    await updateDoc(projectRef(db.uid, row.id), { status, updatedAt: serverTimestamp() });
  }

  return { db, rows, setDates, setStatus, loading: db.loading };
}

