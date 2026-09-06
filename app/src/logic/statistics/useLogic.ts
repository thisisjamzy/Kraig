'use client';

// Rebuilt against public/mockups/Analytics_1.png — every section here reads
// straight from the last 24 months of raw transactions and transfers (like
// Home's and Budget's own live-recompute — see src/logic/home/useLogic.ts's
// comment on why a precomputed doc goes stale) rather than the monthly
// statsMonthly/statsBudgetProgress docs, so Habit Breakdown, Income
// Analysis, Income Consistency, and Financial Trends can each slice that
// same data by whatever window they need without waiting on a write
// somewhere else to have refreshed a precomputed field.
//
// Savings specifically is account-type based now, not category/transfer-
// kind based (see src/viewmodels/savingsTransfers.ts) — "total savings" is
// just the live balance sum of every Savings Account, always the true
// compounding total, never reset by which period is selected. A savings
// trend/graph instead needs a real rising-or-falling line, so it works
// backward from that live total by each bucket's own net flow rather than
// plotting a flat "total repeated" or a flat "same amount saved" line.

import { useMemo, useState } from 'react';
import { query, where, Timestamp } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { transactionsRef, transfersRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { categoryColor } from '@/src/viewmodels/statistics';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { savingsTransactionFlow, savingsTransferFlow } from '@/src/viewmodels/savingsTransfers';
import type { FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';

// Cumulative running total per bucket, anchored so the LAST (most recent)
// bucket always equals the account's true live total — every earlier bucket
// is that total worked backward by each subsequent bucket's own net flow.
// This is what makes a savings graph show real growth/decline even when the
// same amount is saved every period, instead of a flat repeated line.
function cumulativeAnchoredToTotal(flows: number[], total: number): number[] {
  const cumulative = new Array<number>(flows.length);
  let flowSinceThisBucket = 0;
  for (let i = flows.length - 1; i >= 0; i--) {
    cumulative[i] = round2(total - flowSinceThisBucket);
    flowSinceThisBucket += flows[i];
  }
  return cumulative;
}

export type StatsPeriod = 'Week' | 'Month' | 'Quarter' | 'Year';
export type HabitPeriod = 'Daily' | 'Monthly' | 'Yearly';

// 24, not 12 — the single period filter's "vs previous period" comparison
// needs a full previous window of history too, and a Year window's previous
// window alone reaches back 24 months (see previousPeriodRangeFor below).
const HISTORY_MONTHS = 24;
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(Math.abs(value));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Calendar-day aligned (midnight), not now.getTime() minus a fixed
// duration — the latter cuts the oldest day off partway through whenever
// "now" isn't exactly midnight, silently excluding that day's earlier
// transactions and rendering it as a blank bar even though real
// transactions exist on it (see startOfDay's use in the Financial Trends
// week bucketing below, which already got this right).
function periodStartFor(period: StatsPeriod, now: Date) {
  if (period === 'Week') return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  if (period === 'Quarter') return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  if (period === 'Year') return new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// The equal-length window immediately preceding periodStartFor's own
// window — what the current period's totals get compared against.
function previousPeriodRangeFor(period: StatsPeriod, now: Date) {
  const currentStart = periodStartFor(period, now);
  if (period === 'Week') {
    const end = new Date(currentStart.getTime() - 1);
    const start = new Date(currentStart.getTime() - 7 * 24 * 3600 * 1000);
    return { start, end };
  }
  if (period === 'Quarter') {
    const end = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0, 23, 59, 59, 999);
    const start = new Date(currentStart.getFullYear(), currentStart.getMonth() - 3, 1);
    return { start, end };
  }
  if (period === 'Year') {
    const end = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0, 23, 59, 59, 999);
    const start = new Date(currentStart.getFullYear(), currentStart.getMonth() - 12, 1);
    return { start, end };
  }
  const end = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0, 23, 59, 59, 999);
  const start = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);
  return { start, end };
}

// Real buckets per granularity, not just a wider date range fed into the
// same fixed 7-weekday shape (the previous version's bug: picking "Yearly"
// still only ever showed 7 weekday bars, so an entire year's transactions
// collapsed into just "MON"..."SUN", conflating dozens of unrelated days
// into one number apiece). Each granularity now gets buckets that actually
// match what a person picking it would expect to see.
function habitBucketsFor(period: HabitPeriod, now: Date): { label: string; start: Date; end: Date }[] {
  if (period === 'Daily') {
    // Trailing 7 days, oldest to newest — labeled by weekday, but the
    // chronological order shifts with "now" instead of always reading
    // Mon-first regardless of which day it actually is.
    return Array.from({ length: 7 }, (_, i) => {
      const d = startOfDay(new Date(now.getTime() - (6 - i) * 24 * 3600 * 1000));
      return {
        label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        start: d,
        end: new Date(d.getTime() + 24 * 3600 * 1000 - 1),
      };
    });
  }
  if (period === 'Yearly') {
    // The 12 calendar months of the current year.
    return Array.from({ length: 12 }, (_, i) => ({
      label: MONTH_LABELS[i],
      start: new Date(now.getFullYear(), i, 1),
      end: new Date(now.getFullYear(), i + 1, 0, 23, 59, 59, 999),
    }));
  }
  // 'Monthly': weeks within the current calendar month (up to 5), not the
  // whole month collapsed into 7 weekday bars.
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const weeks: { label: string; start: Date; end: Date }[] = [];
  for (let day = 1, week = 1; day <= daysInMonth; day += 7, week++) {
    weeks.push({
      label: `WK ${week}`,
      start: new Date(now.getFullYear(), now.getMonth(), day),
      end: new Date(now.getFullYear(), now.getMonth(), Math.min(day + 6, daysInMonth), 23, 59, 59, 999),
    });
  }
  return weeks;
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

  const transfersQuery = useMemo(
    () => (uid ? query(transfersRef(uid), where('date', '>=', Timestamp.fromDate(historyStart))) : null),
    [uid, historyStart]
  );
  const { data: allTransfers, loading: transfersLoading } = useFirestoreCollection<FirestoreTransfer>(transfersQuery);

  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const accountType = useMemo(() => new Map(accounts.map((a) => [a.id, a.type])), [accounts]);
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  // Every transaction's amount, converted once up front to the display
  // currency — everything below just filters/sums this, never reconverts.
  const rows = useMemo(
    () =>
      allTransactions.map((t) => ({
        ...t,
        displayAmount: toDisplay(ctx, t.amount, accountCurrency.get(t.accountId) ?? ctx.base),
        // Signed, and 0 for anything not touching a Savings Account — see
        // savingsTransactionFlow's own header.
        savingsFlow: toDisplay(ctx, savingsTransactionFlow(t, accountType), accountCurrency.get(t.accountId) ?? ctx.base),
        dateObj: t.date.toDate(),
      })),
    [allTransactions, accountCurrency, accountType, ctx]
  );
  function inRange(date: Date, start: Date, end: Date) {
    return date >= start && date <= end;
  }
  function sumType(list: typeof rows, type: string) {
    return round2(list.reduce((sum, r) => sum + (r.type === type ? r.displayAmount : 0), 0));
  }

  // Same treatment for transfers — a transfer into/out of a Savings Account
  // moves real savings but lives in a separate collection from transactions
  // (see savingsTransferFlow's own header for the sign convention, incl. a
  // transfer between two Savings Accounts correctly netting to 0).
  const transferRows = useMemo(
    () =>
      allTransfers.map((t) => ({
        dateObj: t.date.toDate(),
        savingsFlow: toDisplay(ctx, savingsTransferFlow(t, accountType), accountCurrency.get(t.fromAccountId) ?? ctx.base),
      })),
    [allTransfers, accountCurrency, accountType, ctx]
  );
  function savingsFlowInRange(start: Date, end: Date) {
    const transactionFlow = rows.reduce((sum, r) => sum + (inRange(r.dateObj, start, end) ? r.savingsFlow : 0), 0);
    const transferFlow = transferRows.reduce((sum, r) => sum + (inRange(r.dateObj, start, end) ? r.savingsFlow : 0), 0);
    return round2(transactionFlow + transferFlow);
  }

  const acrossAllAccounts = round2(
    accounts.reduce((sum, account) => sum + toDisplay(ctx, account.currentBalance, account.currency), 0)
  );
  // The compounding total — every Savings Account's own live currentBalance,
  // which already bakes in every transaction/transfer that ever touched it.
  // This is "Savings" everywhere it's shown as a headline figure; only a
  // trend/graph needs the per-bucket flow helpers above.
  const totalSavingsNow = round2(
    accounts.filter(isSavingsAccount).reduce((sum, account) => sum + toDisplay(ctx, account.currentBalance, account.currency), 0)
  );

  // --- Single Week/Month/Quarter/Year filter — drives the summary tiles at
  // the top of the page plus every section below that used to carry its own
  // separate period control (Spending Insights, Income Analysis, Financial
  // Trends). Habit Breakdown keeps its own Daily/Monthly/Yearly control —
  // that's a bucketing granularity, not this same date-range concept.

  const [period, setPeriod] = useState<StatsPeriod>('Month');
  const periodStart = periodStartFor(period, now);
  const previousPeriodRange = previousPeriodRangeFor(period, now);
  const periodRows = useMemo(
    () => rows.filter((r) => inRange(r.dateObj, periodStart, now)),
    [rows, periodStart, now]
  );
  const previousPeriodRows = useMemo(
    () => rows.filter((r) => inRange(r.dateObj, previousPeriodRange.start, previousPeriodRange.end)),
    [rows, previousPeriodRange.start, previousPeriodRange.end]
  );

  const income = sumType(periodRows, 'Income');
  const expense = sumType(periodRows, 'Expense');
  const spending = -expense;
  // The headline figure is always the live compounding total, not "how much
  // moved this period" — see this file's own header. netSavings only
  // changes when the account balances themselves do, never when the period
  // filter changes.
  const netSavings = totalSavingsNow;
  // A ratio still wants the period's own flow, not the running total — "% of
  // this period's income that actually landed in savings" wouldn't mean
  // anything against an all-time total.
  const periodSavingsFlow = savingsFlowInRange(periodStart, now);
  const savingsRate = income ? Math.round((periodSavingsFlow / income) * 1000) / 10 : 0;

  const summary = {
    currency: ctx.display,
    acrossAllAccounts,
    spending,
    income,
    netSavings,
    savingsRate,
    activeAccounts: accounts.length,
  };

  const prevIncome = sumType(previousPeriodRows, 'Income');
  const prevExpense = sumType(previousPeriodRows, 'Expense');
  // What the total actually was right before this period's own flow
  // happened — the true prior snapshot to compare today's total against, so
  // the comparison row below shows whether savings really grew or shrank
  // this period instead of just restating the same running total twice.
  const prevNetSavings = round2(totalSavingsNow - periodSavingsFlow);

  // Empty (not three zeroed rows) until there's at least some real history
  // in either window — same "nothing to compare yet" empty state a brand
  // new account should see.
  const monthComparison =
    periodRows.length > 0 || previousPeriodRows.length > 0
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
  // Same window as the summary tiles above — periodRows.

  const topCategories = useMemo(() => {
    // Outflow categories only (Expense + Savings, same "money that left a
    // spendable wallet" grouping Budget screen's totalSpent uses) — Income
    // has its own section below.
    const spend = new Map<string, number>();
    periodRows.forEach((r) => {
      if (r.type === 'Income' || !r.categoryId) return;
      spend.set(r.categoryId, (spend.get(r.categoryId) ?? 0) + r.displayAmount);
    });
    const entries = [...spend.entries()]
      .map(([categoryId, amount]) => ({ label: categoryName.get(categoryId) ?? categoryId, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const total = entries.reduce((sum, e) => sum + e.amount, 0) || 1;
    return entries.map((e) => ({ ...e, percent: Math.round((e.amount / total) * 100) }));

  }, [periodRows, categoryName]);

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

  // --- Habit Breakdown: Income/Expense/Savings, bucketed to match whichever
  // granularity is selected (Daily -> weekdays, Monthly -> weeks-of-month,
  // Yearly -> months) — see habitBucketsFor's own comment.

  const [habitPeriod, setHabitPeriod] = useState<HabitPeriod>('Daily');
  const habitBuckets = useMemo(() => habitBucketsFor(habitPeriod, now), [habitPeriod, now]);
  const habitBreakdown = useMemo(() => {
    const buckets = habitBuckets.map((b) => ({ label: b.label, income: 0, expense: 0, savings: 0 }));
    rows.forEach((r) => {
      const index = habitBuckets.findIndex((b) => inRange(r.dateObj, b.start, b.end));
      if (index === -1) return;
      if (r.type === 'Income') buckets[index].income += r.displayAmount;
      else if (r.type === 'Expense') buckets[index].expense += r.displayAmount;
      // A bar chart compares independent buckets, not a running trajectory —
      // this stays "how much flowed into savings during this bucket" (the
      // habit-forming behavior), not the cumulative total. See the
      // dedicated Savings Trend chart (financialTrends.savings) for the
      // real growing/shrinking total.
      buckets[index].savings += r.savingsFlow;
    });
    transferRows.forEach((t) => {
      const index = habitBuckets.findIndex((b) => inRange(t.dateObj, b.start, b.end));
      if (index === -1) return;
      buckets[index].savings += t.savingsFlow;
    });
    return buckets.map((b) => ({
      ...b,
      income: round2(b.income),
      expense: round2(b.expense),
      savings: round2(Math.max(b.savings, 0)),
    }));
  }, [habitBuckets, rows, transferRows]);
  const habitMax = Math.max(1, ...habitBreakdown.flatMap((b) => [b.income, b.expense, b.savings]));

  // --- Income Analysis: total + by-category breakdown ----------------------
  // Same window as the summary tiles above — periodRows, Income-type only.

  const incomeRows = useMemo(() => periodRows.filter((r) => r.type === 'Income'), [periodRows]);
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
  // Same shared period control as the summary tiles above.

  const trendsBuckets = useMemo(() => {
    if (period === 'Week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = startOfDay(new Date(now.getTime() - (6 - i) * 24 * 3600 * 1000));
        return { label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(), start: d, end: new Date(d.getTime() + 24 * 3600 * 1000 - 1) };
      });
    }
    if (period === 'Quarter') {
      // 6 buckets of half-months isn't meaningful — a quarter reads as its
      // 3 months, so this shows the trailing 6 months same as Year, just a
      // shorter, more zoomed-in window when the difference matters: 3
      // months of real bars instead of 6.
      return Array.from({ length: 3 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
        return { label: MONTH_LABELS[d.getMonth()], start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) };
      });
    }
    if (period === 'Year') {
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
  }, [period, now]);

  const financialTrends = useMemo(() => {
    const spendingByBucket: number[] = [];
    const incomeByBucket: number[] = [];
    const savingsFlowByBucket: number[] = [];
    trendsBuckets.forEach((bucket) => {
      let spendingSum = 0;
      let incomeSum = 0;
      rows.forEach((r) => {
        if (!inRange(r.dateObj, bucket.start, bucket.end)) return;
        if (r.type === 'Expense') spendingSum += r.displayAmount;
        else if (r.type === 'Income') incomeSum += r.displayAmount;
      });
      spendingByBucket.push(round2(spendingSum));
      incomeByBucket.push(round2(incomeSum));
      savingsFlowByBucket.push(savingsFlowInRange(bucket.start, bucket.end));
    });
    // Savings is the cumulative total at each bucket, anchored to today's
    // real balance — see this file's own header and cumulativeAnchoredToTotal.
    // Spending/Income stay per-bucket flow amounts; those are genuinely flow
    // concepts, only Savings needs to show a compounding trajectory.
    const savingsByBucket = cumulativeAnchoredToTotal(savingsFlowByBucket, totalSavingsNow);
    return trendsBuckets.map((bucket, i) => ({
      label: bucket.label,
      spending: spendingByBucket[i],
      income: incomeByBucket[i],
      savings: savingsByBucket[i],
    }));
    // savingsFlowInRange itself isn't listed — it's a pure function of rows/
    // transferRows (both already deps via the closures they're built from)
    // recreated each render, not state of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendsBuckets, rows, transferRows, totalSavingsNow]);
  // Separate scales — a compounding savings total can run many times larger
  // than a single period's income/spending, so sharing one axis would make
  // income/spending read as a flat line near zero next to it.
  const trendsMax = Math.max(1, ...financialTrends.flatMap((t) => [t.spending, t.income]));
  const savingsTrendMax = Math.max(1, ...financialTrends.map((t) => t.savings));

  return {
    summary,
    topCategories,
    donutSlices,
    donutCircumference,
    monthComparison,

    // One shared Week/Month/Quarter/Year filter — drives the summary tiles
    // plus Spending Insights, Income Analysis, and Financial Trends below.
    period,
    setPeriod,

    habitPeriod,
    setHabitPeriod,
    habitBreakdown,
    habitMax,

    totalIncomeForPeriod,
    incomeCurrency: ctx.display,
    incomeSources,

    incomeConsistency,
    consistencyMax,

    financialTrends,
    trendsMax,
    savingsTrendMax,

    loading:
      authLoading || transactionsLoading || transfersLoading || accountsLoading || categoriesLoading || ctxLoading,
    error: transactionsError,
  };
}
