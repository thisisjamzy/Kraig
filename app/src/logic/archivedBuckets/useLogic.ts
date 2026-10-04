'use client';

// Settings' own "Archived buckets" screen — everything archiveBucket
// (aggregation.ts) has ever set archived: true on. Archiving never
// deletes a bucket, this is where it can always be found and brought back.

import { useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketsRef } from '@/src/shared/firestore/refs';
import { useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { restoreBucket as restoreBucketWrite, deleteBucket as deleteBucketWrite } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreBucket } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const archivedBucketsQuery = useMemo(
    () => (uid ? query(bucketsRef(uid), where('archived', '==', true)) : null),
    [uid]
  );
  const { data: bucketDocs, loading: bucketsLoading, error } = useFirestoreCollection<FirestoreBucket>(archivedBucketsQuery);

  const buckets = useMemo(
    () =>
      bucketDocs
        .map((bucket) => ({
          id: bucket.id,
          name: bucket.name,
          kind: bucket.kind ?? 'Variable',
          total: round2(toDisplay(ctx, bucket.totalAmount, ctx.base)),
          currency: ctx.display,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [bucketDocs, ctx]
  );

  async function restoreBucket(id: string) {
    if (!uid) return;
    await restoreBucketWrite(uid, id);
  }

  // deleteBucketWrite refuses while payments or budget moves are still
  // linked to the bucket's items — say why instead of failing silently.
  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function deleteBucket(id: string) {
    if (!uid) return;
    setDeleteError(null);
    try {
      await deleteBucketWrite(uid, id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this basket.');
    }
  }

  // Back to the page the user came from (skipping forms); '/settings' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/settings');
  }

  return {
    buckets,
    restoreBucket,
    deleteBucket,
    deleteError,
    goBack,
    loading: ctxLoading || bucketsLoading,
    error,
  };
}
