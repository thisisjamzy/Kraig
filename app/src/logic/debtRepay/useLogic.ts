'use client';

// Record repayment (src/screens/DebtForms/RepaymentFormScreen). Amount
// (prefilled from the plan's next payment, or the link's `amount`), date
// (today), paid from (required for a cash debt and prefilled from the plan;
// a toggle for record only), method (Planned when it matches the plan,
// otherwise Manual; the household can change it) and a note. The Impact
// card says what's owed after and what leaves which account. Paying more
// than is owed only warns; an account without the money blocks the save.

import { useMemo, useState } from 'react';
import { recordRepayment } from '@/src/shared/firestore/aggregation';
import { useDebtLedger } from '@/src/shared/hooks/useDebtLedger';
import { nextPayment, repaymentImpact } from '@/src/viewmodels/debt';
import { formatMoney } from '@/src/widgets/Money/Money';
import { showToast } from '@/src/widgets/Toast/Toast';
import { round2 } from '@/src/shared/firestore/currency';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function useLogic(debtId: string, prefillAmount: string | null, onSaved: (debtId: string) => void) {
  const ledger = useDebtLedger(debtId);
  const { uid, debt, accounts, ctx } = ledger;
  const isCash = debt?.debtType === 'cash';
  const recurring = debt?.paymentPlan.type === 'recurring' ? debt.paymentPlan.recurring : undefined;
  const next = recurring
    ? nextPayment({
        amount: recurring.amount,
        interval: recurring.interval,
        nextPaymentDate: recurring.nextPaymentDate.toDate(),
        isActive: recurring.isActive,
        nextOverride: recurring.nextOverride ? { amount: recurring.nextOverride.amount, date: recurring.nextOverride.date.toDate() } : null,
      })
    : null;

  const [amountInput, setAmount] = useState<string | null>(null);
  const [date, setDate] = useState(isoDay(new Date()));
  const [fromAccount, setFromAccount] = useState<boolean | null>(null);
  const [accountChoice, setAccountChoice] = useState('');
  const [methodChoice, setMethodChoice] = useState<'planned' | 'manual' | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Prefilled until edited: the link's amount, else the plan's next payment.
  const amount = amountInput ?? prefillAmount ?? (next ? String(next.amount) : '');
  const amountValue = Number(amount);
  // Paid from: the plan's account, else the account it was received into.
  const planAccount = recurring?.paidFrom?.kind === 'account' ? recurring.paidFrom.accountId : null;
  const accountId = accountChoice || planAccount || debt?.accountId || accounts[0]?.id || '';
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const useAccount = isCash || (fromAccount ?? false);
  const autoMethod = next && Math.abs(amountValue - next.amount) < 0.005 ? 'planned' : 'manual';
  const method = methodChoice ?? autoMethod;
  const balance = debt?.currentBalance ?? 0;

  const impact = useMemo(() => repaymentImpact({ amount: amountValue, balance, accountName: useAccount ? (account?.name ?? null) : null }, formatMoney), [amountValue, balance, useAccount, account]);

  const available = account ? round2((account.currentBalance ?? 0) - (account.lockedAmount ?? 0)) : 0;
  const fundsError = useAccount && account && amountValue > available + 0.005 ? `${account.name} only has ${formatMoney(available)} available.` : null;
  const valid = amountValue > 0 && (!useAccount || Boolean(accountId)) && !fundsError;

  async function handleSave() {
    if (!uid || !debt || saving || !valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      await recordRepayment(
        uid,
        { id: debtId, name: debt.name, debtType: debt.debtType, principalAmount: debt.principalAmount, paymentPlan: debt.paymentPlan },
        { amount: amountValue, date: fromIso(date), notes: note.trim(), method, accountId: useAccount ? accountId : null, categoryId: null, checkFunds: true },
        ctx
      );
      showToast(amountValue >= balance - 0.005 ? `${debt.name} is paid off` : 'Repayment recorded');
      onSaved(debtId);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not record this repayment.');
      setSaving(false);
    }
  }

  return {
    debt,
    isCash,
    accounts,
    amount,
    setAmount,
    currency: debt?.currency || ctx.base,
    date,
    setDate,
    useAccount,
    fromAccount: fromAccount ?? false,
    setFromAccount,
    accountId,
    account,
    setAccountId: setAccountChoice,
    method,
    setMethod: setMethodChoice,
    note,
    setNote,
    impact,
    fundsError,
    valid,
    saving,
    saveError,
    handleSave,
    loading: ledger.loading,
    error: ledger.error,
  };
}
