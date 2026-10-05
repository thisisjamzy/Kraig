'use client';

import { useEffect, useMemo, useState } from 'react';
import { updateDoc } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { categoryRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreCategory } from '@/src/shared/firestore/types';
import { CATEGORY_TYPES, type CategoryType } from '@/src/logic/createCategory/useLogic';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { useFormFinish } from '@/src/shared/navigation/formPeekContext';

export { CATEGORY_TYPES };
export type { CategoryType };

export function useLogic(categoryId: string) {
  const finish = useFormFinish();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const ref = useMemo(() => (uid ? categoryRef(uid, categoryId) : null), [uid, categoryId]);
  const { data: category, loading, error } = useFirestoreDoc<FirestoreCategory>(ref);

  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryType>('Expense');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Same seed-once-on-load pattern as walletEdit/useLogic.ts — fires only
  // the first time this category's doc arrives so it never clobbers an
  // in-progress edit on a later snapshot update.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!category || seededFor === categoryId) return;
    setSeededFor(categoryId);
    setName(category.name);
    setType(category.transactionType);
    setDescription(category.notes ?? '');
  }, [category, seededFor, categoryId]);

  async function handleSave() {
    if (!uid || saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveError('Give this category a name.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(categoryRef(uid, categoryId), {
        name: trimmedName,
        transactionType: type,
        notes: description.trim(),
      });
      finish('/categories');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not update this category.');
      setSaving(false);
    }
  }

  // Back to the page the user came from (skipping forms); '/categories' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/categories');
  }

  return {
    name,
    setName,
    type,
    setType,
    description,
    setDescription,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
    error,
  };
}
