'use client';

import { useMemo } from 'react';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { statsMonthlyRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { categoryColor } from '@/src/viewmodels/statistics';
import type { StatsMonthly } from '@/src/shared/firestore/types';

const DONUT_RADIUS = 60;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(Math.abs(value));
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function previousMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function percentChange(current: number, previous: number) {
  if (!previous) return 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export function useLogic() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prev = previousMonth(year, month);
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const { data: current, loading: currentLoading, error: currentError } = useFirestoreDoc<StatsMonthly>(
    useMemo(() => (uid ? statsMonthlyRef(uid, monthKey(year, month)) : null), [uid, year, month])
  );
  const { data: previous, loading: previousLoading } = useFirestoreDoc<StatsMonthly>(
    useMemo(() => (uid ? statsMonthlyRef(uid, monthKey(prev.year, prev.month)) : null), [uid, prev.year, prev.month])
  );
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (categoryId: string) => map.get(categoryId) ?? categoryId;
  }, [categories]);

  const acrossAllAccounts = round2(
    accounts.reduce((sum, account) => sum + toDisplay(ctx, account.currentBalance, account.currency), 0)
  );

  const totalIncome = current?.totalIncome ?? 0;
  const totalExpense = current?.totalExpense ?? 0;
  // Stored in stats documents already converted to the household's default
  // (base) currency by the onTransactionWrite trigger — only need base ->
  // display here, never native -> display (see functions/src/transactions.ts).
  const income = toDisplay(ctx, totalIncome, ctx.base);
  const spending = -toDisplay(ctx, totalExpense, ctx.base);
  const netSavings = round2(income + spending);
  // A ratio, so currency-invariant — compute from the raw base amounts.
  const savingsRate = totalIncome ? Math.round(((totalIncome - totalExpense) / totalIncome) * 1000) / 10 : 0;

  const summary = {
    currency: ctx.display,
    acrossAllAccounts,
    spending,
    income,
    netSavings,
    savingsRate,
    activeAccounts: accounts.length,
  };

  const topCategories = useMemo(() => {
    const perCategorySpend = current?.perCategorySpend ?? {};
    const entries = Object.entries(perCategorySpend)
      .map(([categoryId, amount]) => ({
        label: categoryName(categoryId),
        amount: round2(toDisplay(ctx, amount, ctx.base)),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const totalTop = entries.reduce((sum, entry) => sum + entry.amount, 0) || 1;
    return entries.map((entry) => ({ ...entry, percent: Math.round((entry.amount / totalTop) * 100) }));
  }, [current, categoryName, ctx]);

  const donutSlices = useMemo(() => {
    return topCategories.map((slice, index) => {
      const precedingPercent = topCategories.slice(0, index).reduce((sum, entry) => sum + entry.percent, 0);
      const length = (slice.percent / 100) * DONUT_CIRCUMFERENCE;
      const dashoffset = -(precedingPercent / 100) * DONUT_CIRCUMFERENCE;
      return { ...slice, color: categoryColor(index), length, dashoffset };
    });
  }, [topCategories]);

  const monthComparison = previous
    ? [
        {
          label: 'Spending',
          current: spending,
          previous: -toDisplay(ctx, previous.totalExpense, ctx.base),
          percent: percentChange(spending, -toDisplay(ctx, previous.totalExpense, ctx.base)),
        },
        {
          label: 'Income',
          current: income,
          previous: toDisplay(ctx, previous.totalIncome, ctx.base),
          percent: percentChange(income, toDisplay(ctx, previous.totalIncome, ctx.base)),
        },
        {
          label: 'Net savings',
          current: netSavings,
          previous: round2(
            toDisplay(ctx, previous.totalIncome, ctx.base) - toDisplay(ctx, previous.totalExpense, ctx.base)
          ),
          percent: percentChange(
            netSavings,
            round2(
              toDisplay(ctx, previous.totalIncome, ctx.base) - toDisplay(ctx, previous.totalExpense, ctx.base)
            )
          ),
        },
      ]
    : [];

  return {
    summary,
    topCategories,
    donutSlices,
    donutCircumference: DONUT_CIRCUMFERENCE,
    monthComparison,
    loading: authLoading || currentLoading || previousLoading || accountsLoading || categoriesLoading || ctxLoading,
    error: currentError,
  };
}
