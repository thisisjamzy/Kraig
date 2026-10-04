'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { debtRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCurrencyContext } from '@/src/shared/firestore/queries';
import { updateDoc, serverTimestamp } from 'firebase/firestore';
import { changeDebtWalletEffect, undoDebtChange, updateDebtDetails } from '@/src/shared/firestore/debtWrites';
import { formatMoney } from '@/src/widgets/Money/Money';
import { showToast } from '@/src/widgets/Toast/Toast';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { DebtPriority, FirestoreDebt } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function useLogic(debtId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const debtDocRef = useMemo(() => (uid ? debtRef(uid, debtId) : null), [uid, debtId]);
  const { data: debt, loading: debtLoading, error: debtError } = useFirestoreDoc<FirestoreDebt>(debtDocRef);
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [principal, setPrincipal] = useState('');
  const [priority, setPriority] = useState<DebtPriority>('medium');
  const [startDate, setStartDate] = useState(toIso(new Date()));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Page load, not a click-to-open modal — seed once the debt doc arrives
  // rather than at an explicit "open" moment. Guarded to fire only the
  // first time this debt's data shows up so it never clobbers what the
  // user is mid-typing on a later snapshot update (same shape as
  // src/logic/editTransaction/useLogic.ts's seededFor).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!debt || seededFor === debtId) return;
    setSeededFor(debtId);
    setName(debt.name);
    setDescription(debt.description);
    setAccountId(debt.accountId ?? '');
    setPrincipal(String(debt.principalAmount));
    setPriority(debt.priority);
    setStartDate(toIso(debt.startDate.toDate()));
    setNotes(debt.notes);
  }, [debt, seededFor, debtId]);

  // A 'cash' debt that never had a wallet linked can pick one here for the
  // first time (updateDebt then backfills the principal into it) — never
  // offered for an 'existing' debt (no wallet impact by definition) or a
  // 'cash' debt that's already linked (swapping wallets isn't what this is
  // for, and would double-credit the principal).
  const canBackfillAccount = debt?.debtType === 'cash' && !debt.accountId;

  useEffect(() => {
    if (!canBackfillAccount || accounts.length === 0) return;
    setAccountId((current) => current || accounts[0].id);
  }, [canBackfillAccount, accounts]);

  async function handleSave() {
    if (!uid || !debt || saving) return;
    const principalValue = Number(principal);
    if (!name.trim() || !(principalValue > 0)) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Amount, date and a first account move money: they go through the
      // shared wallet-effect writes (one transaction, undoable), like the
      // web form. The rest are plain detail edits.
      const change: { kind: 'edit'; amount?: number; accountId?: string; date?: Date } = { kind: 'edit' };
      if (principalValue !== debt.principalAmount) change.amount = principalValue;
      if (canBackfillAccount && accountId) change.accountId = accountId;
      const nextStart = new Date(`${startDate}T00:00:00`);
      if (toIso(nextStart) !== toIso(debt.startDate.toDate())) change.date = nextStart;
      let changeId: string | null = null;
      if (change.amount !== undefined || change.accountId || change.date) {
        const result = await changeDebtWalletEffect(uid, debtId, change, ctx, formatMoney);
        if (result.applied) changeId = result.changeId;
      }
      await updateDebtDetails(uid, debtId, { name: name.trim(), priority, notes: notes.trim() });
      if (description.trim() !== debt.description) await updateDoc(debtRef(uid, debtId), { description: description.trim(), updatedAt: serverTimestamp() });
      if (changeId) {
        const id = changeId;
        showToast('Debt saved', { duration: 10_000, action: { label: 'Undo', onClick: () => void undoDebtChange(uid, debtId, id).then(() => showToast('Change undone')).catch((e) => showToast(e instanceof Error ? e.message : 'Could not undo that.')) } });
      }
      router.push(`/debts/${debtId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update this debt.');
      setSaving(false);
    }
  }

  // Back to the page the user came from (skipping forms); `/debts/${debtId}` only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(`/debts/${debtId}`);
  }

  return {
    debt,
    name,
    setName,
    description,
    setDescription,
    accounts,
    accountId,
    setAccountId,
    canBackfillAccount,
    principal,
    setPrincipal,
    priority,
    setPriority,
    startDate,
    setStartDate,
    notes,
    setNotes,
    saving,
    saveError,
    handleSave,
    goBack,
    loading: debtLoading || accountsLoading || ctxLoading,
    error: debtError,
  };
}
