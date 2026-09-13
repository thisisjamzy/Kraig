'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { createGoal } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { currencyName } from '@/src/viewmodels/currencies';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();
  const { data: exchangeRates } = useExchangeRates();
  const currencyOptions = (exchangeRates.length > 0 ? exchangeRates.map((rate) => rate.id) : [ctx.base]).map(
    (code) => ({ code, name: currencyName(code) })
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [currency, setCurrency] = useState(ctx.base);
  const [kind, setKind] = useState<'Fixed' | 'Variable'>('Variable');
  // What this goal is planning for — decides which categories (or, for
  // Transfer, which account-to-account moves) its line items may use. Not
  // editable after creation (same as kind) — changing it would leave
  // already-created items pointed at categories the new type disallows.
  const [type, setType] = useState<'Expense' | 'Income' | 'Savings' | 'Transfer'>('Expense');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    if (!uid || saving || !name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await createGoal(uid, {
        name: name.trim(),
        description: description.trim(),
        deadline: deadline ? new Date(`${deadline}T00:00:00`) : null,
        currency: currency || ctx.base,
        kind,
        type,
      });
      router.push(`/goals/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not create this goal.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push('/goals');
  }

  return {
    name,
    setName,
    description,
    setDescription,
    deadline,
    setDeadline,
    currency: currency || ctx.base,
    setCurrency,
    currencyOptions,
    kind,
    setKind,
    type,
    setType,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: ctxLoading,
  };
}
