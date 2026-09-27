'use client';

// The all-transactions page — the same History list as Planning's History
// tab (src/screens/Planning/HistoryView), over a wider set of records,
// chosen by the URL:
//   - no parameters: every transaction and transfer, newest first (the
//     latest PAGE_SIZE of each) — Home's "all transactions";
//   - ?month=0-11&year=YYYY: one month (older links);
//   - ?backfillBatch=<id>: exactly the records one backfill spread created
//     ("Manage backfill batches").
// The category drill-down has its own route (/budget/category/[id]).

import { useMemo, useState } from 'react';
import { query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketsRef, transactionsRef, transfersRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { buildRows, type HistoryRow } from '@/src/logic/planning/rows';
import { TRANSACTION_DEFAULTS, transactionFields } from '@/src/logic/planning/transactionFields';
import { dateRange, type DateValue, type ListQuery } from '@/src/shared/listQuery/engine';
import { useListQuery } from '@/src/shared/listQuery/useListQuery';
import { monthTitle } from '@/src/viewmodels/planning';
import type { FirestoreBucket, FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';

export const PAGE_SIZE = 300;
/** A chosen date window loads everything in it, up to this. */
const WINDOW_CAP = 2000;

/** The date window a query's date filter asks for, to load exactly it. */
function dateWindow(query: ListQuery): { from: number; to: number } | null {
  const rule = query.filters.find((r) => r.field === 'date' && r.value);
  if (!rule) return null;
  const [start, end] = dateRange(rule.value as DateValue, new Date());
  if (rule.op === 'is' || rule.op === 'within') return { from: start.getTime(), to: end.getTime() };
  if (rule.op === 'after' || rule.op === 'on_or_after') return { from: start.getTime(), to: Date.now() + 366 * 86400000 };
  return null;
}

interface Mode {
  month: string | null; // YYYY-MM
  batch: string | null;
}

function modeFromSearch(): Mode {
  if (typeof window === 'undefined') return { month: null, batch: null };
  const params = new URLSearchParams(window.location.search);
  const batch = params.get('backfillBatch');
  if (batch) return { month: null, batch };
  const m = params.get('month');
  const y = params.get('year');
  if (m !== null && y !== null && /^\d{1,2}$/.test(m) && /^\d{4}$/.test(y) && Number(m) <= 11) {
    return { month: `${y}-${String(Number(m) + 1).padStart(2, '0')}`, batch: null };
  }
  return { month: null, batch: null };
}

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [{ month, batch }] = useState(modeFromSearch);
  const { data: buckets } = useFirestoreCollection<FirestoreBucket>(
    useMemo(() => (uid ? query(bucketsRef(uid)) : null), [uid])
  );
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const fields = useMemo(
    () =>
      transactionFields({
        buckets: buckets.filter((b) => !b.archived).map((b) => ({ id: b.id, name: b.name })),
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
        accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      }),
    [buckets, categories, accounts]
  );
  const list = useListQuery<HistoryRow>({ listId: 'transactions-all', fields, defaults: TRANSACTION_DEFAULTS });
  // A date filter on the open-ended view loads exactly that window, so
  // records older than the latest PAGE_SIZE are found too.
  const loadWindow = batch || month ? null : dateWindow(list.query);
  const fromMs = loadWindow?.from ?? null;
  const toMs = loadWindow?.to ?? null;

  const transactionsQuery = useMemo(() => {
    if (!uid) return null;
    if (batch) return query(transactionsRef(uid), where('backfillBatchId', '==', batch), orderBy('date', 'desc'));
    if (month) return query(transactionsRef(uid), where('month', '==', month), orderBy('date', 'desc'), limit(PAGE_SIZE));
    if (fromMs !== null && toMs !== null) {
      return query(
        transactionsRef(uid),
        where('date', '>=', Timestamp.fromMillis(fromMs)),
        where('date', '<=', Timestamp.fromMillis(toMs)),
        orderBy('date', 'desc'),
        limit(WINDOW_CAP)
      );
    }
    return query(transactionsRef(uid), orderBy('date', 'desc'), limit(PAGE_SIZE));
  }, [uid, month, batch, fromMs, toMs]);
  const transfersQuery = useMemo(() => {
    if (!uid) return null;
    if (batch) return query(transfersRef(uid), where('backfillBatchId', '==', batch), orderBy('date', 'desc'));
    if (month) {
      const [y, m] = month.split('-').map(Number);
      return query(
        transfersRef(uid),
        where('date', '>=', Timestamp.fromDate(new Date(y, m - 1, 1))),
        where('date', '<', Timestamp.fromDate(new Date(y, m, 1))),
        orderBy('date', 'desc'),
        limit(PAGE_SIZE)
      );
    }
    if (fromMs !== null && toMs !== null) {
      return query(
        transfersRef(uid),
        where('date', '>=', Timestamp.fromMillis(fromMs)),
        where('date', '<=', Timestamp.fromMillis(toMs)),
        orderBy('date', 'desc'),
        limit(WINDOW_CAP)
      );
    }
    return query(transfersRef(uid), orderBy('date', 'desc'), limit(PAGE_SIZE));
  }, [uid, month, batch, fromMs, toMs]);

  const { data: transactions, loading: txLoading, error: txError } = useFirestoreCollection<FirestoreTransaction>(transactionsQuery);
  const { data: transfers, loading: trLoading, error: trError } = useFirestoreCollection<FirestoreTransfer>(transfersQuery);
  const rows = useMemo(() => {
    const bucketName = new Map(buckets.map((b) => [b.id, b.name]));
    return buildRows(transactions, transfers, { accounts, categories, bucketName, ctx });
  }, [transactions, transfers, buckets, accounts, categories, ctx]);

  const navigateBack = useGoBack();
  return {
    title: batch ? 'Backfill batch' : month ? monthTitle(month) : 'Transactions',
    // Only the newest PAGE_SIZE of each are loaded in the open-ended view.
    capped: !batch && fromMs === null && (transactions.length >= PAGE_SIZE || transfers.length >= PAGE_SIZE),
    fields,
    list,
    rows,
    currency: ctx.display,
    addHref: month ? `/add-transaction?month=${Number(month.slice(5)) - 1}&year=${month.slice(0, 4)}` : '/add-transaction',
    goBack: () => navigateBack('/home'),
    loading: txLoading || trLoading || accountsLoading || categoriesLoading || ctxLoading,
    error: txError ?? trError ?? null,
  };
}
