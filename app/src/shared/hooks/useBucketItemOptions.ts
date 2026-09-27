'use client';

// The "Pays for bucket item" picker shared by Edit Transaction and Edit
// Transfer (PRD-BUDGETS-V2.md section 6.4): every occurrence, in the given
// category (or Transfer kind), within a month either side of the date (for
// early/late payments), plus whatever the record is linked to now so an
// existing link never silently disappears from the picker.

import { useMemo } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useBucketLineItemsByBucket } from '@/src/shared/hooks/useBucketLineItemsByBucket';
import { addMonths, itemOccurrence, monthLabel } from '@/src/shared/budget/monthBudget';
import type { BucketItemLink, FirestoreBucket } from '@/src/shared/firestore/types';

export interface BucketItemOption {
  key: string; // `${itemId}@${yyyy-MM}`
  link: BucketItemLink;
  label: string;
}

export function bucketItemKey(link: BucketItemLink | null | undefined): string {
  return link ? `${link.itemId}@${link.month}` : '';
}

export function useBucketItemOptions({
  categoryId,
  dateValue,
  current,
}: {
  categoryId: string; // a real category id, or a TRANSFER_CATEGORIES kind for a transfer
  dateValue: string; // yyyy-MM-dd
  current: BucketItemLink | null | undefined;
}): BucketItemOption[] {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: buckets } = useFirestoreCollection<FirestoreBucket>(
    useMemo(() => (uid ? query(bucketsRef(uid), where('archived', '==', false)) : null), [uid])
  );
  const { itemsByBucket } = useBucketLineItemsByBucket(buckets);

  return useMemo(() => {
    if (!dateValue) return [];
    const monthKey = dateValue.slice(0, 7);
    const months = [monthKey, addMonths(monthKey, -1), addMonths(monthKey, 1)];
    const bucketName = new Map(buckets.map((bucket) => [bucket.id, bucket.name]));
    const options: BucketItemOption[] = Object.values(itemsByBucket)
      .flat()
      .filter((item) => item.categoryId === categoryId)
      .flatMap((item) =>
        months
          .filter((month) => itemOccurrence(item, month))
          .map((month) => ({
            key: `${item.id}@${month}`,
            link: { bucketId: item.goalId, itemId: item.id, month },
            label: `${bucketName.get(item.goalId) ?? 'Bucket'}: ${item.name}${month === monthKey ? '' : ` · ${monthLabel(month)}`}`,
          }))
      );
    if (current && !options.some((option) => option.key === bucketItemKey(current))) {
      const item = itemsByBucket[current.bucketId]?.find((candidate) => candidate.id === current.itemId);
      options.push({
        key: bucketItemKey(current),
        link: current,
        label: `${bucketName.get(current.bucketId) ?? 'Bucket'}: ${item?.name ?? 'Deleted item'} · ${monthLabel(current.month)}`,
      });
    }
    return options;
  }, [itemsByBucket, buckets, categoryId, dateValue, current]);
}
