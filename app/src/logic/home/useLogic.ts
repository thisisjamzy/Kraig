'use client';

import { useMemo, useState } from 'react';
import { query, where, Timestamp } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreMapDoc } from '@/src/shared/firestore/hooks';
import { transactionsRef, budgetRulesRef, plannedPaymentsRef, statsBudgetProgressRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { computeUpcomingPayments } from '@/src/shared/firestore/upcomingPayments';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor } from '@/src/viewmodels/wallets';
import { dueLabel, formatDueDate } from '@/src/logic/paymentsCalendar/useLogic';
import type {
  FirestoreBudgetRule,
  FirestorePlannedPayment,
  FirestoreTransaction,
  StatsBudgetProgress,
} from '@/src/shared/firestore/types';

export type SpendingPeriod = 'week' | 'month' | 'quarter';

const UPCOMING_PAYMENTS_HORIZON_DAYS = 30;
const UPCOMING_PAYMENTS_PREVIEW_COUNT = 3;
const BUDGETS_PREVIEW_COUNT = 3;

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatCompact(value: number) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}M`;
  }
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }
  return `${value}`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function rangeStartFor(period: SpendingPeriod, now: Date) {
  if (period === 'week') return new Date(now.getTime() - 6 * 24 * 3600 * 1000);
  if (period === 'quarter') return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function bucketKeyFor(period: SpendingPeriod, date: Date) {
  if (period === 'week') return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  if (period === 'quarter') return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return `WK ${Math.ceil(date.getDate() / 7)}`;
}

export function useLogic() {
  const [period, setPeriod] = useState<SpendingPeriod>('week');
  const now = useMemo(() => new Date(), []);
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const { data: accounts, loading: accountsLoading, error: accountsError } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const activeBudgetRulesQuery = useMemo(
    () => (uid ? query(budgetRulesRef(uid), where('archived', '==', false)) : null),
    [uid]
  );
  const { data: rules, loading: rulesLoading } = useFirestoreCollection<FirestoreBudgetRule>(
    activeBudgetRulesQuery
  );
  const activePlannedPaymentsQuery = useMemo(
    () => (uid ? query(plannedPaymentsRef(uid), where('archived', '==', false)) : null),
    [uid]
  );
  const { data: plannedPayments, loading: plannedPaymentsLoading } = useFirestoreCollection<FirestorePlannedPayment>(
    activePlannedPaymentsQuery
  );
  const { data: progress, loading: progressLoading } = useFirestoreMapDoc<StatsBudgetProgress>(
    useMemo(() => (uid ? statsBudgetProgressRef(uid, currentMonthKey()) : null), [uid])
  );
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const breakdownQuery = useMemo(
    () =>
      uid ? query(transactionsRef(uid), where('date', '>=', Timestamp.fromDate(rangeStartFor(period, now)))) : null,
    [uid, period, now]
  );
  const { data: rangeTransactions, loading: breakdownLoading } =
    useFirestoreCollection<FirestoreTransaction>(breakdownQuery);

  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const ruleCategoryId = useMemo(() => new Map(rules.map((r) => [r.id, r.categoryId])), [rules]);

  const totalBalance = round2(
    accounts.reduce((sum, account) => sum + toDisplay(ctx, account.currentBalance, account.currency), 0)
  );
  // Frozen or notSpendable accounts are excluded from what you can actually
  // spend right now, but still count toward net worth (`total`).
  const spendableBalance = round2(
    accounts
      .filter((account) => !account.frozen && !account.notSpendable)
      .reduce((sum, account) => sum + toDisplay(ctx, account.currentBalance, account.currency), 0)
  );
  const balance = { currency: ctx.display, total: totalBalance, spendable: spendableBalance };

  const wallets = accounts.map((account, index) => ({
    name: account.name,
    amount: toDisplay(ctx, account.currentBalance, account.currency),
    color: walletColor(index),
  }));
  const walletMax = Math.max(1, ...wallets.map((wallet) => wallet.amount));

  const budgets = Object.entries(progress ?? {})
    .slice(0, BUDGETS_PREVIEW_COUNT)
    .map(([ruleId, entry]) => {
      const categoryId = ruleCategoryId.get(ruleId);
      return {
        category: (categoryId && categoryName.get(categoryId)) || categoryId || ruleId,
        spent: round2(toDisplay(ctx, entry.spent, ctx.base)),
        total: round2(toDisplay(ctx, entry.budgeted, ctx.base)),
      };
    });

  const breakdown = useMemo(() => {
    const buckets = new Map<string, { day: string; income: number; expense: number }>();
    const order: string[] = [];
    rangeTransactions.forEach((transaction) => {
      const date = transaction.date.toDate();
      if (date > now) return;
      const key = bucketKeyFor(period, date);
      if (!buckets.has(key)) {
        buckets.set(key, { day: key, income: 0, expense: 0 });
        order.push(key);
      }
      const bucket = buckets.get(key)!;
      const native = accountCurrency.get(transaction.accountId) ?? ctx.base;
      const amount = toDisplay(ctx, transaction.amount, native);
      if (transaction.direction === 'Inflow') bucket.income += amount;
      else bucket.expense += amount;
    });
    return order.map((key) => {
      const bucket = buckets.get(key)!;
      return { day: bucket.day, income: round2(bucket.income), expense: round2(bucket.expense) };
    });
  }, [rangeTransactions, period, now, accountCurrency, ctx]);
  const breakdownMax = Math.max(1, ...breakdown.flatMap((entry) => [entry.income, entry.expense]));

  const upcomingPayments = useMemo(
    () =>
      computeUpcomingPayments(plannedPayments, accounts, categories, ctx, UPCOMING_PAYMENTS_HORIZON_DAYS)
        .slice(0, UPCOMING_PAYMENTS_PREVIEW_COUNT)
        .map((payment) => ({
          ...payment,
          dueDateLabel: formatDueDate(payment.dueDate),
          dueInLabel: dueLabel(payment.dueDate),
        })),
    [plannedPayments, accounts, categories, ctx]
  );

  // Firestore's onSnapshot listeners already push updates live — nothing to
  // manually refetch, this just satisfies the existing "Sync" quick action.
  function refetch() {}

  return {
    balance,
    wallets,
    budgets,
    upcomingPayments,
    period,
    setPeriod,
    breakdown,
    walletMax,
    breakdownMax,
    loading:
      authLoading ||
      accountsLoading ||
      categoriesLoading ||
      rulesLoading ||
      plannedPaymentsLoading ||
      progressLoading ||
      ctxLoading ||
      breakdownLoading,
    error: accountsError,
    refetch,
  };
}
