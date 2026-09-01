'use client';

// Editing an existing Expense/Income/Savings transaction — reachable from
// the top-right edit icon on each row in Transaction History
// (src/screens/TransactionHistory). Type/direction stay fixed (an Expense
// stays an Expense); only description, category, amount, account, and date
// are editable, all applied through updateTransactionWithAggregation's
// reverse-then-apply path (src/shared/firestore/aggregation.ts) so account
// balances and stats* end up exactly where a fresh, correct transaction
// with the new values would have left them.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transactionRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { updateTransactionWithAggregation } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreTransaction } from '@/src/shared/firestore/types';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toIso(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function useLogic(transactionId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const { data: original, loading: docLoading, error: docError } = useFirestoreDoc<FirestoreTransaction>(
    useMemo(() => (uid ? transactionRef(uid, transactionId) : null), [uid, transactionId])
  );

  const { data: allAccounts, loading: accountsLoading } = useAccounts();
  // The account this transaction already used stays selectable even if it's
  // since been frozen (so the form doesn't silently drop it out from under
  // an in-progress edit) — aggregation.ts's own frozen check is still the
  // real enforcement point at save time.
  const accounts = allAccounts.filter((account) => !account.frozen || account.id === original?.accountId);
  const { data: categories, loading: categoriesLoading } = useCategories(
    original?.type as 'Expense' | 'Income' | 'Savings' | undefined
  );
  const { ctx } = useCurrencyContext();

  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amountString, setAmountString] = useState('');
  const [accountId, setAccountId] = useState('');
  const [dateValue, setDateValue] = useState('');
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Seeds the form once the original transaction loads — keyed on its id so
  // it re-seeds correctly if this screen instance ever gets reused for a
  // different transaction, without clobbering fields the user is actively
  // editing on every re-render.
  useEffect(() => {
    if (!original || seededFor === transactionId) return;
    setDescription(original.description);
    setCategoryId(original.categoryId ?? '');
    setAmountString(String(original.amount));
    setAccountId(original.accountId);
    setDateValue(toIso(original.date.toDate()));
    setSeededFor(transactionId);
  }, [original, seededFor, transactionId]);

  async function handleSave() {
    if (!original || !uid || submitting) return;
    if (!categoryId || !accountId || Number(amountString) <= 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateTransactionWithAggregation(
        uid,
        {
          id: transactionId,
          date: new Date(`${dateValue}T00:00:00`),
          type: original.type,
          description,
          accountId,
          categoryId,
          amount: Number(amountString),
          direction: original.direction,
        },
        ctx
      );
      router.push('/transactions');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not save changes.');
      setSubmitting(false);
    }
  }

  function goBack() {
    router.push('/transactions');
  }

  const canSave = categoryId.length > 0 && accountId.length > 0 && Number(amountString) > 0 && !submitting;

  return {
    description,
    setDescription,
    categoryId,
    setCategoryId,
    categories,
    amountString,
    setAmountString,
    accountId,
    setAccountId,
    accounts,
    dateValue,
    setDateValue,
    type: original?.type ?? '',
    canSave,
    submitting,
    submitError,
    handleSave,
    goBack,
    loading: docLoading || accountsLoading || categoriesLoading,
    error: docError,
    notFound: !docLoading && !docError && !original,
  };
}
