'use client';

// Every active bucket's line items, fanned out as one onSnapshot per bucket id
// (same shape as src/logic/buckets/useLogic.ts's own repaymentsByDebt fan-out)
// rather than a collectionGroup('lineItems') query — that would need a
// collection-group index enabled and deployed just for this, where a
// handful of per-bucket listeners does the same job with zero new Firebase
// config. Shared by the cross-bucket "All bucket items" list (src/logic/
// bucketItems) and the Buckets tab's must-have/nice-to-have gauge
// (src/logic/buckets), so the two agree on the same underlying data.

import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { bucketLineItemsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreBucketLineItem } from '@/src/shared/firestore/types';

export function useBucketLineItemsByBucket(buckets: { id: string }[]) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const [itemsByBucket, setItemsByBucket] = useState<Record<string, (FirestoreBucketLineItem & { id: string })[]>>({});
  const [loading, setLoading] = useState(true);
  const bucketIdsKey = buckets.map((bucket) => bucket.id).sort().join(',');
  // Which set of buckets `itemsByBucket` was loaded for — until the effect
  // below has caught up with a new set, the items aren't settled yet (the
  // one render in between would otherwise read as "loaded, no items").
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || buckets.length === 0) {
      setItemsByBucket({});
      setLoading(false);
      setLoadedKey(bucketIdsKey);
      return;
    }
    setLoading(true);
    let pending = buckets.length;
    const unsubscribers = buckets.map((bucket) =>
      onSnapshot(bucketLineItemsRef(uid, bucket.id), (snap) => {
        setItemsByBucket((current) => ({
          ...current,
          [bucket.id]: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FirestoreBucketLineItem, 'id'>) })),
        }));
        pending = Math.max(0, pending - 1);
        if (pending === 0) {
          setLoading(false);
          setLoadedKey(bucketIdsKey);
        }
      })
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, bucketIdsKey]);

  return { itemsByBucket, loading: loading || loadedKey !== bucketIdsKey };
}
