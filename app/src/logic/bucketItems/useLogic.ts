'use client';

// The cross-bucket "everything left to do" list — every not-yet-completed
// line item across every active bucket, in one place, rankable by the user.
// Fans out one onSnapshot per bucket id for line items (same shape as
// src/logic/buckets/useLogic.ts's own repaymentsByDebt fan-out) rather than a
// collectionGroup('lineItems') query — that would need a collection-group
// index enabled and deployed for a feature this small, where a handful of
// per-bucket listeners does the same job with zero new Firebase config.
//
// Two ways to rank:
//  - Apply a sort ("Priority" = nearest bucket deadline first, "Ease" =
//    smallest cost first) as the new custom order — writes sequential rank
//    values (0, 1, 2, ...) so the list becomes exactly that order, and the
//    user can then fine-tune it from there.
//  - Drag-and-drop one item to a new position (only while sorted by
//    "Custom") — dnd-kit's onDragEnd gives the old/new index directly,
//    reordered exactly like applySortAsCustomOrder's own rank rewrite.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where } from 'firebase/firestore';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketsRef } from '@/src/shared/firestore/refs';
import { setBucketLineItemRanks } from '@/src/shared/firestore/aggregation';
import { useCurrencyContext, useCategories } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { useBucketLineItemsByBucket } from '@/src/shared/hooks/useBucketLineItemsByBucket';
import { isItemClosed } from '@/src/shared/budget/bucketProgress';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY, DEFAULT_NECESSITY } from '@/src/viewmodels/projects';
import { categoryAccentColor } from '@/src/viewmodels/categories';
import type { FirestoreBucket, Priority, BucketItemNecessity } from '@/src/shared/firestore/types';

export type BucketItemSort = 'custom' | 'priority' | 'ease';

interface BucketItemRow {
  id: string;
  goalId: string;
  bucketName: string;
  name: string;
  amount: number;
  rank: number;
  priority: Priority;
  necessity: BucketItemNecessity;
  deadline: Date | null;
  dueDateObj: Date | null;
  categoryName: string;
  categoryColor: string;
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const bucketsQuery = useMemo(() => (uid ? query(bucketsRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: bucketDocs, loading: bucketsLoading } = useFirestoreCollection<FirestoreBucket>(bucketsQuery);

  const { itemsByBucket, loading: itemsLoading } = useBucketLineItemsByBucket(bucketDocs);
  const { data: categories, loading: categoriesLoading } = useCategories();
  const categoryName = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (id: string | undefined | null) => (id && map.get(id)) || id || '—';
  }, [categories]);

  const pendingItems = useMemo(() => {
    const list: BucketItemRow[] = [];
    for (const bucket of bucketDocs) {
      for (const item of itemsByBucket[bucket.id] ?? []) {
        if (isItemClosed(item, bucket.kind)) continue;
        const label = categoryName(item.categoryId);
        list.push({
          id: item.id,
          goalId: bucket.id,
          bucketName: bucket.name,
          name: item.name,
          amount: round2(toDisplay(ctx, item.amount, bucket.currency)),
          rank: item.rank ?? 0,
          priority: item.priority ?? DEFAULT_PRIORITY,
          necessity: item.necessity ?? DEFAULT_NECESSITY,
          deadline: bucket.deadline ? bucket.deadline.toDate() : null,
          dueDateObj: item.dueDate ? item.dueDate.toDate() : null,
          categoryName: label,
          categoryColor: categoryAccentColor(label),
        });
      }
    }
    return list;
  }, [bucketDocs, itemsByBucket, ctx, categoryName]);

  const [sortMode, setSortMode] = useState<BucketItemSort>('custom');
  const sortedItems = useMemo(() => {
    const list = [...pendingItems];
    if (sortMode === 'priority') {
      list.sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.getTime() - b.deadline.getTime();
      });
    } else if (sortMode === 'ease') {
      list.sort((a, b) => a.amount - b.amount);
    } else {
      list.sort((a, b) => a.rank - b.rank);
    }
    return list;
  }, [pendingItems, sortMode]);

  // Empty selection means "no filter" (show everything) for that group —
  // checking a box narrows to just what's checked, unchecking the last one
  // falls back to showing all again, rather than showing nothing.
  const [priorityFilter, setPriorityFilter] = useState<Priority[]>([]);
  const [necessityFilter, setNecessityFilter] = useState<BucketItemNecessity[]>([]);

  function togglePriorityFilter(priority: Priority) {
    setPriorityFilter((current) =>
      current.includes(priority) ? current.filter((p) => p !== priority) : [...current, priority]
    );
  }
  function toggleNecessityFilter(necessity: BucketItemNecessity) {
    setNecessityFilter((current) =>
      current.includes(necessity) ? current.filter((n) => n !== necessity) : [...current, necessity]
    );
  }

  const items = useMemo(
    () =>
      sortedItems.filter(
        (item) =>
          (priorityFilter.length === 0 || priorityFilter.includes(item.priority)) &&
          (necessityFilter.length === 0 || necessityFilter.includes(item.necessity))
      ),
    [sortedItems, priorityFilter, necessityFilter]
  );

  async function applySortAsCustomOrder() {
    if (!uid || sortMode === 'custom') return;
    await setBucketLineItemRanks(
      uid,
      items.map((item, index) => ({ goalId: item.goalId, lineItemId: item.id, rank: index }))
    );
    setSortMode('custom');
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!uid || sortMode !== 'custom') return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    await setBucketLineItemRanks(
      uid,
      reordered.map((item, index) => ({ goalId: item.goalId, lineItemId: item.id, rank: index }))
    );
  }

  function openBucket(goalId: string) {
    router.push(`/buckets/${goalId}`);
  }

  return {
    items,
    sortMode,
    setSortMode,
    priorityFilter,
    togglePriorityFilter,
    necessityFilter,
    toggleNecessityFilter,
    applySortAsCustomOrder,
    handleDragEnd,
    currency: ctx.display,
    openBucket,
    loading: ctxLoading || bucketsLoading || itemsLoading || categoriesLoading,
  };
}
