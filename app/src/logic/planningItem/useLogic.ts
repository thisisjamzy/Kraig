'use client';

// Item details (Planning) — one bucket item in one month, as a page: its
// figures, the action it needs, its transactions and the money moved in or
// out of it. The moves themselves (undo, skip the month, change just this
// month's amount) reuse the bucket item month logic
// (src/logic/bucketItemMonth/useLogic.ts).

import { useState } from 'react';
import { useCategories } from '@/src/shared/firestore/queries';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { itemMonthKey } from '@/src/shared/budget/monthBudget';
import { monthOf, promptFor } from '@/src/viewmodels/planning';
import { buildRows } from '@/src/logic/planning/rows';
import { monthPayments } from '@/src/logic/planning/usePaymentsTab';

function monthFromSearch(): string {
  if (typeof window === 'undefined') return monthOf(new Date());
  const raw = new URLSearchParams(window.location.search).get('month');
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : monthOf(new Date());
}

export function useLogic(bucketId: string, itemId: string) {
  const [month] = useState(monthFromSearch);
  const data = useMonthBudget(month);
  const { budget, buckets, itemsByBucket, transactionsById, transfersById, accounts, ctx } = data;
  const { data: categories } = useCategories();

  const entry = budget.itemsByKey.get(itemMonthKey(itemId, month)) ?? null;
  const raw = itemsByBucket[bucketId]?.find((i) => i.id === itemId) ?? null;
  const bucket = buckets.find((b) => b.id === bucketId) ?? null;
  const prompt = entry ? promptFor([entry], { month, today: new Date() }) : null;
  const bucketName = new Map(buckets.map((b) => [b.id, b.name]));
  const rows = entry
    ? buildRows(
        entry.transactionIds.map((id) => transactionsById.get(id)).filter((t) => t !== undefined),
        entry.transferIds.map((id) => transfersById.get(id)).filter((t) => t !== undefined),
        { accounts, categories, budget, bucketName, ctx }
      )
    : [];
  const payments = monthPayments(month, data, categories).filter((p) => p.itemId === itemId);
  const nextDue = payments.find((p) => p.status !== 'paid') ?? null;
  const account = raw?.accountId ? accounts.find((a) => a.id === raw.accountId)?.name ?? null : null;

  const navigateBack = useGoBack();
  return {
    month,
    currency: ctx.display,
    data,
    entry,
    raw,
    bucket,
    prompt,
    rows,
    nextDue,
    account,
    addExpenseHref: `/add-transaction?bucketItem=${encodeURIComponent(`${bucketId}:${itemId}:${month}`)}`,
    goBack: () => navigateBack(`/budget/bucket/${bucketId}?month=${month}`),
    loading: data.loading,
  };
}
