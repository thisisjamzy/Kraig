'use client';

// Runs the baskets migration (src/shared/budget/basketsMigration.ts) for one
// household, client side, and stores the review list at
// migrations/basketKindsV1 for the one-time "Check your items" page
// (/budget/item-kinds). A finished run is recorded and skipped; an
// interrupted one is planned again (the plan only holds what's missing).

import { getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { bucketLineItemRef, bucketLineItemsRef, bucketRef, bucketsRef, categoriesRef, migrationRef } from './refs';
import { BASKETS_MIGRATION_ID, BASKETS_MIGRATION_VERSION, planBasketsMigration, type KindReviewEntry } from '../budget/basketsMigration';
import { CLAUDE_USD_FIX_ID, planClaudeUsdFix } from '../budget/claudeUsdFix';
import { recalcBucketTotals } from './aggregation';
import type { FirestoreBucket, FirestoreBucketLineItem, ItemKind } from './types';

const BATCH_LIMIT = 400;

export async function runBasketsMigration(uid: string): Promise<number | null> {
  const done = await getDoc(migrationRef(uid, BASKETS_MIGRATION_ID));
  if (done.exists() && done.data()?.completedAt && (done.data()?.version ?? 0) >= BASKETS_MIGRATION_VERSION) return null;

  const [bucketSnap, categorySnap] = await Promise.all([getDocs(bucketsRef(uid)), getDocs(categoriesRef(uid))]);
  const buckets = bucketSnap.docs.map((d) => ({ ...(d.data() as FirestoreBucket), id: d.id }));
  const itemsByBucket: Record<string, (FirestoreBucketLineItem & { id: string })[]> = {};
  await Promise.all(
    buckets.map(async (bucket) => {
      const snap = await getDocs(bucketLineItemsRef(uid, bucket.id));
      itemsByBucket[bucket.id] = snap.docs.map((d) => ({ ...(d.data() as FirestoreBucketLineItem), id: d.id }));
    })
  );
  const plan = planBasketsMigration({
    buckets,
    itemsByBucket,
    categories: new Map(categorySnap.docs.map((d) => [d.id, { name: d.data().name, transactionType: d.data().transactionType }])),
  });

  const db = getFirebaseFirestore();
  let batch = writeBatch(db);
  let count = 0;
  const tick = async () => {
    count += 1;
    if (count >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  };
  // Items first: a one-off is pinned before its basket gets a cadence to inherit.
  for (const p of plan.itemPatches) {
    batch.update(bucketLineItemRef(uid, p.bucketId, p.itemId), { ...p.patch, updatedAt: serverTimestamp() });
    await tick();
  }
  if (count) await batch.commit();
  batch = writeBatch(db);
  count = 0;
  for (const p of plan.bucketPatches) {
    batch.update(bucketRef(uid, p.bucketId), { ...p.patch, updatedAt: serverTimestamp() });
    await tick();
  }
  if (count) await batch.commit();

  await setDoc(migrationRef(uid, BASKETS_MIGRATION_ID), {
    version: BASKETS_MIGRATION_VERSION,
    completedAt: serverTimestamp(),
    reviewedAt: null,
    report: plan.review.map((r) => ({ kind: r.kind, subject: `${r.bucketId}/${r.itemId}`, detail: JSON.stringify(r) })),
  });
  return plan.review.length;
}

/** The review list stored by the run. */
export function reviewEntriesOf(report: { kind: string; subject: string; detail: string }[] | undefined): KindReviewEntry[] {
  return (report ?? []).flatMap((r) => {
    try {
      return [JSON.parse(r.detail) as KindReviewEntry];
    } catch {
      return [];
    }
  });
}

/** One item's kind, corrected from the review list. */
export async function setItemKind(uid: string, bucketId: string, itemId: string, kind: ItemKind) {
  await updateDoc(bucketLineItemRef(uid, bucketId, itemId), { itemKind: kind, updatedAt: serverTimestamp() });
}

export async function markBasketsMigrationReviewed(uid: string) {
  await setDoc(migrationRef(uid, BASKETS_MIGRATION_ID), { reviewedAt: serverTimestamp() }, { merge: true });
}

/**
 * The Claude subscriptions to USD (src/shared/budget/claudeUsdFix.ts), once
 * per household. Returns how many items changed, or null when already done.
 */
export async function runClaudeUsdFix(uid: string): Promise<number | null> {
  const done = await getDoc(migrationRef(uid, CLAUDE_USD_FIX_ID));
  if (done.exists() && done.data()?.completedAt) return null;
  const bucketSnap = await getDocs(bucketsRef(uid));
  const buckets = bucketSnap.docs.map((d) => ({ ...(d.data() as FirestoreBucket), id: d.id }));
  const itemsByBucket: Record<string, (FirestoreBucketLineItem & { id: string })[]> = {};
  await Promise.all(
    buckets.map(async (bucket) => {
      const snap = await getDocs(bucketLineItemsRef(uid, bucket.id));
      itemsByBucket[bucket.id] = snap.docs.map((d) => ({ ...(d.data() as FirestoreBucketLineItem), id: d.id }));
    })
  );
  const plan = planClaudeUsdFix(buckets, itemsByBucket);
  if (plan.length) {
    const batch = writeBatch(getFirebaseFirestore());
    for (const p of plan) batch.update(bucketLineItemRef(uid, p.bucketId, p.itemId), { currency: 'USD', updatedAt: serverTimestamp() });
    await batch.commit();
    await Promise.all([...new Set(plan.map((p) => p.bucketId))].map((id) => recalcBucketTotals(uid, id)));
  }
  await setDoc(migrationRef(uid, CLAUDE_USD_FIX_ID), {
    version: 1,
    completedAt: serverTimestamp(),
    reviewedAt: null,
    report: plan.map((p) => ({ kind: 'currency', subject: `${p.bucketId}/${p.itemId}`, detail: 'USD' })),
  });
  return plan.length;
}
