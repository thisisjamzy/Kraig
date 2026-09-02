'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, setDoc, where } from 'firebase/firestore';
import { useAccounts, useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { toDisplay } from '@/src/shared/firestore/currency';
import { accountRef, accountsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor, ACCOUNT_TYPES } from '@/src/viewmodels/wallets';
import { currencyName } from '@/src/viewmodels/currencies';
import type { FirestoreAccount } from '@/src/shared/firestore/types';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const { data: accounts, loading: accountsLoading, error } = useAccounts();
  const { data: exchangeRates } = useExchangeRates();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  // Archived wallets don't show in useAccounts() (every balance total in
  // the app deliberately excludes them) — this is the one screen that
  // still needs to list them, collapsed below the active ones, so there's
  // a way back to a wallet's edit page to unarchive it.
  const archivedQuery = useMemo(
    () => (user ? query(accountsRef(user.uid), where('archived', '==', true)) : null),
    [user]
  );
  const { data: archivedAccounts, loading: archivedLoading } = useFirestoreCollection<FirestoreAccount>(archivedQuery);
  const archivedWallets = archivedAccounts.map((account) => ({
    id: account.id,
    name: account.name,
  }));

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newShortName, setNewShortName] = useState('');
  const [newType, setNewType] = useState<(typeof ACCOUNT_TYPES)[number]>(ACCOUNT_TYPES[0]);
  const [newCurrency, setNewCurrency] = useState('');
  const [newStartingBalance, setNewStartingBalance] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const wallets = accounts.map((account, index) => ({
    id: account.id,
    name: account.name,
    amount: toDisplay(ctx, account.currentBalance, account.currency),
    currency: ctx.display,
    color: walletColor(index),
  }));
  const total = wallets.reduce((sum, wallet) => sum + wallet.amount, 0);

  const currencyOptions = (exchangeRates.length > 0 ? exchangeRates.map((rate) => rate.id) : [ctx.base]).map(
    (code) => ({ code, name: currencyName(code) })
  );

  function goBack() {
    router.push('/home');
  }

  function openAddWallet() {
    setNewName('');
    setNewShortName('');
    setNewType(ACCOUNT_TYPES[0]);
    setNewCurrency(ctx.base || currencyOptions[0]?.code || '');
    setNewStartingBalance('');
    setCreateError(null);
    setAddOpen(true);
  }

  async function handleCreateWallet() {
    if (!newName.trim() || creating || !user) return;
    setCreating(true);
    setCreateError(null);
    try {
      const startingBalance = Number(newStartingBalance.replace(/[^0-9.]/g, '')) || 0;
      await setDoc(accountRef(user.uid, crypto.randomUUID()), {
        name: newName.trim(),
        shortName: newShortName.trim().slice(0, 5) || newName.trim().slice(0, 5),
        type: newType,
        currency: newCurrency || ctx.base,
        startingBalance,
        currentBalance: startingBalance,
        notes: '',
        archived: false,
        notSpendable: false,
        frozen: false,
      });
      setAddOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create this wallet.');
    } finally {
      setCreating(false);
    }
  }

  return {
    wallets,
    total,
    archivedWallets,
    loading: accountsLoading || ctxLoading,
    archivedLoading,
    error,
    goBack,
    addOpen,
    setAddOpen,
    openAddWallet,
    newName,
    setNewName,
    newShortName,
    setNewShortName,
    newType,
    setNewType,
    newCurrency,
    setNewCurrency,
    newStartingBalance,
    setNewStartingBalance,
    accountTypes: ACCOUNT_TYPES,
    currencyOptions,
    creating,
    createError,
    handleCreateWallet,
  };
}
