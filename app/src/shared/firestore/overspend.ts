'use client';

// The write side of "Cover or justify" — one settlement per overspend:
// the budget moves (allocations tagged with the settlement's id) plus the
// FirestoreOverspendJustification that records how the rest was paid for
// and why. Nothing is ever deleted: undo marks the settlement 'reverted'
// and each of its allocations revertedAt (monthBudget.ts then ignores
// them), and a savings-funded move gets a reversing transfer instead of
// losing its original one.

import { getDoc, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { accountRef, allocationRef, overspendJustificationRef, transferRef } from './refs';
import { round2, type CurrencyContext } from './currency';
import { writeTransferContribution } from './aggregation';
import { createAllocation, type CreateAllocationInput } from './bucketBudget';
import type {
  FirestoreOverspendJustification,
  OverspendAvoidability,
  OverspendAwareness,
  OverspendExternalSource,
  OverspendItemShare,
  OverspendReason,
} from './types';

export interface SettleOverspendInput {
  month: string;
  bucketId: string;
  itemId: string | null;
  currency: string;
  overspendAmount: number;
  moves: Omit<CreateAllocationInput, 'month' | 'currency' | 'reason' | 'note' | 'justificationId'>[];
  externalSources: { source: OverspendExternalSource; amount: number }[];
  items: OverspendItemShare[];
  reason: OverspendReason;
  awareness: OverspendAwareness;
  noticedOn: Date | null;
  avoidability: OverspendAvoidability;
  note: string;
  followsUp: string[];
}

/** Records a settlement and its moves. Returns the settlement's id. */
export async function settleOverspend(uid: string, input: SettleOverspendInput, ctx: CurrencyContext): Promise<string> {
  const id = crypto.randomUUID();
  const note = input.note.trim();
  const adjustmentIds: string[] = [];
  try {
    for (const move of input.moves) {
      adjustmentIds.push(
        await createAllocation(
          uid,
          { ...move, month: input.month, currency: input.currency, reason: 'cover_overspend', note, justificationId: id },
          ctx
        )
      );
    }
  } catch (caught) {
    // Half-written: undo the moves that did land, so nothing is left
    // pointing at a settlement that was never recorded.
    await Promise.allSettled(adjustmentIds.map((allocationId) => revertAllocation(uid, allocationId)));
    throw caught;
  }

  const coveredByAdjustments = round2(input.moves.reduce((s, m) => s + m.amount, 0));
  const uncoveredAmount = round2(input.externalSources.filter((e) => e.source === 'not_covered').reduce((s, e) => s + e.amount, 0));
  const doc: Omit<FirestoreOverspendJustification, 'id'> = {
    month: input.month,
    bucketId: input.bucketId,
    itemId: input.itemId,
    currency: input.currency,
    overspendAmount: round2(input.overspendAmount),
    coveredByAdjustments,
    externalSources: input.externalSources.map((e) => ({ source: e.source, amount: round2(e.amount) })),
    uncoveredAmount,
    items: input.items.map((share) => ({
      itemId: share.itemId,
      overspend: round2(share.overspend),
      covered: round2(share.covered),
      external: round2(share.external),
      uncovered: round2(share.uncovered),
    })),
    adjustmentIds,
    reason: input.reason,
    awareness: input.awareness,
    noticedOn: input.awareness === 'discovered_later' && input.noticedOn ? Timestamp.fromDate(input.noticedOn) : null,
    avoidability: input.avoidability,
    note,
    attachments: [],
    status: uncoveredAmount > 0 ? 'partially_settled' : 'settled',
    followsUp: input.followsUp,
    createdBy: uid,
    revertedAt: null,
  };
  await setDoc(overspendJustificationRef(uid, id), { ...doc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return id;
}

/** Edits a settlement's explanation (never its amounts — undo and redo for that). */
export async function updateJustification(
  uid: string,
  id: string,
  fields: Pick<FirestoreOverspendJustification, 'reason' | 'awareness' | 'avoidability' | 'note'> & { noticedOn: Date | null }
) {
  await updateDoc(overspendJustificationRef(uid, id), {
    reason: fields.reason,
    awareness: fields.awareness,
    avoidability: fields.avoidability,
    note: fields.note.trim(),
    noticedOn: fields.awareness === 'discovered_later' && fields.noticedOn ? Timestamp.fromDate(fields.noticedOn) : null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Undoes one budget move without deleting it. A savings-funded move (or a
 * leftover sent to savings) really moved money, so its transfer is
 * reversed with a new opposite transfer — both stay in the history.
 */
export async function revertAllocation(uid: string, allocationId: string): Promise<void> {
  const snap = await getDoc(allocationRef(uid, allocationId));
  const allocation = snap.data();
  if (!allocation || allocation.revertedAt) return;
  if (!allocation.transferId) {
    await updateDoc(allocationRef(uid, allocationId), { revertedAt: Timestamp.now() });
    return;
  }
  const original = (await getDoc(transferRef(uid, allocation.transferId))).data();
  if (!original) {
    // Its transfer was removed some other way — just mark the move undone.
    await updateDoc(allocationRef(uid, allocationId), { revertedAt: Timestamp.now() });
    return;
  }
  const reverseId = crypto.randomUUID();
  const db = getFirebaseFirestore();
  await runTransaction(db, async (tx) => {
    const [fromSnap, toSnap] = await Promise.all([
      tx.get(accountRef(uid, original.toAccountId)),
      tx.get(accountRef(uid, original.fromAccountId)),
    ]);
    writeTransferContribution(
      tx,
      uid,
      {
        id: reverseId,
        date: new Date(),
        description: `Undo: ${original.description}`,
        fromAccountId: original.toAccountId,
        toAccountId: original.fromAccountId,
        amount: original.amount,
        charges: 0,
        kind: original.kind === 'Savings to wallet' ? 'Wallet to savings' : 'Savings to wallet',
        createdBy: uid,
      },
      fromSnap.data(),
      toSnap.data()
    );
    tx.update(allocationRef(uid, allocationId), { revertedAt: Timestamp.now(), reverseTransferId: reverseId });
  });
}

/** Undoes a settlement: every move it made, and the record itself. */
export async function revertJustification(uid: string, id: string): Promise<void> {
  const snap = await getDoc(overspendJustificationRef(uid, id));
  const justification = snap.data();
  if (!justification || justification.status === 'reverted') return;
  for (const allocationId of justification.adjustmentIds) await revertAllocation(uid, allocationId);
  await updateDoc(overspendJustificationRef(uid, id), {
    status: 'reverted',
    revertedAt: Timestamp.now(),
    updatedAt: serverTimestamp(),
  });
}
