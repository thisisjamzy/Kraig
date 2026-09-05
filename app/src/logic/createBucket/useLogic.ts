'use client';

// Buckets sit between Area and Project (see FirestoreBucket's own header in
// types.ts). A bucket always belongs to exactly one area, fixed at
// creation — this screen is only ever reached via an area's own "New
// bucket in this area" link (src/screens/AreaDetail), which always passes
// ?areaId=, so there's no area picker here the way src/logic/createProject
// has one; the area is shown read-only instead.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { areaRef, bucketRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import type { FirestoreArea } from '@/src/shared/firestore/types';

// Same window.location.search read as src/logic/createProject/useLogic.ts's
// areaIdFromSearch — no Suspense boundary needed.
function areaIdFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('areaId') ?? '';
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [areaId] = useState(areaIdFromSearch);

  const areaDocRef = useMemo(() => (uid && areaId ? areaRef(uid, areaId) : null), [uid, areaId]);
  const { data: area, loading: areaLoading, error: areaError } = useFirestoreDoc<FirestoreArea>(areaDocRef);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    if (!uid || !areaId || saving || !name.trim() || !description.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = crypto.randomUUID();
      await setDoc(bucketRef(uid, id), {
        name: name.trim(),
        emoji,
        color,
        description: description.trim(),
        areaId,
        archived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/buckets/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not create this bucket.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push(areaId ? `/areas/${areaId}` : '/projects');
  }

  return {
    area,
    hasAreaId: Boolean(areaId),
    name,
    setName,
    emoji,
    setEmoji,
    color,
    setColor,
    description,
    setDescription,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: Boolean(areaId) && areaLoading,
    error: areaError,
  };
}
