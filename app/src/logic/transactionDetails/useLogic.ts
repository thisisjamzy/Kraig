'use client';

// Transaction details — one transaction (or transfer) as a full page: the
// amount, when, what, which wallet, which bucket item and month it counts
// toward, the note — and, for a transaction not tied to any bucket, the
// "Assign to bucket" picker (?assign=1 opens straight on it).

import { INCOME_SUBTYPE_LABEL, incomeSubtypeOfTransaction } from '@/src/shared/budget/flow';
import { recordedAt } from '@/src/shared/time/recordedAt';
import { useMemo, useState } from 'react';
import { query } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { bucketsRef, transactionRef, transferRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import { assignTransactionToItem } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useBucketItemOptions, bucketItemKey } from '@/src/shared/hooks/useBucketItemOptions';
import { useBucketLineItemsByBucket } from '@/src/shared/hooks/useBucketLineItemsByBucket';
import { monthLabel } from '@/src/shared/budget/monthBudget';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import type { BucketItemLink, FirestoreBucket, FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';

function flagsFromSearch() {
  if (typeof window === 'undefined') return { transfer: false, assign: false };
  const q = new URLSearchParams(window.location.search);
  return { transfer: q.get('kind') === 'transfer', assign: q.get('assign') === '1' };
}

function dateValue(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `transfer` says which collection the id is in when it isn't the page's
 * own URL (a side peek); otherwise ?kind=transfer does. */
export function useLogic(id: string, opts: { transfer?: boolean } = {}) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [{ transfer: isTransfer, assign }] = useState(() => (opts.transfer !== undefined ? { transfer: opts.transfer, assign: false } : flagsFromSearch()));
  const { data: transaction, loading: txLoading } = useFirestoreDoc<FirestoreTransaction>(
    useMemo(() => (uid && !isTransfer ? transactionRef(uid, id) : null), [uid, id, isTransfer])
  );
  const { data: transferDoc, loading: trLoading } = useFirestoreDoc<FirestoreTransfer>(
    useMemo(() => (uid && isTransfer ? transferRef(uid, id) : null), [uid, id, isTransfer])
  );
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { ctx } = useCurrencyContext();
  const { data: buckets } = useFirestoreCollection<FirestoreBucket>(
    // Archived ones too, so a payment still shows the bucket it paid.
    useMemo(() => (uid ? query(bucketsRef(uid)) : null), [uid])
  );
  const { itemsByBucket } = useBucketLineItemsByBucket(buckets);

  const account = new Map(accounts.map((a) => [a.id, a]));
  const link: BucketItemLink | null = transaction?.bucketItem ?? transferDoc?.bucketItem ?? null;
  const linkedBucket = link ? buckets.find((b) => b.id === link.bucketId) ?? null : null;
  const linkedItem = link ? itemsByBucket[link.bucketId]?.find((i) => i.id === link.itemId) ?? null : null;

  const options = useBucketItemOptions({
    categoryId: transaction?.categoryId ?? '',
    dateValue: transaction ? dateValue(transaction.date.toDate()) : '',
    current: transaction?.bucketItem,
  });

  const [picking, setPicking] = useState(assign);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function assignTo(next: BucketItemLink | null) {
    if (!uid || !transaction || busy) return;
    setBusy(true);
    setError(null);
    try {
      await assignTransactionToItem(uid, transaction, next, ctx);
      setPicking(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this transaction.');
    } finally {
      setBusy(false);
    }
  }

  let view = null as null | {
    title: string;
    note: string;
    flow: 'in' | 'out' | 'move';
    amount: number;
    date: Date;
    /** False when only the day is known (no time recorded). */
    timeKnown: boolean;
    type: string;
    /** Income only: earned, other, or debt financing (borrowed). */
    subtype: string | null;
    category: string;
    method: string;
    editHref: string;
    /** Kept for the record but not counted (its debt is record only). */
    excluded: boolean;
    excludedReason: string;
    /** The debt it borrowed or repaid, when it's linked to one. */
    debtHref: string | null;
  };
  if (transaction) {
    const currency = account.get(transaction.accountId)?.currency ?? ctx.base;
    const category = categories.find((c) => c.id === transaction.categoryId)?.name ?? '';
    view = {
      title: category !== '' ? category : transaction.description || 'Transaction',
      note: transaction.description,
      flow: transaction.direction === 'Inflow' ? 'in' : 'out',
      amount: toDisplay(ctx, transaction.amount, currency),
      ...recordedAt(transaction.date, transaction.createdAt),
      type: transaction.type,
      subtype: transaction.type === 'Income' ? INCOME_SUBTYPE_LABEL[incomeSubtypeOfTransaction(transaction)] : null,
      category,
      method: account.get(transaction.accountId)?.name ?? '',
      editHref: `/edit-transaction/${transaction.id}`,
      excluded: Boolean(transaction.excluded),
      excludedReason: transaction.excludedReason ?? '',
      debtHref: transaction.linkedDebtId ? `/debts/${transaction.linkedDebtId}` : null,
    };
  } else if (transferDoc) {
    const currency = account.get(transferDoc.fromAccountId)?.currency ?? ctx.base;
    view = {
      title: transferDoc.kind || 'Transfer',
      note: transferDoc.description || transferDoc.notes || '',
      flow: 'move',
      amount: toDisplay(ctx, transferDoc.amount, currency),
      ...recordedAt(transferDoc.date, transferDoc.createdAt),
      type: 'Transfer',
      subtype: null,
      category: transferDoc.kind,
      method: `${account.get(transferDoc.fromAccountId)?.name ?? ''} → ${account.get(transferDoc.toAccountId)?.name ?? ''}`,
      editHref: `/edit-transfer/${transferDoc.id}`,
      excluded: false,
      excludedReason: '',
      debtHref: null,
    };
  }

  const navigateBack = useGoBack();
  return {
    view,
    currency: ctx.display,
    isTransfer,
    link,
    linkLabel: link ? `${linkedItem?.name ?? 'Item'} · ${linkedBucket?.name ?? 'Basket'}` : null,
    linkMonth: link ? monthLabel(link.month) : null,
    bucketHref: link ? `/budget/basket/${link.bucketId}?month=${link.month}` : null,
    canAssign: Boolean(transaction && transaction.categoryId && !transaction.isDebtRepayment && !transaction.isUnjustifiedAdjustment),
    options,
    currentKey: bucketItemKey(transaction?.bucketItem),
    picking,
    setPicking,
    assignTo,
    busy,
    error,
    goBack: () => navigateBack('/transactions'),
    loading: txLoading || trLoading,
    missing: !txLoading && !trLoading && !view,
  };
}
