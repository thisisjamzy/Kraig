'use client';

// Editing (or deleting) an existing transfer — reachable from the same
// Transaction History row a transaction edit is (src/screens/TransactionHistory
// routes a 'transfer' row here instead of edit-transaction, see that
// screen's editHref). Every field is editable (description, kind, amount,
// charges, both accounts, date), applied through
// updateTransferWithAggregation's reverse-then-apply path
// (src/shared/firestore/aggregation.ts) so both wallets' balances and
// perCategorySpend/perCategoryCount end up exactly where a fresh, correct
// transfer with the new values would have left them. Delete goes through
// deleteTransferWithAggregation, the same reversal half without a new
// contribution applied after. No currency-conversion context is needed
// here — transfers only ever move an account's own native-currency amount
// (see createTransferWithAggregation's own header).

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transferRef } from '@/src/shared/firestore/refs';
import { useAccounts } from '@/src/shared/firestore/queries';
import { updateTransferWithAggregation, deleteTransferWithAggregation } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import type { FirestoreTransfer } from '@/src/shared/firestore/types';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toIso(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function useLogic(transferId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const { data: original, loading: docLoading, error: docError } = useFirestoreDoc<FirestoreTransfer>(
    useMemo(() => (uid ? transferRef(uid, transferId) : null), [uid, transferId])
  );

  const { data: allAccounts, loading: accountsLoading } = useAccounts();
  // Either side of this transfer stays selectable even if it's since been
  // frozen (so the form doesn't silently drop it out from under an
  // in-progress edit) — aggregation.ts's own frozen check is still the real
  // enforcement point at save time. Same escape-hatch convention as
  // src/logic/editTransaction/useLogic.ts's own `accounts`.
  const accounts = allAccounts.filter(
    (account) => !account.frozen || account.id === original?.fromAccountId || account.id === original?.toAccountId
  );

  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<string>(TRANSFER_CATEGORIES[0]);
  const [amountString, setAmountString] = useState('');
  const [chargesString, setChargesString] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [dateValue, setDateValue] = useState('');
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Seeds the form once the original transfer loads — keyed on its id so it
  // re-seeds correctly if this screen instance ever gets reused for a
  // different transfer, without clobbering fields the user is actively
  // editing on every re-render.
  useEffect(() => {
    if (!original || seededFor === transferId) return;
    setDescription(original.description);
    setKind(original.kind);
    setAmountString(String(original.amount));
    setChargesString(original.charges ? String(original.charges) : '');
    setFromAccountId(original.fromAccountId);
    setToAccountId(original.toAccountId);
    setDateValue(toIso(original.date.toDate()));
    setSeededFor(transferId);
  }, [original, seededFor, transferId]);

  async function handleSave() {
    if (!original || !uid || submitting) return;
    if (!kind || !fromAccountId || !toAccountId || fromAccountId === toAccountId || Number(amountString) <= 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateTransferWithAggregation(uid, {
        id: transferId,
        date: new Date(`${dateValue}T00:00:00`),
        description,
        fromAccountId,
        toAccountId,
        amount: Number(amountString),
        charges: Number(chargesString) || 0,
        kind,
      });
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
      await deleteTransferWithAggregation(uid, transferId);
      router.push('/transactions');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this transfer.');
      setDeleting(false);
    }
  }

  function goBack() {
    router.push('/transactions');
  }

  const canSave =
    kind.length > 0 &&
    fromAccountId.length > 0 &&
    toAccountId.length > 0 &&
    fromAccountId !== toAccountId &&
    Number(amountString) > 0 &&
    !submitting;

  return {
    description,
    setDescription,
    kind,
    setKind,
    kinds: TRANSFER_CATEGORIES,
    amountString,
    setAmountString,
    chargesString,
    setChargesString,
    fromAccountId,
    setFromAccountId,
    toAccountId,
    setToAccountId,
    accounts,
    dateValue,
    setDateValue,
    sameAccount: fromAccountId.length > 0 && fromAccountId === toAccountId,
    canSave,
    submitting,
    submitError,
    handleSave,
    goBack,
    loading: docLoading || accountsLoading,
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
