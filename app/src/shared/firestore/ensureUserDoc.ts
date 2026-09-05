'use client';

// Client-side replacement for functions/src/auth.ts's onCreate Auth trigger
// — this project runs on the Firebase Spark plan (no Cloud Functions
// deployed, see firestore.rules' header), so nothing creates users/{uid}
// automatically anymore. Called after every successful sign-up, sign-in,
// and OAuth redirect result (src/logic/signUp, src/logic/signIn,
// src/widgets/OAuthButtons) — creates the doc the first time, just bumps
// lastLoginAt on every return visit. Firestore's activeUser() rule (every
// other collection's real gate) depends on this doc existing at all, so
// this has to run — and be awaited — before anything else in the app reads
// or writes Firestore.
//
// A brand new account also gets default settings/exchangeRates seeded here
// (previously scripts/seed-dummy-data.ts's ensureSettingsAndRates did this
// once, globally — now every account is private, per firestore.rules'
// header, so each one needs its own). Written sequentially after the user
// doc itself, awaited, so activeUser()'s exists() check already sees the
// just-created doc by the time these writes land.

import { getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { userRef, settingsRef, exchangeRateRef } from './refs';
import { ensureUnjustifiedWallet } from './unaccountedBalance';

const DEFAULT_EXCHANGE_RATES: Record<string, { rateToBase: number; notes: string }> = {
  XAF: { rateToBase: 1, notes: 'base currency' },
  EUR: { rateToBase: 655.957, notes: 'fixed peg' },
  USD: { rateToBase: 605, notes: 'approximate — update periodically' },
  GBP: { rateToBase: 765, notes: 'approximate — update periodically' },
};

export async function ensureUserDoc(user: User): Promise<void> {
  const ref = userRef(user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { lastLoginAt: serverTimestamp() });
    // PRD-AUDIT-RECONCILIATION.md section 2.2 — an account that predates
    // this feature has a user doc already, so it never runs the "new
    // account" branch below; this is the lazy backfill path for it.
    // Idempotent (checks existence first), safe to call on every login.
    await ensureUnjustifiedWallet(user.uid, 'XAF');
    return;
  }

  await setDoc(ref, {
    email: user.email ?? '',
    name: user.displayName ?? '',
    archived: false,
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  });

  await setDoc(settingsRef(user.uid), {
    defaultCurrency: 'XAF',
    displayCurrency: 'XAF',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    householdName: user.displayName ? `${user.displayName}'s ledger` : 'My ledger',
  });

  await Promise.all(
    Object.entries(DEFAULT_EXCHANGE_RATES).map(([code, { rateToBase, notes }]) =>
      setDoc(exchangeRateRef(user.uid, code), { rateToBase, notes, updatedAt: serverTimestamp() })
    )
  );

  await ensureUnjustifiedWallet(user.uid, 'XAF');
}
