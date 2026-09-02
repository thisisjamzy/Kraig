'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { debtRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { recordRepayment } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreDebt } from '@/src/shared/firestore/types';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function useLogic(debtId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const debtDocRef = useMemo(() => (uid ? debtRef(uid, debtId) : null), [uid, debtId]);
  const { data: debt, loading: debtLoading, error: debtError } = useFirestoreDoc<FirestoreDebt>(debtDocRef);
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories('Expense');

  const isCash = debt?.debtType === 'cash';

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [linkAccount, setLinkAccount] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Default the account/category pickers once their options load — a page
  // load, not a click-to-open modal, so there's no explicit "open" moment
  // to seed from; run once per mount instead (same shape as
  // src/logic/editTransaction/useLogic.ts's seededFor guard).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || (accounts.length === 0 && categories.length === 0)) return;
    seeded.current = true;
    setAccountId((current) => current || accounts[0]?.id || '');
    setCategoryId((current) => current || categories[0]?.id || '');
  }, [accounts, categories]);

  const useAccount = isCash || linkAccount;

  async function handleSave() {
    if (!uid || !debt || saving) return;
    const amountValue = Number(amount);
    if (!(amountValue > 0)) return;
    if (useAccount && !accountId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await recordRepayment(
        uid,
        { id: debt.id, name: debt.name, debtType: debt.debtType, principalAmount: debt.principalAmount, paymentPlan: debt.paymentPlan },
        {
          amount: amountValue,
          date: new Date(`${date}T00:00:00`),
          notes: notes.trim(),
          method: 'manual',
          accountId: useAccount ? accountId : null,
          categoryId: useAccount ? categoryId || null : null,
        },
        ctx
      );
      router.push(`/debts/${debtId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not record this repayment.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push(`/debts/${debtId}`);
  }

  return {
    debt,
    isCash,
    accounts,
    categories,
    amount,
    setAmount,
    date,
    setDate,
    notes,
    setNotes,
    linkAccount,
    setLinkAccount,
    accountId,
    setAccountId,
    categoryId,
    setCategoryId,
    useAccount,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: ctxLoading || debtLoading || accountsLoading || categoriesLoading,
    error: debtError,
  };
}
