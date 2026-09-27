'use client';

// PRD-BUDGETS-V2.md sections 4.2 and 4.4 — the write side of the bucket
// budget: per-month skips/overrides on an item, scheduling a Planned item
// into a month, and the allocation ledger (reallocated leftovers, covered
// overspends). Every figure these affect is derived afterward by
// src/shared/budget/monthBudget.ts; nothing here denormalizes a total.
//
// "Is there enough left in the source to move this much" is checked by the
// caller against that same derived MonthBudget (the only place those
// figures exist) — see src/logic/bucketItemMonth/useLogic.ts.

import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  deleteField,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { accountRef, allocationRef, bucketLineItemRef } from './refs';
import { convert, round2, type CurrencyContext } from './currency';
import { deleteTransferWithAggregation, writeTransferContribution } from './aggregation';
import type { AllocationEndpoint, AllocationReason } from './types';

export async function skipItemMonth(uid: string, bucketId: string, itemId: string, month: string) {
  await updateDoc(bucketLineItemRef(uid, bucketId, itemId), {
    excludedMonths: arrayUnion(month),
    updatedAt: serverTimestamp(),
  });
}

export async function unskipItemMonth(uid: string, bucketId: string, itemId: string, month: string) {
  await updateDoc(bucketLineItemRef(uid, bucketId, itemId), {
    excludedMonths: arrayRemove(month),
    updatedAt: serverTimestamp(),
  });
}

/** `amount: null` clears the override, back to the item's usual amount. */
export async function setItemMonthOverride(
  uid: string,
  bucketId: string,
  itemId: string,
  month: string,
  amount: number | null
) {
  await updateDoc(bucketLineItemRef(uid, bucketId, itemId), {
    [`monthOverrides.${month}`]: amount === null ? deleteField() : { amount: round2(amount) },
    updatedAt: serverTimestamp(),
  });
}

/**
 * Puts a Planned item into a month's budget (replaces the old "Add to
 * budget", which bumped a category rule). An unscheduled item (no dueDate)
 * is in no month; this gives it one. Keeps an existing day-of-month when
 * rescheduling so a real due date survives the move.
 */
export async function scheduleItem(uid: string, bucketId: string, itemId: string, month: string) {
  const ref = bucketLineItemRef(uid, bucketId, itemId);
  const snap = await getDoc(ref);
  const [year, monthNum] = month.split('-').map(Number);
  const currentDay = snap.data()?.dueDate?.toDate().getDate() ?? 1;
  const lastDay = new Date(year, monthNum, 0).getDate();
  await updateDoc(ref, {
    dueDate: Timestamp.fromDate(new Date(year, monthNum - 1, Math.min(currentDay, lastDay))),
    updatedAt: serverTimestamp(),
  });
}

export interface CreateAllocationInput {
  month: string;
  from: AllocationEndpoint;
  to: AllocationEndpoint;
  amount: number; // in `currency`
  currency: string; // the display currency it was entered in
  reason: AllocationReason;
  note: string;
  // `from.kind === 'savings'` only — the spending wallet that actually paid
  // the overspend, which the real savings withdrawal lands in.
  savingsToAccountId?: string;
  date?: Date; // the savings withdrawal's own date, defaults to now
}

function monthsTouched(input: CreateAllocationInput): string[] {
  const months = new Set([input.month]);
  if (input.from.kind === 'item') months.add(input.from.month);
  if (input.to.kind === 'item') months.add(input.to.month);
  return [...months];
}

export async function createAllocation(uid: string, input: CreateAllocationInput, ctx: CurrencyContext): Promise<string> {
  if (!(input.amount > 0)) throw new Error('Enter an amount greater than zero.');
  const id = crypto.randomUUID();
  const doc = {
    month: input.month,
    months: monthsTouched(input),
    from: input.from,
    to: input.to,
    amount: round2(input.amount),
    currency: input.currency,
    reason: input.reason,
    note: input.note,
    createdBy: uid,
    createdAt: serverTimestamp(),
  };

  if (input.from.kind !== 'savings') {
    await setDoc(allocationRef(uid, id), { ...doc, transferId: null });
    return id;
  }

  // A savings withdrawal really moves money: savings account → the wallet
  // that paid the overspend, as an ordinary "Savings to wallet" transfer
  // written in the same runTransaction() as the allocation that explains it.
  const savingsAccountId = input.from.accountId;
  const toAccountId = input.savingsToAccountId;
  if (!toAccountId) throw new Error('Choose which wallet the savings go into.');
  if (toAccountId === savingsAccountId) throw new Error('Pick a different wallet than the savings account.');
  const transferId = crypto.randomUUID();
  const db = getFirebaseFirestore();
  await runTransaction(db, async (tx) => {
    const [fromSnap, toSnap] = await Promise.all([
      tx.get(accountRef(uid, savingsAccountId)),
      tx.get(accountRef(uid, toAccountId)),
    ]);
    const savingsCurrency = fromSnap.data()?.currency ?? ctx.base;
    writeTransferContribution(
      tx,
      uid,
      {
        id: transferId,
        date: input.date ?? new Date(),
        description: input.note || 'Covering an overspend from savings',
        fromAccountId: savingsAccountId,
        toAccountId,
        amount: round2(convert(input.amount, input.currency, savingsCurrency, ctx.rates)),
        charges: 0,
        kind: 'Savings to wallet',
        createdBy: uid,
      },
      fromSnap.data(),
      toSnap.data()
    );
    tx.set(allocationRef(uid, id), { ...doc, transferId });
  });
  return id;
}

/** Reverses a move. A savings-funded one also reverses its real transfer. */
export async function deleteAllocation(uid: string, allocationId: string): Promise<void> {
  const snap = await getDoc(allocationRef(uid, allocationId));
  const transferId = snap.data()?.transferId;
  if (transferId) await deleteTransferWithAggregation(uid, transferId);
  await deleteDoc(allocationRef(uid, allocationId));
}
