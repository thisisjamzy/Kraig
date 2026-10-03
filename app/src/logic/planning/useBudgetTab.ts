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
import type { FlowType } from '@/src/shared/budget/flow';
import type { PlanningData } from './useLogic';

export type BudgetView = 'bucket' | 'category';
export type { FlowType };

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
  const { budget, totals, transactionsById, transfersById, buckets, accounts, ctx } = data;
  const [view, setView] = useState<BudgetView>('bucket');
  // The phone's type tabs: one flow type at a time, never mixed.
  const [flow, setFlow] = useState<FlowType>('Expense');

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
  // Every figure from the shared totals (src/shared/budget/monthTotals.ts):
  // savings are positive amounts set aside, transfers are their own row,
  // borrowed income is a sub-line of income.
  const summary = {
    income: {
      actual: totals.income.received,
      planned: totals.income.expected,
      borrowed: totals.income.borrowed,
      variance: round2(totals.income.received - totals.income.expected),
    },
    expenses: { actual: totals.expenses.spent, planned: totals.expenses.planned, variance: round2(totals.expenses.spent - totals.expenses.planned) },
    savings: { actual: totals.savings.saved, planned: totals.savings.planned, withdrawn: totals.savings.withdrawn, totalSaved },
    transfers: { actual: totals.transfers.moved, planned: totals.transfers.planned },
    leftToBudget: totals.leftToPlan,
    availableNow: totals.availableNow,
    availableByMonthEnd: totals.availableByMonthEnd,
  };

  // ---- Cards ----
  const cards = useMemo(() => bucketCards(budget.buckets, { month, today: today() }), [budget.buckets, month]);
  const bucketFlow = useMemo(() => new Map(buckets.map((b) => [b.id, (b.type ?? 'Expense') as FlowType])), [buckets]);
  const cardsOf = (type: FlowType) => cards.filter((c) => (bucketFlow.get(c.id) ?? 'Expense') === type);
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
    flow,
    setFlow,
    cardsOf,
    cards,
    categories,
    bucketType,
    loading: data.loading || sinceTxLoading || sinceTrLoading,
  };
}
