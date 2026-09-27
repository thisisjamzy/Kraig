'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { useSections } from '@/src/shared/firestore/queries';
import { sectionRef, areaRef, projectsRef, tasksRef } from '@/src/shared/firestore/refs';
import { defaultSectionId } from '@/src/shared/firestore/sections';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreSection, FirestoreArea, FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { summarizeSeries } from '@/src/shared/tasks/recurringTasks';

export function useLogic(bucketId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const bucketDocRef = useMemo(() => (uid ? sectionRef(uid, bucketId) : null), [uid, bucketId]);
  const { data: section, loading: bucketLoading, error: bucketError } = useFirestoreDoc<FirestoreSection>(bucketDocRef);

  const bucketAreaId = section?.areaId ?? null;
  const areaDocRef = useMemo(() => (uid && bucketAreaId ? areaRef(uid, bucketAreaId) : null), [uid, bucketAreaId]);
  const { data: area } = useFirestoreDoc<FirestoreArea>(areaDocRef);

  // Every section in this section's own area — needed to tell a "real"
  // project.bucketId from a stale/legacy one, same check
  // areaDetail/useLogic.ts makes when it counts projects per section.
  const { data: areaBuckets } = useSections(bucketAreaId ?? undefined);
  const knownBucketIds = useMemo(() => new Set(areaBuckets.map((b) => b.id)), [areaBuckets]);

  const projectsQuery = useMemo(
    () => (uid && bucketAreaId ? query(projectsRef(uid), where('areaId', '==', bucketAreaId)) : null),
    [uid, bucketAreaId]
  );
  const { data: projectDocs, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(projectsQuery);

  // Same task-stats-per-project shape as areaDetail/useLogic.ts, scoped the
  // same way (by areaId — a section's own tasks are its area's tasks,
  // filtered down to this section's own projects below).
  const tasksQuery = useMemo(
    () => (uid && bucketAreaId ? query(tasksRef(uid), where('areaId', '==', bucketAreaId)) : null),
    [uid, bucketAreaId]
  );
  const { data: taskDocs, loading: tasksLoading } = useFirestoreCollection<FirestoreTask>(tasksQuery);
  const taskStatsByProject = useMemo(() => {
    const stats = new Map<string, { total: number; done: number }>();
    // A recurring series counts once (recurringTasks.ts's summarizeSeries).
    for (const task of summarizeSeries(taskDocs)) {
      if (task.archived || !task.projectId) continue;
      const entry = stats.get(task.projectId) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (task.done) entry.done += 1;
      stats.set(task.projectId, entry);
    }
    return stats;
  }, [taskDocs]);

  const projects = useMemo(() => {
    if (!bucketAreaId) return [];
    return projectDocs
      .filter((p) => p.status !== 'Archived')
      .filter((p) => {
        const resolvedId = p.bucketId && knownBucketIds.has(p.bucketId) ? p.bucketId : defaultSectionId(bucketAreaId);
        return resolvedId === bucketId;
      })
      .map((p) => {
        const stats = taskStatsByProject.get(p.id) ?? { total: 0, done: 0 };
        return {
          id: p.id,
          name: p.name,
          emoji: p.emoji ?? null,
          color: p.color,
          description: p.description,
          areaName: area?.name ?? null,
          bucketName: section?.name ?? null,
          status: p.status,
          priority: p.priority ?? DEFAULT_PRIORITY,
          startDate: p.startDate ? p.startDate.toDate() : null,
          endDate: p.endDate ? p.endDate.toDate() : null,
          taskCount: stats.total,
          completionPercent: stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0,
        };
      });
  }, [projectDocs, knownBucketIds, bucketAreaId, bucketId, taskStatsByProject, area, section]);

  // Back to the page the user came from (skipping forms); bucketAreaId ? `/areas/${bucketAreaId}` : '/projects' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(bucketAreaId ? `/areas/${bucketAreaId}` : '/projects');
  }
  function openProject(id: string) {
    router.push(`/projects/${id}`);
  }
  function openEdit() {
    router.push(`/sections/${bucketId}/edit`);
  }
  function openNewProject() {
    router.push(`/projects/new?areaId=${bucketAreaId ?? ''}&bucketId=${bucketId}`);
  }

  return {
    section,
    area,
    projects,
    goBack,
    openProject,
    openEdit,
    openNewProject,
    loading: bucketLoading || projectsLoading || tasksLoading,
    error: bucketError,
  };
}
