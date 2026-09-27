'use client';

// Planning > History: "where did my money go?" — every transaction and
// transfer recorded in the month, plus its budget moves, in the shared transactions list (its
// filters and sorts are saved per user; a bucket passed in the URL — from
// a bucket's "See all" — starts it filtered to that bucket).

import { useMemo } from 'react';
import { useCategories } from '@/src/shared/firestore/queries';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { useListQuery } from '@/src/shared/listQuery/useListQuery';
import { buildRows, type HistoryRow } from './rows';
import { adjustmentRows, buildAdjustments } from './adjustments';
import { TRANSACTION_DEFAULTS, transactionFields } from './transactionFields';
import type { PlanningData } from './useLogic';
import type { ListQuery } from '@/src/shared/listQuery/engine';

export function useHistoryTab(month: string, data: PlanningData, bucket: string | null) {
  const { budget, transactionsById, transfersById, buckets, accounts, ctx } = data;
  const { data: categories } = useCategories();
  const bucketName = useMemo(() => new Map(buckets.map((b) => [b.id, b.name])), [buckets]);
  const rows = useMemo<HistoryRow[]>(() => {
    const transactions = [...transactionsById.values()].filter((t) => (t.month ?? monthKeyOf(t.date.toDate())) === month);
    const transfers = [...transfersById.values()].filter((t) => monthKeyOf(t.date.toDate()) === month);
    // Budget moves and overspend settlements made for this month, as their
    // own row type (excluded from the money in / out totals).
    const moves = buildAdjustments(
      data.allocations.filter((a) => a.month === month),
      data.justifications,
      { itemsByBucket: data.itemsByBucket, accounts, ctx }
    );
    return [...buildRows(transactions, transfers, { accounts, categories, budget, bucketName, ctx }), ...adjustmentRows(moves, month, bucketName)];
  }, [transactionsById, transfersById, month, accounts, categories, budget, bucketName, ctx, data.allocations, data.justifications, data.itemsByBucket]);

  const fields = useMemo(
    () =>
      transactionFields({
        buckets: buckets.map((b) => ({ id: b.id, name: b.name })),
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
        accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      }),
    [buckets, categories, accounts]
  );
  const override = useMemo<ListQuery | null>(
    () => (bucket ? { ...TRANSACTION_DEFAULTS, filters: [{ id: 'url-bucket', kind: 'rule', field: 'bucket', op: 'is', value: [bucket] }] } : null),
    [bucket]
  );
  const list = useListQuery<HistoryRow>({ listId: 'transactions-month', fields, defaults: TRANSACTION_DEFAULTS, override });

  return { rows, currency: ctx.display, fields, list };
}
