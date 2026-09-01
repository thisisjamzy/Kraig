// onCreate Auth trigger (PRD-AUTH-FIREBASE.md's old auth.upsertUser job,
// corrected per PRD-FIREBASE.md section 10): creates the users/{uid}
// document the moment a Firebase account is first created — covers both
// email/password sign-up and a first-time OAuth sign-in. Also seeds default
// settings/exchangeRates under that same uid, mirroring
// src/shared/firestore/ensureUserDoc.ts's client-side version exactly (this
// project currently runs on the Spark plan with no Cloud Functions
// deployed, see firestore.rules' header — that client-side version is what
// actually runs today; this one is kept in sync for whenever/if this
// project upgrades to Blaze and redeploys functions/. If both ever run for
// the same brand-new account, whichever write lands first wins — harmless,
// both write the same shape).
//
// Deliberately the classic v1 `functions.auth.user().onCreate()` trigger,
// not the newer `beforeUserCreated` blocking function from
// firebase-functions/v2/identity: the v2 blocking-function mechanism needs
// Identity Platform enabled on the project, a manual setup step this
// doesn't need — v1 auth triggers remain fully supported for exactly this
// non-blocking "react to a new user" case, and mixing a v1 export alongside
// this project's other v2 functions is an explicitly supported pattern.

import * as functionsV1 from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './lib/firestore';

const DEFAULT_EXCHANGE_RATES: Record<string, { rateToBase: number; notes: string }> = {
  XAF: { rateToBase: 1, notes: 'base currency' },
  EUR: { rateToBase: 655.957, notes: 'fixed peg' },
  USD: { rateToBase: 605, notes: 'approximate — update periodically' },
  GBP: { rateToBase: 765, notes: 'approximate — update periodically' },
};

export const onUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  const userDoc = db.collection('users').doc(user.uid);

  await userDoc.set({
    email: (user.email ?? '').toLowerCase().trim(),
    name: user.displayName || '',
    archived: false,
    createdAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  });

  await userDoc.collection('settings').doc('app').set({
    defaultCurrency: 'XAF',
    displayCurrency: 'XAF',
    timezone: 'UTC',
    householdName: user.displayName ? `${user.displayName}'s ledger` : 'My ledger',
  });

  await Promise.all(
    Object.entries(DEFAULT_EXCHANGE_RATES).map(([code, { rateToBase, notes }]) =>
      userDoc.collection('exchangeRates').doc(code).set({ rateToBase, notes, updatedAt: FieldValue.serverTimestamp() })
    )
  );
});
