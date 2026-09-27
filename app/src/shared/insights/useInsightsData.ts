'use client';

// Loads what Insights needs (tasks, projects, settings/insights) and
// computes the screen for a range — cached per range, and recomputed when
// tasks, projects, settings or the minute change.

import { useMemo } from 'react';
import { query } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { insightsSettingsRef, projectsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import type { FirestoreInsightsSettings, FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';
import { computeInsights, type InsightsResult } from '@/src/viewmodels/insights/compute';
import { rangeFor } from '@/src/viewmodels/insights/dates';
import { resolveSettings, type InsightsSettings } from '@/src/viewmodels/insights/settings';
import type { RangeKind } from '@/src/viewmodels/insights/types';
import { insightTasks, tasksByProject, toInsightProject } from './adapter';
import { useNowMinute } from './useNow';

interface CacheEntry {
  tasks: FirestoreTask[];
  projects: FirestoreProject[];
  settings: InsightsSettings;
  minute: number;
  result: InsightsResult;
}
// One entry per range ("week", "custom|2026-09-01|2026-09-30"…) — switching
// back to a range reuses it while nothing underneath changed.
const cache = new Map<string, CacheEntry>();

export function computeCached(
  key: string,
  taskDocs: FirestoreTask[],
  projectDocs: FirestoreProject[],
  settings: InsightsSettings,
  minute: number,
  kind: RangeKind,
  custom: { from: string; to: string } | null
): InsightsResult {
  const hit = cache.get(key);
  if (hit && hit.tasks === taskDocs && hit.projects === projectDocs && hit.settings === settings && hit.minute === minute) {
    return hit.result;
  }
  const now = new Date(minute * 60000);
  const range = rangeFor(kind, now, custom);
  const result = computeInsights({
    tasks: insightTasks(taskDocs, range, now),
    projects: projectDocs.map(toInsightProject),
    projectTasks: tasksByProject(taskDocs, now),
    range,
    kind,
    settings,
    now,
  });
  cache.set(key, { tasks: taskDocs, projects: projectDocs, settings, minute, result });
  if (cache.size > 8) cache.delete(cache.keys().next().value as string);
  return result;
}

export function useInsightsSources() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: taskDocs, loading: tasksLoading } = useAllTasks();
  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(projectsQuery);
  const settingsDocRef = useMemo(() => (uid ? insightsSettingsRef(uid) : null), [uid]);
  const { data: settingsDoc, loading: settingsLoading } = useFirestoreDoc<FirestoreInsightsSettings>(settingsDocRef);
  const settings = useMemo(() => resolveSettings(settingsDoc), [settingsDoc]);
  const minute = useNowMinute();
  return {
    uid,
    taskDocs,
    projectDocs,
    settings,
    settingsDoc,
    minute,
    loading: tasksLoading || projectsLoading || settingsLoading || minute === 0,
  };
}
