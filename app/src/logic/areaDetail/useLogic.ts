'use client';

// An area shows its own projects only — a task never belongs to an area
// directly (it belongs to a project, or is fully standalone; see
// FirestoreTask's own header in types.ts), so this hook has nothing task-
// related left to do. Editing/archiving live on /areas/[id]/edit
// (src/logic/areaEdit) — this hook is display-only plus the "open X" nav
// helpers this detail screen needs.

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { useBuckets } from '@/src/shared/firestore/queries';
import { areaRef, projectsRef, tasksRef } from '@/src/shared/firestore/refs';
import { ensureDefaultBucket, defaultBucketId } from '@/src/shared/firestore/buckets';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreArea, FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';

export function useLogic(areaId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const areaDocRef = useMemo(() => (uid ? areaRef(uid, areaId) : null), [uid, areaId]);
  const { data: area, loading: areaLoading, error: areaError } = useFirestoreDoc<FirestoreArea>(areaDocRef);

  // Self-heals an area that predates the Bucket feature — first load of any
  // such area quietly gives it its own "General" bucket, same lazy-create
  // pattern as ensureUnjustifiedWallet.
  useEffect(() => {
    if (!uid || !area) return;
    ensureDefaultBucket(uid, areaId, area.color);
  }, [uid, area, areaId]);

  const { data: buckets, loading: bucketsLoading } = useBuckets(areaId);

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid), where('areaId', '==', areaId)) : null), [uid, areaId]);
  const { data: projectDocs, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(projectsQuery);

  // A project's bucketId counts toward that bucket if it resolves to one
  // that's actually in this area's own bucket list; anything else (no
  // bucketId, or a stale/unrecognized one) falls back to the area's default
  // bucket — see buckets.ts's own header.
  const bucketProjectCounts = useMemo(() => {
    const knownIds = new Set(buckets.map((b) => b.id));
    const counts = new Map<string, number>();
    for (const project of projectDocs) {
      if (project.status === 'Archived') continue;
      const id = project.bucketId && knownIds.has(project.bucketId) ? project.bucketId : defaultBucketId(areaId);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [projectDocs, buckets, areaId]);

  const bucketsWithCounts = useMemo(
    () => buckets.map((bucket) => ({ ...bucket, projectCount: bucketProjectCounts.get(bucket.id) ?? 0 })),
    [buckets, bucketProjectCounts]
  );

  // Single-field query (auto-indexed, no composite index to deploy) —
  // `archived` is filtered client-side instead of as a second `where`.
  const tasksQuery = useMemo(() => (uid ? query(tasksRef(uid), where('areaId', '==', areaId)) : null), [uid, areaId]);
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

  const projects = projectDocs
    .filter((p) => p.status !== 'Archived')
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

  function goBack() {
    router.push('/projects');
  }
  function openProject(id: string) {
    router.push(`/projects/${id}`);
  }
  function openEdit() {
    router.push(`/areas/${areaId}/edit`);
  }
  function openBucket(bucketId: string) {
    router.push(`/buckets/${bucketId}`);
  }
  function openNewBucket() {
    router.push(`/buckets/new?areaId=${areaId}`);
  }

  return {
    area,
    projects,
    buckets: bucketsWithCounts,
    goBack,
    openProject,
    openEdit,
    openBucket,
    openNewBucket,
    loading: areaLoading || projectsLoading || tasksLoading || bucketsLoading,
    error: areaError,
  };
}
