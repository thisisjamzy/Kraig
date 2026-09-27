'use client';

// Bucket details (Planning) — "how is this bucket doing this month, and
// what should I do?": its items' shares, planned / spent / left, type and
// category, linked payments, last activity, health, the action it needs,
// its items and latest transactions, and a sticky bar with the next step.

import { useState } from 'react';
import { useCategories } from '@/src/shared/firestore/queries';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { bucketCard, monthOf, promptFor, unexplained } from '@/src/viewmodels/planning';
import { buildRows } from '@/src/logic/planning/rows';
import { monthPayments } from '@/src/logic/planning/usePaymentsTab';

function monthFromSearch(): string {
  if (typeof window === 'undefined') return monthOf(new Date());
  const raw = new URLSearchParams(window.location.search).get('month');
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : monthOf(new Date());
}

export function useLogic(bucketId: string) {
  const [month] = useState(monthFromSearch);
  const data = useMonthBudget(month);
  const { budget, buckets, transactionsById, transfersById, accounts, ctx } = data;
  const { data: categories } = useCategories();

  const bucket = buckets.find((b) => b.id === bucketId) ?? null;
  const group = budget.buckets.find((g) => g.bucketId === bucketId) ?? null;
  const today = new Date();
  const card = group ? bucketCard(group, { month, today }) : null;

  const items = (group?.items ?? []).map((item) => ({
    item,
    prompt: promptFor([item], { month, today }),
    over: item.type !== 'Income' && item.remaining < 0,
    needs: unexplained(item),
  }));

  // The bucket's category: its items' own, the most common one.
  const counts = new Map<string, number>();
  for (const { item } of items) counts.set(item.categoryName, (counts.get(item.categoryName) ?? 0) + 1);
  const category = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  const bucketName = new Map(buckets.map((b) => [b.id, b.name]));
  const transactionIds = new Set(items.flatMap(({ item }) => item.transactionIds));
  const transferIds = new Set(items.flatMap(({ item }) => item.transferIds));
  const rows = buildRows(
    [...transactionsById.values()].filter((t) => transactionIds.has(t.id)),
    [...transfersById.values()].filter((t) => transferIds.has(t.id)),
    { accounts, categories, budget, bucketName, ctx }
  );

  const payments = monthPayments(month, data, categories).filter((p) => p.bucketId === bucketId);

  // Where "Add expense" records to: the item with the most left.
  const target =
    items
      .filter(({ item }) => item.type !== 'Income')
      .sort((a, b) => b.item.remaining - a.item.remaining)[0]?.item ?? group?.items[0] ?? null;

  const navigateBack = useGoBack();
  return {
    month,
    currency: ctx.display,
    bucket,
    card,
    items,
    category,
    rows,
    lastActivity: rows[0] ? { date: rows[0].date, what: rows[0].note || rows[0].name } : null,
    upcomingCount: payments.filter((p) => p.status === 'upcoming').length,
    overdueCount: payments.filter((p) => p.status === 'overdue').length,
    paymentsHref: `/budget?tab=payments&month=${month}&bucket=${bucketId}`,
    addExpenseHref: target
      ? `/add-transaction?bucketItem=${encodeURIComponent(`${target.bucketId}:${target.itemId}:${month}`)}`
      : `/add-transaction?month=${Number(month.slice(5)) - 1}&year=${month.slice(0, 4)}`,
    goBack: () => navigateBack(`/budget?month=${month}`),
    loading: data.loading,
  };
}
