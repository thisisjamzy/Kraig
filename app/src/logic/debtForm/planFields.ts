'use client';

// The payment plan's fields, shared by New debt / Edit debt and Edit
// payment plan: amount, every (week, 2 weeks, month, year), first payment,
// paid from (an account, any income, one income line, or savings: the same
// funding choices as other payments) and automation.

import { useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useBucketLineItemsByBucket } from '@/src/shared/hooks/useBucketLineItemsByBucket';
import type { DebtPaidFrom, FirestoreBucket, FirestoreDebtRecurringPlan } from '@/src/shared/firestore/types';
import type { PlanInterval } from '@/src/viewmodels/debt';

export const PLAN_INTERVALS: PlanInterval[] = ['weekly', 'biweekly', 'monthly', 'yearly'];
export const AUTOMATION_MODES = ['off', 'remind', 'prepare'] as const;
export type AutomationMode = (typeof AUTOMATION_MODES)[number];
export const AUTOMATION_LABEL: Record<AutomationMode, string> = { off: 'Off', remind: 'Remind me', prepare: 'Prepare for confirmation' };

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The picker's value: 'account:<id>', 'anyIncome', 'income:<bucketId>:<itemId>' or 'savings'. */
export function paidFromKey(p: DebtPaidFrom | null | undefined): string {
  if (!p) return '';
  if (p.kind === 'account') return `account:${p.accountId}`;
  if (p.kind === 'incomeLine') return `income:${p.bucketId}:${p.itemId}`;
  return p.kind;
}

export function paidFromOf(key: string): DebtPaidFrom | null {
  if (key.startsWith('account:')) return { kind: 'account', accountId: key.slice(8) };
  if (key.startsWith('income:')) {
    const [, bucketId, itemId] = key.split(':');
    return { kind: 'incomeLine', bucketId, itemId };
  }
  if (key === 'anyIncome') return { kind: 'anyIncome' };
  if (key === 'savings') return { kind: 'savings', accountId: null };
  return null;
}

/** Income lines (items of income buckets), for "Paid from". */
export function useIncomeLines() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: buckets } = useFirestoreCollection<FirestoreBucket>(
    useMemo(() => (uid ? query(bucketsRef(uid), where('archived', '==', false)) : null), [uid])
  );
  const income = useMemo(() => buckets.filter((b) => b.type === 'Income'), [buckets]);
  const { itemsByBucket } = useBucketLineItemsByBucket(income);
  return useMemo(
    () => income.flatMap((b) => (itemsByBucket[b.id] ?? []).map((item) => ({ bucketId: b.id, itemId: item.id, name: item.name }))),
    [income, itemsByBucket]
  );
}

/** "MTN Mobile Money", "Any income", "Salary (income)", "Savings". */
export function paidFromLabel(key: string, accounts: { id: string; name: string }[], incomeLines: { bucketId: string; itemId: string; name: string }[]): string | null {
  const p = paidFromOf(key);
  if (!p) return null;
  if (p.kind === 'account') return accounts.find((a) => a.id === p.accountId)?.name ?? 'An account';
  if (p.kind === 'incomeLine') return `${incomeLines.find((l) => l.itemId === p.itemId)?.name ?? 'An income line'} (income)`;
  if (p.kind === 'anyIncome') return 'Any income';
  return 'Savings';
}

export function usePlanFields() {
  const [hasPlan, setHasPlan] = useState(false);
  const [amount, setAmount] = useState('');
  const [interval, setInterval] = useState<PlanInterval>('monthly');
  const [firstPayment, setFirstPayment] = useState(isoDay(new Date()));
  const [paidFrom, setPaidFrom] = useState('');
  const [automation, setAutomation] = useState<AutomationMode>('off');

  function seed(plan: FirestoreDebtRecurringPlan | undefined | null) {
    setHasPlan(Boolean(plan?.isActive));
    if (!plan) return;
    setAmount(String(plan.amount));
    setInterval(plan.interval);
    setFirstPayment(isoDay(plan.nextPaymentDate.toDate()));
    setPaidFrom(paidFromKey(plan.paidFrom));
    setAutomation(plan.automation ?? 'off');
  }

  const valid = !hasPlan || Number(amount) > 0;

  return {
    hasPlan,
    setHasPlan,
    amount,
    setAmount,
    interval,
    setInterval,
    firstPayment,
    setFirstPayment,
    paidFrom,
    setPaidFrom,
    automation,
    setAutomation,
    seed,
    valid,
    /** The plan as debtWrites.updateDebtPlan / createDebt take it, or null for "No plan". */
    value: () =>
      hasPlan && Number(amount) > 0
        ? { amount: Number(amount), interval, firstPayment: fromIso(firstPayment), paidFrom: paidFromOf(paidFrom), automation }
        : null,
  };
}

export type PlanFields = ReturnType<typeof usePlanFields>;
