'use client';

import { useMemo, useState } from 'react';
import { limit, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { RefreshCw, ArrowLeftRight, Clock, Download } from 'lucide-react';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transactionsRef, transfersRef, plannedPaymentsRef, accountRef, reconciliationsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { computeUpcomingPayments } from '@/src/shared/firestore/upcomingPayments';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor } from '@/src/viewmodels/wallets';
import type { FirestoreAccount, FirestoreTransaction, FirestoreTransfer, FirestorePlannedPayment, FirestoreReconciliation } from '@/src/shared/firestore/types';
import { countsInFigures } from '@/src/shared/firestore/types';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { balanceHistory, committedByAccount, freeTone, lastReconciledByAccount } from '@/src/logic/wallets/model';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

const ICONS = [RefreshCw, ArrowLeftRight, Clock, Download];
const HISTORY_MONTHS = 6;
const UPCOMING_HORIZON_DAYS = 30;

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(ts: Timestamp) {
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

/** 'Week' | 'Month' | 'Quarter' -> the Date a transactions query's range should start at. */
function periodStart(period: string): Date {
  const now = new Date();
  if (period === 'Week') now.setDate(now.getDate() - 6);
  else if (period === 'Quarter') now.setMonth(now.getMonth() - 2, 1);
  else now.setDate(1); // Month
  now.setHours(0, 0, 0, 0);
  return now;
}

function historyStart(): Date {
  const now = new Date();
  now.setMonth(now.getMonth() - (HISTORY_MONTHS - 1), 1);
  now.setHours(0, 0, 0, 0);
  return now;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short' });
}
function monthKeyOf(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

export function useLogic(walletId: string, periods: readonly string[]) {
  const [period, setPeriod] = useState<string>(periods[0]);
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const walletRef = useMemo(() => (uid ? accountRef(uid, walletId) : null), [uid, walletId]);
  const { data: wallet, loading: walletLoading, error: walletError } = useFirestoreDoc<FirestoreAccount>(walletRef);
  const { data: categories } = useCategories();
  const { data: accounts } = useAccounts();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const transactionsQuery = useMemo(
    () =>
      uid
        ? query(
            transactionsRef(uid),
            where('accountId', '==', walletId),
            where('date', '>=', Timestamp.fromDate(periodStart(period))),
            orderBy('date', 'desc')
          )
        : null,
    [uid, walletId, period]
  );
  const {
    data: transactionDocsAll,
    loading: transactionsLoading,
    error: transactionsError,
  } = useFirestoreCollection<FirestoreTransaction>(transactionsQuery);
  // Excluded transactions (a debt changed to record only) don't count anywhere.
  const transactionDocs = useMemo(() => transactionDocsAll.filter(countsInFigures), [transactionDocsAll]);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (categoryId: string | null) => (categoryId && map.get(categoryId)) || categoryId || '';
  }, [categories]);

  const transactions = transactionDocs.map((transaction, index) => ({
    id: transaction.id,
    title: categoryName(transaction.categoryId),
    amount: toDisplay(ctx, transaction.amount, wallet?.currency ?? ctx.base),
    currency: ctx.display,
    date: formatDate(transaction.date),
    iconColor: walletColor(index),
    // The web page's table.
    when: transaction.date.toDate(),
    description: transaction.description || categoryName(transaction.categoryId),
    signed: toDisplay(ctx, transaction.direction === 'Inflow' ? transaction.amount : -transaction.amount, wallet?.currency ?? ctx.base),
  }));

  // History (last HISTORY_MONTHS, independent of the transaction list's own
  // Week/Month/Quarter tab above) — feeds the cashflow chart and the
  // spending-trend line, both of which need to look further back than the
  // list itself ever does.
  // Every range-filtered query below also explicitly orders by the same
  // field (even though this hook doesn't care about order) so it matches a
  // real Firestore composite index — see ../../../firestore.indexes.json —
  // rather than the implicit-ascending order Firestore assumes for a range
  // filter with no orderBy, which wouldn't match a descending index.
  const historyQuery = useMemo(
    () =>
      uid
        ? query(
            transactionsRef(uid),
            where('accountId', '==', walletId),
            where('date', '>=', Timestamp.fromDate(historyStart())),
            orderBy('date', 'desc')
          )
        : null,
    [uid, walletId]
  );
  const { data: historyTransactionsAll, loading: historyLoading } = useFirestoreCollection<FirestoreTransaction>(historyQuery);
  const historyTransactions = useMemo(() => historyTransactionsAll.filter(countsInFigures), [historyTransactionsAll]);

  const transfersOutQuery = useMemo(
    () =>
      uid
        ? query(
            transfersRef(uid),
            where('fromAccountId', '==', walletId),
            where('date', '>=', Timestamp.fromDate(historyStart())),
            orderBy('date', 'desc')
          )
        : null,
    [uid, walletId]
  );
  const { data: transfersOut, loading: transfersOutLoading } = useFirestoreCollection<FirestoreTransfer>(transfersOutQuery);

  const transfersInQuery = useMemo(
    () =>
      uid
        ? query(
            transfersRef(uid),
            where('toAccountId', '==', walletId),
            where('date', '>=', Timestamp.fromDate(historyStart())),
            orderBy('date', 'desc')
          )
        : null,
    [uid, walletId]
  );
  const { data: transfersIn, loading: transfersInLoading } = useFirestoreCollection<FirestoreTransfer>(transfersInQuery);

  const monthBuckets = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = HISTORY_MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: monthKeyOf(d), label: monthLabel(d) });
    }
    return months;
  }, []);

  const nativeCurrency = wallet?.currency ?? ctx.base;

  // Cashflow — every transaction (income/expense) AND transfer in/out of
  // this account, bucketed by month: "how money has moved through the
  // account", not just its category spend.
  const cashflow = useMemo(() => {
    const buckets = new Map(monthBuckets.map((m) => [m.key, { label: m.label, inflow: 0, outflow: 0 }]));
    for (const t of historyTransactions) {
      const bucket = buckets.get(monthKeyOf(t.date.toDate()));
      if (!bucket) continue;
      const amount = toDisplay(ctx, t.amount, nativeCurrency);
      if (t.direction === 'Inflow') bucket.inflow += amount;
      else bucket.outflow += amount;
    }
    for (const t of transfersIn) {
      const bucket = buckets.get(monthKeyOf(t.date.toDate()));
      if (bucket) bucket.inflow += toDisplay(ctx, t.amount, nativeCurrency);
    }
    for (const t of transfersOut) {
      const bucket = buckets.get(monthKeyOf(t.date.toDate()));
      if (bucket) bucket.outflow += toDisplay(ctx, t.amount + (t.charges ?? 0), nativeCurrency);
    }
    return monthBuckets.map((m) => {
      const b = buckets.get(m.key)!;
      return { label: b.label, inflow: round2(b.inflow), outflow: round2(b.outflow) };
    });
  }, [monthBuckets, historyTransactions, transfersIn, transfersOut, ctx, nativeCurrency]);
  const cashflowMax = Math.max(1, ...cashflow.map((c) => Math.max(c.inflow, c.outflow)));

  // Spending trend — the same history's expense-only totals per month, as
  // a line (src/widgets/TrendChart).
  const spendingTrend = useMemo(
    () => cashflow.map((c) => ({ label: c.label, value: c.outflow })),
    [cashflow]
  );

  // Where money leaving this account tends to go — transfers out grouped
  // by destination account.
  const transferDestinations = useMemo(() => {
    const accountName = new Map(accounts.map((a) => [a.id, a.name]));
    const byDestination = new Map<string, number>();
    for (const t of transfersOut) {
      const amount = toDisplay(ctx, t.amount, nativeCurrency);
      byDestination.set(t.toAccountId, (byDestination.get(t.toAccountId) ?? 0) + amount);
    }
    return Array.from(byDestination.entries())
      .map(([accountId, value], index) => ({
        label: accountName.get(accountId) ?? 'Unknown wallet',
        value: round2(value),
        color: walletColor(index),
      }))
      .sort((a, b) => b.value - a.value);
  }, [transfersOut, accounts, ctx, nativeCurrency]);

  // Planned payments tied specifically to this account, due in the next
  // UPCOMING_HORIZON_DAYS — "how much do I need here to cover what's
  // coming".
  const plannedPaymentsQuery = useMemo(
    () => (uid ? query(plannedPaymentsRef(uid), where('archived', '==', false), where('accountId', '==', walletId)) : null),
    [uid, walletId]
  );
  const { data: plannedPayments, loading: plannedPaymentsLoading } =
    useFirestoreCollection<FirestorePlannedPayment>(plannedPaymentsQuery);
  const upcomingForAccount = useMemo(
    () => computeUpcomingPayments(plannedPayments, accounts, categories, ctx, UPCOMING_HORIZON_DAYS),
    [plannedPayments, accounts, categories, ctx]
  );
  const upcomingTotal = round2(upcomingForAccount.reduce((sum, p) => sum + p.amount, 0));

  // Back to the page the user came from (skipping forms); '/wallets' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/wallets');
  }

  function iconFor(index: number) {
    return ICONS[index % ICONS.length];
  }

  const availableAmount = wallet ? toDisplay(ctx, wallet.currentBalance - (wallet.lockedAmount ?? 0), wallet.currency) : 0;
  const lockedAmount = wallet ? toDisplay(ctx, wallet.lockedAmount ?? 0, wallet.currency) : 0;
  // ---- The wallet's page on tablet and web ----
  // Committed: this month's unpaid lines paid from this wallet; free: the
  // balance after them; the last reconciliation that reported it; the
  // balance at each month end; and those unpaid lines as upcoming payments.
  const { budget } = useMonthBudget(monthKeyOf(new Date()));
  const linesFromWallet = useMemo(
    () => budget.items.filter((l) => l.type !== 'Income' && !l.archived && !l.closed && l.accountId === walletId && l.available - l.actual > 0.5),
    [budget.items, walletId]
  );
  const committed = round2(committedByAccount(budget.items).get(walletId) ?? 0);
  const balanceNow = wallet ? toDisplay(ctx, wallet.currentBalance, wallet.currency) : 0;
  const free = round2(balanceNow - committed);
  const { data: reconciliations } = useFirestoreCollection<FirestoreReconciliation>(
    useMemo(() => (uid ? query(reconciliationsRef(uid), orderBy('performedAt', 'desc'), limit(30)) : null), [uid])
  );
  const lastReconciled =
    lastReconciledByAccount(reconciliations.map((r) => ({ performedAt: r.performedAt.toDate(), reportedBalances: r.reportedBalances }))).get(walletId) ?? null;
  const balanceByMonth = useMemo(() => {
    const flows = [
      ...historyTransactions.map((t) => ({ date: t.date.toDate(), signed: toDisplay(ctx, t.direction === 'Inflow' ? t.amount : -t.amount, nativeCurrency) })),
      ...transfersIn.map((t) => ({ date: t.date.toDate(), signed: toDisplay(ctx, t.amount, nativeCurrency) })),
      ...transfersOut.map((t) => ({ date: t.date.toDate(), signed: -toDisplay(ctx, t.amount + (t.charges ?? 0), nativeCurrency) })),
    ];
    return balanceHistory(balanceNow, flows, monthBuckets.map((m) => m.key), new Date()).map((p, i) => ({ ...p, label: monthBuckets[i].label }));
  }, [historyTransactions, transfersIn, transfersOut, ctx, nativeCurrency, balanceNow, monthBuckets]);
  const upcomingLines = linesFromWallet
    .map((l) => ({ key: l.key, name: l.name, basket: l.bucketName, due: l.due, amount: round2(l.available - l.actual), href: `/budget/item/${l.bucketId}/${l.itemId}?month=${l.month}` }))
    .sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));

  const upcomingShortfall = round2(Math.max(0, upcomingTotal - availableAmount));

  return {
    wallet,
    committed,
    free,
    freeTone: freeTone(free, balanceNow),
    lastReconciled,
    balanceByMonth,
    upcomingLines,
    balance: wallet ? toDisplay(ctx, wallet.currentBalance, wallet.currency) : 0,
    lockedAmount,
    availableAmount,
    currency: ctx.display,
    transactions,
    period,
    setPeriod,
    cashflow,
    cashflowMax,
    spendingTrend,
    transferDestinations,
    upcomingForAccount,
    upcomingTotal,
    upcomingShortfall,
    upcomingHorizonDays: UPCOMING_HORIZON_DAYS,
    loading:
      authLoading ||
      walletLoading ||
      transactionsLoading ||
      ctxLoading ||
      historyLoading ||
      transfersOutLoading ||
      transfersInLoading ||
      plannedPaymentsLoading,
    error: walletError || transactionsError,
    goBack,
    iconFor,
  };
}
