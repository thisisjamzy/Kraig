'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDoc, query, updateDoc, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { projectRef, areasRef } from '@/src/shared/firestore/refs';
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
    setColor(project.color);
    setPriority(project.priority ?? DEFAULT_PRIORITY);
    setStartDate(project.startDate ? toIso(project.startDate.toDate()) : '');
    setEndDate(project.endDate ? toIso(project.endDate.toDate()) : '');
    setStatus(project.status);
    setDescription(project.description ?? '');
  }, [project, seededFor, projectId]);

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

      const update: Record<string, unknown> = {
        name: name.trim(),
        emoji,
        areaId: areaId || null,
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
    name,
    setName,
    emoji,
    setEmoji,
    areaId,
    setAreaId,
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
