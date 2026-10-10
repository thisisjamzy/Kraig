// The one-time baskets migration: every item gets an explicit kind and
// every basket a cadence, so what used to be inferred is stored and the
// household can correct it once.
//   - Items with a set amount and a due date become Payment; items used
//     through the month (a variable expense, no due date, or three or more
//     small payments recorded) become Allowance; savings items become Set
//     aside. Transfers have no kind (a move between your own wallets).
//     Income items are lump sums.
//   - Each basket stores the cadence it already had in effect (Monthly when
//     it repeats, One-off when it doesn't).
//   - An item with no recurrence of its own was a one-off on its due date.
//     Once its basket has a cadence it would start inheriting it, so the
//     plan pins it to "Once" explicitly: no month's budget changes.
// The plan lists every inferred kind for the review list
// (migrations/basketKindsV1). Planning migrated data yields no writes, so
// it's safe to run again. Pure: tested in test/basketKinds.test.ts.

import { expenseKindOf, itemFlow, type FlowType } from './flow';
import { basketCadenceOf } from './cadence';
import { inferItemKind } from './itemKinds';
import type { BasketCadence, FirestoreBucket, FirestoreBucketLineItem, ItemKind } from '../firestore/types';

export const BASKETS_MIGRATION_ID = 'basketKindsV1';
export const BASKETS_MIGRATION_VERSION = 1;

export interface KindReviewEntry {
  bucketId: string;
  bucketName: string;
  itemId: string;
  name: string;
  kind: ItemKind;
  /** Why it was given that kind, in a few words. */
  why: string;
}

export interface BasketsMigrationPlan {
  bucketPatches: { bucketId: string; patch: { cadence: BasketCadence } }[];
  itemPatches: { bucketId: string; itemId: string; patch: Record<string, unknown> }[];
  review: KindReviewEntry[];
}

type Bucket = Pick<FirestoreBucket, 'id' | 'name' | 'type' | 'kind' | 'cadence' | 'repeats' | 'archived'>;
type Item = Pick<FirestoreBucketLineItem, 'id' | 'name' | 'categoryId' | 'dueDate' | 'recurrence'> &
  Partial<Pick<FirestoreBucketLineItem, 'itemKind' | 'incomeMode' | 'expenseKind' | 'subItems' | 'payments'>>;

function why(kind: ItemKind, flow: FlowType, signals: { hasDueDate: boolean; many: boolean; variable: boolean }): string {
  if (flow === 'Savings') return 'Savings item';
  if (kind === 'payment') return 'Set amount with a due date';
  if (signals.many) return 'Paid in many small amounts';
  if (signals.variable) return 'Used through the month';
  return 'No due date';
}

export function planBasketsMigration(input: {
  buckets: Bucket[];
  itemsByBucket: Record<string, Item[]>;
  categories: Map<string, { name?: string; transactionType: 'Expense' | 'Income' | 'Savings' }>;
}): BasketsMigrationPlan {
  const plan: BasketsMigrationPlan = { bucketPatches: [], itemPatches: [], review: [] };
  for (const bucket of input.buckets) {
    const cadence = basketCadenceOf(bucket);
    const storedCadence = Boolean(bucket.cadence);
    if (!storedCadence) plan.bucketPatches.push({ bucketId: bucket.id, patch: { cadence } });
    const bucketType = (bucket.type ?? 'Expense') as FlowType;
    for (const item of input.itemsByBucket[bucket.id] ?? []) {
      const patch: Record<string, unknown> = {};
      const flow = itemFlow(bucketType, item.categoryId, input.categories);
      // Keep every month as it was: a one-off stays a one-off once the basket has a cadence.
      if (!storedCadence && !item.recurrence && item.dueDate && cadence !== 'Once') patch.recurrence = { frequency: 'Once', interval: 1 };
      if (flow === 'Income') {
        if (!item.incomeMode) patch.incomeMode = 'lump_sum';
      } else if (flow !== 'Transfer' && !item.itemKind) {
        const categoryName = item.categoryId ? (input.categories.get(item.categoryId)?.name ?? null) : null;
        const recurring = Boolean(item.recurrence && item.recurrence.frequency !== 'Once');
        const expenseKind = flow === 'Expense' ? expenseKindOf(item, { categoryName, recurring, hasDueDate: Boolean(item.dueDate) }) : null;
        const transactionCount = item.payments?.length ?? 0;
        const kind = inferItemKind({ flow, expenseKind, hasDueDate: Boolean(item.dueDate), transactionCount });
        patch.itemKind = kind;
        if (!bucket.archived) {
          plan.review.push({
            bucketId: bucket.id,
            bucketName: bucket.name,
            itemId: item.id,
            name: item.name,
            kind,
            why: why(kind, flow, { hasDueDate: Boolean(item.dueDate), many: transactionCount >= 3, variable: expenseKind === 'variable' }),
          });
        }
      }
      if (Object.keys(patch).length) plan.itemPatches.push({ bucketId: bucket.id, itemId: item.id, patch });
    }
  }
  return plan;
}
