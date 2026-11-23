'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDoc } from 'firebase/firestore';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { accountRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCurrencyContext } from '@/src/shared/firestore/queries';
import { createTransferWithAggregation } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { ACCOUNT_TYPES, WALLET_HUES, walletHue } from '@/src/viewmodels/wallets';
import { DEFAULT_FEE_APPLIES_TO, parseBands, validateBands } from '@/src/viewmodels/walletFees';
import { updateWallet } from '@/src/shared/firestore/walletWrites';
import type { FeeKind, FirestoreAccount, WalletHue } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { useFormFinish } from '@/src/shared/navigation/formPeekContext';

export interface FeeRow {
  min: string;
  /** Blank: "and above". */
  max: string;
  fee: string;
  kind: 'fixed' | 'percent';
}

function emptyFeeRow(min: string): FeeRow {
  return { min, max: '', fee: '', kind: 'fixed' };
}

export function useLogic(walletId: string) {
  const router = useRouter();
  const finish = useFormFinish();
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
  // Changing type to/from "Savings Account" doesn't need any migration of
  // its own — every screen that reads account type does so live off this
  // field (src/viewmodels/wallets.ts's isSavingsAccount), so flipping it
  // here takes effect everywhere the moment this save lands.
  const [type, setType] = useState<string>(ACCOUNT_TYPES[0]);
  // No starting balance here (owner, 23 Nov 2026): it is set once in Create
  // wallet; a wrong balance is corrected by counting the wallet.
  const [color, setColor] = useState<WalletHue>('purple');
  const [feesOn, setFeesOn] = useState(false);
  const [feeRows, setFeeRows] = useState<FeeRow[]>([emptyFeeRow('0')]);
  const [feeAppliesTo, setFeeAppliesTo] = useState<FeeKind[]>(DEFAULT_FEE_APPLIES_TO);
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
    setType(wallet.type);
    setColor(walletHue(wallet));
    const schedule = wallet.feeSchedule;
    setFeesOn(Boolean(schedule?.bands?.length));
    setFeeRows(
      schedule?.bands?.length
        ? schedule.bands.map((b) => ({ min: String(b.min), max: b.max === null ? '' : String(b.max), fee: String(b.fee), kind: b.kind }))
        : [emptyFeeRow('0')]
    );
    setFeeAppliesTo(schedule?.appliesTo?.length ? schedule.appliesTo : DEFAULT_FEE_APPLIES_TO);
    setNotSpendable(Boolean(wallet.notSpendable));
    setFrozen(Boolean(wallet.frozen));
    setLockedAmount(wallet.lockedAmount ? String(wallet.lockedAmount) : '');
  }, [wallet, seededFor, walletId]);

  const feeProblem = feesOn ? validateBands(parseBands(feeRows)) : null;
  const feesUpdatedAt = wallet?.feeSchedule?.updatedAt?.toDate?.() ?? null;
  function addFeeRow() {
    setFeeRows((rows) => {
      const last = rows[rows.length - 1];
      return [...rows, emptyFeeRow(last?.max ?? '')];
    });
  }
  function updateFeeRow(index: number, patch: Partial<FeeRow>) {
    setFeeRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeFeeRow(index: number) {
    setFeeRows((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  }
  function toggleAppliesTo(kind: FeeKind) {
    setFeeAppliesTo((list) => (list.includes(kind) ? list.filter((k) => k !== kind) : [...list, kind]));
  }

  async function handleSave() {
    if (!uid || !wallet || saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveError('Give this wallet a name.');
      return;
    }
    const lockedAmountValue = Number(lockedAmount.replace(/[^0-9.]/g, '')) || 0;
    if (lockedAmountValue > wallet.currentBalance) {
      setSaveError("Locked amount can't be more than this wallet's balance.");
      return;
    }
    if (feesOn && feeProblem) {
      setSaveError(feeProblem);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateWallet(uid, walletId, {
        name: trimmedName,
        shortName: shortName.trim().slice(0, 5) || trimmedName.slice(0, 5),
        type,
        notSpendable,
        frozen,
        lockedAmount: lockedAmountValue,
        color,
        feeSchedule: feesOn ? { appliesTo: feeAppliesTo, bands: parseBands(feeRows) } : wallet.feeSchedule ? null : undefined,
      });
      finish(`/wallets/${walletId}`);
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
      router.replace('/wallets');
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

  // Back to the page the user came from (skipping forms); `/wallets/${walletId}` only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(`/wallets/${walletId}`);
  }

  return {
    wallet,
    currency: ctx.display,
    otherWallets,
    name,
    setName,
    shortName,
    setShortName,
    type,
    setType,
    accountTypes: ACCOUNT_TYPES,
    color,
    setColor,
    hues: WALLET_HUES,
    feesOn,
    setFeesOn,
    feeRows,
    addFeeRow,
    updateFeeRow,
    removeFeeRow,
    feeAppliesTo,
    toggleAppliesTo,
    feeProblem,
    feesUpdatedAt,
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
