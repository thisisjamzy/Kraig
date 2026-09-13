'use client';

// One screen for both creating and editing a transaction template — same
// "one hook, seed on load" shape as src/logic/taskEdit/useLogic.ts. A
// template never touches the ledger itself (no aggregation.ts write); it's
// a plain setDoc/deleteDoc against transactionTemplates/{id}, applied later
// by src/logic/addTransaction/useLogic.ts's own ?templateId= prefill.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transactionTemplateRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import type { FirestoreTransactionTemplate, TransactionTemplateType } from '@/src/shared/firestore/types';

export type TemplateSavingsMode = 'moved' | 'frozen';
export const TEMPLATE_TYPES: TransactionTemplateType[] = ['expense', 'income', 'transfer', 'savings'];

const CATEGORY_TYPE: Record<'expense' | 'income' | 'savings', 'Expense' | 'Income' | 'Savings'> = {
  expense: 'Expense',
  income: 'Income',
  savings: 'Savings',
};

export function useLogic(templateId?: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const docRef = useMemo(
    () => (uid && templateId ? transactionTemplateRef(uid, templateId) : null),
    [uid, templateId]
  );
  const { data: original, loading: docLoading, error: docError } =
    useFirestoreDoc<FirestoreTransactionTemplate>(docRef);

  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionTemplateType>('expense');
  const [savingsMode, setSavingsMode] = useState<TemplateSavingsMode>('moved');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amountString, setAmountString] = useState('');
  const [chargesString, setChargesString] = useState('');
  const [description, setDescription] = useState('');
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isTransfer = type === 'transfer';
  const isSavingsMoved = type === 'savings' && savingsMode === 'moved';
  // "Moved" savings behaves like a transfer everywhere the form branches on
  // needing a from/to pair instead of a single account — same convention
  // src/logic/addTransaction/useLogic.ts uses for its own isTransferLike.
  const isTransferLike = isTransfer || isSavingsMoved;

  const { data: allAccounts, loading: accountsLoading } = useAccounts();
  const accounts = allAccounts.filter((account) => !account.frozen);
  const spendableAccounts = accounts.filter((account) => !isSavingsAccount(account));

  const { data: fetchedCategories, loading: categoriesLoading } = useCategories(
    type === 'transfer' ? undefined : CATEGORY_TYPE[type]
  );
  const categoryOptions = isTransfer || isSavingsMoved ? TRANSFER_CATEGORIES.map((kind) => ({ id: kind, name: kind })) : fetchedCategories;

  // Switching type invalidates whatever category was picked (it belongs to
  // the old type's list) and resets the account fields that no longer
  // apply, same "type change clears downstream picks" convention
  // addTransaction/useLogic.ts's own selectType uses.
  function changeType(nextType: TransactionTemplateType) {
    setType(nextType);
    setSavingsMode('moved');
    setCategoryId(nextType === 'savings' ? 'Wallet to savings' : '');
    setChargesString('');
  }

  function changeSavingsMode(mode: TemplateSavingsMode) {
    setSavingsMode(mode);
    setCategoryId(mode === 'moved' ? 'Wallet to savings' : '');
  }

  // A Savings Account can never fund a direct Expense — same rule
  // src/logic/addTransaction/useLogic.ts enforces on its own fromAccountId.
  useEffect(() => {
    if (type !== 'expense') return;
    const current = accounts.find((account) => account.id === accountId);
    if (current && isSavingsAccount(current)) {
      setAccountId(spendableAccounts[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, accountId, accounts]);

  // Seeds the form once the original template loads — keyed on its id so it
  // re-seeds correctly if this screen instance is ever reused for a
  // different template, without clobbering fields the user is actively
  // editing on every re-render.
  useEffect(() => {
    if (!original || seededFor === templateId) return;
    setName(original.name);
    setType(original.type);
    setSavingsMode(original.savingsMode ?? 'moved');
    setCategoryId(original.categoryId);
    setDescription(original.description);
    setAmountString(original.amount != null ? String(original.amount) : '');
    setAccountId(original.accountId ?? '');
    setToAccountId(original.toAccountId ?? '');
    setChargesString(original.charges != null ? String(original.charges) : '');
    setSeededFor(templateId ?? null);
  }, [original, seededFor, templateId]);

  const canSave =
    name.trim().length > 0 &&
    categoryId.length > 0 &&
    accountId.length > 0 &&
    (!isTransferLike || (toAccountId.length > 0 && toAccountId !== accountId));

  async function handleSave() {
    if (!uid || saving || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = templateId ?? crypto.randomUUID();
      await setDoc(transactionTemplateRef(uid, id), {
        name: name.trim(),
        type,
        categoryId,
        description: description.trim(),
        amount: amountString ? Number(amountString) : null,
        accountId: accountId || null,
        toAccountId: isTransferLike ? toAccountId || null : null,
        charges: isTransfer && chargesString ? Number(chargesString) : null,
        savingsMode: type === 'savings' ? savingsMode : null,
        createdAt: original?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.push('/transaction-templates');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this template.');
      setSaving(false);
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
    if (!uid || !templateId || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDoc(transactionTemplateRef(uid, templateId));
      router.push('/transaction-templates');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this template.');
      setDeleting(false);
    }
  }

  function goBack() {
    router.push('/transaction-templates');
  }

  return {
    isEditing: Boolean(templateId),
    name,
    setName,
    type,
    setType: changeType,
    types: TEMPLATE_TYPES,
    savingsMode,
    setSavingsMode: changeSavingsMode,
    isTransferLike,
    isTransfer,
    categoryId,
    setCategoryId,
    categoryOptions,
    description,
    setDescription,
    amountString,
    setAmountString,
    chargesString,
    setChargesString,
    accountId,
    setAccountId,
    toAccountId,
    setToAccountId,
    accounts,
    spendableAccounts,
    canSave,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: docLoading || accountsLoading || categoriesLoading,
    error: docError,
    notFound: Boolean(templateId) && !docLoading && !docError && !original,

    deleteConfirmOpen,
    openDeleteConfirm,
    cancelDelete,
    confirmDelete,
    deleting,
    deleteError,
  };
}
