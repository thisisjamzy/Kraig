'use client';

// One debt with everything around it, live: the debt, its repayments, the
// transactions linked to it (counted and excluded), the accounts and the
// currency context, plus the wallet-effect planner's view of them
// (src/shared/debt/walletEffectRun.ts's walletStateOf). The debt page and
// every debt form read this, so a form's Impact card plans against exactly
// what's stored.

import { useMemo } from 'react';
import { orderBy, query, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { debtRef, repaymentsRef, transactionsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCurrencyContext } from '@/src/shared/firestore/queries';
import { walletStateOf } from '@/src/shared/debt/walletEffectRun';
import { useFirebaseUser } from './useFirebaseUser';
import type { FirestoreDebt, FirestoreRepayment, FirestoreTransaction } from '@/src/shared/firestore/types';

export function useDebtLedger(debtId: string | null) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const id = debtId ?? '';

  const { data: debt, loading: debtLoading, error: debtError } = useFirestoreDoc<FirestoreDebt>(
    useMemo(() => (uid && id ? debtRef(uid, id) : null), [uid, id])
  );
  const { data: repayments, loading: repaymentsLoading } = useFirestoreCollection<FirestoreRepayment>(
    useMemo(() => (uid && id ? query(repaymentsRef(uid, id), orderBy('date', 'desc')) : null), [uid, id])
  );
  const { data: linked, loading: linkedLoading } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid && id ? query(transactionsRef(uid), where('linkedDebtId', '==', id)) : null), [uid, id])
  );
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const walletState = useMemo(() => {
    if (!debt) return null;
    return walletStateOf(
      id,
      debt as unknown as Record<string, unknown>,
      repayments as unknown as (Record<string, unknown> & { id: string })[],
      linked as unknown as (Record<string, unknown> & { id: string })[],
      accounts as unknown as (Record<string, unknown> & { id: string })[]
    );
  }, [id, debt, repayments, linked, accounts]);

  return {
    uid,
    debt,
    repayments,
    linked,
    accounts,
    ctx,
    walletState,
    loading: Boolean(debtId) && (debtLoading || repaymentsLoading || linkedLoading || accountsLoading || ctxLoading),
    error: debtError,
  };
}
