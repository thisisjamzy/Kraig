'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, setDoc, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { areasRef, projectRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS, DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreArea, Priority } from '@/src/shared/firestore/types';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Same window.location.search read as src/logic/taskEdit/useLogic.ts's
// projectIdFromSearch — no Suspense boundary needed.
function areaIdFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('areaId') ?? '';
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: areas, loading: areasLoading } = useFirestoreCollection<FirestoreArea>(areasQuery);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string>(areaIdFromSearch);
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    if (!uid || saving || !name.trim() || !description.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = crypto.randomUUID();
      const endDateValue = endDate ? Timestamp.fromDate(new Date(`${endDate}T00:00:00`)) : null;
      await setDoc(projectRef(uid, id), {
        name: name.trim(),
        emoji,
        areaId: areaId || null,
        // This screen has no bucket picker yet — every project it creates
        // is unbucketed (see FirestoreProject.bucketId's own comment in
        // types.ts).
        bucketId:null,
        color,
        priority,
        startDate: startDate ? Timestamp.fromDate(new Date(`${startDate}T00:00:00`)) : null,
        endDate: endDateValue,
        originalEndDate: endDateValue,
        rescheduleCount: 0,
        status: 'Active',
        description: description.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/projects/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not create this project.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push('/projects');
  }

  return {
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
    description,
    setDescription,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: areasLoading,
  };
}
