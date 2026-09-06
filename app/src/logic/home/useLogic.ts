'use client';

import { useMemo, useState } from 'react';
import { query, where, orderBy, limit, updateDoc, Timestamp } from 'firebase/firestore';
import { ArrowUpRight, ArrowDownLeft, PiggyBank, type LucideIcon } from 'lucide-react';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transactionsRef, plannedPaymentsRef, settingsRef, unjustifiedWalletRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { computeUpcomingPayments } from '@/src/shared/firestore/upcomingPayments';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor, arrangeCentered, isSavingsAccount } from '@/src/viewmodels/wallets';
import { currencyName } from '@/src/viewmodels/currencies';
import { dueLabel, formatDueDate } from '@/src/logic/paymentsCalendar/useLogic';
import type { FirestoreAccount, FirestorePlannedPayment, FirestoreTransaction } from '@/src/shared/firestore/types';

// Analytics now owns Quarter/Year (src/logic/statistics/useLogic.ts) — Home
// keeps the shorter-range Week/Month views instead, since those are the
// ones worth checking in on day to day.
export type SpendingPeriod = 'week' | 'month';

const UPCOMING_PAYMENTS_HORIZON_DAYS = 30;
const UPCOMING_PAYMENTS_PREVIEW_COUNT = 3;
const RECENT_TRANSACTIONS_PREVIEW_COUNT = 5;

// Same set src/logic/transactionHistory/useLogic.ts's own card list uses —
// Home's Recent Transactions panel renders with that same card, so the icon
// needs to match.
const TYPE_ICONS: Record<string, LucideIcon> = {
  Expense: ArrowUpRight,
  Income: ArrowDownLeft,
  Savings: PiggyBank,
};

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

function rangeStartFor(period: SpendingPeriod, now: Date) {
  // Calendar-day aligned (midnight), not now.getTime() minus a fixed
  // duration — the latter cuts the oldest day off partway through
  // whenever "now" isn't exactly midnight, silently excluding that day's
  // earlier transactions from the query and rendering it as a blank bar
  // even though real transactions exist on it.
  if (period === 'week') return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function bucketKeyFor(period: SpendingPeriod, date: Date) {
  if (period === 'week') return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  return `WK ${Math.ceil(date.getDate() / 7)}`;
}

// Every bucket the period spans, oldest to newest — walked independently of
// whatever transactions actually exist, so a day/week with nothing recorded
// still gets a column (rendered as a blank/grey placeholder, see
// HomeScreen.tsx) instead of silently disappearing from the chart and
// making the timeline look shorter than it really is. For 'month' this is
// every week of the CURRENT calendar month, including ones "now" hasn't
// reached yet — those just render with no data, rather than being hidden
// entirely (a household checking in on the 3rd shouldn't see a 1-week-wide
// chart with the rest of the month missing).
function expectedBucketKeysFor(period: SpendingPeriod, now: Date): string[] {
  if (period === 'week') {
    return Array.from({ length: 7 }, (_, i) =>
      bucketKeyFor('week', new Date(now.getTime() - (6 - i) * 24 * 3600 * 1000))
    );
  }
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const totalWeeks = Math.ceil(daysInMonth / 7);
  return Array.from({ length: totalWeeks }, (_, i) => `WK ${i + 1}`);
}

export function useLogic() {
  const [period, setPeriod] = useState<SpendingPeriod>('week');
  const now = useMemo(() => new Date(), []);
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const { data: accounts, loading: accountsLoading, error: accountsError } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const activePlannedPaymentsQuery = useMemo(
    () => (uid ? query(plannedPaymentsRef(uid), where('archived', '==', false)) : null),
    [uid]
  );
  const { data: plannedPayments, loading: plannedPaymentsLoading } = useFirestoreCollection<FirestorePlannedPayment>(
    activePlannedPaymentsQuery
  );
  // Most recent transactions across every account, not scoped to a month —
  // this is a quick "what just happened" glance, not a budget-progress view
  // (that's the Budget screen's own job).
  const recentTransactionsQuery = useMemo(
    () => (uid ? query(transactionsRef(uid), orderBy('date', 'desc'), limit(RECENT_TRANSACTIONS_PREVIEW_COUNT)) : null),
    [uid]
  );
  const { data: recentTransactionDocs, loading: recentTransactionsLoading } =
    useFirestoreCollection<FirestoreTransaction>(recentTransactionsQuery);
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
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  // Same color-per-account convention the wallets chart below and
  // TransactionHistoryScreen use (walletColor, keyed by an account's own
  // fixed position in the accounts list) — this panel's cards use the exact
  // same card as that screen, so need the same colors.
  const accountColor = useMemo(
    () => new Map(accounts.map((account, index) => [account.id, walletColor(index)])),
    [accounts]
  );
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
  // PRD-AUDIT-RECONCILIATION.md section 2.2 — the Unjustified wallet's own
  // balance IS the household-wide unaccounted gap, read directly here
  // (bypassing useAccounts(), which deliberately filters this wallet out
  // everywhere else) so the Home card can surface it as its own figure
  // rather than folding it into total/spendable, where it would misstate
  // both.
  const unjustifiedRef = useMemo(() => (uid ? unjustifiedWalletRef(uid) : null), [uid]);
  const { data: unjustifiedWallet } = useFirestoreDoc<FirestoreAccount>(unjustifiedRef);
  const unjustifiedBalance = round2(toDisplay(ctx, unjustifiedWallet?.currentBalance ?? 0, unjustifiedWallet?.currency ?? ctx.base));

  // Savings is account-type based (see src/viewmodels/savingsTransfers.ts) —
  // the live compounding total across every Savings Account, not this
  // month's flow. Not the wallet lockedAmount figure this tile used to show
  // either (which read 0 for any household that never used per-wallet
  // locking, even with real savings activity every month) — a Savings
  // Account's own currentBalance already bakes in everything that ever
  // touched it, so this needs no query of its own.
  const netSavings = round2(
    accounts.filter(isSavingsAccount).reduce((sum, account) => sum + toDisplay(ctx, account.currentBalance, account.currency), 0)
  );

  // How far into the current calendar month "now" falls, as a 0-100 percent
  // for the balance card's progress bar.
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthProgress = round2((now.getDate() / daysInMonth) * 100);

  const balance = {
    currency: ctx.display,
    total: totalBalance,
    spendable: spendableBalance,
    unjustified: unjustifiedBalance,
    savings: netSavings,
    monthProgress,
  };

  // Color stays tied to each account's own fixed position in `accounts`
  // (the same convention Wallets and Transaction History use), assigned
  // before the chart-only reordering below — so a wallet's color never
  // shifts just because its balance moved it to a different column.
  const wallets = arrangeCentered(
    accounts
      .map((account, index) => ({
        id: account.id,
        // The chart's x-axis wraps/distorts with a full wallet name (see
        // FirestoreAccount.shortName's header) — always <=5 characters here,
        // either the user's own short name or a truncated fallback.
        name: (account.shortName || account.name).slice(0, 5),
        amount: toDisplay(ctx, account.currentBalance, account.currency),
        color: walletColor(index),
      }))
      .sort((a, b) => b.amount - a.amount)
  );
  const walletMax = Math.max(1, ...wallets.map((wallet) => wallet.amount));

  // Same card shape src/logic/transactionHistory/useLogic.ts's own list
  // uses — this panel renders with that exact same card component styling.
  const recentTransactions = useMemo(
    () =>
      recentTransactionDocs.map((transaction) => {
        const nativeCurrency = accountCurrency.get(transaction.accountId) ?? ctx.base;
        return {
          id: transaction.id,
          title: categoryName.get(transaction.categoryId ?? '') ?? transaction.categoryId ?? '—',
          description: transaction.description,
          account: accountName.get(transaction.accountId) ?? transaction.accountId,
          amount: round2(toDisplay(ctx, transaction.amount, nativeCurrency)),
          currency: ctx.display,
          date: transaction.date.toDate().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
          icon: TYPE_ICONS[transaction.type] ?? ArrowUpRight,
          iconColor: accountColor.get(transaction.accountId) ?? walletColor(0),
          editHref: `/edit-transaction/${transaction.id}`,
        };
      }),
    [recentTransactionDocs, accountCurrency, accountName, accountColor, categoryName, ctx]
  );

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
    recentTransactions,
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
      plannedPaymentsLoading ||
      recentTransactionsLoading ||
      ctxLoading ||
      breakdownLoading,
    error: accountsError,
  };
}
