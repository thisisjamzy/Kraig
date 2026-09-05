'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { bucketRef, areaRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import type { FirestoreBucket, FirestoreArea } from '@/src/shared/firestore/types';

export function useLogic(bucketId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const bucketDocRef = useMemo(() => (uid ? bucketRef(uid, bucketId) : null), [uid, bucketId]);
  const { data: bucket, loading: bucketLoading, error: bucketError } = useFirestoreDoc<FirestoreBucket>(bucketDocRef);

  const bucketAreaId = bucket?.areaId ?? null;
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
    if (!bucket || seededFor === bucketId) return;
    setSeededFor(bucketId);
    setName(bucket.name);
    setEmoji(bucket.emoji ?? null);
    setColor(bucket.color);
    setDescription(bucket.description ?? '');
  }, [bucket, seededFor, bucketId]);

  async function handleSave() {
    if (!uid || saving || !name.trim() || !description.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(bucketRef(uid, bucketId), {
        name: name.trim(),
        emoji,
        color,
        description: description.trim(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/buckets/${bucketId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update this bucket.');
      setSaving(false);
    }
  }

  async function archiveBucket() {
    if (!uid) return;
    await updateDoc(bucketRef(uid, bucketId), { archived: true, updatedAt: serverTimestamp() });
    router.push(bucketAreaId ? `/areas/${bucketAreaId}` : '/projects');
  }

  async function unarchiveBucket() {
    if (!uid) return;
    await updateDoc(bucketRef(uid, bucketId), { archived: false, updatedAt: serverTimestamp() });
  }

  function goBack() {
    router.push(`/buckets/${bucketId}`);
  }

  return {
    bucket,
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
