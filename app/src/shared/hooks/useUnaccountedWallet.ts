'use client';

// The Unjustified wallet as a pickable wallet, named "Unaccounted money".
// useAccounts() hides it everywhere; it's offered back only where money may
// leave it: as the wallet an expense is paid from, or the "from" side of a
// transfer (moving it into a real wallet corrects a reconciliation gap).
// Never for income, and never as a transfer's destination.

import { useMemo } from 'react';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { unjustifiedWalletRef, UNJUSTIFIED_WALLET_ID } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreAccount } from '@/src/shared/firestore/types';

export const UNACCOUNTED_WALLET_NAME = 'Unaccounted money';

export function isUnaccountedWallet(accountId: string | null | undefined): boolean {
  return accountId === UNJUSTIFIED_WALLET_ID;
}

export function useUnaccountedWallet(): FirestoreAccount | null {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const ref = useMemo(() => (uid ? unjustifiedWalletRef(uid) : null), [uid]);
  const { data } = useFirestoreDoc<FirestoreAccount>(ref);
  return useMemo(() => (data ? { ...data, id: UNJUSTIFIED_WALLET_ID, name: UNACCOUNTED_WALLET_NAME } : null), [data]);
}
