// setPin / verifyPin Callable Functions (PRD-FIREBASE.md section 10). A
// Callable Function automatically receives and verifies the caller's
// Firebase ID token — no manual token/cookie plumbing — and runs on Node,
// so bcryptjs works unchanged. The Admin SDK here reaches
// users/{uid}/private/pin directly, the one place Security Rules block
// every client request outright (section 9).
//
// Both check `archived` themselves: Callable Functions run through the
// Admin SDK, which bypasses Security Rules entirely, so the rules-based
// archived check every other collection gets doesn't apply here — this is
// the one place that check has to be written by hand, mirroring what
// PRD-AUTH-FIREBASE.md's old auth.upsertUser used to refuse on.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from './lib/firestore';

const PIN_LENGTH = 5;
const pinSchema = z.string().length(PIN_LENGTH).regex(/^\d+$/);

async function requireActiveUser(uid: string): Promise<void> {
  const snap = await db.collection('users').doc(uid).get();
  if (snap.data()?.archived) {
    throw new HttpsError('permission-denied', "This account's access has been revoked.");
  }
}

export const setPin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Not signed in.');
  await requireActiveUser(request.auth.uid);

  const parsed = pinSchema.safeParse(request.data?.pin);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Enter a 5-digit PIN.');

  const pinHash = await bcrypt.hash(parsed.data, 12);
  await db
    .doc(`users/${request.auth.uid}/private/pin`)
    .set({ pinHash, updatedAt: FieldValue.serverTimestamp() });

  // Echoed back so the client can cache it (PIN_HASH_CACHE_KEY) for fast,
  // offline PIN re-checks — a bcrypt hash is safe to keep client-side by
  // design, it's one-way, this is not the PIN itself.
  return { ok: true, pinHash };
});

export const verifyPin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Not signed in.');
  await requireActiveUser(request.auth.uid);

  const parsed = pinSchema.safeParse(request.data?.pin);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Enter a 5-digit PIN.');

  const snap = await db.doc(`users/${request.auth.uid}/private/pin`).get();
  const pinHash = snap.data()?.pinHash as string | undefined;
  if (!pinHash) {
    // No PIN set yet for this account — the client should route to the
    // "set your PIN" variant instead of retrying verify.
    return { ok: false, code: 'NO_PIN' };
  }

  const valid = await bcrypt.compare(parsed.data, pinHash);
  if (!valid) return { ok: false, error: 'Incorrect PIN.' };
  return { ok: true, pinHash };
});
