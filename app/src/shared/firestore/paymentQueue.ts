'use client';

// Ready to pay's writes. The payments themselves are derived from the
// current basket items (src/shared/budget/occurrences.ts); what's stored
// here is only what the user did to one occurrence, by its id
// (itemId__yyyyMM):
//
//   - confirmPayments: records each payment as the right kind of entry (an
//     expense transaction, a savings entry, or a transfer), linked to its
//     line, and marks the occurrence confirmed, in ONE runTransaction per
//     payment that also checks it wasn't confirmed or skipped already, so
//     a payment can't be confirmed twice from two taps or two devices.
//   - undoConfirmed: the 10-second Undo; deletes what was recorded and
//     puts the occurrence back.
//   - saveAmountEdit, skipOccurrence, postponeOccurrence: the other actions.
//   - repairQueue: the one-time repair of copies stored before derivation.

import { getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { accountRef, migrationRef, paymentQueueEntryRef, paymentQueueRef } from './refs';
import {
  deleteTransactionWithAggregation,
  deleteTransferWithAggregation,
  recalcBucketTotals,
  syncLinkedItemPayment,
  writeTransactionContribution,
  writeTransferContribution,
} from './aggregation';
import type { CurrencyContext } from './currency';
import type { QueueDraft } from '../budget/automation';
import { repairPlan, type Occurrence } from '../budget/occurrences';
import { SAVINGS_ACCOUNT_TYPE } from '../budget/flow';
import { applyNotificationWrites } from './notificationWrites';
import { recordScheduledLine, REPAYMENTS_BASKET_ID } from './debtSchedule';

/** The fields kept on an action doc, so a confirmed payment reads on its own. */
function snapshotOf(entry: QueueDraft, currency: string) {
  const { due, ...fields } = entry;
  return {
    id: fields.id,
    bucketId: fields.bucketId,
    itemId: fields.itemId,
    month: fields.month,
    flow: fields.flow,
    name: fields.name,
    bucketName: fields.bucketName,
    amount: fields.amount,
    currency,
    accountId: fields.accountId,
    toAccountId: fields.toAccountId,
    categoryId: fields.categoryId,
    fee: fields.fee,
    first: fields.first,
    dueDate: due ? Timestamp.fromDate(due) : null,
    priority: fields.priority,
    trigger: fields.trigger,
  };
}

/** The amount typed before confirming (null clears it), with the item's amount it was typed against. */
export async function saveAmountEdit(uid: string, entry: Occurrence, amount: number | null, currency: string): Promise<void> {
  await setDoc(
    paymentQueueEntryRef(uid, entry.id),
    { ...snapshotOf(entry, currency), status: 'ready', recordIds: [], amountEdit: amount, amountEditBase: amount === null ? null : entry.planned, confirmedAt: null },
    { merge: true }
  );
}

export async function skipOccurrence(uid: string, entry: QueueDraft, currency: string): Promise<void> {
  await setDoc(paymentQueueEntryRef(uid, entry.id), { ...snapshotOf(entry, currency), status: 'skipped', recordIds: [], confirmedAt: null }, { merge: true });
}

export async function postponeOccurrence(uid: string, entry: QueueDraft, until: string, currency: string): Promise<void> {
  await setDoc(
    paymentQueueEntryRef(uid, entry.id),
    { ...snapshotOf(entry, currency), status: 'postponed', postponedUntil: until, recordIds: [], confirmedAt: null },
    { merge: true }
  );
}

export interface ConfirmRequest {
  entry: QueueDraft & { currency?: string };
  amount: number;
  accountId: string | null;
}

export interface ConfirmedRecord {
  queueId: string;
  recordId: string;
  // A debt repayment can't be undone here (it's on the debt's page).
  kind: 'transaction' | 'transfer' | 'repayment';
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

  // A scheduled debt repayment's line: recorded on the debt, with its
  // wallet effect (src/shared/firestore/debtSchedule.ts).
  if (entry.bucketId === REPAYMENTS_BASKET_ID) {
    const done = (await getDoc(queueRef)).data()?.status;
    if (done === 'confirmed') throw new Error(`"${entry.name}" was already recorded.`);
    const { transactionId } = await recordScheduledLine(uid, bucketItem, { amount, accountId, date }, ctx);
    await setDoc(queueRef, {
      ...snapshotOf(entry, entry.currency ?? ctx.display),
      status: 'confirmed',
      recordIds: transactionId ? [transactionId] : [],
      amount,
      accountId,
      amountEdit: null,
      amountEditBase: null,
      postponedUntil: null,
      createdAt: serverTimestamp() as Timestamp,
      confirmedAt: serverTimestamp() as Timestamp,
    });
    return { queueId: entry.id, recordId: transactionId ?? '', kind: 'repayment', bucketId: entry.bucketId };
  }

  // Savings into a savings account from another account move money as a
  // transfer; transfers always do.
  const asTransfer =
    entry.flow === 'Transfer' ||
    (entry.flow === 'Savings' && Boolean(entry.toAccountId) && accountType.get(entry.toAccountId!) === SAVINGS_ACCOUNT_TYPE && entry.toAccountId !== accountId);

  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const queueSnap = await tx.get(queueRef);
    const status = queueSnap.data()?.status;
    if (status === 'confirmed') throw new Error(`"${entry.name}" was already recorded.`);
    if (status === 'skipped') throw new Error(`"${entry.name}" was skipped this month.`);

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
      // Savings credit a savings account, or are set aside inside a
      // spending wallet as "frozen" savings (its locked amount grows, the
      // money never leaves). flow.ts's savingsSign reads both as saved.
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
          isFrozenSavings: entry.flow === 'Savings' && !intoSavings ? true : undefined,
          createdBy: uid,
          bucketItem,
        },
        accountSnap.data(),
        ctx
      );
    }
    tx.set(queueRef, {
      ...snapshotOf(entry, entry.currency ?? ctx.display),
      status: 'confirmed',
      recordIds: [recordId],
      amount,
      accountId,
      amountEdit: null,
      amountEditBase: null,
      postponedUntil: null,
      createdAt: serverTimestamp() as Timestamp,
      confirmedAt: serverTimestamp() as Timestamp,
    });
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
    if (record.kind === 'repayment') continue;
    if (record.kind === 'transfer') await deleteTransferWithAggregation(uid, record.recordId);
    else await deleteTransactionWithAggregation(uid, record.recordId, ctx);
    await updateDoc(paymentQueueEntryRef(uid, record.queueId), { status: 'ready', recordIds: [], confirmedAt: null });
  }
}

const REPAIR_ID = 'payment-occurrences';

/**
 * The one-time repair on release: older versions stored a full copy of
 * every prepared payment, which kept its old amount when the item changed.
 * Clears the plain copies still waiting (Ready to pay now derives them
 * from the items) and keeps anything the user did. Reports how many
 * waiting payments now read differently, once: a notification, and the
 * text returned for a toast. Runs once per user (migrations/{REPAIR_ID}).
 */
export async function repairQueue(uid: string, occurrences: Occurrence[]): Promise<string | null> {
  const db = getFirebaseFirestore();
  const marker = migrationRef(uid, REPAIR_ID);
  if ((await getDoc(marker)).exists()) return null;
  const snap = await getDocs(query(paymentQueueRef(uid), where('status', '==', 'ready')));
  const stored = snap.docs.map((d) => ({ ...(d.data() as unknown as Record<string, unknown>), id: d.id })) as {
    id: string;
    status: string;
    amount?: number;
    accountId?: string | null;
    amountEdit?: number | null;
  }[];
  const plan = repairPlan(occurrences, stored);
  const batch = writeBatch(db);
  for (const s of stored) if (s.amountEdit == null) batch.delete(paymentQueueEntryRef(uid, s.id));
  batch.set(marker, {
    version: 1,
    completedAt: serverTimestamp() as Timestamp,
    reviewedAt: null,
    report: plan.report ? [{ kind: 'payments', subject: 'Ready to pay', detail: plan.report }] : [],
  });
  await batch.commit();
  if (plan.report) {
    const now = new Date();
    await applyNotificationWrites(uid, [
      {
        op: 'create',
        id: 'payments_updated:repair',
        data: {
          id: 'payments_updated:repair',
          type: 'payments_updated',
          module: 'money',
          severity: 'info',
          dedupeKey: 'payments_updated:repair',
          groupKey: 'payments_updated',
          title: plan.report,
          body: 'Ready to pay now always matches your basket items.',
          items: [],
          primaryAction: { label: 'Ready to pay', route: '/budget/ready' },
          secondaryActions: [],
          expiresAt: new Date(now.getTime() + 7 * 86_400_000),
          createdAt: now,
          updatedAt: now,
          readAt: null,
          resolvedAt: null,
          snoozedUntil: null,
          archivedAt: null,
        } as never,
      },
    ]).catch(() => undefined);
  }
  return plan.report;
}
