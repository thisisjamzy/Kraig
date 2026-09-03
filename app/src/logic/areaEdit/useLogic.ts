'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { areaRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import type { FirestoreArea } from '@/src/shared/firestore/types';

export function useLogic(areaId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const areaDocRef = useMemo(() => (uid ? areaRef(uid, areaId) : null), [uid, areaId]);
  const { data: area, loading: areaLoading, error: areaError } = useFirestoreDoc<FirestoreArea>(areaDocRef);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!area || seededFor === areaId) return;
    setSeededFor(areaId);
    setName(area.name);
    setEmoji(area.emoji ?? null);
    setColor(area.color);
    setDescription(area.description ?? '');
  }, [area, seededFor, areaId]);

  async function handleSave() {
    if (!uid || saving || !name.trim() || !description.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(areaRef(uid, areaId), {
        name: name.trim(),
        emoji,
        color,
        description: description.trim(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/areas/${areaId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update this area.');
      setSaving(false);
    }
  }

  async function archiveArea() {
    if (!uid) return;
    await updateDoc(areaRef(uid, areaId), { archived: true, updatedAt: serverTimestamp() });
    router.push('/projects');
  }

  async function unarchiveArea() {
    if (!uid) return;
    await updateDoc(areaRef(uid, areaId), { archived: false, updatedAt: serverTimestamp() });
  }

  function goBack() {
    router.push(`/areas/${areaId}`);
  }

  return {
    area,
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
    archiveArea,
    unarchiveArea,
    goBack,
    loading: areaLoading,
    error: areaError,
  };
}
