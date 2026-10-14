'use client';

// A wallet's own transactions list: every transaction on it and every
// transfer into or out of it, in the same History list as the
// all-transactions page (src/screens/Planning/HistoryView), so it filters
// and sorts the same way (type, date, category, basket, amount, search).
// Loads the newest PAGE_SIZE of each; a date filter loads exactly that
// window instead, so older records are found too.

import { useMemo } from 'react';
import { query, where, orderBy, limit, Timestamp, type Query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketsRef, transactionsRef, transfersRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { buildRows, type HistoryRow } from '@/src/logic/planning/rows';
import { TRANSACTION_DEFAULTS, transactionFields } from '@/src/logic/planning/transactionFields';
import { useListQuery } from '@/src/shared/listQuery/useListQuery';
import { dateWindow, PAGE_SIZE, WINDOW_CAP } from '@/src/logic/transactionHistory/useLogic';
import type { FirestoreBucket, FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';

export function useWalletHistory(walletId: string) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: buckets } = useFirestoreCollection<FirestoreBucket>(useMemo(() => (uid ? query(bucketsRef(uid)) : null), [uid]));
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { ctx } = useCurrencyContext();

  // The wallet is the list itself, so it isn't offered as a filter.
  const fields = useMemo(
    () =>
      transactionFields({
        buckets: buckets.filter((b) => !b.archived).map((b) => ({ id: b.id, name: b.name })),
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
        accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      }).filter((f) => f.id !== 'method'),
    [buckets, categories, accounts]
  );
  const list = useListQuery<HistoryRow>({ listId: 'wallet-transactions', fields, defaults: TRANSACTION_DEFAULTS });
  const span = dateWindow(list.query);
  const fromMs = span?.from ?? null;
  const toMs = span?.to ?? null;

  function scoped<T>(base: Query<T>, field: string): Query<T> {
    if (fromMs !== null && toMs !== null) {
      return query(
        base,
        where(field, '==', walletId),
        where('date', '>=', Timestamp.fromMillis(fromMs)),
        where('date', '<=', Timestamp.fromMillis(toMs)),
        orderBy('date', 'desc'),
        limit(WINDOW_CAP)
      );
    }
    return query(base, where(field, '==', walletId), orderBy('date', 'desc'), limit(PAGE_SIZE));
  }

  const transactionsQuery = useMemo(() => (uid ? scoped(transactionsRef(uid), 'accountId') : null), [uid, walletId, fromMs, toMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const outQuery = useMemo(() => (uid ? scoped(transfersRef(uid), 'fromAccountId') : null), [uid, walletId, fromMs, toMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const inQuery = useMemo(() => (uid ? scoped(transfersRef(uid), 'toAccountId') : null), [uid, walletId, fromMs, toMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: transactions, loading: txLoading, error: txError } = useFirestoreCollection<FirestoreTransaction>(transactionsQuery);
  const { data: transfersOut, loading: outLoading, error: outError } = useFirestoreCollection<FirestoreTransfer>(outQuery);
  const { data: transfersIn, loading: inLoading, error: inError } = useFirestoreCollection<FirestoreTransfer>(inQuery);

  const rows = useMemo(() => {
    const bucketName = new Map(buckets.map((b) => [b.id, b.name]));
    return buildRows(transactions, [...transfersOut, ...transfersIn], { accounts, categories, bucketName, ctx });
  }, [transactions, transfersOut, transfersIn, buckets, accounts, categories, ctx]);

  return {
    rows,
    fields,
    list,
    currency: ctx.display,
    // Only the newest PAGE_SIZE of each are loaded without a date filter.
    capped: fromMs === null && (transactions.length >= PAGE_SIZE || transfersOut.length >= PAGE_SIZE || transfersIn.length >= PAGE_SIZE),
    loading: txLoading || outLoading || inLoading,
    error: txError ?? outError ?? inError ?? null,
  };
}
