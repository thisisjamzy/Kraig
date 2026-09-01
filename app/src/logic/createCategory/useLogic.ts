'use client';

// Settings' own "Create category" entry point (src/screens/Settings) — a
// standalone way to add a category outside of any particular budget line or
// transaction, since not every category gets set up during onboarding. The
// same create-a-category mechanics also live inline in Add Budget Category
// (src/logic/addBudgetCategory/useLogic.ts) for the "can't find your
// category" case there; this one is deliberately its own small
// implementation rather than a shared hook — the two flows differ in where
// they send you afterward and neither is more than a handful of lines.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setDoc } from 'firebase/firestore';
import { categoryRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';

export type CategoryType = 'Expense' | 'Income' | 'Savings';
export const CATEGORY_TYPES: CategoryType[] = ['Expense', 'Income', 'Savings'];

// Settings links here directly; the Categories list's own FAB links here
// with ?returnTo=/categories so creating one lands back on the list (see
// src/screens/Categories) instead of Settings.
function returnTargetFromSearch(): string {
  if (typeof window === 'undefined') return '/settings';
  const returnTo = new URLSearchParams(window.location.search).get('returnTo');
  return returnTo && returnTo.startsWith('/') ? returnTo : '/settings';
}

export function useLogic() {
  const router = useRouter();
  const [returnTo] = useState(returnTargetFromSearch);
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryType>('Expense');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim() || saving || !uid) return;
    setSaving(true);
    setError(null);
    try {
      await setDoc(categoryRef(uid, crypto.randomUUID()), {
        name: name.trim(),
        transactionType: type,
        group: null,
        notes: description.trim(),
        archived: false,
      });
      router.push(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this category.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push(returnTo);
  }

  return { name, setName, type, setType, description, setDescription, saving, error, handleSave, goBack };
}
