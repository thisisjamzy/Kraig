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
import { buildMonthBudget, monthKeyOf, setAsideHistory } from '@/src/shared/budget/monthBudget';
import { monthTotals } from '@/src/shared/budget/monthTotals';
import type {
  FirestoreAllocation,
  FirestoreBucket,
  FirestoreOverspendJustification,
  FirestoreTransaction,
  FirestoreTransfer,
} from '@/src/shared/firestore/types';
import { countsInFigures } from '@/src/shared/firestore/types';

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

  const { data: datedAll, loading: datedLoading } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(
      () => (uid ? query(transactionsRef(uid), where('month', '==', month), limit(MONTH_TRANSACTIONS_CAP)) : null),
      [uid, month]
    )
  );
  const { data: linkedAll, loading: linkedLoading } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid ? query(transactionsRef(uid), where('bucketItem.month', '==', month)) : null), [uid, month])
  );
  // Excluded transactions (a debt changed to record only) count nowhere;
  // the Transactions page lists them under "Show excluded".
  const datedTransactions = useMemo(() => datedAll.filter(countsInFigures), [datedAll]);
  const linkedTransactions = useMemo(() => linkedAll.filter(countsInFigures), [linkedAll]);
  const excludedTransactions = useMemo(() => datedAll.filter((t) => !countsInFigures(t)), [datedAll]);

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

  // Set asides add up across months: every linked transaction (the same
  // query useBucketProgress reads, so the listener is shared), for what
  // was put away and used before this month.
  const { data: linkedEver, loading: linkedEverLoading } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid ? query(transactionsRef(uid), where('bucketItem', '!=', null)) : null), [uid])
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
    const accountType = new Map(accounts.map((account) => [account.id, account.type]));
    const display = (amount: number, currency: string) => toDisplay(ctx, amount, currency);
    return buildMonthBudget({
      setAsideHistory: setAsideHistory({
        month,
        transactions: linkedEver.filter(countsInFigures),
        accountType,
        accountCurrency,
        baseCurrency: ctx.base,
        toDisplay: display,
      }),
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
      accountType,
      categories,
      baseCurrency: ctx.base,
      toDisplay: display,
    });
  }, [month, buckets, itemsByBucket, linkedTransactions, datedTransactions, linkedTransfers, datedTransfers, linkedEver, allocations, justifications, accounts, categoryDocs, ctx]);

  // Per flow type: expected, received, spent, saved, moved, available.
  const totals = useMemo(() => monthTotals(budget, new Date()), [budget]);

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
    totals,
    transactionsById,
    excludedTransactions,
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
      linkedEverLoading ||
      allocationsLoading ||
      justificationsLoading ||
      accountsLoading ||
      categoriesLoading ||
      ctxLoading,
  };
}
