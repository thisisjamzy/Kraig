'use client';

// Everything src/shared/budget/monthBudget.ts's buildMonthBudget needs for
// one month, fetched live — shared by the Budget screen, the bucket item
// month sheet, and Add Transaction's item picker so all three read the
// exact same figures (PRD-BUDGETS-V2.md section 5).
//
// Two transaction queries, not one: `month == M` (everything dated this
// month — linked or not, the source of unplanned spend) and
// `bucketItem.month == M` (early/late payments dated in another month but
// paying this month's occurrence). Same pair for transfers, which have no
// stored `month`, hence the date range. buildMonthBudget de-duplicates.

import { useMemo } from 'react';
import { query, where, limit, Timestamp } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { allocationsRef, bucketsRef, overspendJustificationsRef, transactionsRef, transfersRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useBucketLineItemsByBucket } from '@/src/shared/hooks/useBucketLineItemsByBucket';
import { buildMonthBudget, monthKeyOf } from '@/src/shared/budget/monthBudget';
import type {
  FirestoreAllocation,
  FirestoreBucket,
  FirestoreOverspendJustification,
  FirestoreTransaction,
  FirestoreTransfer,
} from '@/src/shared/firestore/types';

// Generous for a household's real monthly volume — same order of magnitude
// the old Budget screen's month query used.
const MONTH_TRANSACTIONS_CAP = 1000;

// `month: null` switches every query off (hooks can't be called
// conditionally) — for a screen that only sometimes needs a month's budget.
export function useMonthBudget(monthOrNull: string | null) {
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = monthOrNull ? user?.uid : undefined;
  const month = monthOrNull ?? '';

  const { data: buckets, loading: bucketsLoading } = useFirestoreCollection<FirestoreBucket>(
    // Archived ones too: buildMonthBudget keeps their items only where
    // something was recorded that month, so archiving hides no real money.
    useMemo(() => (uid ? query(bucketsRef(uid)) : null), [uid])
  );
  const { itemsByBucket, loading: itemsLoading } = useBucketLineItemsByBucket(buckets);

  const { data: datedTransactions, loading: datedLoading } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(
      () => (uid ? query(transactionsRef(uid), where('month', '==', month), limit(MONTH_TRANSACTIONS_CAP)) : null),
      [uid, month]
    )
  );
  const { data: linkedTransactions, loading: linkedLoading } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid ? query(transactionsRef(uid), where('bucketItem.month', '==', month)) : null), [uid, month])
  );

  const { data: datedTransfers, loading: datedTransfersLoading } = useFirestoreCollection<FirestoreTransfer>(
    useMemo(() => {
      if (!uid) return null;
      const [year, monthNum] = month.split('-').map(Number);
      const start = new Date(year, monthNum - 1, 1);
      const end = new Date(year, monthNum, 0, 23, 59, 59, 999);
      return query(transfersRef(uid), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)));
    }, [uid, month])
  );
  const { data: linkedTransfers, loading: linkedTransfersLoading } = useFirestoreCollection<FirestoreTransfer>(
    useMemo(() => (uid ? query(transfersRef(uid), where('bucketItem.month', '==', month)) : null), [uid, month])
  );

  const { data: allocations, loading: allocationsLoading } = useFirestoreCollection<FirestoreAllocation>(
    useMemo(() => (uid ? query(allocationsRef(uid), where('months', 'array-contains', month)) : null), [uid, month])
  );

  const { data: justifications, loading: justificationsLoading } = useFirestoreCollection<FirestoreOverspendJustification>(
    useMemo(() => (uid ? query(overspendJustificationsRef(uid), where('month', '==', month)) : null), [uid, month])
  );

  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categoryDocs, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const budget = useMemo(() => {
    const accountCurrency = new Map(accounts.map((account) => [account.id, account.currency]));
    const categories = new Map(
      categoryDocs.map((category) => [category.id, { name: category.name, transactionType: category.transactionType }])
    );
    const toMonthed = (t: FirestoreTransfer) => ({ ...t, month: monthKeyOf(t.date.toDate()) });
    return buildMonthBudget({
      month,
      buckets,
      itemsByBucket: itemsByBucket,
      transactions: [...linkedTransactions, ...datedTransactions].map((t) => ({
        ...t,
        month: t.month ?? monthKeyOf(t.date.toDate()),
      })),
      transfers: [...linkedTransfers, ...datedTransfers].map(toMonthed),
      allocations,
      justifications,
      accountCurrency,
      categories,
      baseCurrency: ctx.base,
      toDisplay: (amount, currency) => toDisplay(ctx, amount, currency),
    });
  }, [month, buckets, itemsByBucket, linkedTransactions, datedTransactions, linkedTransfers, datedTransfers, allocations, justifications, accounts, categoryDocs, ctx]);

  // For the item sheet's own payment list — ItemMonth only carries ids.
  const transactionsById = useMemo(
    () => new Map([...datedTransactions, ...linkedTransactions].map((t) => [t.id, t])),
    [datedTransactions, linkedTransactions]
  );
  const transfersById = useMemo(
    () => new Map([...datedTransfers, ...linkedTransfers].map((t) => [t.id, t])),
    [datedTransfers, linkedTransfers]
  );

  return {
    budget,
    transactionsById,
    transfersById,
    buckets,
    itemsByBucket: itemsByBucket,
    allocations,
    justifications,
    accounts,
    ctx,
    loading:
      authLoading ||
      bucketsLoading ||
      itemsLoading ||
      datedLoading ||
      linkedLoading ||
      datedTransfersLoading ||
      linkedTransfersLoading ||
      allocationsLoading ||
      justificationsLoading ||
      accountsLoading ||
      categoriesLoading ||
      ctxLoading,
  };
}
