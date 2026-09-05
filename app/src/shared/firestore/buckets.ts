'use client';

// Every area gets exactly one default bucket, at a deterministic id derived
// from the area's own id — same "fixed derived id, create-if-missing"
// convention as unaccountedBalance.ts's Unjustified wallet. A project with
// no bucket of its own (bucketId null, or an id that no longer resolves to
// a real bucket) is treated as living in its area's default bucket
// wherever projects are grouped by bucket, so every project is always
// manageable from some bucket without a data migration.

import { getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { bucketRef } from './refs';

export function defaultBucketId(areaId: string): string {
  return `default-${areaId}`;
}

/**
 * Creates an area's default bucket if it doesn't already exist. Safe to
 * call repeatedly — called both when an area is created and lazily from
 * any screen that needs to guarantee one exists (area detail, create/edit
 * project) for an area that predates this feature.
 */
export async function ensureDefaultBucket(uid: string, areaId: string, areaColor: string): Promise<string> {
  const id = defaultBucketId(areaId);
  const ref = bucketRef(uid, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: 'General',
      emoji: null,
      color: areaColor,
      description: 'Projects not sorted into a specific bucket.',
      areaId,
      archived: false,
      isDefault: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return id;
}
