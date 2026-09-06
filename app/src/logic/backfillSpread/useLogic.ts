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
  type BackfillSpreadInput,
} from '@/src/shared/firestore/unaccountedBalance';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreAccount } from '@/src/shared/firestore/types';

type TransferKind = (typeof TRANSFER_CATEGORIES)[number];

// Matches Add Transaction's own 4-way type step (src/logic/addTransaction) —
// 'savings' additionally splits into moved/frozen below, same as there.
export type BackfillType = 'expense' | 'income' | 'savings' | 'transfer';
export type SavingsMode = 'moved' | 'frozen';
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
  const [savingsMode, setSavingsModeState] = useState<SavingsMode>('moved');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  // Only meaningful for type === 'transfer' or savings+moved.
  const [toAccountId, setToAccountId] = useState('');
  const [transferKind, setTransferKind] = useState<TransferKind>(TRANSFER_CATEGORIES[0]);
  const [chargesString, setChargesString] = useState('');
  const [amountString, setAmountString] = useState('');
  const [frequency, setFrequency] = useState<BackfillFrequency>('monthly');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [dayOfMonth, setDayOfMonth] = useState(1);

  const isSavingsMoved = type === 'savings' && savingsMode === 'moved';
  const isSavingsFrozen = type === 'savings' && savingsMode === 'frozen';
  const isTransfer = type === 'transfer';
  // 'transfer' and 'moved' savings both write a real Transfer document — no
  // categorized envelope, and a different (from, to) account shape than a
  // plain transaction. See commitBackfillSpread's own kind: 'transfer'
  // branch in unaccountedBalance.ts.
  const isTransferLike = isTransfer || isSavingsMoved;

  const categoryTransactionType = type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : 'Savings';
  const categoriesForType = isTransferLike ? [] : categories.filter((c) => c.transactionType === categoryTransactionType);

  const unjustifiedRef = useMemo(() => (uid ? unjustifiedWalletRef(uid) : null), [uid]);
  const { data: unjustifiedWallet } = useFirestoreDoc<FirestoreAccount>(unjustifiedRef);
  const unjustifiedBalance = unjustifiedWallet?.currentBalance ?? 0;
  // Same mutual-exclusion rule as Add Transaction's own guard — only ever
  // true for a plain categorized expense/income entry, never for a transfer
  // (nothing to explain — no wallet gap crossed) or a Savings entry in
  // either mode (moved is itself a transfer; frozen never touches the
  // Unjustified wallet by design, see ExplainHistoricEntryInput's own doc
  // comment in unaccountedBalance.ts).
  const canExplainUnjustifiedBalance =
    unjustifiedBalance !== 0 && (unjustifiedBalance > 0 ? type === 'expense' : type === 'income');
  const [explainsUnjustifiedBalance, setExplainsUnjustifiedBalance] = useState(false);

  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [occurrences, setOccurrences] = useState<BackfillOccurrence[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const amount = Number(amountString) || 0;
  const datesValid = Boolean(startDate) && (frequency === 'once' || (Boolean(endDate) && startDate <= endDate));
  const canPreview =
    title.trim().length > 0 &&
    amount > 0 &&
    datesValid &&
    (isTransferLike
      ? accountId.length > 0 && toAccountId.length > 0 && toAccountId !== accountId
      : categoryId.length > 0 && accountId.length > 0);

  function buildInput(): BackfillSpreadInput {
    const common = {
      title: title.trim(),
      amount,
      frequency,
      startDate,
      endDate,
      dayOfWeek,
      dayOfMonth,
      createdBy: uid ?? '',
    };
    if (isTransferLike) {
      return {
        ...common,
        kind: 'transfer',
        fromAccountId: accountId,
        toAccountId,
        transferKind: isSavingsMoved ? 'Wallet to savings' : transferKind,
        charges: isSavingsMoved ? 0 : Number(chargesString) || 0,
      };
    }
    return {
      ...common,
      kind: 'transaction',
      type: type === 'income' ? 'Income' : type === 'savings' ? 'Savings' : 'Expense',
      categoryId,
      accountId,
      direction: type === 'income' ? 'Inflow' : 'Outflow',
      isFrozenSavings: isSavingsFrozen || undefined,
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
  const toAccountName = accounts.find((a) => a.id === toAccountId)?.name ?? '';

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

  function selectType(next: BackfillType) {
    setType(next);
    setSavingsModeState('moved');
    setCategoryId('');
    setExplainsUnjustifiedBalance(false);
  }

  function chooseSavingsMode(mode: SavingsMode) {
    setSavingsModeState(mode);
    setCategoryId('');
    setExplainsUnjustifiedBalance(false);
  }

  return {
    title,
    setTitle,
    type,
    setType: selectType,
    savingsMode,
    chooseSavingsMode,
    isTransferLike,
    isSavingsFrozen,
    categoryId,
    setCategoryId,
    categoriesForType,
    accountId,
    setAccountId,
    toAccountId,
    setToAccountId,
    transferKind,
    setTransferKind,
    transferKinds: TRANSFER_CATEGORIES,
    chargesString,
    setChargesString,
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
    toAccountName,
    backToEdit,
    committing,
    commitError,
    handleConfirm,

    goBack,
    openBatches,
  };
}
