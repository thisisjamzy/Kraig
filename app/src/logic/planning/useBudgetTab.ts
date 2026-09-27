'use client';

// Planning > Budget: "am I on track this month?" — the summary card
// (income, expenses and savings, actual against planned, and what's left
// to budget) and the month's buckets, each with the one action it needs.
//
// Savings are account based (src/viewmodels/savingsTransfers.ts): this
// month's actual is the real flow into/out of Savings Accounts, and the
// running total is today's balance — rewound to the month's end for a
// past month (every savings flow after it undone).

import { useMemo, useState } from 'react';
import { query, updateDoc, where, Timestamp } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { settingsRef, transactionsRef, transfersRef } from '@/src/shared/firestore/refs';
import { useExchangeRates } from '@/src/shared/firestore/queries';
import { round2, toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { currencyName } from '@/src/viewmodels/currencies';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { savingsTransactionFlow, savingsTransferFlow } from '@/src/viewmodels/savingsTransfers';
import { bucketCards, categoryCard, monthPhase } from '@/src/viewmodels/planning';
import type { FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';
import type { PlanningData } from './useLogic';

export type BudgetView = 'bucket' | 'category';

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) };
}
function today() {
  return new Date();
}

export function useBudgetTab(month: string, data: PlanningData) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { budget, transactionsById, transfersById, buckets, accounts, ctx } = data;
  const [view, setView] = useState<BudgetView>('bucket');

  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const accountType = useMemo(() => new Map(accounts.map((a) => [a.id, a.type])), [accounts]);

  // ---- Savings ----
  const isPast = monthPhase(month, today()) === 'past';
  const { start, end } = monthBounds(month);
  const sinceTxQuery = useMemo(
    () => (uid && isPast ? query(transactionsRef(uid), where('date', '>', Timestamp.fromDate(monthBounds(month).end))) : null),
    [uid, isPast, month]
  );
  const { data: sinceTransactions, loading: sinceTxLoading } = useFirestoreCollection<FirestoreTransaction>(sinceTxQuery);
  const sinceTrQuery = useMemo(
    () => (uid && isPast ? query(transfersRef(uid), where('date', '>', Timestamp.fromDate(monthBounds(month).end))) : null),
    [uid, isPast, month]
  );
  const { data: sinceTransfers, loading: sinceTrLoading } = useFirestoreCollection<FirestoreTransfer>(sinceTrQuery);

  const inMonth = (d: Date) => d >= start && d <= end;
  const monthTransactions = [...transactionsById.values()].filter((t) => (t.month ?? '') === month || (!t.month && inMonth(t.date.toDate())));
  const monthTransfers = [...transfersById.values()].filter((t) => inMonth(t.date.toDate()));
  const flowOf = (txs: FirestoreTransaction[], trs: FirestoreTransfer[]) =>
    round2(
      txs.reduce((s, t) => s + toDisplay(ctx, savingsTransactionFlow(t, accountType), accountCurrency.get(t.accountId) ?? ctx.base), 0) +
        trs.reduce((s, t) => s + toDisplay(ctx, savingsTransferFlow(t, accountType), accountCurrency.get(t.fromAccountId) ?? ctx.base), 0)
    );
  const savingsThisMonth = flowOf(monthTransactions, monthTransfers);
  const liveSavings = round2(
    accounts.filter(isSavingsAccount).reduce((s, a) => s + toDisplay(ctx, a.currentBalance, a.currency), 0)
  );
  const totalSaved = isPast ? round2(liveSavings - flowOf(sinceTransactions, sinceTransfers)) : liveSavings;

  // ---- Summary ----
  const sumItems = (type: string) => round2(budget.items.filter((i) => i.type === type).reduce((s, i) => s + i.planned, 0));
  const expensesSpent = round2(budget.categories.filter((g) => g.type === 'Expense').reduce((s, g) => s + g.actual, 0));
  const expensesPlanned = sumItems('Expense');
  const incomeActual = Math.max(0, budget.actualIncome);
  const summary = {
    income: { actual: incomeActual, planned: budget.plannedIncome, variance: round2(incomeActual - budget.plannedIncome) },
    expenses: { actual: expensesSpent, planned: expensesPlanned, variance: round2(expensesSpent - expensesPlanned) },
    savings: { actual: savingsThisMonth, planned: sumItems('Savings'), totalSaved },
    // The month's pool: planned income nothing claims yet. Negative = the
    // plan spends more than it expects to earn.
    leftToBudget: round2(budget.pool),
  };

  // ---- Cards ----
  const cards = useMemo(() => bucketCards(budget.buckets, { month, today: today() }), [budget.buckets, month]);
  const categories = useMemo(() => budget.categories.map(categoryCard), [budget.categories]);
  const bucketType = useMemo(() => new Map(buckets.map((b) => [b.id, b.type ?? 'Expense'])), [buckets]);

  // ---- Currency chip ----
  const { data: rates } = useExchangeRates();
  const currencyOptions = rates.map((rate) => ({ code: rate.id, name: currencyName(rate.id) }));
  async function setCurrency(code: string) {
    if (!uid || code === ctx.display) return;
    await updateDoc(settingsRef(uid), { displayCurrency: code });
  }

  return {
    currency: ctx.display,
    currencyOptions,
    setCurrency,
    summary,
    view,
    setView,
    cards,
    categories,
    bucketType,
    loading: data.loading || sinceTxLoading || sinceTrLoading,
  };
}
