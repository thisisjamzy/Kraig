'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { createBucket } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { currencyName } from '@/src/viewmodels/currencies';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

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
  // What this bucket is planning for — decides which categories (or, for
  // Transfer, which account-to-account moves) its line items may use. Not
  // editable after creation (same as kind) — changing it would leave
  // already-created items pointed at categories the new type disallows.
  // ?type= (from a type tab's "New bucket") starts the form on that type.
  const [type, setType] = useState<'Expense' | 'Income' | 'Savings' | 'Transfer'>(() => {
    if (typeof window === 'undefined') return 'Expense';
    const wanted = new URLSearchParams(window.location.search).get('type');
    return wanted === 'Income' || wanted === 'Savings' || wanted === 'Transfer' ? wanted : 'Expense';
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    if (!uid || saving || !name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await createBucket(uid, {
        name: name.trim(),
        description: description.trim(),
        deadline: deadline ? new Date(`${deadline}T00:00:00`) : null,
        currency: currency || ctx.base,
        kind,
        type,
      });
      router.push(`/buckets/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not create this bucket.');
      setSaving(false);
    }
  }

  // Back to the page the user came from (skipping forms); '/buckets' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/buckets');
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
