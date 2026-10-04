'use client';

// Transactions (it replaces History) — one month's money, by flow type:
// income, expenses, savings and transfers each listed on their own, newest
// first and grouped by day. Savings are what was set aside (a transfer
// into a savings account counts here, a withdrawal shows as negative), and
// a transfer's fee is listed with it. A bucket or category in the URL (a
// bucket's "See all months", an Insights tap) starts the list filtered.

import { useMemo, useState } from 'react';
import { useCategories } from '@/src/shared/firestore/queries';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useMonthParam, useSearchParamOnce } from '@/src/shared/navigation/useMonthParam';
import { INCOME_SUBTYPE_LABEL, incomeSubtypeOfTransaction, savingsSign, transferSavingsSign, type FlowType } from '@/src/shared/budget/flow';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { toDisplay } from '@/src/shared/firestore/currency';
import { recordedAt } from '@/src/shared/time/recordedAt';
import { monthTitle } from '@/src/viewmodels/planning';

export interface TxRow {
  id: string;
  kind: 'transaction' | 'transfer';
  flow: FlowType;
  date: Date;
  /** False when only the day is known (no time recorded). */
  timeKnown: boolean;
  day: string; // yyyy-mm-dd, for grouping
  name: string;
  note: string;
  source: string;
  subtype: string;
  bucketId: string | null;
  bucketName: string;
  itemName: string;
  category: string;
  account: string;
  from: string;
  to: string;
  fee: number;
  /** Signed for its flow: income +, spending −, savings + (withdrawals −), transfers +. */
  amount: number;
  href: string;
  /** Kept for the record but not counted (a debt changed to record only); shown with "Show excluded". */
  excluded: boolean;
  excludedReason: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function useLogic() {
  const [month, setMonth] = useMonthParam();
  const bucketFilter = useSearchParamOnce('bucket');
  const categoryFilter = useSearchParamOnce('category');
  const data = useMonthBudget(month);
  const { data: categories } = useCategories();
  const [tab, setTab] = useState<FlowType>('Expense');
  const [showExcluded, setShowExcluded] = useState(false);

  const rows = useMemo<TxRow[]>(() => {
    const { transactionsById, excludedTransactions, transfersById, accounts, buckets, budget, ctx } = data;
    const account = new Map(accounts.map((a) => [a.id, a]));
    const accountType = new Map(accounts.map((a) => [a.id, a.type]));
    const category = new Map(categories.map((c) => [c.id, c.name]));
    const bucketName = new Map(buckets.map((b) => [b.id, b.name]));
    const itemOf = new Map<string, { name: string; bucketId: string }>();
    for (const item of budget.items) {
      for (const id of [...item.transactionIds, ...item.transferIds]) itemOf.set(id, { name: item.name, bucketId: item.bucketId });
    }
    const out: TxRow[] = [];
    const listed = showExcluded ? [...transactionsById.values(), ...excludedTransactions] : transactionsById.values();
    for (const t of listed) {
      if ((t.month ?? monthKeyOf(t.date.toDate())) !== month) continue;
      const currency = account.get(t.accountId)?.currency ?? ctx.base;
      const value = toDisplay(ctx, t.amount, currency);
      const at = recordedAt(t.date, t.createdAt);
      const item = itemOf.get(t.id);
      const bucketId = item?.bucketId ?? t.bucketItem?.bucketId ?? null;
      const cat = (t.categoryId && category.get(t.categoryId)) || '';
      const accountName = account.get(t.accountId)?.name ?? '';
      const flow: FlowType = t.type === 'Income' ? 'Income' : t.type === 'Savings' ? 'Savings' : 'Expense';
      const sign = flow === 'Savings' ? savingsSign(t, accountType) : flow === 'Income' ? (t.direction === 'Inflow' ? 1 : -1) : t.direction === 'Outflow' ? -1 : 1;
      const intoSavingsAccount = accountType.get(t.accountId) === 'Savings Account';
      out.push({
        id: t.id,
        kind: 'transaction',
        flow,
        date: at.date,
        timeKnown: at.timeKnown,
        day: dayKey(at.date),
        name: t.description || cat || t.type,
        note: t.description && cat ? cat : '',
        source: cat,
        subtype: flow === 'Income' ? INCOME_SUBTYPE_LABEL[incomeSubtypeOfTransaction(t)] : '',
        bucketId,
        bucketName: bucketId ? (bucketName.get(bucketId) ?? '') : '',
        itemName: item?.name ?? '',
        category: cat,
        account: accountName,
        from: flow === 'Savings' && !intoSavingsAccount ? accountName : '',
        to: flow === 'Savings' ? (intoSavingsAccount ? accountName : t.isFrozenSavings ? `${accountName} (locked)` : '') : '',
        fee: 0,
        amount: sign * value,
        href: `/transactions/${t.id}`,
        excluded: Boolean(t.excluded),
        excludedReason: t.excludedReason ?? '',
      });
    }
    for (const t of transfersById.values()) {
      if (monthKeyOf(t.date.toDate()) !== month) continue;
      const currency = account.get(t.fromAccountId)?.currency ?? ctx.base;
      const at = recordedAt(t.date, t.createdAt);
      const item = itemOf.get(t.id);
      const bucketId = item?.bucketId ?? t.bucketItem?.bucketId ?? null;
      const savings = transferSavingsSign(t, accountType);
      const linkedType = bucketId ? buckets.find((b) => b.id === bucketId)?.type : undefined;
      const flow: FlowType = linkedType === 'Savings' || (!linkedType && savings !== 0) ? 'Savings' : 'Transfer';
      out.push({
        id: t.id,
        kind: 'transfer',
        flow,
        date: at.date,
        timeKnown: at.timeKnown,
        day: dayKey(at.date),
        name: t.description || t.kind || 'Transfer',
        note: t.notes || '',
        source: '',
        subtype: '',
        bucketId,
        bucketName: bucketId ? (bucketName.get(bucketId) ?? '') : '',
        itemName: item?.name ?? '',
        category: t.kind,
        account: account.get(t.fromAccountId)?.name ?? '',
        from: account.get(t.fromAccountId)?.name ?? '',
        to: account.get(t.toAccountId)?.name ?? '',
        fee: toDisplay(ctx, t.charges ?? 0, currency),
        amount: (flow === 'Savings' && savings < 0 ? -1 : 1) * toDisplay(ctx, t.amount, currency),
        href: `/transactions/${t.id}?kind=transfer`,
        excluded: false,
        excludedReason: '',
      });
    }
    return out.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [data, categories, month, showExcluded]);

  const byType = useMemo(() => {
    const out: Record<FlowType, TxRow[]> = { Income: [], Expense: [], Savings: [], Transfer: [] };
    for (const r of rows) {
      if (bucketFilter && r.bucketId !== bucketFilter) continue;
      if (categoryFilter && r.category !== (categories.find((c) => c.id === categoryFilter)?.name ?? categoryFilter)) continue;
      out[r.flow].push(r);
    }
    return out;
  }, [rows, bucketFilter, categoryFilter, categories]);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const counted = (list: TxRow[]) => list.filter((r) => !r.excluded);
  const moneyIn = r2(counted(byType.Income).reduce((s, r) => s + Math.max(0, r.amount), 0));
  const moneyOut = r2(counted(byType.Expense).reduce((s, r) => s - Math.min(0, r.amount), 0) + byType.Transfer.reduce((s, r) => s + r.fee, 0));

  return {
    month,
    setMonth,
    title: monthTitle(month),
    tab,
    setTab,
    byType,
    count: rows.filter((r) => !r.excluded).length,
    showExcluded,
    setShowExcluded,
    excludedCount: data.excludedTransactions.length,
    moneyIn,
    moneyOut,
    filteredBy: bucketFilter ? (data.buckets.find((b) => b.id === bucketFilter)?.name ?? 'a bucket') : categoryFilter ? (categories.find((c) => c.id === categoryFilter)?.name ?? 'a category') : null,
    currency: data.ctx.display,
    loading: data.loading,
  };
}
