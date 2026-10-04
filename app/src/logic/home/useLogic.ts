'use client';

// Money Home: everything the dashboard shows, from this month's budget
// (useMonthBudget and monthTotals), last month's for comparison, the Ready
// to pay queue, the daily spending guide, accounts, debts and recent
// activity. The screen (src/screens/Home/HomeScreen.tsx) only draws it.
//
// Upcoming payments are budget lines that pay out (expenses, savings,
// transfers), never income. Spending categories are expense categories
// only (a refund is money in, not a category to spend on).

import { useMemo, useState } from 'react';
import { doc, limit, orderBy, query, Timestamp, updateDoc, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { paymentQueueRef, settingsRef, transactionsRef, transfersRef, unjustifiedWalletRef } from '@/src/shared/firestore/refs';
import { useCategories, useExchangeRates } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useReadyToPay, type ReadyEntry } from '@/src/shared/hooks/useReadyToPay';
import { addMonths, monthKeyOf } from '@/src/shared/budget/monthBudget';
import { dailyGuide, variableBudget, variableSpendByDay } from '@/src/shared/budget/dailyGuide';
import { useLogic as useDebts } from '@/src/logic/debtsList/useLogic';
import { isSavingsAccount, walletColor } from '@/src/viewmodels/wallets';
import { currencyName } from '@/src/viewmodels/currencies';
import { categoryInsight, dueText, greetingFor, upcomingLines, weekBuckets, type FlowBar } from '@/src/viewmodels/home';
import type { FirestoreAccount, FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';
import { countsInFigures } from '@/src/shared/firestore/types';

const LATEST = 4;
const DAY = 86_400_000;

export type FlowView = 'week' | 'month';

export interface HomeTx {
  id: string;
  kind: 'income' | 'expense' | 'savings' | 'transfer';
  name: string;
  when: Date;
  amount: number;
  href: string;
}

export function useLogic() {
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;
  const [now] = useState(() => new Date());
  const month = monthKeyOf(now);
  const cur = useMonthBudget(month);
  const prev = useMonthBudget(addMonths(month, -1));
  const ready = useReadyToPay();
  const debts = useDebts();
  const { data: categories } = useCategories();
  const ctx = cur.ctx;
  const currency = ctx.display;
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [flowView, setFlowView] = useState<FlowView>('week');

  const accounts = useMemo(() => cur.accounts.filter((a) => !a.archived), [cur.accounts]);
  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const display = (amount: number, accountId: string | null | undefined) => toDisplay(ctx, amount, (accountId && accountCurrency.get(accountId)) || ctx.base);
  const balanceOf = (a: FirestoreAccount) => toDisplay(ctx, a.currentBalance, a.currency);

  // ---- Balance ----
  const shown = accountFilter === 'all' ? accounts : accounts.filter((a) => a.id === accountFilter);
  const cash = round2(shown.reduce((s, a) => s + balanceOf(a), 0));
  const savings = round2(shown.filter(isSavingsAccount).reduce((s, a) => s + balanceOf(a), 0));
  const spendable = round2(
    shown.filter((a) => !a.frozen && !a.notSpendable && !isSavingsAccount(a)).reduce((s, a) => s + toDisplay(ctx, a.currentBalance - (a.lockedAmount ?? 0), a.currency), 0)
  );
  const allSpendable = round2(
    accounts.filter((a) => !a.frozen && !a.notSpendable && !isSavingsAccount(a)).reduce((s, a) => s + toDisplay(ctx, a.currentBalance - (a.lockedAmount ?? 0), a.currency), 0)
  );
  const { data: unjustified } = useFirestoreDoc<FirestoreAccount>(useMemo(() => (uid ? unjustifiedWalletRef(uid) : null), [uid]));
  const unexplained = round2(toDisplay(ctx, unjustified?.currentBalance ?? 0, unjustified?.currency ?? ctx.base));

  // ---- This month ----
  const t = cur.totals;
  const incomeLines = cur.budget.items.filter((i) => i.type === 'Income' && !i.archived);
  const stillExpectedNames = incomeLines.filter((i) => i.available - i.actual > 0.5).map((i) => i.name);

  // ---- Ready to pay, or today's allowance ----
  const readyTotal = round2(ready.entries.reduce((s, e) => s + toDisplay(ctx, e.amount + (e.fee ?? 0), e.currency), 0));
  const canPayNow = round2(ready.proposed.reduce((s, e) => s + toDisplay(ctx, e.amount + (e.fee ?? 0), e.currency), 0));
  const waiting = round2(ready.notEnough.reduce((s, e) => s + toDisplay(ctx, e.amount + (e.fee ?? 0), e.currency), 0));
  const waitingFor = ready.notEnough.find((e) => e.trigger.incomeName)?.trigger.incomeName ?? null;

  const guide = useMemo(() => {
    const v = variableBudget(cur.budget);
    if (v.planned <= 0) return null;
    const expenses = [...cur.transactionsById.values()]
      .filter((x) => x.type === 'Expense')
      .map((x) => ({ id: x.id, spend: display(x.direction === 'Outflow' ? x.amount : -x.amount, x.accountId), date: x.date.toDate(), month: x.month ?? monthKeyOf(x.date.toDate()) }));
    const fixedStillDue = cur.budget.items
      .filter((i) => !i.archived && !i.closed && ((i.type === 'Expense' && i.expenseKind !== 'variable') || i.type === 'Savings'))
      .reduce((s, i) => s + Math.max(0, i.available - i.actual), 0);
    return dailyGuide({
      today: now,
      variablePlanned: v.planned,
      variableLeft: v.left,
      spentByDay: variableSpendByDay(cur.budget, expenses),
      availableNow: t.availableNow,
      expectedStill: t.income.notYetReceived,
      fixedStillDue,
    });
    // display depends on ctx and accounts, both in the deps through cur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur.budget, cur.transactionsById, t, now]);

  // ---- Spending ----
  const prevCats = new Map(prev.budget.categories.filter((c) => c.type === 'Expense').map((c) => [c.categoryId, c.actual]));
  const expenseCats = cur.budget.categories
    .filter((c) => c.type === 'Expense' && c.actual > 0.5 && !/refund/i.test(c.name))
    .sort((a, b) => b.actual - a.actual);
  const spending = {
    spent: t.expenses.spent,
    planned: t.expenses.planned,
    last: prev.totals.expenses.spent,
    change: prev.totals.expenses.spent > 0 ? (t.expenses.spent - prev.totals.expenses.spent) / prev.totals.expenses.spent : null,
    top: expenseCats.slice(0, 4).map((c) => ({ id: c.categoryId, name: c.name, amount: c.actual })),
    insight: categoryInsight(
      expenseCats.map((c) => ({ name: c.name, now: c.actual, before: prevCats.get(c.categoryId) ?? 0 })),
      t.expenses.spent,
      prev.totals.expenses.spent
    ),
  };

  // ---- Income ----
  const sumBy = (sub: string, f: (i: (typeof incomeLines)[number]) => number) => round2(incomeLines.filter((i) => (i.incomeSubtype ?? 'earned') === sub).reduce((s, i) => s + f(i), 0));
  const earnedIn = sumBy('earned', (i) => i.actual);
  const borrowedIn = t.income.borrowed;
  const sources = [
    { id: 'earned', label: 'Earned', received: earnedIn, expected: sumBy('earned', (i) => i.available) },
    { id: 'debt', label: 'Debt financing', received: borrowedIn, expected: t.income.expectedBorrowed },
    { id: 'other', label: 'Other', received: round2(Math.max(0, t.income.received - earnedIn - borrowedIn)), expected: sumBy('other', (i) => i.available) },
  ];
  const income = {
    received: t.income.received,
    expected: t.income.expected,
    change: prev.totals.income.received > 0 ? (t.income.received - prev.totals.income.received) / prev.totals.income.received : null,
    sources,
  };

  // ---- Transactions ----
  const { data: recentTxAll } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid ? query(transactionsRef(uid), orderBy('date', 'desc'), limit(LATEST)) : null), [uid])
  );
  // Excluded transactions (a debt changed to record only) don't count anywhere.
  const recentTx = useMemo(() => recentTxAll.filter(countsInFigures), [recentTxAll]);
  const { data: recentTransfers } = useFirestoreCollection<FirestoreTransfer>(
    useMemo(() => (uid ? query(transfersRef(uid), orderBy('date', 'desc'), limit(LATEST)) : null), [uid])
  );
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const accountName = useMemo(() => new Map(cur.accounts.map((a) => [a.id, a.name])), [cur.accounts]);
  const latest: HomeTx[] = [
    ...recentTx.map((x): HomeTx => {
      const kind = x.type === 'Income' ? 'income' : x.type === 'Savings' ? 'savings' : 'expense';
      const amount = display(x.amount, x.accountId);
      return {
        id: x.id,
        kind,
        name: x.description || categoryName.get(x.categoryId ?? '') || (kind === 'income' ? 'Income' : 'Expense'),
        when: x.date.toDate(),
        amount: kind === 'income' || (kind === 'expense' && x.direction === 'Inflow') ? amount : -amount,
        href: `/transactions/${x.id}`,
      };
    }),
    ...recentTransfers.map(
      (x): HomeTx => ({
        id: `transfer:${x.id}`,
        kind: 'transfer',
        name: `${accountName.get(x.fromAccountId) ?? 'Account'} to ${x.toAccountId ? (accountName.get(x.toAccountId) ?? 'account') : 'outside'}`,
        when: x.date.toDate(),
        amount: display(x.amount, x.fromAccountId),
        href: `/edit-transfer/${x.id}`,
      })
    ),
  ]
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, LATEST);

  async function skip(entry: ReadyEntry) {
    if (!uid) return;
    await updateDoc(doc(paymentQueueRef(uid), entry.id), { status: 'skipped' });
  }
  async function confirmOne(entry: ReadyEntry) {
    return ready.confirm([{ entry, amount: entry.amount, accountId: entry.accountId }]);
  }

  // ---- Upcoming payments: what pays out, never income ----
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayMs = today.getTime();
  const upcoming = upcomingLines(cur.budget.items).map((i) => ({
      key: i.key,
      name: i.name,
      bucket: i.bucketName,
      amount: round2(i.available - i.actual),
      due: dueText(i.due!, today),
      late: i.due! < today,
      href: `/budget/item/${i.bucketId}/${i.itemId}?month=${i.month}`,
    }));

  // ---- Accounts: balance and what this month's unpaid lines will take ----
  const committed = new Map<string, number>();
  for (const i of cur.budget.items) {
    if (i.type === 'Income' || i.archived || i.closed || !i.accountId) continue;
    committed.set(i.accountId, (committed.get(i.accountId) ?? 0) + Math.max(0, i.available - i.actual));
  }
  const accountRows = accounts
    .map((a) => ({ id: a.id, name: a.name, color: walletColor(cur.accounts.indexOf(a)), balance: round2(balanceOf(a)), committed: round2(committed.get(a.id) ?? 0) }))
    .sort((a, b) => b.balance - a.balance);

  // ---- Cash flow: last 30 days by week, or the last 6 months ----
  const flowFrom = flowView === 'week' ? new Date(today.getTime() - 29 * DAY) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const { data: flowTxAll } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid ? query(transactionsRef(uid), where('date', '>=', Timestamp.fromDate(flowFrom))) : null),
    // flowFrom changes only with the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, flowView])
  );
  const flowTx = useMemo(() => flowTxAll.filter(countsInFigures), [flowTxAll]);
  const flow: FlowBar[] = useMemo(
    () =>
      weekBuckets(
        flowTx
          .filter((x) => x.type === 'Income' || x.type === 'Expense')
          .map((x) => ({
            date: x.date.toDate(),
            income: x.type === 'Income' && x.direction === 'Inflow' ? display(x.amount, x.accountId) : 0,
            expense: x.type === 'Expense' ? (x.direction === 'Outflow' ? 1 : -1) * display(x.amount, x.accountId) : 0,
          })),
        flowView,
        new Date(todayMs)
      ),
    // display reads ctx and accounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flowTx, flowView, todayMs, ctx, accountCurrency]
  );

  // ---- Plan ----
  const plan = [
    { id: 'expenses', label: 'Expenses', done: t.expenses.spent, planned: t.expenses.planned, verb: 'spent' },
    { id: 'savings', label: 'Savings', done: t.savings.saved, planned: t.savings.planned, verb: 'saved' },
    { id: 'transfers', label: 'Transfers', done: t.transfers.moved, planned: t.transfers.planned, verb: 'moved' },
  ];

  // ---- Debt ----
  const nextDebt = [...debts.debts].filter((d) => d.nextPaymentDate && d.balance > 0).sort((a, b) => a.nextPaymentDate!.getTime() - b.nextPaymentDate!.getTime())[0] ?? null;

  // ---- Currency chip ----
  const { data: rates } = useExchangeRates();
  const currencyOptions = rates.map((r) => ({ code: r.id, name: currencyName(r.id) }));
  async function switchCurrency(code: string) {
    if (uid) await updateDoc(settingsRef(uid), { displayCurrency: code });
  }

  const name = user?.displayName?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || '';
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

  return {
    now,
    currency,
    greeting: greetingFor(now, name),
    daysLeft,
    accounts,
    accountFilter,
    setAccountFilter,
    cash,
    savings,
    spendable,
    allSpendable,
    unexplained,
    received: t.income.received,
    expected: t.income.expected,
    stillExpected: t.income.notYetReceived,
    stillExpectedNames,
    ready: { count: ready.count, total: readyTotal, canPayNow, waiting, waitingFor, entries: ready.entries, busy: ready.busy, error: ready.error },
    guide,
    spending,
    income,
    latest,
    skip,
    confirmOne,
    upcoming,
    accountRows,
    flow,
    flowView,
    setFlowView,
    plan,
    debt: { total: debts.debtSummary.totalDebt, count: debts.debtSummary.debtCount, next: nextDebt },
    currencyOptions,
    switchCurrency,
    loading: authLoading || cur.loading,
    error: null as string | null,
  };
}

export type HomeLogic = ReturnType<typeof useLogic>;
