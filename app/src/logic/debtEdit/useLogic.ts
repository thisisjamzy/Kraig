'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { debtRef } from '@/src/shared/firestore/refs';
import { round2 } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { DebtPriority, FirestoreDebt } from '@/src/shared/firestore/types';

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function useLogic(debtId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const debtDocRef = useMemo(() => (uid ? debtRef(uid, debtId) : null), [uid, debtId]);
  const { data: debt, loading: debtLoading, error: debtError } = useFirestoreDoc<FirestoreDebt>(debtDocRef);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [principal, setPrincipal] = useState('');
  const [priority, setPriority] = useState<DebtPriority>('medium');
  const [startDate, setStartDate] = useState(toIso(new Date()));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Page load, not a click-to-open modal — seed once the debt doc arrives
  // rather than at an explicit "open" moment. Guarded to fire only the
  // first time this debt's data shows up so it never clobbers what the
  // user is mid-typing on a later snapshot update (same shape as
  // src/logic/editTransaction/useLogic.ts's seededFor).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!debt || seededFor === debtId) return;
    setSeededFor(debtId);
    setName(debt.name);
    setDescription(debt.description);
    setPrincipal(String(debt.principalAmount));
    setPriority(debt.priority);
    setStartDate(toIso(debt.startDate.toDate()));
    setNotes(debt.notes);
  }, [debt, seededFor, debtId]);

  async function handleSave() {
    if (!uid || !debt || saving) return;
    const principalValue = Number(principal);
    if (!name.trim() || !(principalValue > 0)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(debtRef(uid, debtId), {
        name: name.trim(),
        description: description.trim(),
        principalAmount: principalValue,
        currentBalance: Math.max(0, round2(principalValue - debt.totalRepaid)),
        priority,
        startDate: Timestamp.fromDate(new Date(`${startDate}T00:00:00`)),
        notes: notes.trim(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/debts/${debtId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update this debt.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push(`/debts/${debtId}`);
  }

  return {
    debt,
    name,
    setName,
    description,
    setDescription,
    principal,
    setPrincipal,
    priority,
    setPriority,
    startDate,
    setStartDate,
    notes,
    setNotes,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: debtLoading,
    error: debtError,
  };
}
