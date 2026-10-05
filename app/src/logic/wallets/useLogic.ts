'use client';

import { useMemo, useState } from 'react';
import { limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { useAccounts, useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { toDisplay } from '@/src/shared/firestore/currency';
import { accountRef, accountsRef, reconciliationsRef, transactionsRef, transfersRef } from '@/src/shared/firestore/refs';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { committedByAccount, freeTone, groupOf, lastReconciledByAccount, latestByAccount, type WalletGroup } from './model';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor, ACCOUNT_TYPES, isSavingsAccount } from '@/src/viewmodels/wallets';
import { currencyName } from '@/src/viewmodels/currencies';
import type { FirestoreAccount, FirestoreReconciliation, FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';

/** One wallet as the Wallets page lists it (amounts in the display currency). */
export interface WalletRow {
  id: string;
  name: string;
  color: string;
  type: string;
  group: WalletGroup;
  balance: number;
  committed: number;
  free: number;
  freeTone: 'good' | 'watch' | 'bad';
  lastActivity: Date | null;
  lastReconciled: Date | null;
  /** Savings wallets only: whether the plan may count on it. */
  usableForPlan: boolean | null;
  status: 'Active' | 'Archived';
}
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function useLogic() {
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

  // ---- The Wallets page's table (web and tablet) ----
  const uid = user?.uid;
  const month = monthKeyOf(new Date());
  const { budget } = useMonthBudget(month);
  const committed = useMemo(() => committedByAccount(budget.items), [budget.items]);
  const { data: recentTx } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid ? query(transactionsRef(uid), orderBy('date', 'desc'), limit(300)) : null), [uid])
  );
  const { data: recentTransfers } = useFirestoreCollection<FirestoreTransfer>(
    useMemo(() => (uid ? query(transfersRef(uid), orderBy('date', 'desc'), limit(200)) : null), [uid])
  );
  const { data: reconciliations } = useFirestoreCollection<FirestoreReconciliation>(
    useMemo(() => (uid ? query(reconciliationsRef(uid), orderBy('performedAt', 'desc'), limit(30)) : null), [uid])
  );
  const lastActivity = useMemo(
    () =>
      latestByAccount([
        ...recentTx.map((t) => ({ accountIds: [t.accountId], date: t.date.toDate() })),
        ...recentTransfers.map((t) => ({ accountIds: [t.fromAccountId, t.toAccountId], date: t.date.toDate() })),
      ]),
    [recentTx, recentTransfers]
  );
  const lastReconciled = useMemo(
    () => lastReconciledByAccount(reconciliations.map((r) => ({ performedAt: r.performedAt.toDate(), reportedBalances: r.reportedBalances }))),
    [reconciliations]
  );
  const rowOf = (account: FirestoreAccount, index: number, status: WalletRow['status']): WalletRow => {
    const balance = toDisplay(ctx, account.currentBalance, account.currency);
    const used = status === 'Active' ? (committed.get(account.id) ?? 0) : 0;
    const free = balance - used;
    return {
      id: account.id,
      name: account.name,
      color: walletColor(index),
      type: account.type,
      group: groupOf(account.type),
      balance,
      committed: used,
      free,
      freeTone: freeTone(free, balance),
      lastActivity: lastActivity.get(account.id) ?? null,
      lastReconciled: lastReconciled.get(account.id) ?? null,
      usableForPlan: isSavingsAccount(account) ? Boolean(account.usableForPlan) : null,
      status,
    };
  };
  const rows: WalletRow[] = [...accounts.map((a, i) => rowOf(a, i, 'Active')), ...archivedAccounts.map((a, i) => rowOf(a, accounts.length + i, 'Archived'))];
  const active = rows.filter((r) => r.status === 'Active');
  const totals = {
    total: active.reduce((s, r) => s + r.balance, 0),
    inSavings: active.filter((r) => r.group === 'Savings').reduce((s, r) => s + r.balance, 0),
    committed: active.reduce((s, r) => s + r.committed, 0),
    free: active.reduce((s, r) => s + r.free, 0),
  };

  const currencyOptions = (exchangeRates.length > 0 ? exchangeRates.map((rate) => rate.id) : [ctx.base]).map(
    (code) => ({ code, name: currencyName(code) })
  );

  // Back to the page the user came from (skipping forms); '/home' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/home');
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
    rows,
    totals,
    freeTotalTone: freeTone(totals.free, totals.total),
    currency: ctx.display,
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
