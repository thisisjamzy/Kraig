'use client';

// Planning > Payments: "what's coming and when?" — every scheduled payment
// in the month (bucket items with a due date, recurring ones once per
// occurrence), each upcoming, paid or overdue, on a calendar and in a list.
//
// Paid is read from the month budget: an item's occurrences count as paid
// in date order, as many as its linked spend this month covers (a Planned
// item closed in full counts as all paid). "Mark as paid" records the
// payment against this month's occurrence
// (aggregation.ts's recordBucketLineItemPayment).

import { useMemo, useState } from 'react';
import { recordBucketLineItemPayment } from '@/src/shared/firestore/aggregation';
import { useCategories } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import type { FirestoreCategory, Frequency } from '@/src/shared/firestore/types';
import type { PlanningData } from './useLogic';

export type PaymentStatus = 'upcoming' | 'paid' | 'overdue';

export interface MonthPayment {
  id: string;
  bucketId: string;
  bucketName: string;
  itemId: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  categoryType: 'Expense' | 'Income' | 'Savings' | 'Transfer';
  frequency: string;
  method: string;
  accountId: string | null;
  toAccountId: string | null;
  charges: number | null;
  /** This occurrence's planned amount. */
  amount: number;
  /** Paid toward it so far, and what's still to pay. */
  paid: number;
  remaining: number;
  due: Date;
  dueKey: string;
  status: PaymentStatus;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const UNIT: Record<string, [string, string]> = {
  Daily: ['day', 'days'],
  Weekly: ['week', 'weeks'],
  Monthly: ['month', 'months'],
  Quarterly: ['quarter', 'quarters'],
  Yearly: ['year', 'years'],
};

/** "Every week", "Every 2 months", "One-off". */
export function frequencyLabel(recurrence: { frequency: Frequency; interval?: number } | null | undefined): string {
  if (!recurrence || recurrence.frequency === 'Once') return 'One-off';
  const unit = UNIT[recurrence.frequency];
  if (!unit) return recurrence.frequency;
  const n = recurrence.interval ?? 1;
  return n === 1 ? `Every ${unit[0]}` : `Every ${n} ${unit[1]}`;
}

/**
 * Every scheduled payment in the month, with its status: one row per
 * occurrence of each Payment item (allowances and set asides are never
 * "due", so they never show here). Read from the month's derived lines, so
 * the cadence (a weekly payment has four or five dates), month-only edits
 * and skips all apply. Money recorded pays occurrences in date order; one
 * paid in part shows "40,000 of 160,000 paid" and stays due.
 */
export function monthPayments(
  month: string,
  data: Pick<PlanningData, 'budget' | 'buckets' | 'itemsByBucket' | 'accounts' | 'ctx'>,
  categories: FirestoreCategory[]
): MonthPayment[] {
  const { budget, accounts } = data;
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const category = new Map(categories.map((c) => [c.id, c]));
  const out: MonthPayment[] = [];
  for (const entry of budget.items) {
    if (entry.type === 'Income' || entry.itemKind !== 'payment' || !entry.dueDates.length) continue;
    const dates = entry.dueDates;
    const unit = entry.available / dates.length;
    let paidLeft = entry.closed ? entry.available : entry.actual;
    const cat = entry.categoryId ? category.get(entry.categoryId) : undefined;
    dates.forEach((due) => {
      const paidHere = Math.max(0, Math.min(unit, paidLeft));
      paidLeft -= paidHere;
      const paid = entry.closed || paidHere >= unit - 0.5;
      // An archived bucket keeps its payment history, but nothing more is due from it.
      if (entry.archived && !paid) return;
      out.push({
        id: `${entry.itemId}@${dayKey(due)}`,
        bucketId: entry.bucketId,
        bucketName: entry.bucketName,
        itemId: entry.itemId,
        name: entry.name || cat?.name || 'Payment',
        categoryId: entry.categoryId,
        categoryName: cat?.name ?? (entry.type === 'Transfer' ? (entry.categoryId ?? 'Transfer') : ''),
        categoryType: entry.type === 'Transfer' ? 'Transfer' : (cat?.transactionType ?? entry.type),
        frequency: entry.recurring ? frequencyLabel({ frequency: entry.frequency, interval: 1 }) : 'One-off',
        method: (entry.accountId && accountName.get(entry.accountId)) || 'No wallet set',
        accountId: entry.accountId,
        toAccountId: entry.toAccountId,
        charges: entry.fee || null,
        amount: Math.round(unit * 100) / 100,
        paid: Math.round(paidHere * 100) / 100,
        remaining: paid ? 0 : Math.round((unit - paidHere) * 100) / 100,
        due,
        dueKey: dayKey(due),
        status: paid ? 'paid' : due < todayStart ? 'overdue' : 'upcoming',
      });
    });
  }
  return out.sort((a, b) => a.due.getTime() - b.due.getTime() || a.name.localeCompare(b.name));
}

/**
 * The expense form for one payment occurrence, with what's still due
 * suggested (editable): the phone's "Pay" and "Mark as paid".
 */
export function payHref(payment: Pick<MonthPayment, 'bucketId' | 'itemId' | 'remaining' | 'amount' | 'due'>, month: string) {
  const amount = Math.round((payment.remaining || payment.amount) * 100) / 100;
  return `/add-transaction?bucketItem=${encodeURIComponent(`${payment.bucketId}:${payment.itemId}:${month}`)}&amount=${amount}`;
}

export function usePaymentsTab(month: string, data: PlanningData, bucketFilter: string | null = null) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { budget, buckets, itemsByBucket, accounts, ctx } = data;
  const { data: categories } = useCategories();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [paying, setPaying] = useState<MonthPayment | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  // What "Mark as paid" records: the remaining due amount, editable, so a
  // payment can be made in parts.
  const [payAmount, setPayAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payments = useMemo(
    () => monthPayments(month, data, categories),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month, buckets, itemsByBucket, accounts, categories, budget.itemsByKey, ctx]
  );

  // Up to 3 dots per day, by status.
  const dotsByDay = useMemo(() => {
    const map = new Map<string, PaymentStatus[]>();
    for (const p of payments) map.set(p.dueKey, [...(map.get(p.dueKey) ?? []), p.status]);
    return map;
  }, [payments]);

  const visible = selectedDay ? payments.filter((p) => p.dueKey === selectedDay) : payments;
  const open = visible.filter((p) => p.status !== 'paid');
  const paid = visible.filter((p) => p.status === 'paid');

  function pickDay(key: string) {
    setSelectedDay((current) => (current === key ? null : key));
  }

  // A Savings item pays into a savings account; everything else from a wallet.
  const payAccounts = accounts.filter((a) => (paying?.categoryType === 'Savings' ? isSavingsAccount(a) : !isSavingsAccount(a)));
  function startPaying(payment: MonthPayment) {
    setPaying(payment);
    const pool = accounts.filter((a) => (payment.categoryType === 'Savings' ? isSavingsAccount(a) : !isSavingsAccount(a)));
    setPayAccountId(payment.accountId ?? pool[0]?.id ?? '');
    setPayAmount(String(payment.remaining || payment.amount));
    setError(null);
  }
  // What's still due on the payment's whole line this month (every occurrence).
  function lineLeft(payment: MonthPayment) {
    const line = budget.itemsByKey.get(`${payment.itemId}@${month}`);
    return line ? Math.max(0, line.available - line.actual) : payment.remaining || payment.amount;
  }
  async function confirmPaid() {
    const amount = Number(payAmount);
    if (!uid || !paying || !payAccountId || busy || !(amount > 0)) return;
    setBusy(true);
    setError(null);
    try {
      await recordBucketLineItemPayment(
        uid,
        paying.bucketId,
        paying.itemId,
        amount,
        // Closes the item only when this clears everything still due on it
        // this month, never on one occurrence or a part payment.
        amount >= lineLeft(paying) - 0.5,
        {
          accountId: payAccountId,
          categoryId: paying.categoryId,
          date: new Date(),
          description: paying.name,
          categoryType: paying.categoryType,
          toAccountId: paying.toAccountId,
          charges: paying.charges,
          occurrenceMonth: month,
        },
        ctx
      );
      setPaying(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record this payment.');
    } finally {
      setBusy(false);
    }
  }

  return {
    currency: ctx.display,
    payments,
    bucketName: bucketFilter ? (data.buckets.find((b) => b.id === bucketFilter)?.name ?? 'Basket') : null,
    dotsByDay,
    selectedDay,
    pickDay,
    clearDay: () => setSelectedDay(null),
    open,
    paid,
    paying,
    startPaying,
    cancelPaying: () => setPaying(null),
    payAccountId,
    setPayAccountId,
    payAmount,
    setPayAmount: (value: string) => setPayAmount(value.replace(/[^0-9.]/g, '')),
    payHref,
    accounts: payAccounts,
    confirmPaid,
    busy,
    error,
  };
}
