'use client';

// New debt and Edit debt — one form (src/screens/DebtForms/DebtFormScreen).
// Type (cash debt or record only), name, lender, amount, borrowed on and
// received into, priority, payment plan, notes; a live Impact card above
// the button.
//
// Editing: amount, date and account on a cash debt move money, so they go
// through the wallet-effect planner (one transaction, undoable for 10
// seconds); the preview is the planner's own. Switching Type opens the
// Change wallet effect form instead (onSwitchType), which asks what to do
// with past repayments before anything changes.

import { useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { createDebt } from '@/src/shared/firestore/aggregation';
import { changeDebtWalletEffect, undoDebtChange, updateDebtDetails, updateDebtPlan } from '@/src/shared/firestore/debtWrites';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { debtsRef } from '@/src/shared/firestore/refs';
import { planWalletChange, WalletChangeError, type DebtKind, type WalletChange } from '@/src/shared/debt/walletEffect';
import { useDebtLedger } from '@/src/shared/hooks/useDebtLedger';
import { newDebtImpact } from '@/src/viewmodels/debt';
import { formatMoney } from '@/src/widgets/Money/Money';
import { showToast } from '@/src/widgets/Toast/Toast';
import type { DebtPriority, FirestoreDebt } from '@/src/shared/firestore/types';
import { paidFromKey, usePlanFields } from './planFields';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const DEBT_PRIORITIES: DebtPriority[] = ['high', 'medium', 'low'];

export function useLogic(debtId: string | null, callbacks: { onSaved: (debtId: string) => void; onSwitchType: (to: DebtKind) => void }) {
  const isEditing = Boolean(debtId);
  const ledger = useDebtLedger(debtId);
  const { uid, debt, accounts, ctx, walletState } = ledger;

  const [debtType, setDebtType] = useState<DebtKind>('cash');
  const [name, setName] = useState('');
  const [lender, setLender] = useState('');
  const [amount, setAmount] = useState('');
  const [borrowedOn, setBorrowedOn] = useState(isoDay(new Date()));
  const [accountChoice, setAccountChoice] = useState('');
  const [priority, setPriority] = useState<DebtPriority>('medium');
  const [notes, setNotes] = useState('');
  const plan = usePlanFields();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit: fill the form once the debt arrives (adjusting state during
  // render, not in an effect), never again over what's being typed.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (debt && debtId && !ledger.loading && seededFor !== debtId) {
    setSeededFor(debtId);
    setDebtType(debt.debtType);
    setName(debt.name);
    setLender(debt.lender ?? '');
    setAmount(String(debt.principalAmount));
    setBorrowedOn(isoDay((walletState?.borrowing && !walletState.borrowing.excluded ? walletState.borrowing.date : debt.startDate.toDate())));
    setAccountChoice(debt.accountId ?? '');
    setPriority(debt.priority);
    setNotes(debt.notes ?? '');
    plan.seed(debt.paymentPlan.type === 'recurring' ? debt.paymentPlan.recurring : null);
  }

  // Received into: the choice, else the first account.
  const accountId = accountChoice || accounts[0]?.id || '';
  const accountName = accounts.find((a) => a.id === accountId)?.name ?? null;
  const isCash = debtType === 'cash';

  // Recent lenders, newest debts first, for the lender picker.
  const { data: allDebts } = useFirestoreCollection<FirestoreDebt>(useMemo(() => (uid ? query(debtsRef(uid), where('archivedAt', '==', null)) : null), [uid]));
  const recentLenders = useMemo(() => {
    const sorted = [...allDebts].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
    return [...new Set(sorted.map((d) => d.lender?.trim()).filter((l): l is string => Boolean(l)))].slice(0, 8);
  }, [allDebts]);

  const amountValue = Number(amount);
  const now = useMemo(() => new Date(), []);

  // What a save would change in balances and figures.
  const moneyEdit: WalletChange | null = useMemo(() => {
    if (!isEditing || !debt) return null;
    const change: { kind: 'edit'; amount?: number; accountId?: string; date?: Date } = { kind: 'edit' };
    if (amountValue > 0 && amountValue !== debt.principalAmount) change.amount = amountValue;
    if (debt.debtType === 'cash' && accountId && accountId !== debt.accountId) change.accountId = accountId;
    const currentDate = walletState?.borrowing && !walletState.borrowing.excluded ? walletState.borrowing.date : debt.startDate.toDate();
    if (borrowedOn !== isoDay(currentDate)) change.date = fromIso(borrowedOn);
    return change.amount !== undefined || change.accountId || change.date ? change : null;
  }, [isEditing, debt, amountValue, accountId, borrowedOn, walletState]);

  const impact = useMemo((): { lines: string[]; warnings: string[]; error: string | null } => {
    if (!isEditing) {
      const r = newDebtImpact({ cash: isCash, amount: amountValue, accountName, borrowedOn: fromIso(borrowedOn) }, now, formatMoney);
      return { ...r, error: null };
    }
    if (!moneyEdit || !walletState) return { lines: ['Your balances and figures don’t change.'], warnings: [], error: null };
    try {
      const p = planWalletChange(walletState, moneyEdit, ctx, now, () => 'preview', formatMoney);
      return { lines: p.lines, warnings: p.warnings, error: null };
    } catch (caught) {
      return { lines: [], warnings: [], error: caught instanceof WalletChangeError ? caught.message : 'Could not work out this change.' };
    }
  }, [isEditing, isCash, amountValue, accountName, borrowedOn, now, moneyEdit, walletState, ctx]);

  const valid = Boolean(name.trim()) && amountValue > 0 && (!isCash || Boolean(accountId)) && plan.valid && !impact.error;

  function chooseType(next: DebtKind) {
    // An existing debt switches through Change wallet effect, which asks
    // about past repayments and shows every change first.
    if (isEditing && debt && next !== debt.debtType) callbacks.onSwitchType(next);
    else setDebtType(next);
  }

  async function handleSave() {
    if (!uid || saving || !valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const planValue = plan.value();
      if (!isEditing) {
        const id = await createDebt(
          uid,
          {
            name: name.trim(),
            description: '',
            debtType,
            accountId: isCash ? accountId : null,
            principalAmount: amountValue,
            currency: ctx.base,
            priority,
            startDate: fromIso(borrowedOn),
            notes: notes.trim(),
            lender: lender.trim(),
            recurring: planValue
              ? { amount: planValue.amount, interval: planValue.interval, nextPaymentDate: planValue.firstPayment, paidFrom: planValue.paidFrom, automation: planValue.automation }
              : null,
          },
          ctx
        );
        showToast(`${name.trim()} added`);
        callbacks.onSaved(id);
        return;
      }
      if (!debt || !debtId) return;
      let changeId: string | null = null;
      if (moneyEdit) {
        const result = await changeDebtWalletEffect(uid, debtId, moneyEdit, ctx, formatMoney);
        if (result.applied) changeId = result.changeId;
      }
      await updateDebtDetails(uid, debtId, { name: name.trim(), lender: lender.trim(), priority, notes: notes.trim() });
      const current = debt.paymentPlan.type === 'recurring' ? debt.paymentPlan.recurring : undefined;
      const planChanged =
        Boolean(planValue) !== Boolean(current?.isActive) ||
        (planValue &&
          current &&
          (planValue.amount !== current.amount ||
            planValue.interval !== current.interval ||
            isoDay(planValue.firstPayment) !== isoDay(current.nextPaymentDate.toDate()) ||
            paidFromKey(planValue.paidFrom) !== paidFromKey(current.paidFrom) ||
            planValue.automation !== (current.automation ?? 'off')));
      if (planChanged) await updateDebtPlan(uid, debtId, planValue, 'future', formatMoney);
      if (changeId) {
        const id = changeId;
        showToast('Debt saved', { duration: 10_000, action: { label: 'Undo', onClick: () => void undoDebtChange(uid, debtId, id).then(() => showToast('Change undone')).catch((e) => showToast(e instanceof Error ? e.message : 'Could not undo that.')) } });
      } else {
        showToast('Debt saved');
      }
      callbacks.onSaved(debtId);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not save this debt.');
      setSaving(false);
    }
  }

  return {
    isEditing,
    debt,
    debtType,
    chooseType,
    name,
    setName,
    lender,
    setLender,
    recentLenders,
    amount,
    setAmount,
    currency: debt?.currency || ctx.base,
    borrowedOn,
    setBorrowedOn,
    accounts,
    accountId,
    accountName,
    setAccountId: setAccountChoice,
    isCash,
    priority,
    setPriority,
    notes,
    setNotes,
    plan,
    impact,
    valid,
    saving,
    saveError,
    handleSave,
    loading: ledger.loading,
    error: ledger.error,
  };
}
