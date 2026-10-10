// One-time data fix: the Claude subscriptions were entered as 24 in their
// basket's currency (XAF), but they cost 24 USD. Marking those items as USD
// (FirestoreBucketLineItem.currency) makes every screen convert them at the
// current rate, and follow it when the rate or display currency changes.
// Only items named Claude with an amount of 24 that aren't already in USD
// are touched, so planning fixed data yields nothing (safe to run again).
// Pure: tested in test/basketKinds.test.ts.

import type { FirestoreBucket, FirestoreBucketLineItem } from '../firestore/types';

export const CLAUDE_USD_FIX_ID = 'claudeUsdV1';

type Item = Pick<FirestoreBucketLineItem, 'id' | 'name' | 'amount'> & Partial<Pick<FirestoreBucketLineItem, 'currency'>>;

export function planClaudeUsdFix(
  buckets: Pick<FirestoreBucket, 'id' | 'currency'>[],
  itemsByBucket: Record<string, Item[]>
): { bucketId: string; itemId: string }[] {
  const out: { bucketId: string; itemId: string }[] = [];
  for (const bucket of buckets) {
    for (const item of itemsByBucket[bucket.id] ?? []) {
      const currency = item.currency || bucket.currency;
      if (/claude/i.test(item.name ?? '') && Number(item.amount) === 24 && currency !== 'USD') out.push({ bucketId: bucket.id, itemId: item.id });
    }
  }
  return out;
}
