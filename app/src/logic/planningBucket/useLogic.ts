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
import { buildAdjustments, type AdjustmentEntry } from '@/src/logic/planning/adjustments';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { revertAllocation, revertJustification, updateJustification } from '@/src/shared/firestore/overspend';
import { closeBucketMonth, reopenBucketMonth } from '@/src/shared/firestore/bucketBudget';
import { restoreBucket } from '@/src/shared/firestore/aggregation';
import { showToast } from '@/src/widgets/Toast/Toast';
import type { OverspendAvoidability, OverspendAwareness, OverspendReason } from '@/src/shared/firestore/types';

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
    // Red only while part of the overspend is still unexplained.
    over: item.type !== 'Income' && unexplained(item) > 0,
    // Its share of a real bucket overspend, since explained or covered.
    justified: item.type !== 'Income' && item.unfunded > 0 && unexplained(item) === 0,
    // Past its own amount, but the bucket's other items make up for it:
    // a mis-estimate, not an overspend.
    aboveEstimate: item.type !== 'Income' && item.remaining < 0 && item.unfunded === 0,
    needs: unexplained(item),
    // Net budget this item gave to others this month ("−8,000 moved").
    movedOut: Math.max(0, Math.round((item.allocatedOut - item.allocatedIn) * 100) / 100),
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

  // Adjustments timeline — settlements and moves touching this bucket.
  const { user } = useFirebaseUser();
  const adjustments = buildAdjustments(data.allocations, data.justifications, { itemsByBucket: data.itemsByBucket, accounts, ctx }, bucketId);
  const [openAdjustment, setOpenAdjustment] = useState<string | null>(null);
  const [adjustmentBusy, setAdjustmentBusy] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, done: string) {
    setAdjustmentBusy(true);
    setAdjustmentError(null);
    try {
      await action();
      showToast(done);
      setOpenAdjustment(null);
    } catch (caught) {
      setAdjustmentError(caught instanceof Error ? caught.message : 'Could not save that.');
    } finally {
      setAdjustmentBusy(false);
    }
  }
  /** Undo: a settlement (or a move that was part of one) reverts as a whole. */
  function undoAdjustment(entry: AdjustmentEntry) {
    const uid = user?.uid;
    if (!uid) return;
    return run(
      () => (entry.justification ? revertJustification(uid, entry.justification.id) : revertAllocation(uid, entry.allocationId!)),
      'Undone — kept in the history as reverted.'
    );
  }
  function editJustification(
    id: string,
    fields: { reason: OverspendReason; awareness: OverspendAwareness; noticedOn: Date | null; avoidability: OverspendAvoidability; note: string }
  ) {
    const uid = user?.uid;
    if (!uid) return;
    return run(() => updateJustification(uid, id, fields), 'Explanation updated.');
  }

  // Where "Add expense" records to: the item with the most left.
  const target =
    items
      .filter(({ item }) => item.type !== 'Income')
      .sort((a, b) => b.item.remaining - a.item.remaining)[0]?.item ?? group?.items[0] ?? null;

  const navigateBack = useGoBack();
  // Closing the bucket for this month (with a note), or reopening it.
  const spendingItems = (group?.items ?? []).filter((i) => i.type !== 'Income');
  const net = Math.round(spendingItems.reduce((s, i) => s + i.remaining, 0) * 100) / 100;
  async function closeBucket(note: string) {
    const uid = user?.uid;
    if (!uid) return;
    await run(() => closeBucketMonth(uid, bucketId, month, note), 'Bucket closed.');
  }
  async function unarchiveBucket() {
    const uid = user?.uid;
    if (!uid) return;
    await run(() => restoreBucket(uid, bucketId), 'Bucket unarchived.');
  }
  async function reopenBucket() {
    const uid = user?.uid;
    if (!uid) return;
    await run(() => reopenBucketMonth(uid, bucketId, month), 'Bucket reopened.');
  }

  return {
    month,
    // The month's data, for the wide page's editable line database.
    data,
    currency: ctx.display,
    bucket,
    closed: group?.closed ?? null,
    netLeftover: Math.max(0, net),
    netOver: Math.max(0, -net),
    closeBucket,
    reopenBucket,
    archived: Boolean(bucket?.archived),
    unarchiveBucket,
    card,
    items,
    category,
    rows,
    lastActivity: rows[0] ? { date: rows[0].date, what: rows[0].note || rows[0].name } : null,
    upcomingCount: payments.filter((p) => p.status === 'upcoming').length,
    overdueCount: payments.filter((p) => p.status === 'overdue').length,
    paymentsHref: `/payments?month=${month}&bucket=${bucketId}`,
    addExpenseHref: target
      ? `/add-transaction?bucketItem=${encodeURIComponent(`${target.bucketId}:${target.itemId}:${month}`)}`
      : `/add-transaction?month=${Number(month.slice(5)) - 1}&year=${month.slice(0, 4)}`,
    adjustments,
    openAdjustment: adjustments.find((a) => a.id === openAdjustment) ?? null,
    setOpenAdjustment: (id: string | null) => {
      setAdjustmentError(null);
      setOpenAdjustment(id);
    },
    undoAdjustment,
    editJustification,
    adjustmentBusy,
    adjustmentError,
    goBack: () => navigateBack(`/budget?month=${month}`),
    loading: data.loading,
  };
}
