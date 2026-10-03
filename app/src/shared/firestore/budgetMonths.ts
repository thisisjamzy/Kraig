'use client';

// Month setup's writes (src/shared/budget/monthSetup.ts): the
// budgetMonths/{yyyy-MM} docs, created once each inside a transaction so
// two devices opening the app at once can't both set the same month up.

import { getDocs, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { budgetMonthRef, budgetMonthsRef } from './refs';
import { setupCounts, type SetupLine } from '../budget/monthSetup';

export async function setUpMonths(uid: string, months: { month: string; lines: SetupLine[] }[]): Promise<string[]> {
  if (!months.length) return [];
  const created: string[] = [];
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snaps = await Promise.all(months.map((m) => tx.get(budgetMonthRef(uid, m.month))));
    months.forEach((m, index) => {
      if (snaps[index].exists()) return;
      tx.set(budgetMonthRef(uid, m.month), {
        setupAt: serverTimestamp() as Timestamp,
        counts: setupCounts(m.lines),
        lineKeys: m.lines.map((line) => line.key),
        reviewedAt: null,
        bannerDismissedAt: null,
      });
      created.push(m.month);
    });
  });
  return created;
}

export async function existingMonths(uid: string): Promise<string[]> {
  const snap = await getDocs(budgetMonthsRef(uid));
  return snap.docs.map((d) => d.id);
}

export async function dismissMonthBanner(uid: string, month: string) {
  await updateDoc(budgetMonthRef(uid, month), { bannerDismissedAt: serverTimestamp() });
}

/** Reviewed — creating the month's doc when it was never set up (an older month). */
export async function markMonthReviewed(uid: string, month: string) {
  const ref = budgetMonthRef(uid, month);
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      tx.update(ref, { reviewedAt: serverTimestamp(), bannerDismissedAt: serverTimestamp() });
      return;
    }
    tx.set(ref, {
      setupAt: serverTimestamp() as Timestamp,
      counts: { income: 0, expense: 0, savings: 0, transfer: 0 },
      lineKeys: [],
      reviewedAt: serverTimestamp() as Timestamp,
      bannerDismissedAt: serverTimestamp() as Timestamp,
    });
  });
}

/** "Not yet": ask about this income line again from tomorrow. */
export async function snoozeIncomePrompt(uid: string, month: string, key: string, today: Date) {
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await setDoc(budgetMonthRef(uid, month), { incomeSnoozed: { [key]: day } } as never, { merge: true });
}
