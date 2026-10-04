'use client';

// Edit payment plan (src/screens/DebtForms/PlanFormScreen): the plan's
// fields from New debt, and whether the change applies to this and future
// payments or only the next one. The Impact card says when the next
// payment is and when, at this plan, the debt is paid off; no balance
// moves until a payment is recorded.

import { useMemo, useState } from 'react';
import { updateDebtPlan } from '@/src/shared/firestore/debtWrites';
import { useDebtLedger } from '@/src/shared/hooks/useDebtLedger';
import { monthWord, projectPayments } from '@/src/viewmodels/debt';
import { formatMoney } from '@/src/widgets/Money/Money';
import { showToast } from '@/src/widgets/Toast/Toast';
import { paidFromLabel, useIncomeLines, usePlanFields } from '@/src/logic/debtForm/planFields';

export function useLogic(debtId: string, onSaved: (debtId: string) => void) {
  const ledger = useDebtLedger(debtId);
  const { uid, debt, accounts } = ledger;
  const plan = usePlanFields();
  const incomeLines = useIncomeLines();
  const [scope, setScope] = useState<'future' | 'next'>('future');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hadPlan = debt?.paymentPlan.type === 'recurring' && Boolean(debt.paymentPlan.recurring?.isActive);

  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (debt && seededFor !== debtId) {
    setSeededFor(debtId);
    plan.seed(debt.paymentPlan.type === 'recurring' ? debt.paymentPlan.recurring : null);
    if (debt.paymentPlan.type !== 'recurring') plan.setHasPlan(true);
  }

  const now = useMemo(() => new Date(), []);
  const value = plan.value();
  const impact = useMemo(() => {
    if (!value) return { lines: ['No payments are planned. Your balances don’t change.'], warnings: [] as string[] };
    const fromIso = value.firstPayment;
    const from = paidFromLabel(plan.paidFrom, accounts, incomeLines);
    const lines = [`Next payment: ${formatMoney(value.amount)} on ${fromIso.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${from ? `, from ${from}` : ''}.`];
    const balance = debt?.currentBalance ?? 0;
    if (scope === 'future') {
      const payments = projectPayments(balance, { ...value, nextPaymentDate: value.firstPayment, isActive: true });
      if (payments.length) lines.push(`At this plan it's paid off in ${monthWord(payments[payments.length - 1].date, now)}, after ${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}.`);
    } else {
      lines.push('After it, the plan carries on as before.');
    }
    lines.push('Your balances don’t change until a payment is recorded.');
    return { lines, warnings: fromIso < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? ['That date is in the past, so the payment shows as late.'] : [] };
  }, [value, plan.paidFrom, accounts, incomeLines, debt, scope, now]);

  const valid = plan.valid && (scope === 'future' || Boolean(value));

  async function handleSave() {
    if (!uid || saving || !valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateDebtPlan(uid, debtId, value, hadPlan ? scope : 'future', formatMoney);
      showToast(value ? 'Payment plan saved' : 'Payment plan removed');
      onSaved(debtId);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not save the payment plan.');
      setSaving(false);
    }
  }

  return { debt, accounts, plan, hadPlan, scope, setScope, impact, valid, saving, saveError, handleSave, loading: ledger.loading, error: ledger.error };
}
