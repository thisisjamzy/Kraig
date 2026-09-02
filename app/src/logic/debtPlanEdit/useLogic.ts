'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { debtRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { RECURRING_INTERVALS } from '@/src/logic/createDebt/useLogic';
import type { FirestoreDebt } from '@/src/shared/firestore/types';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function useLogic(debtId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const debtDocRef = useMemo(() => (uid ? debtRef(uid, debtId) : null), [uid, debtId]);
  const { data: debt, loading: debtLoading, error: debtError } = useFirestoreDoc<FirestoreDebt>(debtDocRef);

  const [hasRecurring, setHasRecurring] = useState(false);
  const [amount, setAmount] = useState('');
  const [planInterval, setPlanInterval] = useState<(typeof RECURRING_INTERVALS)[number]>('monthly');
  const [nextDate, setNextDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Same seed-once-on-load shape as debtEdit — this is a page now, not a
  // click-to-open modal, so there's no explicit "open" moment to seed from.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!debt || seededFor === debtId) return;
    setSeededFor(debtId);
    const recurring = debt.paymentPlan.type === 'recurring' ? debt.paymentPlan.recurring : undefined;
    setHasRecurring(Boolean(recurring));
    setAmount(recurring ? String(recurring.amount) : '');
    setPlanInterval(recurring?.interval ?? 'monthly');
    setNextDate(recurring ? toIso(recurring.nextPaymentDate.toDate()) : todayIso());
  }, [debt, seededFor, debtId]);

  async function handleSave() {
    if (!uid || saving) return;
    if (hasRecurring && !(Number(amount) > 0)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(debtRef(uid, debtId), {
        paymentPlan: hasRecurring
          ? {
              type: 'recurring',
              recurring: {
                amount: Number(amount),
                interval: planInterval,
                nextPaymentDate: Timestamp.fromDate(new Date(`${nextDate}T00:00:00`)),
                isActive: true,
              },
            }
          : { type: 'none' },
        updatedAt: serverTimestamp(),
      });
      router.push(`/debts/${debtId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update the payment plan.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push(`/debts/${debtId}`);
  }

  return {
    debt,
    hasRecurring,
    setHasRecurring,
    amount,
    setAmount,
    planInterval,
    setPlanInterval,
    nextDate,
    setNextDate,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: debtLoading,
    error: debtError,
  };
}
