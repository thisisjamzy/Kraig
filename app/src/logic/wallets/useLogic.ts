'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setDoc } from 'firebase/firestore';
import { useAccounts, useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import { accountRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor, ACCOUNT_TYPES } from '@/src/viewmodels/wallets';
import { currencyName } from '@/src/viewmodels/currencies';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const { data: accounts, loading: accountsLoading, error } = useAccounts();
  const { data: exchangeRates } = useExchangeRates();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
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
    loading: accountsLoading || ctxLoading,
    error,
    goBack,
    addOpen,
    setAddOpen,
    openAddWallet,
    newName,
    setNewName,
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
