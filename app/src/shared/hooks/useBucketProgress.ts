'use client';

// Live inputs for src/shared/budget/bucketProgress.ts — every explicitly
// linked transaction/transfer (any month) plus this month's derived budget —
// so the Buckets list and Bucket Detail read the same figures as the Budget
// screen. `bucketItem != null` is a single-field inequality, covered by
// Firestore's automatic index.

import { useMemo } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { transactionsRef, transfersRef } from '@/src/shared/firestore/refs';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { buildItemSpend, bucketProgress, type BucketProgress } from '@/src/shared/budget/bucketProgress';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import type { FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';
import { countsInFigures } from '@/src/shared/firestore/types';

export function useBucketProgress() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const month = monthKeyOf(new Date());
  const monthData = useMonthBudget(month);
  const { budget: monthBudget, buckets, itemsByBucket, accounts, ctx, loading: monthLoading } = monthData;

  const { data: linkedTransactionsAll, loading: transactionsLoading } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid ? query(transactionsRef(uid), where('bucketItem', '!=', null)) : null), [uid])
  );
  const linkedTransactions = useMemo(() => linkedTransactionsAll.filter(countsInFigures), [linkedTransactionsAll]);
  const { data: linkedTransfers, loading: transfersLoading } = useFirestoreCollection<FirestoreTransfer>(
    useMemo(() => (uid ? query(transfersRef(uid), where('bucketItem', '!=', null)) : null), [uid])
  );

  const itemSpend = useMemo(
    () =>
      buildItemSpend({
        buckets,
        itemsByBucket,
        transactions: linkedTransactions,
        transfers: linkedTransfers,
        accountCurrency: new Map(accounts.map((account) => [account.id, account.currency])),
        baseCurrency: ctx.base,
        toDisplay: (amount, currency) => toDisplay(ctx, amount, currency),
      }),
    [buckets, itemsByBucket, linkedTransactions, linkedTransfers, accounts, ctx]
  );

  const progressByBucket = useMemo(() => {
    const out = new Map<string, BucketProgress>();
    for (const bucket of buckets) {
      out.set(
        bucket.id,
        bucketProgress(bucket, itemsByBucket[bucket.id] ?? [], itemSpend, monthBudget, (amount, currency) =>
          toDisplay(ctx, amount, currency)
        )
      );
    }
    return out;
  }, [buckets, itemsByBucket, itemSpend, monthBudget, ctx]);

  return {
    month,
    // The whole useMonthBudget result — the item-month sheet needs it.
    monthData,
    monthBudget,
    itemSpend,
    progressByBucket,
    loading: monthLoading || transactionsLoading || transfersLoading,
  };
}
