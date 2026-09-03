'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { areaRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    if (!uid || saving || !name.trim() || !description.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = crypto.randomUUID();
      await setDoc(areaRef(uid, id), {
        name: name.trim(),
        emoji,
        color,
        description: description.trim(),
        archived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/areas/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not create this area.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push('/projects');
  }

  return {
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
  };
}
