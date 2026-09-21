'use client';

// "See all projects" — reached from the Projects hub's Projects section
// (see src/screens/Projects/ProjectsScreen.tsx), the same Timeline/Name
// sort that carousel already offers. Each row carries the same fields the
// hub's own ProjectCard (src/widgets/ProjectCard) shows — name, timeline,
// description, bucket, area — just laid out for a full-width vertical
// list instead of a fixed-width carousel card.
//
// Archiving here is the same status:'Archived' write projectEdit/
// useLogic.ts's own archiveProject makes, just without that hook's
// redirect-after-archive (this list stays put and the live query drops
// the row the instant it archives).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { useBuckets } from '@/src/shared/firestore/queries';
import { areasRef, projectRef, projectsRef } from '@/src/shared/firestore/refs';
import { defaultBucketId } from '@/src/shared/firestore/buckets';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreArea, FirestoreProject } from '@/src/shared/firestore/types';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs, loading: projectsLoading, error: projectsError } =
    useFirestoreCollection<FirestoreProject>(projectsQuery);

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid)) : null), [uid]);
  const { data: areaDocs, loading: areasLoading } = useFirestoreCollection<FirestoreArea>(areasQuery);
  const areaName = useMemo(() => new Map(areaDocs.map((a) => [a.id, a.name])), [areaDocs]);

  const { data: bucketDocs, loading: bucketsLoading } = useBuckets();
  const bucketName = useMemo(() => new Map(bucketDocs.map((b) => [b.id, b.name])), [bucketDocs]);

  const [sort, setSort] = useState<'timeline' | 'name'>('timeline');

  const projects = useMemo(
    () =>
      projectDocs
        .filter((project) => project.status !== 'Archived')
        .map((project) => {
          // A project's bucketId falls back to its own area's default
          // bucket when unset — same rule the Projects hub's own logic
          // (src/logic/projects/useLogic.ts) and areaDetail/useLogic.ts
          // both apply.
          const resolvedBucketId = project.bucketId ?? (project.areaId ? defaultBucketId(project.areaId) : null);
          return {
            id: project.id,
            name: project.name,
            emoji: project.emoji ?? null,
            color: project.color,
            description: project.description,
            areaName: project.areaId ? areaName.get(project.areaId) ?? null : null,
            bucketName: resolvedBucketId ? bucketName.get(resolvedBucketId) ?? null : null,
            startDate: project.startDate ? project.startDate.toDate() : null,
            endDate: project.endDate ? project.endDate.toDate() : null,
          };
        })
        .sort((a, b) =>
          sort === 'name'
            ? a.name.localeCompare(b.name)
            : (a.startDate?.getTime() ?? Infinity) - (b.startDate?.getTime() ?? Infinity)
        ),
    [projectDocs, areaName, bucketName, sort]
  );

  function openProject(id: string) {
    router.push(`/projects/${id}`);
  }

  function goBack() {
    router.push('/projects');
  }

  async function archiveProject(id: string) {
    if (!uid) return;
    await updateDoc(projectRef(uid, id), { status: 'Archived', updatedAt: serverTimestamp() });
  }

  return {
    projects,
    sort,
    setSort,
    openProject,
    archiveProject,
    goBack,
    loading: projectsLoading || areasLoading || bucketsLoading,
    error: projectsError,
  };
}
