'use client';

// Rebuilt against public/mockups/Analytics_1.png — every section here reads
// straight from the last 12 months of raw transactions/transfers (like
// Home's and Budget's own live-recompute — see src/logic/home/useLogic.ts's
// comment on why a precomputed doc goes stale) rather than the monthly
// statsMonthly/statsBudgetProgress docs, so Habit Breakdown, Income
// Analysis, Income Consistency, and Financial Trends can each slice that
// same data by whatever window they need without waiting on a write
// somewhere else to have refreshed a precomputed field.

import { useMemo, useState } from 'react';
import { query, where, Timestamp } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { transactionsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { categoryColor } from '@/src/viewmodels/statistics';
import type { FirestoreTransaction } from '@/src/shared/firestore/types';

export type StatsPeriod = 'Week' | 'Month' | 'Quarter' | 'Year';
export type HabitPeriod = 'Daily' | 'Monthly' | 'Yearly';

const HISTORY_MONTHS = 12;
const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(Math.abs(value));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function periodStartFor(period: StatsPeriod, now: Date) {
  if (period === 'Week') return new Date(now.getTime() - 6 * 24 * 3600 * 1000);
  if (period === 'Quarter') return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  if (period === 'Year') return new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function habitStartFor(period: HabitPeriod, now: Date) {
  if (period === 'Daily') return new Date(now.getTime() - 6 * 24 * 3600 * 1000);
  if (period === 'Yearly') return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function percentChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export function useLogic() {
  const now = useMemo(() => new Date(), []);
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const historyStart = useMemo(() => new Date(now.getFullYear(), now.getMonth() - (HISTORY_MONTHS - 1), 1), [now]);

  const transactionsQuery = useMemo(
    () => (uid ? query(transactionsRef(uid), where('date', '>=', Timestamp.fromDate(historyStart))) : null),
    [uid, historyStart]
  );
  const { data: allTransactions, loading: transactionsLoading, error: transactionsError } =
    useFirestoreCollection<FirestoreTransaction>(transactionsQuery);

  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  // Every transaction's amount, converted once up front to the display
  // currency — everything below just filters/sums this, never reconverts.
  const rows = useMemo(
    () =>
      allTransactions.map((t) => ({
        ...t,
        displayAmount: toDisplay(ctx, t.amount, accountCurrency.get(t.accountId) ?? ctx.base),
        dateObj: t.date.toDate(),
      })),
    [allTransactions, accountCurrency, ctx]
  );
  function inRange(date: Date, start: Date, end: Date) {
    return date >= start && date <= end;
  }
  function sumType(list: typeof rows, type: string) {
    return round2(list.reduce((sum, r) => sum + (r.type === type ? r.displayAmount : 0), 0));
  }

  const acrossAllAccounts = round2(
    accounts.reduce((sum, account) => sum + toDisplay(ctx, account.currentBalance, account.currency), 0)
  );

  // --- This month vs last month (summary tiles + comparison table) -------

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const thisMonthRows = rows.filter((r) => inRange(r.dateObj, thisMonthStart, now));
  const lastMonthRows = rows.filter((r) => inRange(r.dateObj, lastMonthStart, lastMonthEnd));

  const income = sumType(thisMonthRows, 'Income');
  const expense = sumType(thisMonthRows, 'Expense');
  const netSavings = sumType(thisMonthRows, 'Savings');
  const spending = -expense;
  // What fraction of this month's income actually landed in a Savings
  // category — paired with netSavings' own definition (real recorded
  // savings, not income-minus-expense; see src/logic/budget/useLogic.ts's
  // actualSavings, the same definition).
  const savingsRate = income ? Math.round((netSavings / income) * 1000) / 10 : 0;

  const summary = {
    currency: ctx.display,
    acrossAllAccounts,
    spending,
    income,
    netSavings,
    savingsRate,
    activeAccounts: accounts.length,
  };

  const prevIncome = sumType(lastMonthRows, 'Income');
  const prevExpense = sumType(lastMonthRows, 'Expense');
  const prevNetSavings = sumType(lastMonthRows, 'Savings');

  // Empty (not three zeroed rows) until there's at least some real history
  // in either month — same "nothing to compare yet" empty state a brand
  // new account should see.
  const monthComparison =
    thisMonthRows.length > 0 || lastMonthRows.length > 0
      ? [
          { label: 'Spending', current: spending, previous: -prevExpense, percent: percentChange(spending, -prevExpense) },
          { label: 'Income', current: income, previous: prevIncome, percent: percentChange(income, prevIncome) },
          {
            label: 'Net savings',
            current: netSavings,
            previous: prevNetSavings,
            percent: percentChange(netSavings, prevNetSavings),
          },
        ]
      : [];

  // --- Spending Insights: donut + top categories --------------------------

  const [insightsPeriod, setInsightsPeriod] = useState<StatsPeriod>('Month');
  const insightsStart = periodStartFor(insightsPeriod, now);
  const insightsRows = rows.filter((r) => inRange(r.dateObj, insightsStart, now));

  const topCategories = useMemo(() => {
    // Outflow categories only (Expense + Savings, same "money that left a
    // spendable wallet" grouping Budget screen's totalSpent uses) — Income
    // has its own section below.
    const spend = new Map<string, number>();
    insightsRows.forEach((r) => {
      if (r.type === 'Income' || !r.categoryId) return;
      spend.set(r.categoryId, (spend.get(r.categoryId) ?? 0) + r.displayAmount);
    });
    const entries = [...spend.entries()]
      .map(([categoryId, amount]) => ({ label: categoryName.get(categoryId) ?? categoryId, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const total = entries.reduce((sum, e) => sum + e.amount, 0) || 1;
    return entries.map((e) => ({ ...e, percent: Math.round((e.amount / total) * 100) }));
     
  }, [insightsRows, categoryName]);

  const DONUT_RADIUS = 60;
  const donutCircumference = 2 * Math.PI * DONUT_RADIUS;
  const donutSlices = useMemo(() => {
    return topCategories.map((slice, index) => {
      const precedingPercent = topCategories.slice(0, index).reduce((sum, entry) => sum + entry.percent, 0);
      const length = (slice.percent / 100) * donutCircumference;
      const dashoffset = -(precedingPercent / 100) * donutCircumference;
      return { ...slice, color: categoryColor(index), length, dashoffset };
    });
  }, [topCategories, donutCircumference]);

  // --- Habit Breakdown: Income/Expense/Savings by weekday -----------------

  const [habitPeriod, setHabitPeriod] = useState<HabitPeriod>('Daily');
  const habitStart = habitStartFor(habitPeriod, now);
  const habitRows = rows.filter((r) => inRange(r.dateObj, habitStart, now));
  const habitBreakdown = useMemo(() => {
    const buckets = WEEKDAY_LABELS.map((label) => ({ label, income: 0, expense: 0, savings: 0 }));
    habitRows.forEach((r) => {
      // getDay(): 0=Sun..6=Sat -> Mon-first index (0=Mon..6=Sun).
      const index = (r.dateObj.getDay() + 6) % 7;
      if (r.type === 'Income') buckets[index].income += r.displayAmount;
      else if (r.type === 'Expense') buckets[index].expense += r.displayAmount;
      else if (r.type === 'Savings') buckets[index].savings += r.displayAmount;
    });
    return buckets.map((b) => ({ ...b, income: round2(b.income), expense: round2(b.expense), savings: round2(b.savings) }));
  }, [habitRows]);
  const habitMax = Math.max(1, ...habitBreakdown.flatMap((b) => [b.income, b.expense, b.savings]));

  // --- Income Analysis: total + by-category breakdown ----------------------

  const [incomePeriod, setIncomePeriod] = useState<StatsPeriod>('Month');
  const incomeStart = periodStartFor(incomePeriod, now);
  const incomeRows = rows.filter((r) => r.type === 'Income' && inRange(r.dateObj, incomeStart, now));
  const totalIncomeForPeriod = round2(incomeRows.reduce((sum, r) => sum + r.displayAmount, 0));
  const incomeSources = useMemo(() => {
    const byCategory = new Map<string, number>();
    incomeRows.forEach((r) => {
      const key = r.categoryId ?? '—';
      byCategory.set(key, (byCategory.get(key) ?? 0) + r.displayAmount);
    });
    const total = totalIncomeForPeriod || 1;
    return [...byCategory.entries()]
      .map(([categoryId, amount]) => ({
        label: categoryName.get(categoryId) ?? categoryId,
        amount: round2(amount),
        percent: Math.round((amount / total) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);
     
  }, [incomeRows, categoryName, totalIncomeForPeriod]);

  // --- Income Consistency: last 6 months vs their own average -------------

  const incomeConsistency = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: MONTH_LABELS[d.getMonth()] };
    });
    const totals = months.map(({ year, month }) => {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
      return round2(
        rows.reduce((sum, r) => (r.type === 'Income' && inRange(r.dateObj, start, end) ? sum + r.displayAmount : sum), 0)
      );
    });
    const monthsWithIncome = totals.filter((v) => v > 0);
    const average = monthsWithIncome.length
      ? monthsWithIncome.reduce((sum, v) => sum + v, 0) / monthsWithIncome.length
      : 0;
    return months.map((m, i) => ({
      label: m.label,
      amount: totals[i],
      percentOfAverage: average ? Math.round((totals[i] / average) * 100) : 0,
    }));
     
  }, [rows, now]);
  const consistencyMax = Math.max(100, ...incomeConsistency.map((m) => m.percentOfAverage));

  // --- Financial Trends: Spending vs Income, bucketed by the period -------

  const [trendsPeriod, setTrendsPeriod] = useState<StatsPeriod>('Month');
  const trendsBuckets = useMemo(() => {
    if (trendsPeriod === 'Week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = startOfDay(new Date(now.getTime() - (6 - i) * 24 * 3600 * 1000));
        return { label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(), start: d, end: new Date(d.getTime() + 24 * 3600 * 1000 - 1) };
      });
    }
    if (trendsPeriod === 'Quarter') {
      // 6 buckets of half-months isn't meaningful — a quarter reads as its
      // 3 months, so this shows the trailing 6 months same as Year, just a
      // shorter, more zoomed-in window when the difference matters: 3
      // months of real bars instead of 6.
      return Array.from({ length: 3 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
        return { label: MONTH_LABELS[d.getMonth()], start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) };
      });
    }
    if (trendsPeriod === 'Year') {
      return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        return { label: MONTH_LABELS[d.getMonth()], start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) };
      });
    }
    // Month (default): trailing 6 months, matching the mockup's Mar-Aug span.
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { label: MONTH_LABELS[d.getMonth()], start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) };
    });
  }, [trendsPeriod, now]);

  const financialTrends = useMemo(
    () =>
      trendsBuckets.map((bucket) => {
        let spendingSum = 0;
        let incomeSum = 0;
        let savingsSum = 0;
        rows.forEach((r) => {
          if (!inRange(r.dateObj, bucket.start, bucket.end)) return;
          if (r.type === 'Expense') spendingSum += r.displayAmount;
          else if (r.type === 'Income') incomeSum += r.displayAmount;
          else if (r.type === 'Savings') savingsSum += r.displayAmount;
        });
        return {
          label: bucket.label,
          spending: round2(spendingSum),
          income: round2(incomeSum),
          savings: round2(savingsSum),
        };
      }),
    [trendsBuckets, rows]
  );
  const trendsMax = Math.max(1, ...financialTrends.flatMap((t) => [t.spending, t.income, t.savings]));

  return {
    summary,
    topCategories,
    donutSlices,
    donutCircumference,
    monthComparison,

    insightsPeriod,
    setInsightsPeriod,

    habitPeriod,
    setHabitPeriod,
    habitBreakdown,
    habitMax,

    incomePeriod,
    setIncomePeriod,
    totalIncomeForPeriod,
    incomeCurrency: ctx.display,
    incomeSources,

    incomeConsistency,
    consistencyMax,

    trendsPeriod,
    setTrendsPeriod,
    financialTrends,
    trendsMax,

    loading:
      authLoading || transactionsLoading || accountsLoading || categoriesLoading || ctxLoading,
    error: transactionsError,
  };
}
