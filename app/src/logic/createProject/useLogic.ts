'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, setDoc, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { useSections } from '@/src/shared/firestore/queries';
import { areasRef, projectRef } from '@/src/shared/firestore/refs';
import { ensureDefaultSection, defaultSectionId } from '@/src/shared/firestore/sections';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS, DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreArea, Priority } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Same window.location.search read as src/logic/taskEdit/useLogic.ts's
// projectIdFromSearch — no Suspense boundary needed.
function areaIdFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('areaId') ?? '';
}
function bucketIdFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('bucketId') ?? '';
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
  const [bucketId, setBucketId] = useState<string>(bucketIdFromSearch);
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isValid = Boolean(name.trim() && description.trim());

  // Every section in the chosen area — always includes that area's own
  // default section (sections.ts), since areaDetail/useLogic.ts's self-heal
  // effect guarantees one exists by the time an area can be picked here.
  const { data: sections } = useSections(areaId || undefined);

  // Switching areas resets the section choice to that area's default, and
  // guarantees that default exists — this screen may well be the first
  // place an area is ever touched, so it can't just assume
  // areaDetail/useLogic.ts's own self-heal has already run for it.
  useEffect(() => {
    if (!areaId) {
      setBucketId('');
      return;
    }
    if (uid) ensureDefaultSection(uid, areaId, color);
    setBucketId((current) => (sections.some((b) => b.id === current) ? current : defaultSectionId(areaId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `color` intentionally excluded: it's only the fallback for a brand-new default section's own swatch, not something that should re-run this on every color pick.
  }, [areaId, sections, uid]);

  async function handleSave() {
    if (!uid || saving || !isValid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = crypto.randomUUID();
      const endDateValue = endDate ? Timestamp.fromDate(new Date(`${endDate}T00:00:00`)) : null;
      // A project's section only makes sense alongside its area — resolve
      // (and lazily create, for an area older than this feature) the
      // area's default section right before writing, rather than trusting
      // the picker's state alone.
      const resolvedBucketId = areaId ? bucketId || (await ensureDefaultSection(uid, areaId, color)) : null;
      await setDoc(projectRef(uid, id), {
        name: name.trim(),
        emoji,
        areaId: areaId || null,
        bucketId: resolvedBucketId,
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

  // Back to the page the user came from (skipping forms); '/projects' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/projects');
  }

  return {
    areas,
    sections,
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
    description,
    setDescription,
    isValid,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: areasLoading,
  };
}
