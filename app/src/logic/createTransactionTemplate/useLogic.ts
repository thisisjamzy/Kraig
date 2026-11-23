'use client';

// One screen for both creating and editing a transaction template — same
// "one hook, seed on load" shape as src/logic/taskEdit/useLogic.ts. A
// template never touches the ledger itself (no aggregation.ts write); it's
// a plain setDoc/deleteDoc against transactionTemplates/{id}, applied later
// by src/logic/addTransaction/useLogic.ts's own ?templateId= prefill.

import { useEffect, useMemo, useState } from 'react';
import { setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transactionRef, transactionTemplateRef, transferRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import type { FirestoreTransaction, FirestoreTransactionTemplate, FirestoreTransfer, TemplateRepeat, TransactionTemplateType } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { useFormFinish } from '@/src/shared/navigation/formPeekContext';

export type TemplateSavingsMode = 'moved' | 'frozen';
export const TEMPLATE_TYPES: TransactionTemplateType[] = ['expense', 'income', 'transfer', 'savings'];

const CATEGORY_TYPE: Record<'expense' | 'income' | 'savings', 'Expense' | 'Income' | 'Savings'> = {
  expense: 'Expense',
  income: 'Income',
  savings: 'Savings',
};

export function useLogic(templateId?: string) {
  const finish = useFormFinish();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const docRef = useMemo(
    () => (uid && templateId ? transactionTemplateRef(uid, templateId) : null),
    [uid, templateId]
  );
  const { data: original, loading: docLoading, error: docError } =
    useFirestoreDoc<FirestoreTransactionTemplate>(docRef);

  // "Save as template" on a transaction's detail: ?fromTransaction= or
  // ?fromTransfer= fills a new template from that entry, basket included.
  const [source] = useState(() => {
    if (templateId || typeof window === 'undefined') return null;
    const sp = new URLSearchParams(window.location.search);
    const tx = sp.get('fromTransaction');
    const tr = sp.get('fromTransfer');
    return tx ? { kind: 'tx' as const, id: tx } : tr ? { kind: 'transfer' as const, id: tr } : null;
  });
  const { data: sourceTx } = useFirestoreDoc<FirestoreTransaction>(
    useMemo(() => (uid && source?.kind === 'tx' ? transactionRef(uid, source.id) : null), [uid, source])
  );
  const { data: sourceTransfer } = useFirestoreDoc<FirestoreTransfer>(
    useMemo(() => (uid && source?.kind === 'transfer' ? transferRef(uid, source.id) : null), [uid, source])
  );
  const [prefill, setPrefill] = useState<{ basketId: string | null; basketItemId: string | null } | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionTemplateType>('expense');
  const [savingsMode, setSavingsMode] = useState<TemplateSavingsMode>('moved');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amountString, setAmountString] = useState('');
  const [chargesString, setChargesString] = useState('');
  const [description, setDescription] = useState('');
  const [repeat, setRepeatState] = useState<TemplateRepeat>('none');
  const [repeatDay, setRepeatDay] = useState<number | null>(null);
  const [remind, setRemind] = useState(false);
  function setRepeat(next: TemplateRepeat) {
    setRepeatState(next);
    const now = new Date();
    setRepeatDay(next === 'weekly' ? ((now.getDay() + 6) % 7) + 1 : next === 'monthly' ? now.getDate() : null);
  }
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
  // Filled once from the entry, when it loads (adjusted during render).
  if (!prefill && !seededFor && (sourceTx || sourceTransfer)) {
    if (sourceTx) {
      const t = sourceTx.type === 'Income' ? 'income' : sourceTx.type === 'Savings' ? 'savings' : 'expense';
      setType(t);
      if (t === 'savings') setSavingsMode('frozen');
      setCategoryId(sourceTx.categoryId ?? '');
      setDescription(sourceTx.description ?? '');
      setName(sourceTx.description ?? '');
      setAmountString(String(sourceTx.amount));
      setAccountId(sourceTx.accountId ?? '');
      setPrefill({ basketId: sourceTx.bucketItem?.bucketId ?? null, basketItemId: sourceTx.bucketItem?.itemId ?? null });
    } else if (sourceTransfer) {
      setType('transfer');
      setCategoryId(sourceTransfer.kind ?? '');
      setDescription(sourceTransfer.description ?? '');
      setName(sourceTransfer.description ?? '');
      setAmountString(String(sourceTransfer.amount));
      setAccountId(sourceTransfer.fromAccountId);
      setToAccountId(sourceTransfer.toAccountId ?? '');
      setChargesString(sourceTransfer.charges ? String(sourceTransfer.charges) : '');
      setPrefill({ basketId: sourceTransfer.bucketItem?.bucketId ?? null, basketItemId: sourceTransfer.bucketItem?.itemId ?? null });
    }
  }

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
    setRepeatState(original.repeat ?? 'none');
    setRepeatDay(original.repeatDay ?? null);
    setRemind(Boolean(original.remind));
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
        basketId: original?.basketId ?? prefill?.basketId ?? null,
        basketItemId: original?.basketItemId ?? prefill?.basketItemId ?? null,
        repeat,
        repeatDay: repeat === 'weekly' || repeat === 'monthly' ? (repeatDay ?? 1) : null,
        remind: repeat !== 'none' && remind,
        lastUsedAt: original?.lastUsedAt ?? null,
        lastSkippedOn: original?.lastSkippedOn ?? null,
        archived: original?.archived ?? false,
        createdAt: original?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      finish('/transaction-templates');
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
      finish('/transaction-templates');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this template.');
      setDeleting(false);
    }
  }

  // Back to the page the user came from (skipping forms); '/transaction-templates' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/transaction-templates');
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
    repeat,
    setRepeat,
    repeatDay,
    setRepeatDay,
    remind,
    setRemind,
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
