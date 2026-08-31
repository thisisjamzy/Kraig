'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where, orderBy, updateDoc, Timestamp } from 'firebase/firestore';
import { RefreshCw, ArrowLeftRight, Clock, Download } from 'lucide-react';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transactionsRef, accountRef } from '@/src/shared/firestore/refs';
import { useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor } from '@/src/viewmodels/wallets';
import type { FirestoreAccount, FirestoreTransaction } from '@/src/shared/firestore/types';

const ICONS = [RefreshCw, ArrowLeftRight, Clock, Download];

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(ts: Timestamp) {
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

/** 'Week' | 'Month' | 'Quarter' -> the Date a transactions query's range should start at. */
function periodStart(period: string): Date {
  const now = new Date();
  if (period === 'Week') now.setDate(now.getDate() - 6);
  else if (period === 'Quarter') now.setMonth(now.getMonth() - 2, 1);
  else now.setDate(1); // Month
  now.setHours(0, 0, 0, 0);
  return now;
}

export function useLogic(walletId: string, periods: readonly string[]) {
  const router = useRouter();
  const [period, setPeriod] = useState<string>(periods[0]);
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const walletRef = useMemo(() => (uid ? accountRef(uid, walletId) : null), [uid, walletId]);
  const { data: wallet, loading: walletLoading, error: walletError } = useFirestoreDoc<FirestoreAccount>(walletRef);
  const { data: categories } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const [editOpen, setEditOpen] = useState(false);
  const [notSpendableDraft, setNotSpendableDraft] = useState(false);
  const [frozenDraft, setFrozenDraft] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit() {
    setNotSpendableDraft(Boolean(wallet?.notSpendable));
    setFrozenDraft(Boolean(wallet?.frozen));
    setEditError(null);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!uid || savingEdit) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await updateDoc(accountRef(uid, walletId), {
        notSpendable: notSpendableDraft,
        frozen: frozenDraft,
      });
      setEditOpen(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not update this wallet.');
    } finally {
      setSavingEdit(false);
    }
  }

  const transactionsQuery = useMemo(
    () =>
      uid
        ? query(
            transactionsRef(uid),
            where('accountId', '==', walletId),
            where('date', '>=', Timestamp.fromDate(periodStart(period))),
            orderBy('date', 'desc')
          )
        : null,
    [uid, walletId, period]
  );
  const {
    data: transactionDocs,
    loading: transactionsLoading,
    error: transactionsError,
  } = useFirestoreCollection<FirestoreTransaction>(transactionsQuery);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (categoryId: string | null) => (categoryId && map.get(categoryId)) || categoryId || '—';
  }, [categories]);

  const transactions = transactionDocs.map((transaction, index) => ({
    id: transaction.id,
    title: categoryName(transaction.categoryId),
    amount: toDisplay(ctx, transaction.amount, wallet?.currency ?? ctx.base),
    currency: ctx.display,
    date: formatDate(transaction.date),
    iconColor: walletColor(index),
  }));

  function goBack() {
    router.push('/wallets');
  }

  function iconFor(index: number) {
    return ICONS[index % ICONS.length];
  }

  return {
    wallet,
    balance: wallet ? toDisplay(ctx, wallet.currentBalance, wallet.currency) : 0,
    currency: ctx.display,
    transactions,
    period,
    setPeriod,
    loading: authLoading || walletLoading || transactionsLoading || ctxLoading,
    error: walletError || transactionsError,
    goBack,
    iconFor,
    editOpen,
    setEditOpen,
    openEdit,
    notSpendableDraft,
    setNotSpendableDraft,
    frozenDraft,
    setFrozenDraft,
    savingEdit,
    editError,
    saveEdit,
  };
}
