'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDoc, increment } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { accountRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCurrencyContext } from '@/src/shared/firestore/queries';
import { createTransferWithAggregation } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreAccount } from '@/src/shared/firestore/types';

export function useLogic(walletId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const walletRef = useMemo(() => (uid ? accountRef(uid, walletId) : null), [uid, walletId]);
  const { data: wallet, loading: walletLoading, error: walletError } = useFirestoreDoc<FirestoreAccount>(walletRef);
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { ctx } = useCurrencyContext();

  // Other active, unfrozen wallets — the only valid destinations when
  // moving this wallet's balance out before archiving it.
  const otherWallets = accounts.filter((account) => account.id !== walletId && !account.frozen);

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
  const [notSpendable, setNotSpendable] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [lockedAmount, setLockedAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Page load, not a click-to-open modal — seed once the wallet doc
  // arrives, guarded to fire only the first time so it never clobbers
  // in-progress edits on a later snapshot update.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!wallet || seededFor === walletId) return;
    setSeededFor(walletId);
    setName(wallet.name);
    setShortName(wallet.shortName || wallet.name.slice(0, 5));
    setStartingBalance(String(wallet.startingBalance));
    setNotSpendable(Boolean(wallet.notSpendable));
    setFrozen(Boolean(wallet.frozen));
    setLockedAmount(wallet.lockedAmount ? String(wallet.lockedAmount) : '');
  }, [wallet, seededFor, walletId]);

  async function handleSave() {
    if (!uid || !wallet || saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveError('Give this wallet a name.');
      return;
    }
    const newStartingBalance = Number(startingBalance.replace(/[^0-9.]/g, '')) || 0;
    // currentBalance is a running total (startingBalance + every
    // transaction/transfer delta since, see aggregation.ts) — never
    // recomputed from scratch — so editing the seed amount has to shift
    // currentBalance by the same delta to stay consistent with it, rather
    // than overwriting currentBalance outright and losing every real
    // transaction that happened since.
    const startingBalanceDelta = newStartingBalance - wallet.startingBalance;
    const newCurrentBalance = wallet.currentBalance + startingBalanceDelta;
    const lockedAmountValue = Number(lockedAmount.replace(/[^0-9.]/g, '')) || 0;
    if (lockedAmountValue > newCurrentBalance) {
      setSaveError("Locked amount can't be more than this wallet's balance.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(accountRef(uid, walletId), {
        name: trimmedName,
        shortName: shortName.trim().slice(0, 5) || trimmedName.slice(0, 5),
        startingBalance: newStartingBalance,
        currentBalance: increment(startingBalanceDelta),
        notSpendable,
        frozen,
        lockedAmount: lockedAmountValue,
      });
      router.push(`/wallets/${walletId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update this wallet.');
      setSaving(false);
    }
  }

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveMode, setArchiveMode] = useState<'transfer' | 'discard'>('transfer');
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function openArchive() {
    setArchiveMode('transfer');
    setTransferDestinationId(otherWallets[0]?.id ?? '');
    setArchiveError(null);
    setArchiveOpen(true);
  }

  async function confirmArchive() {
    if (!uid || !wallet || archiving) return;
    const hasBalance = wallet.currentBalance > 0;
    if (hasBalance && archiveMode === 'transfer' && !transferDestinationId) {
      setArchiveError('Choose a wallet to move the balance to.');
      return;
    }
    setArchiving(true);
    setArchiveError(null);
    try {
      if (hasBalance && archiveMode === 'transfer') {
        // Release whatever's blocking a full-balance transfer out first —
        // both aggregation.ts's frozen check and its locked-amount floor
        // would otherwise refuse to move the last of the balance.
        await updateDoc(accountRef(uid, walletId), { lockedAmount: 0, frozen: false });
        await createTransferWithAggregation({
          id: crypto.randomUUID(),
          date: new Date(),
          description: `Archiving ${wallet.name}`,
          fromAccountId: walletId,
          toAccountId: transferDestinationId,
          amount: wallet.currentBalance,
          charges: 0,
          kind: 'Wallet to wallet',
          createdBy: uid,
        });
        await updateDoc(accountRef(uid, walletId), { archived: true });
      } else if (hasBalance && archiveMode === 'discard') {
        await updateDoc(accountRef(uid, walletId), { archived: true, currentBalance: 0, lockedAmount: 0 });
      } else {
        await updateDoc(accountRef(uid, walletId), { archived: true });
      }
      router.push('/wallets');
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Could not archive this wallet.');
    } finally {
      setArchiving(false);
    }
  }

  async function unarchive() {
    if (!uid) return;
    await updateDoc(accountRef(uid, walletId), { archived: false });
  }

  function goBack() {
    router.push(`/wallets/${walletId}`);
  }

  return {
    wallet,
    currency: ctx.display,
    otherWallets,
    name,
    setName,
    shortName,
    setShortName,
    startingBalance,
    setStartingBalance,
    notSpendable,
    setNotSpendable,
    frozen,
    setFrozen,
    lockedAmount,
    setLockedAmount,
    saving,
    saveError,
    handleSave,

    archiveOpen,
    setArchiveOpen,
    openArchive,
    archiveMode,
    setArchiveMode,
    transferDestinationId,
    setTransferDestinationId,
    archiving,
    archiveError,
    confirmArchive,
    unarchive,

    goBack,
    loading: walletLoading || accountsLoading,
    error: walletError,
  };
}
