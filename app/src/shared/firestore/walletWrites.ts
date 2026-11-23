// Edit wallet's one write (owner, 23 Nov 2026). The starting balance is set
// once, in Create wallet, and is read-only afterwards: this is the
// enforcement point below the form, so no caller can change it (or the
// running balance) through an edit. A wrong balance is corrected by
// counting the wallet (Reconcile), never here.

import { Timestamp, updateDoc } from 'firebase/firestore';
import { accountRef } from '@/src/shared/firestore/refs';
import type { FeeSchedule, FirestoreAccount, WalletHue } from '@/src/shared/firestore/types';
import { validateBands } from '@/src/viewmodels/walletFees';

export type WalletEdit = Partial<Pick<FirestoreAccount, 'name' | 'shortName' | 'type' | 'notSpendable' | 'frozen' | 'lockedAmount'>> & {
  color?: WalletHue;
  /** null clears the schedule (the wallet charges no fees). */
  feeSchedule?: Omit<FeeSchedule, 'updatedAt'> | null;
};

/** Fields an edit may never touch. */
const LOCKED = ['startingBalance', 'currentBalance', 'balanceAdjustments', 'currency', 'isSystemWallet', 'systemType'] as const;

/** The patch an edit writes: only the editable fields, the fee schedule
 *  validated and stamped. Throws on a starting balance change or bad bands. */
export function walletEditPatch(edit: WalletEdit & Record<string, unknown>, now: Timestamp = Timestamp.now()): Record<string, unknown> {
  for (const key of LOCKED) {
    if (key in edit) {
      throw new Error(key === 'startingBalance' ? "A wallet's starting balance can't be edited. To correct the balance, count this wallet." : `${key} can't be edited here.`);
    }
  }
  const patch: Record<string, unknown> = {};
  for (const key of ['name', 'shortName', 'type', 'notSpendable', 'frozen', 'lockedAmount', 'color'] as const) {
    if (edit[key] !== undefined) patch[key] = edit[key];
  }
  if (edit.feeSchedule !== undefined) {
    if (edit.feeSchedule === null) patch.feeSchedule = null;
    else {
      const problem = validateBands(edit.feeSchedule.bands);
      if (problem) throw new Error(problem);
      patch.feeSchedule = { appliesTo: edit.feeSchedule.appliesTo, bands: edit.feeSchedule.bands, updatedAt: now };
    }
  }
  patch.updatedAt = now;
  return patch;
}

export async function updateWallet(uid: string, walletId: string, edit: WalletEdit): Promise<void> {
  await updateDoc(accountRef(uid, walletId), walletEditPatch(edit));
}
