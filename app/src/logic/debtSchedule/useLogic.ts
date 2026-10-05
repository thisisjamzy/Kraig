'use client';

// Plan a repayment (src/screens/DebtForms/ScheduleFormScreen): one dated
// repayment on a debt, alongside or instead of a repeating plan. Date;
// Amount as "Set amount" or "Everything left" (the balance left on that
// date after every earlier repayment, shown as "Currently 250,000" and
// worked out again whenever the balance changes); Paid from; Automation;
// Note. The Impact card says what it plans; a set amount above the balance
// expected on that date warns and offers "Use everything left", and
// scheduled repayments adding up to more than what's owed warn by how
// much. Opened from a debt (its page, its "..." menu) or from Payments'
// New menu, where the debt is chosen first.

import { useMemo, useState } from 'react';
import { deleteScheduledRepayment, planLikeOf, saveScheduledRepayment, scheduledLikeOf } from '@/src/shared/firestore/debtSchedule';
import { useDebtLedger } from '@/src/shared/hooks/useDebtLedger';
import { useLogic as useDebtsList } from '@/src/logic/debtsList/useLogic';
import { balanceBefore, repaymentSchedule, scheduledImpact } from '@/src/viewmodels/debtSchedule';
import { formatMoney } from '@/src/widgets/Money/Money';
import { showToast } from '@/src/widgets/Toast/Toast';
import { paidFromKey, paidFromLabel, paidFromOf, useIncomeLines, type AutomationMode } from '@/src/logic/debtForm/planFields';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function useLogic(initialDebtId: string | null, scheduledId: string | null, onSaved: (debtId: string) => void) {
  const [debtId, setDebtId] = useState<string | null>(initialDebtId);
  const ledger = useDebtLedger(debtId ?? '');
  const { uid, debt, accounts } = ledger;
  const list = useDebtsList();
  const incomeLines = useIncomeLines();

  const [date, setDate] = useState(() => {
    const d = new Date();
    return isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 15));
  });
  const [amountMode, setAmountMode] = useState<'set' | 'everything'>('set');
  const [amount, setAmount] = useState('');
  const [paidFrom, setPaidFrom] = useState('');
  const [automation, setAutomation] = useState<AutomationMode>('off');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Editing: the stored repayment; new: the plan's own Paid from and automation.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = `${debtId ?? ''}:${scheduledId ?? ''}`;
  if (debt && debtId && seededFor !== seedKey) {
    setSeededFor(seedKey);
    const existing = debt.paymentPlan.scheduled?.find((s) => s.id === scheduledId);
    const recurring = debt.paymentPlan.type === 'recurring' ? debt.paymentPlan.recurring : undefined;
    if (existing) {
      setDate(isoDay(existing.date.toDate()));
      setAmountMode(existing.amountMode);
      setAmount(existing.amount != null ? String(existing.amount) : '');
      setPaidFrom(paidFromKey(existing.paidFrom));
      setAutomation(existing.automation);
      setNote(existing.note);
    } else {
      setPaidFrom(paidFromKey(recurring?.paidFrom ?? (debt.accountId ? { kind: 'account', accountId: debt.accountId } : null)));
      setAutomation(recurring?.automation ?? 'remind');
    }
  }

  const when = fromIso(date);
  const scheduled = useMemo(() => scheduledLikeOf(debt?.paymentPlan.scheduled), [debt]);
  const plan = useMemo(() => (debt ? planLikeOf(debt) : null), [debt]);
  const balance = debt?.currentBalance ?? 0;
  /** What's expected to be owed on that date, before this repayment. */
  const expected = useMemo(() => balanceBefore(balance, plan, scheduled, when, scheduledId), [balance, plan, scheduled, when, scheduledId]);
  const value = amountMode === 'everything' ? expected : Number(amount) || 0;
  const overBy = useMemo(() => {
    const others = scheduled.filter((s) => s.id !== scheduledId);
    const mine = { id: scheduledId ?? 'new', date: when, amountMode, amount: amountMode === 'set' ? value : null, recorded: false };
    return repaymentSchedule(balance, plan, [...others, mine]).overBy;
  }, [scheduled, scheduledId, when, amountMode, value, balance, plan]);

  const fromName = paidFromLabel(paidFrom, accounts, incomeLines);
  const impact = scheduledImpact({ amount: value, date: when, from: fromName, expected, overBy, everything: amountMode === 'everything' }, formatMoney);
  const recordOnly = debt?.debtType === 'existing' && !paidFrom;

  const valid = Boolean(debt) && Boolean(date) && (amountMode === 'everything' || value > 0);

  async function handleSave() {
    if (!uid || !debtId || saving || !valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveScheduledRepayment(
        uid,
        debtId,
        { id: scheduledId ?? undefined, date: when, amountMode, amount: amountMode === 'set' ? value : null, paidFrom: paidFromOf(paidFrom), automation, note: note.trim() },
        formatMoney
      );
      showToast(scheduledId ? 'Repayment updated' : 'Repayment planned');
      onSaved(debtId);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not save this repayment.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!uid || !debtId || !scheduledId || saving) return;
    setSaving(true);
    try {
      await deleteScheduledRepayment(uid, debtId, scheduledId);
      showToast('Repayment removed');
      onSaved(debtId);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not remove this repayment.');
      setSaving(false);
    }
  }

  return {
    debtId,
    setDebtId,
    debts: list.debts,
    debt,
    accounts,
    date,
    setDate,
    amountMode,
    setAmountMode,
    amount,
    setAmount,
    paidFrom,
    setPaidFrom,
    fromName,
    automation,
    setAutomation,
    note,
    setNote,
    expected,
    current: value,
    impact,
    recordOnly,
    useEverythingLeft: () => setAmountMode('everything'),
    editing: Boolean(scheduledId),
    valid,
    saving,
    saveError,
    handleSave,
    handleDelete,
    currency: debt?.currency ?? '',
    loading: debtId ? ledger.loading : list.loading,
    error: ledger.error,
  };
}
