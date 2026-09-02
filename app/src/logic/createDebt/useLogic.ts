'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { createDebt } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { currencyName } from '@/src/viewmodels/currencies';
import type { DebtType, DebtPriority } from '@/src/shared/firestore/types';

export const DEBT_TYPES: DebtType[] = ['cash', 'existing'];
export const DEBT_PRIORITIES: DebtPriority[] = ['high', 'medium', 'low'];
export const RECURRING_INTERVALS = ['weekly', 'biweekly', 'monthly', 'yearly'] as const;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();
  const { data: exchangeRates } = useExchangeRates();
  const currencyOptions = (exchangeRates.length > 0 ? exchangeRates.map((rate) => rate.id) : [ctx.base]).map(
    (code) => ({ code, name: currencyName(code) })
  );

  const [debtType, setDebtType] = useState<DebtType>('cash');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [priority, setPriority] = useState<DebtPriority>('medium');
  const [startDate, setStartDate] = useState(todayIso());
  const [notes, setNotes] = useState('');

  const [hasRecurring, setHasRecurring] = useState(false);
  const [recurringAmount, setRecurringAmount] = useState('');
  const [recurringInterval, setRecurringInterval] = useState<(typeof RECURRING_INTERVALS)[number]>('monthly');
  const [recurringNextDate, setRecurringNextDate] = useState(todayIso());

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    if (!uid || saving) return;
    const principal = Number(principalAmount);
    if (!name.trim() || !(principal > 0)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await createDebt(uid, {
        name: name.trim(),
        description: description.trim(),
        debtType,
        principalAmount: principal,
        currency: currency || ctx.base,
        priority,
        startDate: new Date(`${startDate}T00:00:00`),
        notes: notes.trim(),
        recurring:
          hasRecurring && Number(recurringAmount) > 0
            ? {
                amount: Number(recurringAmount),
                interval: recurringInterval,
                nextPaymentDate: new Date(`${recurringNextDate}T00:00:00`),
              }
            : null,
      });
      router.push(`/debts/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not create this debt.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push('/goals');
  }

  return {
    debtType,
    setDebtType,
    name,
    setName,
    description,
    setDescription,
    principalAmount,
    setPrincipalAmount,
    currency: currency || ctx.base,
    setCurrency,
    currencyOptions,
    priority,
    setPriority,
    startDate,
    setStartDate,
    notes,
    setNotes,
    hasRecurring,
    setHasRecurring,
    recurringAmount,
    setRecurringAmount,
    recurringInterval,
    setRecurringInterval,
    recurringNextDate,
    setRecurringNextDate,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: ctxLoading,
  };
}
