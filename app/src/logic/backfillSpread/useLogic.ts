'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { unjustifiedWalletRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import {
  previewBackfillSpread,
  commitBackfillSpread,
  type BackfillOccurrence,
  type BackfillFrequency,
} from '@/src/shared/firestore/unaccountedBalance';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreAccount } from '@/src/shared/firestore/types';

export type BackfillType = 'expense' | 'income';
export type { BackfillFrequency };

export const BACKFILL_FREQUENCIES: BackfillFrequency[] = ['once', 'daily', 'weekdays', 'weekly', 'monthly', 'quarterly'];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx } = useCurrencyContext();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories(undefined);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<BackfillType>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amountString, setAmountString] = useState('');
  const [frequency, setFrequency] = useState<BackfillFrequency>('monthly');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [dayOfMonth, setDayOfMonth] = useState(1);

  const categoriesForType = categories.filter((c) => c.transactionType === (type === 'expense' ? 'Expense' : 'Income'));

  const unjustifiedRef = useMemo(() => (uid ? unjustifiedWalletRef(uid) : null), [uid]);
  const { data: unjustifiedWallet } = useFirestoreDoc<FirestoreAccount>(unjustifiedRef);
  const unjustifiedBalance = unjustifiedWallet?.currentBalance ?? 0;
  const canExplainUnjustifiedBalance = unjustifiedBalance !== 0 && (unjustifiedBalance > 0 ? type === 'expense' : type === 'income');
  const [explainsUnjustifiedBalance, setExplainsUnjustifiedBalance] = useState(false);

  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [occurrences, setOccurrences] = useState<BackfillOccurrence[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const amount = Number(amountString) || 0;
  const canPreview =
    title.trim().length > 0 &&
    categoryId.length > 0 &&
    accountId.length > 0 &&
    amount > 0 &&
    Boolean(startDate) &&
    (frequency === 'once' || (Boolean(endDate) && startDate <= endDate));

  function buildInput() {
    return {
      title: title.trim(),
      type: type === 'expense' ? 'Expense' : 'Income',
      categoryId,
      accountId,
      amount,
      direction: type === 'income' ? ('Inflow' as const) : ('Outflow' as const),
      frequency,
      startDate,
      endDate,
      dayOfWeek,
      dayOfMonth,
      createdBy: uid ?? '',
    };
  }

  function handlePreview() {
    setPreviewError(null);
    try {
      setOccurrences(previewBackfillSpread(buildInput()));
      setStep('preview');
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Could not preview this spread.');
    }
  }

  function backToEdit() {
    setStep('form');
    setCommitError(null);
  }

  async function handleConfirm() {
    if (!uid || committing) return;
    setCommitting(true);
    setCommitError(null);
    try {
      await commitBackfillSpread(buildInput(), canExplainUnjustifiedBalance && explainsUnjustifiedBalance, ctx);
      router.push('/settings/backfill/batches');
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Could not create this backfill spread.');
    } finally {
      setCommitting(false);
    }
  }

  const totalAmount = occurrences.reduce((sum, occ) => sum + occ.amount, 0);
  const accountName = accounts.find((a) => a.id === accountId)?.name ?? '';

  function goBack() {
    if (step === 'preview') {
      backToEdit();
      return;
    }
    router.push('/settings');
  }

  function openBatches() {
    router.push('/settings/backfill/batches');
  }

  return {
    title,
    setTitle,
    type,
    setType: (next: BackfillType) => {
      setType(next);
      setCategoryId('');
      setExplainsUnjustifiedBalance(false);
    },
    categoryId,
    setCategoryId,
    categoriesForType,
    accountId,
    setAccountId,
    accounts,
    amountString,
    setAmountString,
    frequency,
    setFrequency,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dayOfWeek,
    setDayOfWeek,
    dayOfMonth,
    setDayOfMonth,
    canExplainUnjustifiedBalance,
    explainsUnjustifiedBalance,
    setExplainsUnjustifiedBalance,
    unjustifiedBalance,
    currency: ctx.display,

    step,
    canPreview,
    handlePreview,
    previewError,
    occurrences,
    totalAmount,
    accountName,
    backToEdit,
    committing,
    commitError,
    handleConfirm,

    goBack,
    openBatches,
  };
}
