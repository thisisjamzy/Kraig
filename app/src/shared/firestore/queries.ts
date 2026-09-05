'use client';

// Small composed hooks every screen reuses instead of re-deriving the same
// query. useCurrencyContext in particular is the client-side equivalent of
// sheets/Code.gs's buildCurrencyContext_, see
// src/shared/firestore/currency.ts.
//
// Every query/ref here is keyed on the signed-in user's own uid (see
// refs.ts's header — each account has its own private data, nothing
// shared) and built through useMemo, never called inline in the hook body:
// an unmemoized DocumentReference/Query is a fresh object every render,
// which resubscribes useFirestoreDoc/useFirestoreCollection's effect every
// render and both sets state and depends on that same fresh object again —
// an infinite render loop ("Maximum update depth exceeded"). While `user`
// itself is still resolving (useFirebaseUser's own async
// onAuthStateChanged), the query passed down is null and `loading` is
// forced true here rather than trusting useFirestoreCollection's null-query
// state (loading: false) — that state means "intentionally no query" for
// callers like WalletDetail, not "not ready yet", and conflating them would
// make a screen think a signed-in user's data has finished loading (as
// empty) before their uid was even known.

import { useMemo } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from './hooks';
import { accountsRef, categoriesRef, settingsRef, exchangeRatesRef } from './refs';
import { buildCurrencyContext } from './currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreAccount, FirestoreCategory, FirestoreSettings, FirestoreExchangeRate } from './types';

export function useAccounts() {
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;
  const q = useMemo(() => (uid ? query(accountsRef(uid), where('archived', '==', false)) : null), [uid]);
  const state = useFirestoreCollection<FirestoreAccount>(q);
  // The Unjustified wallet (PRD-AUDIT-RECONCILIATION.md section 2.2) is a
  // real accounts/{id} document so it can move money through the ordinary
  // transfer mechanism, but it's never a real, spendable wallet — filtered
  // out here, once, so every screen built on this hook (Wallets, Home,
  // every account picker) never needs its own check. The Reconciliation
  // screens that DO need its balance read it directly via
  // unjustifiedWalletRef, bypassing this hook entirely.
  const data = useMemo(() => state.data.filter((account) => !account.isSystemWallet), [state.data]);
  return { ...state, data, loading: authLoading || state.loading };
}

export function useCategories(transactionType?: 'Expense' | 'Income' | 'Savings') {
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;
  const q = useMemo(() => {
    if (!uid) return null;
    return transactionType
      ? query(categoriesRef(uid), where('archived', '==', false), where('transactionType', '==', transactionType))
      : query(categoriesRef(uid), where('archived', '==', false));
  }, [uid, transactionType]);
  const state = useFirestoreCollection<FirestoreCategory>(q);
  return { ...state, loading: authLoading || state.loading };
}

export function useSettings() {
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;
  const ref = useMemo(() => (uid ? settingsRef(uid) : null), [uid]);
  const state = useFirestoreDoc<FirestoreSettings>(ref);
  return { ...state, loading: authLoading || state.loading };
}

export function useExchangeRates() {
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;
  const q = useMemo(() => (uid ? query(exchangeRatesRef(uid)) : null), [uid]);
  const state = useFirestoreCollection<FirestoreExchangeRate>(q);
  return { ...state, loading: authLoading || state.loading };
}

export function useCurrencyContext() {
  const { data: settings, loading: settingsLoading } = useSettings();
  const { data: rates, loading: ratesLoading } = useExchangeRates();
  const ctx = useMemo(
    () =>
      buildCurrencyContext(
        rates,
        settings?.defaultCurrency || 'XAF',
        settings?.displayCurrency || settings?.defaultCurrency || 'XAF'
      ),
    [rates, settings]
  );
  return { ctx, loading: settingsLoading || ratesLoading };
}
