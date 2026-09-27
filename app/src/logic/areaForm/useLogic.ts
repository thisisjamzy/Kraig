'use client';

// New / edit area — one form for both (same as New / edit project).
// `areaId` switches it to editing: the fields are seeded from the area,
// Save updates it, and archiving (or restoring) becomes available.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { areaRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import type { FirestoreArea } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function useLogic(areaId?: string) {
  const isEditing = Boolean(areaId);
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const areaDocRef = useMemo(() => (uid && areaId ? areaRef(uid, areaId) : null), [uid, areaId]);
  const { data: area, loading: areaLoading, error: areaError } = useFirestoreDoc<FirestoreArea>(areaDocRef);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isValid = Boolean(name.trim() && description.trim());

  // Editing: seed the fields once the area has loaded.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seeded = !isEditing || seededFor === areaId;
  useEffect(() => {
    if (!area || !areaId || seededFor === areaId) return;
    setSeededFor(areaId);
    setName(area.name);
    setEmoji(area.emoji ?? null);
    setColor(area.color);
    setDescription(area.description ?? '');
  }, [area, seededFor, areaId]);

  async function handleSave() {
    if (!uid || saving || !isValid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const fields = { name: name.trim(), emoji, color, description: description.trim(), updatedAt: serverTimestamp() };
      if (areaId) {
        await updateDoc(areaRef(uid, areaId), fields);
        router.push(`/areas/${areaId}`);
      } else {
        const id = crypto.randomUUID();
        await setDoc(areaRef(uid, id), { ...fields, archived: false, createdAt: serverTimestamp() });
        router.push(`/areas/${id}`);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : isEditing ? 'Could not update this area.' : 'Could not create this area.');
      setSaving(false);
    }
  }

  async function setArchived(archived: boolean) {
    if (!uid || !areaId) return;
    await updateDoc(areaRef(uid, areaId), { archived, updatedAt: serverTimestamp() });
    if (archived) router.push('/projects');
  }

  // Back to the page the user came from (skipping forms) — see
  // src/shared/navigation/useGoBack.ts for when the fallback is used.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(areaId ? `/areas/${areaId}` : '/projects');
  }

  return {
    isEditing,
    archived: Boolean(area?.archived),
    name,
    setName,
    emoji,
    setEmoji,
    color,
    setColor,
    description,
    setDescription,
    isValid,
    saving,
    saveError,
    handleSave,
    archiveArea: () => setArchived(true),
    unarchiveArea: () => setArchived(false),
    goBack,
    loading: isEditing && (areaLoading || (Boolean(area) && !seeded)),
    notFound: isEditing && !areaLoading && !area,
    error: areaError,
  };
}
