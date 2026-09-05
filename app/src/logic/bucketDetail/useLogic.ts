'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { useBuckets } from '@/src/shared/firestore/queries';
import { bucketRef, areaRef, projectsRef, tasksRef } from '@/src/shared/firestore/refs';
import { defaultBucketId } from '@/src/shared/firestore/buckets';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreBucket, FirestoreArea, FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';

export function useLogic(bucketId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const bucketDocRef = useMemo(() => (uid ? bucketRef(uid, bucketId) : null), [uid, bucketId]);
  const { data: bucket, loading: bucketLoading, error: bucketError } = useFirestoreDoc<FirestoreBucket>(bucketDocRef);

  const bucketAreaId = bucket?.areaId ?? null;
  const areaDocRef = useMemo(() => (uid && bucketAreaId ? areaRef(uid, bucketAreaId) : null), [uid, bucketAreaId]);
  const { data: area } = useFirestoreDoc<FirestoreArea>(areaDocRef);

  // Every bucket in this bucket's own area — needed to tell a "real"
  // project.bucketId from a stale/legacy one, same check
  // areaDetail/useLogic.ts makes when it counts projects per bucket.
  const { data: areaBuckets } = useBuckets(bucketAreaId ?? undefined);
  const knownBucketIds = useMemo(() => new Set(areaBuckets.map((b) => b.id)), [areaBuckets]);

  const projectsQuery = useMemo(
    () => (uid && bucketAreaId ? query(projectsRef(uid), where('areaId', '==', bucketAreaId)) : null),
    [uid, bucketAreaId]
  );
  const { data: projectDocs, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(projectsQuery);

  // Same task-stats-per-project shape as areaDetail/useLogic.ts, scoped the
  // same way (by areaId — a bucket's own tasks are its area's tasks,
  // filtered down to this bucket's own projects below).
  const tasksQuery = useMemo(
    () => (uid && bucketAreaId ? query(tasksRef(uid), where('areaId', '==', bucketAreaId)) : null),
    [uid, bucketAreaId]
  );
  const { data: taskDocs, loading: tasksLoading } = useFirestoreCollection<FirestoreTask>(tasksQuery);
  const taskStatsByProject = useMemo(() => {
    const stats = new Map<string, { total: number; done: number }>();
    for (const task of taskDocs) {
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
        const resolvedId = p.bucketId && knownBucketIds.has(p.bucketId) ? p.bucketId : defaultBucketId(bucketAreaId);
        return resolvedId === bucketId;
      })
      .map((p) => {
        const stats = taskStatsByProject.get(p.id) ?? { total: 0, done: 0 };
        return {
          id: p.id,
          name: p.name,
          emoji: p.emoji ?? null,
          status: p.status,
          priority: p.priority ?? DEFAULT_PRIORITY,
          startDate: p.startDate ? p.startDate.toDate() : null,
          endDate: p.endDate ? p.endDate.toDate() : null,
          taskCount: stats.total,
          completionPercent: stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0,
        };
      });
  }, [projectDocs, knownBucketIds, bucketAreaId, bucketId, taskStatsByProject]);

  function goBack() {
    router.push(bucketAreaId ? `/areas/${bucketAreaId}` : '/projects');
  }
  function openProject(id: string) {
    router.push(`/projects/${id}`);
  }
  function openEdit() {
    router.push(`/buckets/${bucketId}/edit`);
  }

  return {
    bucket,
    area,
    projects,
    goBack,
    openProject,
    openEdit,
    loading: bucketLoading || projectsLoading || tasksLoading,
    error: bucketError,
  };
}
