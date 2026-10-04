'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { debtRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { RECURRING_INTERVALS } from '@/src/phone/logic/createDebt/useLogic';
import type { FirestoreDebt } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { updateDebtPlan } from '@/src/shared/firestore/debtWrites';
import { formatMoney } from '@/src/widgets/Money/Money';

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
      // Saved through the shared debt writes (activity log, plan fields the
      // web forms set); this form keeps the plan's funding and automation.
      const current = debt?.paymentPlan.type === 'recurring' ? debt.paymentPlan.recurring : undefined;
      await updateDebtPlan(
        uid,
        debtId,
        hasRecurring
          ? {
              amount: Number(amount),
              interval: planInterval,
              firstPayment: new Date(`${nextDate}T00:00:00`),
              paidFrom: current?.paidFrom ?? null,
              automation: current?.automation ?? 'off',
            }
          : null,
        'future',
        formatMoney
      );
      router.push(`/debts/${debtId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update the payment plan.');
      setSaving(false);
    }
  }

  // Back to the page the user came from (skipping forms); `/debts/${debtId}` only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(`/debts/${debtId}`);
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
