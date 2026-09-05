'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { query, updateDoc } from 'firebase/firestore';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useFirestoreDoc, useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { settingsRef, exchangeRatesRef, transactionsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories } from '@/src/shared/firestore/queries';
import { buildTransactionCsvTemplate, buildTransactionsCsv, downloadTextFile } from '@/src/shared/firestore/csv';
import type { FirestoreSettings, FirestoreExchangeRate, FirestoreTransaction } from '@/src/shared/firestore/types';
import { currencyName } from '@/src/viewmodels/currencies';
import { clearAllLocalAuthFlags } from '@/src/shared/config/authSession';
import { PIN_DISABLED_KEY, PIN_HASH_CACHE_KEY, PIN_VERIFIED_KEY } from '@/src/shared/config/pinGate';
import { clearClientCookie, setClientCookie, PERSISTENT_COOKIE_MAX_AGE_SECONDS } from '@/src/shared/config/clientCookies';
import { callSetPin, callVerifyPin } from '@/src/shared/config/pinCallable';
import { INITIAL_REMINDER_TIMES } from '@/src/viewmodels/settings';

export function useLogic() {
  const router = useRouter();
  // Firebase's own current-user object, not a round trip anywhere
  // (PRD-FIREBASE.md section 10).
  const { user: firebaseUser } = useFirebaseUser();
  const user = { name: firebaseUser?.displayName || 'You', email: firebaseUser?.email || '' };
  const uid = firebaseUser?.uid;

  const settingsDocRef = useMemo(() => (uid ? settingsRef(uid) : null), [uid]);
  const {
    data: settings,
    loading: settingsLoading,
    error: settingsError,
  } = useFirestoreDoc<FirestoreSettings>(settingsDocRef);
  const exchangeRatesQuery = useMemo(() => (uid ? query(exchangeRatesRef(uid)) : null), [uid]);
  const { data: currencies } = useFirestoreCollection<FirestoreExchangeRate>(exchangeRatesQuery);
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');

  const [pinModalOpen, setPinModalOpen] = useState(false);
  // Changing the PIN is two steps: prove you know the current one, then
  // pick the new one — otherwise anyone holding an already-unlocked phone
  // could silently take over the PIN gate.
  const [pinStep, setPinStep] = useState<'confirm' | 'new'>('confirm');
  const [currentPinDraft, setCurrentPinDraft] = useState('');
  const [confirmingPin, setConfirmingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinTogglePending, setPinTogglePending] = useState(false);

  const [reminders, setReminders] = useState<string[]>(INITIAL_REMINDER_TIMES);

  const [shareCopied, setShareCopied] = useState(false);

  // CSV export — every transaction the account has, named columns instead
  // of raw account/category ids so the file is directly re-importable and
  // human-readable on its own.
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const allTransactionsQuery = useMemo(() => (uid ? query(transactionsRef(uid)) : null), [uid]);
  const { data: allTransactions } = useFirestoreCollection<FirestoreTransaction>(allTransactionsQuery);

  function downloadCsvTemplate() {
    downloadTextFile('dreda-transactions-template.csv', buildTransactionCsvTemplate());
  }

  function exportTransactionsCsv() {
    const accountName = new Map(accounts.map((a) => [a.id, a.name]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const csv = buildTransactionsCsv(
      allTransactions.map((t) => ({
        date: t.date.toDate(),
        type: t.type,
        accountId: t.accountId,
        categoryId: t.categoryId,
        amount: t.amount,
        description: t.description,
      })),
      accountName,
      categoryName
    );
    const today = new Date().toISOString().slice(0, 10);
    downloadTextFile(`dreda-transactions-${today}.csv`, csv);
  }

  const currency = settings?.displayCurrency ?? '';
  const filteredCurrencies = (currencies ?? [])
    .map((entry) => ({ code: entry.id, name: currencyName(entry.id) }))
    .filter((entry) => `${entry.code} ${entry.name}`.toLowerCase().includes(currencySearch.toLowerCase()));

  async function setCurrency(code: string) {
    if (currencySaving || !uid) return;
    setCurrencySaving(true);
    setCurrencyError(null);
    try {
      // Live listener on settingsRef() picks the change up on its own, no
      // separate refetch needed the way the old Apps Script round trip had.
      await updateDoc(settingsRef(uid), { displayCurrency: code });
    } catch (error) {
      setCurrencyError(error instanceof Error ? error.message : 'Could not switch currency.');
    } finally {
      setCurrencySaving(false);
    }
  }

  async function handleShare(shareText: string) {
    const url = window.location.origin;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: 'Dreda', text: shareText, url });
      } catch {
        // Share sheet dismissed — nothing to do.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function addReminder() {
    setReminders((current) => [...current, '09:00']);
  }

  function updateReminder(index: number, value: string) {
    setReminders((current) => current.map((time, i) => (i === index ? value : time)));
  }

  function removeReminder(index: number) {
    setReminders((current) => current.filter((_, i) => i !== index));
  }

  async function handleSignOut() {
    // No Next.js routes to call anymore (PRD-FIREBASE.md section 1) — clear
    // the Firebase client session and every local UX flag directly.
    await signOut(getFirebaseAuth()).catch(() => {});
    clearAllLocalAuthFlags();
    router.push('/');
  }

  function openPinModal() {
    setPinStep('confirm');
    setCurrentPinDraft('');
    setPinDraft('');
    setPinError(null);
    setPinModalOpen(true);
  }

  function closePinModal() {
    setPinModalOpen(false);
    setPinStep('confirm');
    setCurrentPinDraft('');
    setPinDraft('');
    setPinError(null);
  }

  async function handleConfirmCurrentPin() {
    if (currentPinDraft.length !== 5 || confirmingPin) return;
    setConfirmingPin(true);
    setPinError(null);
    try {
      const data = await callVerifyPin(currentPinDraft);
      if (!data.ok) {
        setCurrentPinDraft('');
        setPinError(data.error || 'Incorrect PIN.');
        return;
      }
      setPinStep('new');
      setCurrentPinDraft('');
    } finally {
      setConfirmingPin(false);
    }
  }

  async function handleSavePin() {
    if (pinDraft.length !== 5) return;
    const data = await callSetPin(pinDraft);
    if (!data.ok) {
      setPinError(data.error || 'Could not update your PIN.');
      return;
    }
    if (data.pinHash) window.localStorage.setItem(PIN_HASH_CACHE_KEY, data.pinHash);
    window.sessionStorage.setItem(PIN_VERIFIED_KEY, '1');
    setClientCookie(PIN_VERIFIED_KEY, '1');
    closePinModal();
  }

  // "Require PIN" toggle — off means the app opens straight to /home,
  // skipping the PIN gate entirely (src/logic/appEntry/useLogic.ts,
  // proxy.ts). settings.pinDisabled in Firestore is the account-wide source
  // of truth; the local cookie/localStorage flag is what actually lets this
  // device act on it instantly (see pinGate.ts's PIN_DISABLED_KEY header).
  const pinEnabled = !settings?.pinDisabled;
  async function togglePinEnabled() {
    if (pinTogglePending || !uid || settingsLoading) return;
    const nextEnabled = !pinEnabled;
    setPinTogglePending(true);
    try {
      await updateDoc(settingsRef(uid), { pinDisabled: !nextEnabled });
      if (nextEnabled) {
        window.localStorage.removeItem(PIN_DISABLED_KEY);
        clearClientCookie(PIN_DISABLED_KEY);
      } else {
        window.localStorage.setItem(PIN_DISABLED_KEY, '1');
        setClientCookie(PIN_DISABLED_KEY, '1', PERSISTENT_COOKIE_MAX_AGE_SECONDS);
      }
    } finally {
      setPinTogglePending(false);
    }
  }

  function goBack() {
    router.push('/home');
  }

  return {
    user,
    currency,
    currencyOpen,
    setCurrencyOpen,
    currencySearch,
    setCurrencySearch,
    filteredCurrencies,
    currencySaving,
    currencyError,
    settingsLoading,
    settingsError,
    pinModalOpen,
    openPinModal,
    closePinModal,
    pinStep,
    currentPinDraft,
    setCurrentPinDraft,
    confirmingPin,
    handleConfirmCurrentPin,
    pinDraft,
    setPinDraft,
    pinError,
    pinEnabled,
    pinTogglePending,
    togglePinEnabled,
    reminders,
    shareCopied,
    handleShare,
    addReminder,
    updateReminder,
    removeReminder,
    handleSignOut,
    handleSavePin,
    setCurrency,
    goBack,
    downloadCsvTemplate,
    exportTransactionsCsv,
  };
}
