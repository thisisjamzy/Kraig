'use client';

// A debt's page (src/screens/DebtDetail): the debt with its repayments,
// linked transactions (the borrowing and each repayment, excluded ones
// behind "Show excluded") and activity log; the balance owed by month with
// the plan's projection; the callout sentence; and the page's actions.
// Forms open through useDebtForms (a side peek on wide screens, their own
// page on a phone).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { orderBy, query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { debtActivityRef } from '@/src/shared/firestore/refs';
import { deleteDebt, setDebtArchived, undoDebtChange, updateDebtDetails } from '@/src/shared/firestore/debtWrites';
import { useDebtLedger } from '@/src/shared/hooks/useDebtLedger';
import { useDebtForms } from '@/src/shared/navigation/useDebtForms';
import { round2 } from '@/src/shared/firestore/currency';
import { paidFromLabel, useIncomeLines, paidFromKey } from '@/src/logic/debtForm/planFields';
import { daysLate, debtStateSentence, nextPayment, planSentence, projectPayments, type PlanLike } from '@/src/viewmodels/debt';
import { formatMoney } from '@/src/widgets/Money/Money';
import { showToast } from '@/src/widgets/Toast/Toast';
import type { DebtPriority, FirestoreDebtActivity } from '@/src/shared/firestore/types';

export interface RepaymentRow {
  id: string;
  date: Date;
  amount: number;
  paidFrom: string;
  transactionId: string | null;
  linked: string;
  linkedExcluded: boolean;
  method: 'planned' | 'manual';
  note: string;
}

export interface LinkedRow {
  id: string;
  date: Date;
  role: 'Borrowing' | 'Repayment';
  name: string;
  amount: number;
  account: string;
  excluded: boolean;
  reason: string;
}

const monthLabel = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

export function useLogic(debtId: string) {
  const router = useRouter();
  const forms = useDebtForms();
  const ledger = useDebtLedger(debtId);
  const { uid, debt, repayments, linked, accounts } = ledger;
  const incomeLines = useIncomeLines();
  const { data: activity } = useFirestoreCollection<FirestoreDebtActivity>(
    useMemo(() => (uid ? query(debtActivityRef(uid, debtId), orderBy('at', 'desc')) : null), [uid, debtId])
  );
  const [showExcluded, setShowExcluded] = useState(false);
  const today = useMemo(() => new Date(), []);

  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const recurring = debt?.paymentPlan.type === 'recurring' ? debt.paymentPlan.recurring : undefined;
  const plan: PlanLike | null = recurring
    ? {
        amount: recurring.amount,
        interval: recurring.interval,
        nextPaymentDate: recurring.nextPaymentDate.toDate(),
        isActive: recurring.isActive,
        nextOverride: recurring.nextOverride ? { amount: recurring.nextOverride.amount, date: recurring.nextOverride.date.toDate() } : null,
      }
    : null;
  const balance = debt ? round2(debt.currentBalance) : 0;
  const next = nextPayment(plan);
  const late = next && balance > 0 ? daysLate(next.date, today) : 0;
  const percent = debt && debt.principalAmount > 0 ? Math.min(1, debt.totalRepaid / debt.principalAmount) : 0;
  const paidFrom = recurring ? paidFromLabel(paidFromKey(recurring.paidFrom), accounts, incomeLines) : null;
  const borrowing = ledger.walletState?.borrowing ?? null;

  const txById = useMemo(() => new Map(linked.map((t) => [t.id, t])), [linked]);

  const repaymentRows = useMemo<RepaymentRow[]>(
    () =>
      repayments.map((r) => {
        const tx = r.transactionId ? txById.get(r.transactionId) : undefined;
        return {
          id: r.id,
          date: r.date.toDate(),
          amount: r.amount,
          paidFrom: tx && !tx.excluded ? (accountName.get(tx.accountId) ?? 'An account') : 'Not from my accounts',
          transactionId: r.transactionId,
          linked: tx ? (tx.excluded ? 'Excluded' : tx.description || 'Transaction') : 'None',
          linkedExcluded: Boolean(tx?.excluded),
          method: r.method,
          note: r.notes ?? '',
        };
      }),
    [repayments, txById, accountName]
  );

  const allLinked = useMemo<LinkedRow[]>(
    () =>
      linked
        .map((t) => ({
          id: t.id,
          date: t.date.toDate(),
          role: (t.isDebtRepayment ? 'Repayment' : 'Borrowing') as LinkedRow['role'],
          name: t.description,
          amount: t.direction === 'Inflow' ? t.amount : -t.amount,
          account: accountName.get(t.accountId) ?? '',
          excluded: Boolean(t.excluded),
          reason: t.excludedReason ?? '',
        }))
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [linked, accountName]
  );
  const linkedRows = showExcluded ? allLinked : allLinked.filter((r) => !r.excluded);
  const excludedCount = allLinked.filter((r) => r.excluded).length;

  // "Is this debt going down?": what was owed at the end of each month
  // since it started, then the plan's projection, dashed.
  const trend = useMemo(() => {
    if (!debt) return [];
    const start = debt.startDate.toDate();
    const points: { label: string; owed: number | null; projected: number | null }[] = [];
    for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= today; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59);
      const repaid = repayments.filter((r) => r.date.toDate() <= end).reduce((s, r) => s + r.amount, 0);
      points.push({ label: monthLabel(m), owed: Math.max(0, round2(debt.principalAmount - repaid)), projected: null });
    }
    const payments = projectPayments(balance, plan);
    if (payments.length && points.length) {
      points[points.length - 1].projected = points[points.length - 1].owed;
      const byMonth = new Map<string, number>();
      for (const p of payments) byMonth.set(monthLabel(p.date), p.balance);
      for (const [label, owed] of byMonth) {
        const existing = points.find((p) => p.label === label);
        if (existing) existing.projected = owed;
        else points.push({ label, owed: null, projected: owed });
      }
    }
    return points;
    // `plan` is rebuilt from `recurring` each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debt, repayments, balance, recurring, today]);

  const sentence = debt ? debtStateSentence(balance, plan, today, formatMoney) : '';
  const latestUndoable = activity.find((a) => a.id === debt?.lastChangeId && a.plan && !a.undoneAt) ?? null;

  async function guard(run: () => Promise<unknown>, fallback: string) {
    try {
      await run();
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : fallback);
    }
  }

  return {
    debt,
    loading: ledger.loading,
    error: ledger.error,
    currency: debt?.currency || ledger.ctx.base,
    balance,
    percent,
    next,
    late,
    plan,
    planText: planSentence(plan, paidFrom, formatMoney),
    receivedInto: debt?.accountId ? (accountName.get(debt.accountId) ?? 'An account') : null,
    borrowedOn: borrowing && !borrowing.excluded ? borrowing.date : (debt?.startDate.toDate() ?? null),
    sentence,
    trend,
    repaymentRows,
    linkedRows,
    excludedCount,
    showExcluded,
    setShowExcluded,
    activity,
    latestUndoable,
    openForm: forms.open,
    formHref: forms.hrefFor,
    async undo(entryId: string) {
      if (!uid) return;
      await guard(async () => {
        await undoDebtChange(uid, debtId, entryId);
        showToast('Change undone');
      }, 'Could not undo that.');
    },
    async setPriority(priority: DebtPriority) {
      if (uid) await updateDebtDetails(uid, debtId, { priority });
    },
    async setLender(lender: string) {
      if (uid) await updateDebtDetails(uid, debtId, { lender: lender.trim() });
    },
    async saveNotes(notes: string) {
      if (uid) await updateDebtDetails(uid, debtId, { notes });
    },
    async archive() {
      if (!uid) return;
      await guard(async () => {
        await setDebtArchived(uid, debtId, true);
        showToast(`${debt?.name ?? 'Debt'} archived`);
        router.replace('/debts');
      }, 'Could not archive this debt.');
    },
    async remove() {
      if (!uid) return;
      await guard(async () => {
        await deleteDebt(uid, debtId, ledger.ctx);
        showToast(`${debt?.name ?? 'Debt'} deleted`);
        router.replace('/debts');
      }, 'Could not delete this debt.');
    },
    canDelete: repayments.length === 0,
  };
}
