'use client';

// Editing (or deleting) an existing Expense/Income/Savings transaction —
// reachable from the top-right edit icon on each row in Transaction History
// (src/screens/TransactionHistory). Every field is editable, including
// type/direction (an Expense CAN become an Income here — direction is
// derived from the selected type, same convention
// src/logic/addTransaction/useLogic.ts uses), all applied through
// updateTransactionWithAggregation's reverse-then-apply path
// (src/shared/firestore/aggregation.ts) so account balances and stats* end
// up exactly where a fresh, correct transaction with the new values would
// have left them. Delete goes through deleteTransactionWithAggregation, the
// same reversal half without a new contribution applied after.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transactionRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { updateTransactionWithAggregation, deleteTransactionWithAggregation } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import type { FirestoreTransaction } from '@/src/shared/firestore/types';

export type EditableTransactionType = 'Expense' | 'Income' | 'Savings';
export const TRANSACTION_TYPES: EditableTransactionType[] = ['Expense', 'Income', 'Savings'];

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
  // A Savings Account can never fund a direct Expense — same rule
  // src/logic/addTransaction/useLogic.ts enforces, with the same escape
  // hatch: a transaction already recorded against one stays selectable
  // rather than silently dropping out from under an in-progress edit.
  const spendableAccounts = accounts.filter(
    (account) => !isSavingsAccount(account) || account.id === original?.accountId
  );

  const [description, setDescription] = useState('');
  const [type, setTypeState] = useState<EditableTransactionType>('Expense');
  const [categoryId, setCategoryId] = useState('');
  const [amountString, setAmountString] = useState('');
  const [accountId, setAccountId] = useState('');
  const [dateValue, setDateValue] = useState('');
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Categories are type-specific — reflow the list off whatever type is
  // CURRENTLY SELECTED in the form, not the transaction's original type, so
  // switching type here actually shows the right category options.
  const { data: categories, loading: categoriesLoading } = useCategories(type);

  // Switching type mid-edit invalidates whatever category was picked (it
  // belongs to the old type's list) — setType is the only way the form
  // itself changes type, so clearing categoryId here can't also fire during
  // the initial seed below (that sets categoryId directly, after setType).
  // Switching TO Expense also drops the selected account if it's a Savings
  // Account (unless it's the transaction's own original account, still
  // protected by the same escape hatch spendableAccounts uses) — a Savings
  // Account can never fund a direct Expense.
  function setType(nextType: EditableTransactionType) {
    setTypeState(nextType);
    setCategoryId('');
    if (nextType === 'Expense') {
      setAccountId((current) => {
        const account = accounts.find((a) => a.id === current);
        if (!account || !isSavingsAccount(account) || current === original?.accountId) return current;
        return spendableAccounts[0]?.id ?? '';
      });
    }
  }

  const { ctx } = useCurrencyContext();

  // Seeds the form once the original transaction loads — keyed on its id so
  // it re-seeds correctly if this screen instance ever gets reused for a
  // different transaction, without clobbering fields the user is actively
  // editing on every re-render.
  useEffect(() => {
    if (!original || seededFor === transactionId) return;
    setDescription(original.description);
    setTypeState((original.type as EditableTransactionType) || 'Expense');
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
          type,
          description,
          accountId,
          categoryId,
          amount: Number(amountString),
          direction: type === 'Income' ? 'Inflow' : 'Outflow',
        },
        ctx
      );
      router.push('/transactions');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not save changes.');
      setSubmitting(false);
    }
  }

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openDeleteConfirm() {
    setDeleteError(null);
    setDeleteConfirmOpen(true);
  }

  function cancelDelete() {
    setDeleteConfirmOpen(false);
  }

  async function confirmDelete() {
    if (!uid || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTransactionWithAggregation(uid, transactionId, ctx);
      router.push('/transactions');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this transaction.');
      setDeleting(false);
    }
  }

  function goBack() {
    router.push('/transactions');
  }

  const canSave = categoryId.length > 0 && accountId.length > 0 && Number(amountString) > 0 && !submitting;

  return {
    description,
    setDescription,
    type,
    setType,
    types: TRANSACTION_TYPES,
    categoryId,
    setCategoryId,
    categories,
    amountString,
    setAmountString,
    accountId,
    setAccountId,
    accounts,
    spendableAccounts,
    dateValue,
    setDateValue,
    canSave,
    submitting,
    submitError,
    handleSave,
    goBack,
    loading: docLoading || accountsLoading || categoriesLoading,
    error: docError,
    notFound: !docLoading && !docError && !original,

    deleteConfirmOpen,
    openDeleteConfirm,
    cancelDelete,
    confirmDelete,
    deleting,
    deleteError,
  };
}
