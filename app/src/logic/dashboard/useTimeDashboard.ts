'use client';

// The Time dashboard: the period (usePeriod), tasks (recurring ones as
// their dates), projects, areas, calendar events and your work settings,
// turned into time entries and one view model per card
// (src/viewmodels/dashboard/time.ts) for the period's layout. Live.

import { useMemo } from 'react';
import { query } from 'firebase/firestore';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { useCalendarEvents } from '@/src/shared/hooks/useCalendarEvents';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { areasRef, insightsSettingsRef, projectsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { expandTasks } from '@/src/shared/tasks/recurringTasks';
import { effectiveTimeMode } from '@/src/viewmodels/scheduling';
import { resolveSettings } from '@/src/viewmodels/insights/settings';
import { usePeriod } from '@/src/shared/dashboard/usePeriod';
import { addUnit, startOf } from '@/src/shared/dashboard/period';
import { cardsIn, TIME_LAYOUT } from '@/src/shared/dashboard/layouts';
import { timeDashboard, timeEntries, type TaskLike } from '@/src/viewmodels/dashboard/time';
import type { FirestoreArea, FirestoreInsightsSettings, FirestoreProject } from '@/src/shared/firestore/types';

const hourOf = (hhmm: string, fallback: number) => {
  const h = Number(hhmm?.split(':')[0]);
  return Number.isFinite(h) ? h : fallback;
};

export function useTimeDashboard() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const tasks = useAllTasks();
  const projects = useFirestoreCollection<FirestoreProject>(useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]));
  const areas = useFirestoreCollection<FirestoreArea>(useMemo(() => (uid ? query(areasRef(uid)) : null), [uid]));
  const settingsDoc = useFirestoreDoc<FirestoreInsightsSettings>(useMemo(() => (uid ? insightsSettingsRef(uid) : null), [uid]));
  const settings = useMemo(() => resolveSettings(settingsDoc.data), [settingsDoc.data]);

  const first = useMemo(() => {
    let min: number | null = null;
    for (const t of tasks.data) {
      const d = t.startTime?.toMillis() ?? t.createdAt?.toMillis();
      if (d && (min === null || d < min)) min = d;
    }
    return min ? new Date(min) : null;
  }, [tasks.data]);
  const p = usePeriod('time', first);
  const layout = TIME_LAYOUT[p.kind];

  // Enough history for comparisons and 12-week trends.
  const from = useMemo(() => {
    const back = addUnit('week', startOf('week', p.period.start), -13);
    const compare = p.period.compare?.start ?? p.period.start;
    return [back, compare, p.period.start].reduce((a, b) => (b < a ? b : a));
  }, [p.period.start, p.period.compare]);
  const events = useCalendarEvents(from.getTime(), p.period.end.getTime());

  const dash = useMemo(() => {
    const areaOfProject = new Map(projects.data.map((x) => [x.id, x.areaId]));
    const expanded: TaskLike[] = expandTasks(tasks.data.filter((t) => !t.archived), from, p.period.end).map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type ?? 'ToDo',
      mode: effectiveTimeMode(t),
      start: t.startTime ? t.startTime.toDate() : null,
      end: t.dueDate ? t.dueDate.toDate() : null,
      allDay: Boolean(t.allDay),
      done: Boolean(t.done) || t.status === 'Done',
      cancelled: t.status === 'Cancelled',
      completedAt: t.completedAt ? t.completedAt.toDate() : null,
      actualMinutes: t.actualMinutes ?? null,
      projectId: t.projectId ?? null,
      areaId: t.areaId ?? (t.projectId ? (areaOfProject.get(t.projectId) ?? null) : null),
    }));
    const entries = timeEntries(
      expanded,
      events.data.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.startAt.toDate(),
        end: e.endAt.toDate(),
        allDay: e.allDay,
        focus: e.eventType === 'focusTime',
        linked: Boolean(e.linkedTaskId),
      })),
      p.period.now
    );
    const tasksByProject = new Map<string, { done: number; total: number }>();
    for (const t of tasks.data) {
      if (!t.projectId || t.archived || t.status === 'Cancelled') continue;
      const row = tasksByProject.get(t.projectId) ?? { done: 0, total: 0 };
      row.total += 1;
      if (t.done || t.status === 'Done') row.done += 1;
      tasksByProject.set(t.projectId, row);
    }
    return timeDashboard(
      {
        entries,
        projects: projects.data.map((x) => ({
          id: x.id,
          name: x.name,
          start: x.startDate ? x.startDate.toDate() : null,
          end: x.endDate ? x.endDate.toDate() : null,
          done: tasksByProject.get(x.id)?.done ?? 0,
          total: tasksByProject.get(x.id)?.total ?? 0,
        })),
        areas: areas.data.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, weeklyTargetHours: a.weeklyHoursTarget ?? null })),
        dailyTarget: settings.capacityHours * 60,
        workStart: hourOf(settings.workStart, 8),
        workEnd: hourOf(settings.workEnd, 18),
      },
      p.period,
      cardsIn(layout)
    );
  }, [tasks.data, projects.data, areas.data, events.data, settings, from, p.period, layout]);

  return { ...p, layout, dash, loading: tasks.loading || projects.loading || areas.loading || settingsDoc.loading };
}
