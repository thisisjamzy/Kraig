'use client';

// Runs the flow-type migration (src/shared/budget/flowMigration.ts) for one
// household, client side: reads buckets, items, categories, accounts and
// income transactions, applies the plan in batches, and stores the report
// at migrations/flowTypesV1 for the one-time review page.
//
// Safe to run more than once. A finished run is recorded and skipped; an
// interrupted one is simply planned again — the plan only contains what
// still needs doing, new buckets have deterministic ids, and moving an item
// copies it under its new bucket (same id) before deleting the old copy.

import { getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch, type DocumentReference } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import {
  accountsRef,
  allocationsRef,
  bucketLineItemRef,
  bucketLineItemsRef,
  bucketRef,
  bucketsRef,
  categoriesRef,
  migrationRef,
  overspendJustificationsRef,
  transactionRef,
  transactionsRef,
  transfersRef,
} from './refs';
import { recalcBucketTotals } from './aggregation';
import { FLOW_MIGRATION_ID, FLOW_MIGRATION_VERSION, planFlowMigration, type MigrationPlan } from '../budget/flowMigration';
import type { FirestoreBucket, FirestoreBucketLineItem } from './types';

const BATCH_LIMIT = 400;

class Batcher {
  private batch = writeBatch(getFirebaseFirestore());
  private count = 0;
  async set(ref: DocumentReference, data: Record<string, unknown>, merge = false) {
    if (merge) this.batch.set(ref, data, { merge: true });
    else this.batch.set(ref, data);
    await this.tick();
  }
  async update(ref: DocumentReference, data: Record<string, unknown>) {
    this.batch.update(ref, data);
    await this.tick();
  }
  async delete(ref: DocumentReference) {
    this.batch.delete(ref);
    await this.tick();
  }
  private async tick() {
    this.count += 1;
    if (this.count >= BATCH_LIMIT) await this.flush();
  }
  async flush() {
    if (!this.count) return;
    await this.batch.commit();
    this.batch = writeBatch(getFirebaseFirestore());
    this.count = 0;
  }
}

export async function flowMigrationDone(uid: string): Promise<boolean> {
  const snap = await getDoc(migrationRef(uid, FLOW_MIGRATION_ID));
  return Boolean(snap.exists() && snap.data()?.completedAt && (snap.data()?.version ?? 0) >= FLOW_MIGRATION_VERSION);
}

/** Plans and applies the migration. Returns the plan (empty when already done). */
export async function runFlowMigration(uid: string): Promise<MigrationPlan | null> {
  if (await flowMigrationDone(uid)) return null;

  const [bucketSnap, categorySnap, accountSnap, incomeSnap] = await Promise.all([
    getDocs(bucketsRef(uid)),
    getDocs(categoriesRef(uid)),
    getDocs(accountsRef(uid)),
    getDocs(query(transactionsRef(uid), where('type', '==', 'Income'))),
  ]);
  const buckets = bucketSnap.docs.map((d) => ({ ...(d.data() as FirestoreBucket), id: d.id }));
  const itemsByBucket: Record<string, (FirestoreBucketLineItem & { id: string })[]> = {};
  await Promise.all(
    buckets.map(async (bucket) => {
      const snap = await getDocs(bucketLineItemsRef(uid, bucket.id));
      itemsByBucket[bucket.id] = snap.docs.map((d) => ({ ...(d.data() as FirestoreBucketLineItem), id: d.id }));
    })
  );

  const plan = planFlowMigration({
    buckets,
    itemsByBucket,
    categories: new Map(categorySnap.docs.map((d) => [d.id, { name: d.data().name, transactionType: d.data().transactionType }])),
    accountType: new Map(accountSnap.docs.map((d) => [d.id, d.data().type])),
    incomeTransactions: incomeSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
  });

  await applyPlan(uid, plan, buckets, itemsByBucket);

  await setDoc(migrationRef(uid, FLOW_MIGRATION_ID), {
    version: FLOW_MIGRATION_VERSION,
    completedAt: serverTimestamp(),
    reviewedAt: null,
    report: plan.report,
  });
  return plan;
}

async function applyPlan(
  uid: string,
  plan: MigrationPlan,
  buckets: (FirestoreBucket & { id: string })[],
  itemsByBucket: Record<string, (FirestoreBucketLineItem & { id: string })[]>
) {
  const writes = new Batcher();
  const touched = new Set<string>();
  const bucketById = new Map(buckets.map((b) => [b.id, b]));

  for (const nb of plan.newBuckets) {
    const source = bucketById.get(nb.from);
    await writes.set(
      bucketRef(uid, nb.id),
      {
        name: nb.name,
        description: source?.description ?? '',
        totalAmount: 0,
        lineItemCount: 0,
        completedLineItemCount: 0,
        amountCompleted: 0,
        currency: nb.currency,
        deadline: source?.deadline ?? null,
        archived: Boolean(source?.archived),
        kind: nb.kind,
        type: nb.type,
        splitFrom: nb.from,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      true
    );
  }
  for (const p of plan.bucketPatches) {
    await writes.update(bucketRef(uid, p.bucketId), { ...p.patch, updatedAt: serverTimestamp() });
  }

  // Item patches are applied to the copy that ends up in the target bucket.
  const patchOf = new Map(plan.itemPatches.map((p) => [`${p.bucketId}/${p.itemId}`, p.patch]));
  for (const move of plan.itemMoves) {
    const item = itemsByBucket[move.from]?.find((i) => i.id === move.itemId);
    if (!item) continue;
    const { id: _id, ...data } = item;
    const patch = patchOf.get(`${move.to}/${move.itemId}`) ?? {};
    patchOf.delete(`${move.to}/${move.itemId}`);
    await writes.set(bucketLineItemRef(uid, move.to, move.itemId), { ...data, ...patch, goalId: move.to, updatedAt: serverTimestamp() });
    await writes.delete(bucketLineItemRef(uid, move.from, move.itemId));
    touched.add(move.from).add(move.to);
  }
  for (const [key, patch] of patchOf) {
    const [bucketId, itemId] = key.split('/');
    await writes.update(bucketLineItemRef(uid, bucketId, itemId), { ...patch, updatedAt: serverTimestamp() });
  }
  for (const p of plan.transactionPatches) {
    await writes.update(transactionRef(uid, p.id), p.patch);
  }
  await writes.flush();

  // Links to a moved item follow it to its new bucket. Budget figures key
  // on the item id, so these are tidiness rather than correctness.
  for (const move of plan.itemMoves) {
    const [txSnap, trSnap, fromSnap, toSnap, justSnap] = await Promise.all([
      getDocs(query(transactionsRef(uid), where('bucketItem.itemId', '==', move.itemId))),
      getDocs(query(transfersRef(uid), where('bucketItem.itemId', '==', move.itemId))),
      getDocs(query(allocationsRef(uid), where('from.itemId', '==', move.itemId))),
      getDocs(query(allocationsRef(uid), where('to.itemId', '==', move.itemId))),
      getDocs(query(overspendJustificationsRef(uid), where('bucketId', '==', move.from))),
    ]);
    for (const d of [...txSnap.docs, ...trSnap.docs]) await writes.update(d.ref, { 'bucketItem.bucketId': move.to });
    for (const d of fromSnap.docs) await writes.update(d.ref, { 'from.bucketId': move.to });
    for (const d of toSnap.docs) await writes.update(d.ref, { 'to.bucketId': move.to });
    for (const d of justSnap.docs) {
      const j = d.data();
      // A settlement about this one item follows it; one covering the
      // whole bucket stays with the bucket.
      if (j.itemId === move.itemId) await writes.update(d.ref, { bucketId: move.to });
    }
  }
  await writes.flush();

  for (const bucketId of touched) await recalcBucketTotals(uid, bucketId);
}

export async function markFlowMigrationReviewed(uid: string) {
  await setDoc(migrationRef(uid, FLOW_MIGRATION_ID), { reviewedAt: serverTimestamp() }, { merge: true });
}

/**
 * Moves one item to another bucket (of the same flow type): copies it
 * under the new bucket with the same id, deletes the old copy, and points
 * its payments and budget moves at the new bucket. Used by the Budget
 * page's "Move to bucket".
 */
export async function moveBucketItem(uid: string, itemId: string, from: string, to: string) {
  if (from === to) return;
  const snap = await getDoc(bucketLineItemRef(uid, from, itemId));
  if (!snap.exists()) throw new Error('That item no longer exists.');
  const writes = new Batcher();
  await writes.set(bucketLineItemRef(uid, to, itemId), { ...snap.data(), goalId: to, updatedAt: serverTimestamp() });
  await writes.delete(bucketLineItemRef(uid, from, itemId));
  const [txSnap, trSnap, fromSnap, toSnap] = await Promise.all([
    getDocs(query(transactionsRef(uid), where('bucketItem.itemId', '==', itemId))),
    getDocs(query(transfersRef(uid), where('bucketItem.itemId', '==', itemId))),
    getDocs(query(allocationsRef(uid), where('from.itemId', '==', itemId))),
    getDocs(query(allocationsRef(uid), where('to.itemId', '==', itemId))),
  ]);
  for (const d of [...txSnap.docs, ...trSnap.docs]) await writes.update(d.ref, { 'bucketItem.bucketId': to });
  for (const d of fromSnap.docs) await writes.update(d.ref, { 'from.bucketId': to });
  for (const d of toSnap.docs) await writes.update(d.ref, { 'to.bucketId': to });
  await writes.flush();
  await Promise.all([recalcBucketTotals(uid, from), recalcBucketTotals(uid, to)]);
}
