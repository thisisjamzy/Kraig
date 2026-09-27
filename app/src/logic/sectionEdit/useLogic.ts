'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { sectionRef, areaRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import type { FirestoreSection, FirestoreArea } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function useLogic(bucketId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const bucketDocRef = useMemo(() => (uid ? sectionRef(uid, bucketId) : null), [uid, bucketId]);
  const { data: section, loading: bucketLoading, error: bucketError } = useFirestoreDoc<FirestoreSection>(bucketDocRef);

  const bucketAreaId = section?.areaId ?? null;
  const areaDocRef = useMemo(() => (uid && bucketAreaId ? areaRef(uid, bucketAreaId) : null), [uid, bucketAreaId]);
  const { data: area } = useFirestoreDoc<FirestoreArea>(areaDocRef);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!section || seededFor === bucketId) return;
    setSeededFor(bucketId);
    setName(section.name);
    setEmoji(section.emoji ?? null);
    setColor(section.color);
    setDescription(section.description ?? '');
  }, [section, seededFor, bucketId]);

  async function handleSave() {
    if (!uid || saving || !name.trim() || !description.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(sectionRef(uid, bucketId), {
        name: name.trim(),
        emoji,
        color,
        description: description.trim(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/sections/${bucketId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update this section.');
      setSaving(false);
    }
  }

  async function archiveBucket() {
    // The default section is every unbucketed project's fallback home (see
    // sections.ts's own header) — archiving it would leave those projects
    // with nowhere to resolve to, so it's never allowed to go away.
    if (!uid || section?.isDefault) return;
    await updateDoc(sectionRef(uid, bucketId), { archived: true, updatedAt: serverTimestamp() });
    router.push(bucketAreaId ? `/areas/${bucketAreaId}` : '/projects');
  }

  async function unarchiveBucket() {
    if (!uid) return;
    await updateDoc(sectionRef(uid, bucketId), { archived: false, updatedAt: serverTimestamp() });
  }

  // Back to the page the user came from (skipping forms); `/sections/${bucketId}` only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(`/sections/${bucketId}`);
  }

  return {
    section,
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
    archiveBucket,
    unarchiveBucket,
    goBack,
    loading: bucketLoading,
    error: bucketError,
  };
}
