'use client';

import { useMemo, useState } from 'react';
import { query, where, updateDoc, Timestamp } from 'firebase/firestore';
import { ruleAppliesToMonth } from '@dreda/shared-recurrence';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transactionsRef, budgetRulesRef, plannedPaymentsRef, statsMonthlyRef, settingsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { toRecurrenceRule } from '@/src/shared/firestore/recurrence';
import { computeUpcomingPayments } from '@/src/shared/firestore/upcomingPayments';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor, arrangeCentered } from '@/src/viewmodels/wallets';
import { currencyName } from '@/src/viewmodels/currencies';
import { dueLabel, formatDueDate } from '@/src/logic/paymentsCalendar/useLogic';
import type {
  FirestoreBudgetRule,
  FirestorePlannedPayment,
  FirestoreTransaction,
  StatsMonthly,
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

// Every bucket the period spans, oldest to newest — walked independently of
// whatever transactions actually exist, so a day/week/month with nothing
// recorded still gets a column (rendered as a blank/grey placeholder,
// see HomeScreen.tsx) instead of silently disappearing from the chart and
// making the timeline look shorter than it really is.
function expectedBucketKeysFor(period: SpendingPeriod, now: Date): string[] {
  if (period === 'week') {
    return Array.from({ length: 7 }, (_, i) =>
      bucketKeyFor('week', new Date(now.getTime() - (6 - i) * 24 * 3600 * 1000))
    );
  }
  if (period === 'quarter') {
    return Array.from({ length: 3 }, (_, i) =>
      bucketKeyFor('quarter', new Date(now.getFullYear(), now.getMonth() - (2 - i), 1))
    );
  }
  // 'month': one bucket per week-of-month elapsed so far — a week that
  // hasn't happened yet isn't "no data", it's just not reached, so this
  // stops at the current week rather than the whole month.
  const weeksSoFar = Math.ceil(now.getDate() / 7);
  return Array.from({ length: weeksSoFar }, (_, i) => `WK ${i + 1}`);
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
  // Budget rules × ruleAppliesToMonth, computed live — same as Budget
  // screen's own `categories` (src/logic/budget/useLogic.ts) — rather than
  // read from the precomputed statsBudgetProgress/{month} doc, which only
  // gets (re)written on specific write events (a transaction, or a rule
  // being created/edited/deleted) and so goes stale for an ongoing
  // recurring rule the moment the calendar rolls into a new month with no
  // matching write yet — the Home preview was showing blank for an
  // otherwise fully budgeted month because of exactly that gap.
  const { data: statsMonthly, loading: statsMonthlyLoading } = useFirestoreDoc<StatsMonthly>(
    useMemo(() => (uid ? statsMonthlyRef(uid, currentMonthKey()) : null), [uid])
  );
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  // Tapping the currency chip switches which currency the whole app
  // displays amounts in — same write Settings' own currency picker makes
  // (src/logic/settings/useLogic.ts's setCurrency), just reachable directly
  // from Home too.
  const { data: exchangeRates } = useExchangeRates();
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const currencyOptions = exchangeRates
    .map((rate) => ({ code: rate.id, name: currencyName(rate.id) }))
    .filter((entry) => `${entry.code} ${entry.name}`.toLowerCase().includes(currencySearch.toLowerCase()));

  async function switchCurrency(code: string) {
    if (currencySaving || !uid) return;
    setCurrencySaving(true);
    setCurrencyError(null);
    try {
      await updateDoc(settingsRef(uid), { displayCurrency: code });
      setCurrencyPickerOpen(false);
      setCurrencySearch('');
    } catch (error) {
      setCurrencyError(error instanceof Error ? error.message : 'Could not switch currency.');
    } finally {
      setCurrencySaving(false);
    }
  }

  const breakdownQuery = useMemo(
    () =>
      uid ? query(transactionsRef(uid), where('date', '>=', Timestamp.fromDate(rangeStartFor(period, now)))) : null,
    [uid, period, now]
  );
  const { data: rangeTransactions, loading: breakdownLoading } =
    useFirestoreCollection<FirestoreTransaction>(breakdownQuery);

  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const totalBalance = round2(
    accounts.reduce((sum, account) => sum + toDisplay(ctx, account.currentBalance, account.currency), 0)
  );
  // Frozen or notSpendable accounts are excluded from what you can actually
  // spend right now, but still count toward net worth (`total`); a
  // non-excluded account's own lockedAmount (set aside without freezing the
  // whole wallet, see src/logic/walletDetail/useLogic.ts) is subtracted the
  // same way.
  const spendableBalance = round2(
    accounts
      .filter((account) => !account.frozen && !account.notSpendable)
      .reduce(
        (sum, account) =>
          sum + toDisplay(ctx, account.currentBalance - (account.lockedAmount ?? 0), account.currency),
        0
      )
  );
  const balance = { currency: ctx.display, total: totalBalance, spendable: spendableBalance };

  // Color stays tied to each account's own fixed position in `accounts`
  // (the same convention Wallets and Transaction History use), assigned
  // before the chart-only reordering below — so a wallet's color never
  // shifts just because its balance moved it to a different column.
  const wallets = arrangeCentered(
    accounts
      .map((account, index) => ({
        name: account.name,
        amount: toDisplay(ctx, account.currentBalance, account.currency),
        color: walletColor(index),
      }))
      .sort((a, b) => b.amount - a.amount)
  );
  const walletMax = Math.max(1, ...wallets.map((wallet) => wallet.amount));

  const budgets = useMemo(() => {
    const [y, m] = currentMonthKey().split('-').map(Number);
    const monthStr = currentMonthKey();
    return rules
      .map((rule) => {
        const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), y, m);
        if (!occurrence || rule.excludedMonths?.includes(monthStr)) return null;
        const ruleNative = rule.accountId ? accountCurrency.get(rule.accountId) ?? ctx.base : ctx.base;
        const spentBase = statsMonthly?.perCategorySpend?.[rule.categoryId] ?? 0;
        return {
          category: categoryName.get(rule.categoryId) ?? rule.categoryId,
          spent: round2(toDisplay(ctx, spentBase, ctx.base)),
          total: round2(toDisplay(ctx, rule.budgetedAmount * occurrence.multiplier, ruleNative)),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .slice(0, BUDGETS_PREVIEW_COUNT);
  }, [rules, statsMonthly, categoryName, accountCurrency, ctx]);

  const breakdown = useMemo(() => {
    const buckets = new Map<string, { day: string; income: number; expense: number }>();
    const order = expectedBucketKeysFor(period, now);
    order.forEach((key) => buckets.set(key, { day: key, income: 0, expense: 0 }));
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
      return {
        day: bucket.day,
        income: round2(bucket.income),
        expense: round2(bucket.expense),
        hasData: bucket.income > 0 || bucket.expense > 0,
      };
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
    currencyPickerOpen,
    setCurrencyPickerOpen,
    currencySearch,
    setCurrencySearch,
    currencyOptions,
    currencySaving,
    currencyError,
    switchCurrency,
    loading:
      authLoading ||
      accountsLoading ||
      categoriesLoading ||
      rulesLoading ||
      plannedPaymentsLoading ||
      statsMonthlyLoading ||
      ctxLoading ||
      breakdownLoading,
    error: accountsError,
  };
}
