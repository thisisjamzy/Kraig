'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { query, updateDoc } from 'firebase/firestore';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useFirestoreDoc, useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { settingsRef, exchangeRatesRef } from '@/src/shared/firestore/refs';
import type { FirestoreSettings, FirestoreExchangeRate } from '@/src/shared/firestore/types';
import { currencyName } from '@/src/viewmodels/currencies';
import { clearSignedIn } from '@/src/shared/config/authSession';
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

  const [reminders, setReminders] = useState<string[]>(INITIAL_REMINDER_TIMES);

  const [shareCopied, setShareCopied] = useState(false);

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
    // the Firebase client session and the local UX flag directly.
    await signOut(getFirebaseAuth()).catch(() => {});
    clearSignedIn();
    router.push('/');
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
    reminders,
    shareCopied,
    handleShare,
    addReminder,
    updateReminder,
    removeReminder,
    handleSignOut,
    setCurrency,
    goBack,
  };
}
