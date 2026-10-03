'use client';

// The Ready to pay queue's reads and writes (src/shared/budget/automation.ts
// decides what goes in it and in which order).
//
//   - queuePayments: writes newly prepared payments. Each id is one line
//     occurrence (itemId__yyyyMM) and is only ever created, never
//     overwritten, so a line can't be prepared twice.
//   - confirmPayments: records each payment as the right kind of entry (an
//     expense transaction, a savings entry, or a transfer), linked to its
//     line, and marks the queue entry confirmed — in ONE runTransaction per
//     payment, which also checks the entry is still 'ready', so a payment
//     can't be confirmed twice from two taps or two devices.
//   - undoConfirmed: the 10-second Undo — deletes what was recorded and
//     puts the entries back as ready.

import { runTransaction, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { accountRef, paymentQueueEntryRef } from './refs';
import {
  deleteTransactionWithAggregation,
  deleteTransferWithAggregation,
  recalcBucketTotals,
  syncLinkedItemPayment,
  writeTransactionContribution,
  writeTransferContribution,
} from './aggregation';
import type { CurrencyContext } from './currency';
import type { FirestorePaymentQueueEntry } from './types';
import type { QueueDraft } from '../budget/automation';
import { SAVINGS_ACCOUNT_TYPE } from '../budget/flow';

export async function queuePayments(uid: string, drafts: QueueDraft[], currency: string): Promise<number> {
  if (!drafts.length) return 0;
  let created = 0;
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snaps = await Promise.all(drafts.map((d) => tx.get(paymentQueueEntryRef(uid, d.id))));
    drafts.forEach((d, index) => {
      if (snaps[index].exists()) return;
      // The draft's own id is stored too; it's always the doc id.
      const { due, ...fields } = d;
      tx.set(paymentQueueEntryRef(uid, d.id), {
        ...fields,
        currency,
        dueDate: due ? Timestamp.fromDate(due) : null,
        status: 'ready',
        recordIds: [],
        createdAt: serverTimestamp() as Timestamp,
        confirmedAt: null,
      });
      created += 1;
    });
  });
  return created;
}

export interface ConfirmRequest {
  entry: FirestorePaymentQueueEntry;
  amount: number;
  accountId: string | null;
}

export interface ConfirmedRecord {
  queueId: string;
  recordId: string;
  kind: 'transaction' | 'transfer';
  bucketId: string;
}

async function confirmOne(uid: string, request: ConfirmRequest, ctx: CurrencyContext, accountType: Map<string, string>): Promise<ConfirmedRecord> {
  const { entry, amount } = request;
  const accountId = request.accountId ?? entry.accountId;
  if (!accountId) throw new Error(`Choose the account to pay "${entry.name}" from.`);
  if (!(amount > 0)) throw new Error(`Enter an amount for "${entry.name}".`);
  const recordId = crypto.randomUUID();
  const date = new Date();
  const bucketItem = { bucketId: entry.bucketId, itemId: entry.itemId, month: entry.month };
  const queueRef = paymentQueueEntryRef(uid, entry.id);

  // Savings into a savings account from another account move money as a
  // transfer; transfers always do.
  const asTransfer =
    entry.flow === 'Transfer' ||
    (entry.flow === 'Savings' && Boolean(entry.toAccountId) && accountType.get(entry.toAccountId!) === SAVINGS_ACCOUNT_TYPE && entry.toAccountId !== accountId);

  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const queueSnap = await tx.get(queueRef);
    if (queueSnap.data()?.status !== 'ready') throw new Error(`"${entry.name}" was already recorded.`);

    if (asTransfer) {
      const toAccountId = entry.toAccountId;
      if (!toAccountId) throw new Error(`"${entry.name}" has no account to move the money to.`);
      const [fromSnap, toSnap] = await Promise.all([tx.get(accountRef(uid, accountId)), tx.get(accountRef(uid, toAccountId))]);
      writeTransferContribution(
        tx,
        uid,
        {
          id: recordId,
          date,
          description: entry.name,
          fromAccountId: accountId,
          toAccountId,
          amount,
          charges: entry.flow === 'Transfer' ? entry.fee : 0,
          kind: entry.flow === 'Savings' ? 'Wallet to savings' : (entry.categoryId ?? 'Wallet to wallet'),
          createdBy: uid,
          bucketItem,
        },
        fromSnap.data(),
        toSnap.data()
      );
    } else {
      const accountSnap = await tx.get(accountRef(uid, accountId));
      // Savings credit a savings account, or are set aside out of a
      // spending wallet (flow.ts's savingsSign reads both as saved).
      const intoSavings = accountType.get(accountId) === SAVINGS_ACCOUNT_TYPE;
      writeTransactionContribution(
        tx,
        uid,
        {
          id: recordId,
          date,
          type: entry.flow,
          description: entry.name,
          accountId,
          categoryId: entry.categoryId,
          amount,
          direction: entry.flow === 'Savings' && intoSavings ? 'Inflow' : 'Outflow',
          createdBy: uid,
          bucketItem,
        },
        accountSnap.data(),
        ctx
      );
    }
    tx.update(queueRef, { status: 'confirmed', recordIds: [recordId], amount, accountId, confirmedAt: serverTimestamp() });
  });

  await syncLinkedItemPayment(uid, bucketItem, recordId, asTransfer ? 'transfer' : 'expense', { amount, date });
  return { queueId: entry.id, recordId, kind: asTransfer ? 'transfer' : 'transaction', bucketId: entry.bucketId };
}

/**
 * Records every selected payment. Stops at the first that fails, returning
 * what was recorded so far alongside the error, so the caller can still
 * offer Undo for those.
 */
export async function confirmPayments(
  uid: string,
  requests: ConfirmRequest[],
  ctx: CurrencyContext,
  accountType: Map<string, string>
): Promise<{ records: ConfirmedRecord[]; error: string | null }> {
  const records: ConfirmedRecord[] = [];
  for (const request of requests) {
    try {
      records.push(await confirmOne(uid, request, ctx, accountType));
    } catch (caught) {
      return { records, error: caught instanceof Error ? caught.message : 'Could not record that payment.' };
    }
  }
  for (const bucketId of new Set(records.map((r) => r.bucketId))) await recalcBucketTotals(uid, bucketId);
  return { records, error: null };
}

export async function undoConfirmed(uid: string, records: ConfirmedRecord[], ctx: CurrencyContext): Promise<void> {
  for (const record of records) {
    if (record.kind === 'transfer') await deleteTransferWithAggregation(uid, record.recordId);
    else await deleteTransactionWithAggregation(uid, record.recordId, ctx);
    await updateDoc(paymentQueueEntryRef(uid, record.queueId), { status: 'ready', recordIds: [], confirmedAt: null });
  }
}
