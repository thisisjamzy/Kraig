'use client';

// Sections sit between Area and Project (see FirestoreSection's own header in
// types.ts). A section always belongs to exactly one area, fixed at
// creation — this screen is only ever reached via an area's own "New
// section in this area" link (src/screens/AreaDetail), which always passes
// ?areaId=, so there's no area picker here the way src/logic/createProject
// has one; the area is shown read-only instead.
//
// areaId is a real prop threaded from the page's own searchParams (see
// app/(mobile)/sections/new/page.tsx), not read here off
// window.location.search the way most other create/edit screens do —
// this one has no fallback UI for a missing area, so it can't risk the
// one gap in that convention: a value seeded once via a lazy useState
// initializer goes stale if this same route is visited twice in a row
// (a different area's own link each time) without an actual remount.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { areaRef, sectionRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import type { FirestoreArea } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function useLogic(areaId: string) {
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

  async function handleSave() {
    if (!uid || !areaId || saving || !isValid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = crypto.randomUUID();
      await setDoc(sectionRef(uid, id), {
        name: name.trim(),
        emoji,
        color,
        description: description.trim(),
        areaId,
        archived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.replace(`/sections/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not create this section.');
      setSaving(false);
    }
  }

  // Back to the page the user came from (skipping forms); areaId ? `/areas/${areaId}` : '/projects' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(areaId ? `/areas/${areaId}` : '/projects');
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
    isValid,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: Boolean(areaId) && areaLoading,
    error: areaError,
  };
}
