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
    saving,
    saveError,
    handleSave,
    goBack,
    loading: ctxLoading,
  };
}
