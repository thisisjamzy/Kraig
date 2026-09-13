'use client';

// The template list — reached from Add Transaction's own "Use a template"
// entry point and from Settings. Tapping a row applies it (routes to
// /add-transaction?templateId=..., see src/logic/addTransaction/useLogic.ts's
// own prefill effect); the edit icon opens src/screens/CreateTransactionTemplate
// instead. Deleting a template never touches the ledger — it was never
// written there in the first place.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteDoc, orderBy, query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { transactionTemplateRef, transactionTemplatesRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreTransactionTemplate } from '@/src/shared/firestore/types';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const templatesQuery = useMemo(
    () => (uid ? query(transactionTemplatesRef(uid), orderBy('name')) : null),
    [uid]
  );
  const { data: templates, loading: templatesLoading, error } = useFirestoreCollection<FirestoreTransactionTemplate>(templatesQuery);

  // Every category, unfiltered by type — just for resolving a template's
  // own categoryId back to a display name (a transfer/savings-moved
  // template's categoryId is already a display string, see
  // FirestoreTransactionTemplate's own header, so this map only ever gets
  // consulted for the other three types).
  const { data: categories, loading: categoriesLoading } = useCategories();
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const accountNameById = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);

  function categoryLabel(template: FirestoreTransactionTemplate) {
    if (template.type === 'transfer' || template.savingsMode === 'moved') return template.categoryId;
    return categoryNameById.get(template.categoryId) ?? template.categoryId;
  }

  function accountLabel(template: FirestoreTransactionTemplate) {
    const from = template.accountId ? accountNameById.get(template.accountId) ?? template.accountId : null;
    const to = template.toAccountId ? accountNameById.get(template.toAccountId) ?? template.toAccountId : null;
    if (from && to) return `${from} → ${to}`;
    return from ?? '';
  }

  function applyTemplate(id: string) {
    router.push(`/add-transaction?templateId=${id}`);
  }

  function openNewTemplate() {
    router.push('/transaction-templates/new');
  }

  function openEditTemplate(id: string) {
    router.push(`/transaction-templates/${id}/edit`);
  }

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function requestDelete(id: string) {
    setDeleteError(null);
    setPendingDeleteId(id);
  }
  function cancelDelete() {
    setPendingDeleteId(null);
  }
  async function confirmDelete() {
    if (!uid || !pendingDeleteId || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDoc(transactionTemplateRef(uid, pendingDeleteId));
      setPendingDeleteId(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this template.');
    } finally {
      setDeleting(false);
    }
  }

  // Reachable from both Add Transaction and Settings — router.back() returns
  // to whichever one actually launched it, rather than a fixed destination.
  function goBack() {
    router.back();
  }

  return {
    templates,
    categoryLabel,
    accountLabel,
    applyTemplate,
    openNewTemplate,
    openEditTemplate,
    goBack,
    loading: templatesLoading || categoriesLoading || accountsLoading,
    error,

    pendingDeleteId,
    requestDelete,
    cancelDelete,
    confirmDelete,
    deleting,
    deleteError,
  };
}
