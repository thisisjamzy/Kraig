'use client';

// setPin / verifyPin — client-side now (PRD-AUTH-FIREBASE.md section 10
// originally had these as Callable Functions; this project runs on the
// Firebase Spark plan with no Cloud Functions deployed, see
// firestore.rules' header for the trade-off). bcryptjs runs unchanged in
// the browser (confirmed via its package.json `browser` field, already
// relied on for the existing offline-verify path below /pin's Callable
// Function calls used to sit behind) — this just moves the hash/compare
// call site from a Cloud Function to here, reaching
// users/{uid}/private/pin directly, now allowed by firestore.rules for the
// doc's own (active, non-archived) owner only. Same exported shape as the
// Callable Function version on purpose, so src/logic/pin/useLogic.ts and
// src/logic/settings/useLogic.ts needed no changes at all.

import bcrypt from 'bcryptjs';
import { getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { userPinRef } from '@/src/shared/firestore/refs';

const PIN_LENGTH = 5;
const PIN_PATTERN = /^\d{5}$/;

export interface PinCallableResult {
  ok: boolean;
  pinHash?: string;
  error?: string;
  code?: string;
}

function requireUid(): string {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  return uid;
}

export async function callSetPin(pin: string): Promise<PinCallableResult> {
  if (!PIN_PATTERN.test(pin)) return { ok: false, error: `Enter a ${PIN_LENGTH}-digit PIN.` };
  const uid = requireUid();

  const pinHash = await bcrypt.hash(pin, 12);
  // firestore.rules' activeUser() gate on private/{doc} throws
  // permission-denied for a revoked account — surfaces as a normal thrown
  // error, same as the Callable Function's HttpsError used to.
  await setDoc(userPinRef(uid), { pinHash, updatedAt: serverTimestamp() });

  // Echoed back so the caller can cache it (PIN_HASH_CACHE_KEY) for fast,
  // offline PIN re-checks — a bcrypt hash is safe to keep client-side by
  // design, it's one-way, this is not the PIN itself.
  return { ok: true, pinHash };
}

export async function callVerifyPin(pin: string): Promise<PinCallableResult> {
  if (!PIN_PATTERN.test(pin)) return { ok: false, error: `Enter a ${PIN_LENGTH}-digit PIN.` };
  const uid = requireUid();

  const snap = await getDoc(userPinRef(uid));
  const pinHash = snap.data()?.pinHash;
  if (!pinHash) {
    // No PIN set yet for this account — the caller should route to the
    // "set your PIN" variant instead of retrying verify.
    return { ok: false, code: 'NO_PIN' };
  }

  const valid = await bcrypt.compare(pin, pinHash);
  if (!valid) return { ok: false, error: 'Incorrect PIN.' };
  return { ok: true, pinHash };
}
