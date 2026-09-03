'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccounts, useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
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
  const { data: accounts, loading: accountsLoading } = useAccounts();

  const [debtType, setDebtType] = useState<DebtType>('cash');
  const [accountId, setAccountId] = useState('');
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

  // Default the wallet picker once accounts load — a page load, not a
  // click-to-open modal, so there's no explicit "open" moment to seed from
  // (same shape as debtRepay/useLogic.ts's own accountId default).
  useEffect(() => {
    if (accounts.length === 0) return;
    setAccountId((current) => current || accounts[0].id);
  }, [accounts]);

  const needsAccount = debtType === 'cash';

  async function handleSave() {
    if (!uid || saving) return;
    const principal = Number(principalAmount);
    if (!name.trim() || !(principal > 0)) return;
    if (needsAccount && !accountId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await createDebt(
        uid,
        {
          name: name.trim(),
          description: description.trim(),
          debtType,
          accountId: needsAccount ? accountId : null,
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
        },
        ctx
      );
      router.push(`/debts/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not create this debt.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push('/debts');
  }

  return {
    debtType,
    setDebtType,
    accounts,
    accountId,
    setAccountId,
    needsAccount,
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
    loading: ctxLoading || accountsLoading,
  };
}
