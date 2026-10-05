'use client';

// Everything the finance Insights page reads, loaded once and turned into
// src/viewmodels/finance's inputs (FinData): every transaction, transfer,
// budget move and overspend settlement, the buckets and their items, and
// each month's budget built with the same buildMonthBudget the Planning
// screens use — so a figure here always matches Planning.

import { useMemo } from 'react';
import { query, setDoc } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import {
  allocationsRef,
  bucketsRef,
  financeSettingsRef,
  overspendJustificationsRef,
  transactionsRef,
  transfersRef,
} from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useBucketLineItemsByBucket } from '@/src/shared/hooks/useBucketLineItemsByBucket';
import { incomeSubtypeOfTransaction, savingsSign } from '@/src/shared/budget/flow';
import { BUDGETS_V2_START, buildLegacyLinks, buildMonthBudget, endpointKey, monthKeyOf, resolveLink } from '@/src/shared/budget/monthBudget';
import { monthPayments } from '@/src/logic/planning/usePaymentsTab';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { savingsTransactionFlow, savingsTransferFlow } from '@/src/viewmodels/savingsTransfers';
import { unexplained } from '@/src/viewmodels/planning';
import { monthKey, shiftMonthKey } from '@/src/viewmodels/finance/ranges';
import { recordedAt } from '@/src/shared/time/recordedAt';
import type { FinData, FinMonthPlan, FinPayment, FinTx, ForecastItem } from '@/src/viewmodels/finance/types';
import type {
  FirestoreAllocation,
  FirestoreBucket,
  FirestoreFinanceSettings,
  FirestoreOverspendJustification,
  FirestoreTransaction,
  FirestoreTransfer,
} from '@/src/shared/firestore/types';
import { countsInFigures } from '@/src/shared/firestore/types';

const KIND: Record<string, FinTx['kind'] | undefined> = { Income: 'income', Expense: 'expense', Savings: 'savings' };

export function useFinanceData() {
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const { data: allTransactions, loading: txLoading } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid ? query(transactionsRef(uid)) : null), [uid])
  );
  // Excluded transactions (a debt changed to record only) don't count anywhere.
  const transactions = useMemo(() => allTransactions.filter(countsInFigures), [allTransactions]);
  const { data: transfers, loading: trLoading } = useFirestoreCollection<FirestoreTransfer>(
    useMemo(() => (uid ? query(transfersRef(uid)) : null), [uid])
  );
  const { data: allocations, loading: alLoading } = useFirestoreCollection<FirestoreAllocation>(
    useMemo(() => (uid ? query(allocationsRef(uid)) : null), [uid])
  );
  const { data: justifications, loading: jLoading } = useFirestoreCollection<FirestoreOverspendJustification>(
    useMemo(() => (uid ? query(overspendJustificationsRef(uid)) : null), [uid])
  );
  const { data: buckets, loading: bLoading } = useFirestoreCollection<FirestoreBucket>(
    // Archived ones too — their recorded history still counts.
    useMemo(() => (uid ? query(bucketsRef(uid)) : null), [uid])
  );
  const { itemsByBucket, loading: iLoading } = useBucketLineItemsByBucket(buckets);
  const { data: accounts, loading: aLoading } = useAccounts();
  const { data: categories, loading: cLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();
  const settingsDoc = useMemo(() => (uid ? financeSettingsRef(uid) : null), [uid]);
  const { data: settings, loading: sLoading } = useFirestoreDoc<FirestoreFinanceSettings>(settingsDoc);

  const loading = authLoading || txLoading || trLoading || alLoading || jLoading || bLoading || iLoading || aLoading || cLoading || ctxLoading || sLoading;

  const data = useMemo<FinData>(() => {
    const today = new Date();
    const display = (amount: number, currency: string) => toDisplay(ctx, amount, currency);
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const accountCurrency = new Map(accounts.map((a) => [a.id, a.currency]));
    const accountType = new Map(accounts.map((a) => [a.id, isSavingsAccount(a) ? 'Savings Account' : 'Wallet']));
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const bucketById = new Map(buckets.map((b) => [b.id, b]));
    const legacy = buildLegacyLinks(itemsByBucket);
    const currencyOf = (accountId: string) => accountCurrency.get(accountId) ?? ctx.base;

    const withMonth = transactions.map((t) => ({ ...t, month: t.month ?? monthKeyOf(t.date.toDate()) }));
    const txs: FinTx[] = [];
    for (const t of withMonth) {
      const kind = KIND[t.type];
      if (!kind) continue;
      const native = t.direction === 'Outflow' ? t.amount : -t.amount;
      // Savings are "money put aside" whichever way they were recorded
      // (src/shared/budget/flow.ts's savingsSign) — a bucket payment
      // crediting a savings account is put aside, not negative.
      const signed = kind === 'income' ? -native : kind === 'savings' ? savingsSign(t, accountType) * t.amount : native;
      const amount = display(signed, currencyOf(t.accountId));
      const link = resolveLink(t, legacy);
      txs.push({
        id: t.id,
        // Best-known time of day (for the hourly view); the day is unchanged.
        date: recordedAt(t.date, t.createdAt).date,
        month: t.month,
        kind,
        amount,
        categoryId: t.categoryId,
        categoryName: (t.categoryId && categoryById.get(t.categoryId)?.name) || 'Uncategorized',
        accountId: t.accountId,
        accountName: accountById.get(t.accountId)?.name ?? 'Unknown wallet',
        payee: t.description ?? '',
        link,
        fixed: Boolean(link && bucketById.get(link.bucketId)?.kind === 'Fixed'),
        savingsFlow: display(savingsTransactionFlow(t, accountType), currencyOf(t.accountId)),
        debtRepayment: Boolean(t.isDebtRepayment),
        borrowed: kind === 'income' && incomeSubtypeOfTransaction(t) === 'debt_financing',
      });
    }
    const monthedTransfers = transfers.map((t) => ({ ...t, month: monthKeyOf(t.date.toDate()) }));

    // Each month's budget, built on demand and cached.
    const txsByMonth = new Map<string, typeof withMonth>();
    for (const t of withMonth) {
      const months = new Set([t.month, resolveLink(t, legacy)?.month].filter((m): m is string => Boolean(m)));
      for (const m of months) txsByMonth.set(m, [...(txsByMonth.get(m) ?? []), t]);
    }
    const transfersByMonth = new Map<string, typeof monthedTransfers>();
    for (const t of monthedTransfers) {
      const months = new Set([t.month, resolveLink({ ...t, month: t.month }, legacy)?.month].filter((m): m is string => Boolean(m)));
      for (const m of months) transfersByMonth.set(m, [...(transfersByMonth.get(m) ?? []), t]);
    }
    const categoryInfo = new Map(categories.map((c) => [c.id, { name: c.name, transactionType: c.transactionType }]));
    const rawItem = new Map(Object.values(itemsByBucket).flat().map((i) => [i.id, i]));
    const cache = new Map<string, { plan: FinMonthPlan; budget: ReturnType<typeof buildMonthBudget> }>();
    function build(month: string) {
      const hit = cache.get(month);
      if (hit) return hit;
      const budget = buildMonthBudget({
        month,
        buckets,
        itemsByBucket,
        transactions: txsByMonth.get(month) ?? [],
        transfers: transfersByMonth.get(month) ?? [],
        allocations: allocations.filter((a) => a.months?.includes(month)),
        justifications: justifications.filter((j) => j.month === month),
        accountCurrency,
        accountType,
        categories: categoryInfo,
        baseCurrency: ctx.base,
        toDisplay: display,
      });
      const items = budget.items.map((i) => ({
        key: i.key,
        bucketId: i.bucketId,
        bucketName: i.bucketName,
        itemId: i.itemId,
        name: i.name,
        type: i.type,
        fixed: i.kind === 'Fixed',
        planned: i.planned,
        available: i.available,
        actual: i.actual,
        unexplained: unexplained(i),
        createdAt: rawItem.get(i.itemId)?.createdAt?.toDate() ?? null,
      }));
      const total = (type: string) => items.filter((i) => i.type === type).reduce((s, i) => s + i.available, 0);
      const entry = {
        budget,
        plan: { month, items, plannedIncome: budget.plannedIncome, plannedExpense: total('Expense'), plannedSavings: total('Savings') },
      };
      cache.set(month, entry);
      return entry;
    }

    // Before Budgets v2, a transaction paying a recurring item counts against
    // it (buildMonthBudget's own recurring match) — use the same link here
    // so it isn't classed as "no budget".
    for (const t of txs) {
      if (t.link || t.month >= BUDGETS_V2_START) continue;
      const entry = build(t.month).budget.items.find((i) => i.transactionIds.includes(t.id));
      if (!entry) continue;
      t.link = { bucketId: entry.bucketId, itemId: entry.itemId, month: t.month };
      t.fixed = entry.kind === 'Fixed';
    }

    // Planned payments of this month and next (upcoming income, overdue).
    const payments: FinPayment[] = [];
    for (const m of [monthKey(today), shiftMonthKey(monthKey(today), 1)]) {
      for (const p of monthPayments(m, { budget: build(m).budget, buckets, itemsByBucket, accounts, ctx }, categories)) {
        if (p.categoryType === 'Transfer') continue;
        payments.push({
          itemId: p.itemId,
          bucketId: p.bucketId,
          name: p.name,
          amount: p.amount,
          due: p.due,
          kind: p.categoryType === 'Income' ? 'income' : p.categoryType === 'Savings' ? 'savings' : 'expense',
          status: p.status,
        });
      }
    }

    const balance = { spending: 0, savings: 0 };
    for (const a of accounts) {
      const value = display(a.currentBalance, a.currency);
      if (isSavingsAccount(a)) balance.savings += value;
      else balance.spending += value;
    }

    return {
      today,
      txs,
      transfers: monthedTransfers.map((t) => ({
        id: t.id,
        date: t.date.toDate(),
        month: t.month,
        amount: display(t.amount, currencyOf(t.fromAccountId)),
        charges: display(t.charges ?? 0, currencyOf(t.fromAccountId)),
        savingsFlow: display(savingsTransferFlow(t, accountType), currencyOf(t.fromAccountId)),
      })),
      plan: (month: string) => build(month).plan,
      budget: (month: string) => build(month).budget,
      allocations: allocations
        .filter((a) => !a.revertedAt)
        .map((a) => ({
          fromKey: a.from.kind === 'item' ? endpointKey(a.from) : null,
          toKey: a.to.kind === 'item' ? endpointKey(a.to) : null,
          amount: display(a.amount, a.currency),
          createdAt: a.createdAt?.toDate() ?? null,
        })),
      justifications: justifications
        .filter((j) => j.status !== 'reverted')
        .map((j) => ({
          id: j.id,
          month: j.month,
          bucketId: j.bucketId,
          overspend: display(j.overspendAmount, j.currency),
          covered: display(j.coveredByAdjustments, j.currency),
          external: j.externalSources.map((e) => ({ source: e.source, amount: display(e.amount, j.currency) })),
          uncovered: display(j.uncoveredAmount, j.currency),
          reason: j.reason,
          awareness: j.awareness,
          avoidability: j.avoidability,
        })),
      payments,
      balance,
      savingsTarget: settings?.savingsTarget ?? 0.2,
      forecastItems: settings?.forecastItems ?? [],
      firstMonth: txs.length ? txs.reduce((min, t) => (t.month < min ? t.month : min), txs[0].month) : null,
    };
  }, [transactions, transfers, allocations, justifications, buckets, itemsByBucket, accounts, categories, ctx, settings]);

  const bucketName = useMemo(() => {
    const names = new Map(buckets.map((b) => [b.id, b.name]));
    return (id: string) => names.get(id) ?? 'Basket';
  }, [buckets]);

  async function saveSettings(next: FirestoreFinanceSettings) {
    if (!uid) return;
    await setDoc(financeSettingsRef(uid), next, { merge: true });
  }

  return {
    data,
    // Raw documents, for screens that need item details the finance model
    // doesn't carry (Buckets, Priorities, Plans forecast).
    buckets,
    itemsByBucket,
    categories,
    accounts,
    ctx,
    loading,
    currency: ctx.display,
    bucketName,
    setSavingsTarget: (target: number) => saveSettings({ savingsTarget: target }),
    addForecastItem: (item: Omit<ForecastItem, 'id'>) =>
      saveSettings({ forecastItems: [...data.forecastItems, { ...item, id: crypto.randomUUID() }] }),
    removeForecastItem: (id: string) => saveSettings({ forecastItems: data.forecastItems.filter((x) => x.id !== id) }),
  };
}
