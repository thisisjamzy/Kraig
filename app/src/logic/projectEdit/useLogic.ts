'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDoc, query, updateDoc, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { useBuckets } from '@/src/shared/firestore/queries';
import { projectRef, areasRef } from '@/src/shared/firestore/refs';
import { ensureDefaultBucket, defaultBucketId } from '@/src/shared/firestore/buckets';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS, DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreProject, FirestoreArea, ProjectStatus, Priority } from '@/src/shared/firestore/types';

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function useLogic(projectId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const projectDocRef = useMemo(() => (uid ? projectRef(uid, projectId) : null), [uid, projectId]);
  const { data: project, loading: projectLoading, error: projectError } = useFirestoreDoc<FirestoreProject>(projectDocRef);

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: areas, loading: areasLoading } = useFirestoreCollection<FirestoreArea>(areasQuery);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [areaId, setAreaId] = useState('');
  const [bucketId, setBucketId] = useState('');
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!project || seededFor === projectId) return;
    setSeededFor(projectId);
    setName(project.name);
    setEmoji(project.emoji ?? null);
    setAreaId(project.areaId ?? '');
    setBucketId(project.bucketId ?? '');
    setColor(project.color);
    setPriority(project.priority ?? DEFAULT_PRIORITY);
    setStartDate(project.startDate ? toIso(project.startDate.toDate()) : '');
    setEndDate(project.endDate ? toIso(project.endDate.toDate()) : '');
    setStatus(project.status);
    setDescription(project.description ?? '');
  }, [project, seededFor, projectId]);

  // Every bucket in the currently selected area — same lookup
  // createProject/useLogic.ts uses.
  const { data: buckets } = useBuckets(areaId || undefined);

  // Once seeded, keep the bucket choice valid for whichever area is
  // currently selected: a bucket from a different area (the user just
  // switched areas), or a legacy null bucketId, both resolve to that
  // area's own default the moment its bucket list is known.
  useEffect(() => {
    if (seededFor !== projectId) return;
    if (!areaId) {
      setBucketId('');
      return;
    }
    if (uid) ensureDefaultBucket(uid, areaId, color);
    setBucketId((current) => (buckets.some((b) => b.id === current) ? current : defaultBucketId(areaId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `color`/`projectId` intentionally excluded, see createProject/useLogic.ts's identical effect.
  }, [areaId, buckets, uid, seededFor]);

  async function handleSave() {
    if (!uid || saving || !name.trim() || !description.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Same reschedule-flag bookkeeping as taskWrites.ts's updateTask, one
      // level up: originalEndDate is set once, rescheduleCount increments
      // on every later change — read fresh here rather than trusted from
      // the loaded `project` prop, since it may have gone stale while the
      // form was open.
      const beforeSnap = await getDoc(projectRef(uid, projectId));
      const before = beforeSnap.data();
      const beforeEndMs = before?.endDate ? before.endDate.toMillis() : null;
      const newEndDate = endDate ? new Date(`${endDate}T00:00:00`) : null;
      const newEndMs = newEndDate ? newEndDate.getTime() : null;
      const endDateChanged = newEndMs !== null && newEndMs !== beforeEndMs;
      const resolvedBucketId = areaId ? bucketId || (await ensureDefaultBucket(uid, areaId, color)) : null;

      const update: Record<string, unknown> = {
        name: name.trim(),
        emoji,
        areaId: areaId || null,
        bucketId: resolvedBucketId,
        color,
        priority,
        startDate: startDate ? Timestamp.fromDate(new Date(`${startDate}T00:00:00`)) : null,
        endDate: newEndDate ? Timestamp.fromDate(newEndDate) : null,
        status,
        description: description.trim(),
        updatedAt: serverTimestamp(),
      };
      if (!before?.originalEndDate && newEndDate) {
        update.originalEndDate = Timestamp.fromDate(newEndDate);
      } else if (endDateChanged && beforeEndMs !== null) {
        update.rescheduleCount = (before?.rescheduleCount ?? 0) + 1;
      }

      await updateDoc(projectRef(uid, projectId), update);
      router.push(`/projects/${projectId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update this project.');
      setSaving(false);
    }
  }

  async function archiveProject() {
    if (!uid) return;
    await updateDoc(projectRef(uid, projectId), { status: 'Archived', updatedAt: serverTimestamp() });
    router.push('/projects');
  }

  async function unarchiveProject() {
    if (!uid) return;
    await updateDoc(projectRef(uid, projectId), { status: 'Active', updatedAt: serverTimestamp() });
    setStatus('Active');
  }

  function goBack() {
    router.push(`/projects/${projectId}`);
  }

  return {
    project,
    areas,
    buckets,
    name,
    setName,
    emoji,
    setEmoji,
    areaId,
    setAreaId,
    bucketId,
    setBucketId,
    color,
    setColor,
    priority,
    setPriority,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    status,
    setStatus,
    description,
    setDescription,
    saving,
    saveError,
    handleSave,
    archiveProject,
    unarchiveProject,
    goBack,
    loading: projectLoading || areasLoading,
    error: projectError,
  };
}
