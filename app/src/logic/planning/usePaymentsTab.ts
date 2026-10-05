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
import { nextOccurrenceOnOrAfter } from '@dreda/shared-recurrence';
import { recordBucketLineItemPayment } from '@/src/shared/firestore/aggregation';
import { useCategories } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { itemMonthKey } from '@/src/shared/budget/monthBudget';
import { isItemClosed } from '@/src/shared/budget/bucketProgress';
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
  amount: number;
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

/** Every scheduled payment in the month, with its status. */
export function monthPayments(
  month: string,
  data: Pick<PlanningData, 'budget' | 'buckets' | 'itemsByBucket' | 'accounts' | 'ctx'>,
  categories: FirestoreCategory[]
): MonthPayment[] {
  const { budget, buckets, itemsByBucket, accounts, ctx } = data;
  const [y, m] = month.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const accountCurrency = new Map(accounts.map((a) => [a.id, a.currency]));
  const category = new Map(categories.map((c) => [c.id, c]));
  const out: MonthPayment[] = [];
  for (const bucket of buckets) {
    for (const item of itemsByBucket[bucket.id] ?? []) {
      if (!item.dueDate || item.excludedMonths?.includes(month)) continue;
      const rule = {
        frequency: (bucket.kind === 'Fixed' ? item.recurrence?.frequency : undefined) ?? ('Once' as Frequency),
        interval: item.recurrence?.interval ?? 1,
        anchorDate: item.dueDate.toDate(),
        endCondition: 'Never' as const,
      };
      const endDate = item.recurrence?.endDate?.toDate() ?? null;
      const dates: Date[] = [];
      let from = monthStart;
      for (let guard = 0; guard < 40; guard++) {
        const next = nextOccurrenceOnOrAfter(rule, from, monthEnd);
        if (!next || (endDate && next > endDate)) break;
        dates.push(next);
        from = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
      }
      if (!dates.length) continue;
      const native = item.accountId ? (accountCurrency.get(item.accountId) ?? bucket.currency) : bucket.currency;
      const amount = toDisplay(ctx, item.amount, native);
      const entry = budget.itemsByKey.get(itemMonthKey(item.id, month));
      // Closed (the item, or its bucket for this month): nothing more is due.
      const closed = isItemClosed(item, bucket.kind) || Boolean(entry?.closed);
      // A payment counts as paid once anything is recorded against it —
      // the amount may differ from the plan (a mis-estimate, not a missed
      // payment). Several records pay several dates; a large one can pay
      // more than one.
      const records = entry ? entry.transactionIds.length + entry.transferIds.length : 0;
      const byAmount = entry && amount > 0 ? Math.floor((entry.actual + 0.01) / amount) : 0;
      const paidCount = closed ? dates.length : Math.min(dates.length, Math.max(records, byAmount));
      const cat = item.categoryId ? category.get(item.categoryId) : undefined;
      dates.forEach((due, index) => {
        const paid = index < paidCount;
        // An archived bucket keeps its payment history, but nothing more is
        // due from it.
        if (bucket.archived && !paid) return;
        out.push({
          id: `${item.id}@${dayKey(due)}`,
          bucketId: bucket.id,
          bucketName: bucket.name,
          itemId: item.id,
          name: item.name || cat?.name || 'Payment',
          categoryId: item.categoryId ?? null,
          categoryName: cat?.name ?? (bucket.type === 'Transfer' ? (item.categoryId ?? 'Transfer') : ''),
          categoryType: bucket.type === 'Transfer' ? 'Transfer' : (cat?.transactionType ?? 'Expense'),
          frequency: frequencyLabel(bucket.kind === 'Fixed' ? item.recurrence : null),
          method: (item.accountId && accountName.get(item.accountId)) || 'No wallet set',
          accountId: item.accountId ?? null,
          toAccountId: item.toAccountId ?? null,
          charges: item.charges ?? null,
          amount,
          due,
          dueKey: dayKey(due),
          status: paid ? 'paid' : due < todayStart ? 'overdue' : 'upcoming',
        });
      });
    }
  }
  return out.sort((a, b) => a.due.getTime() - b.due.getTime() || a.name.localeCompare(b.name));
}

export function usePaymentsTab(month: string, data: PlanningData, bucketFilter: string | null = null) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { budget, buckets, itemsByBucket, accounts, ctx } = data;
  const { data: categories } = useCategories();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [paying, setPaying] = useState<MonthPayment | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
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
    setError(null);
  }
  async function confirmPaid() {
    if (!uid || !paying || !payAccountId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await recordBucketLineItemPayment(
        uid,
        paying.bucketId,
        paying.itemId,
        paying.amount,
        true,
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
    accounts: payAccounts,
    confirmPaid,
    busy,
    error,
  };
}
