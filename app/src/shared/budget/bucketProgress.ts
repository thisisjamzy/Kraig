// How far along a bucket (and each of its items) is — the ONE derivation
// every bucket screen reads (Buckets list, Bucket Detail's progress card and
// item rows), so they can never disagree with each other or with the Budget
// screen. Pure, like monthBudget.ts, and built on the same attribution rule
// (monthBudget.ts's resolveLink).
//
// Never reads the stored FirestoreBucket.amountCompleted /
// completedLineItemCount or an item's actualAmount: those are denormalized
// copies that only counted fully-closed items and, before Budgets v2, got
// set on recurring items too — the source of "0 spent here, all spent
// there".
//
// Two scopes, because the two kinds of bucket answer different questions:
//  - Fixed (recurring): "how is THIS month going?" — straight from the
//    month's derived budget (MonthBudget's bucket group), including any
//    money moved in or out of its items. A recurring item is never "done"
//    for good.
//  - Planned (one-off): "how much of the whole plan is paid?" — every
//    month's spend against each item's amount.

import { itemCurrencyOf } from '../firestore/currency';
import { buildLegacyLinks, resolveLink, monthKeyOf, type BudgetItemLike, type MonthBudget } from './monthBudget';
import type {
  FirestoreBucket,
  FirestoreBucketLineItem,
  FirestoreTransaction,
  FirestoreTransfer,
} from '../firestore/types';

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

type ItemLike = BudgetItemLike & Partial<Pick<FirestoreBucketLineItem, 'completedAt' | 'actualAmount'>>;

/** A one-off item is closed when marked so; a recurring item never is. */
export function isItemClosed(item: { completed: boolean }, bucketKind: FirestoreBucket['kind']): boolean {
  return bucketKind !== 'Fixed' && item.completed;
}

export interface ItemSpend {
  total: number;
  byMonth: Map<string, number>;
  transactionIds: string[];
  transferIds: string[];
}

export interface ItemSpendInput {
  buckets: Pick<FirestoreBucket, 'id' | 'currency'>[];
  itemsByBucket: Record<string, ItemLike[]>;
  // Every transaction/transfer carrying an explicit bucketItem link (any
  // month). Legacy (unlinked) payments come from the items' own payments[].
  transactions: Pick<FirestoreTransaction, 'id' | 'accountId' | 'amount' | 'direction' | 'type' | 'date' | 'bucketItem'>[];
  transfers: Pick<FirestoreTransfer, 'id' | 'fromAccountId' | 'amount' | 'date' | 'bucketItem'>[];
  accountCurrency: Map<string, string>;
  baseCurrency: string;
  toDisplay: (amount: number, currency: string) => number;
}

/** Lifetime spend per item id, in display currency. */
export function buildItemSpend(input: ItemSpendInput): Map<string, ItemSpend> {
  const { toDisplay, accountCurrency, baseCurrency } = input;
  const spend = new Map<string, ItemSpend>();
  const legacyLinks = buildLegacyLinks(input.itemsByBucket);
  const counted = new Set<string>();

  function add(itemId: string, month: string, amount: number) {
    let entry = spend.get(itemId);
    if (!entry) {
      entry = { total: 0, byMonth: new Map(), transactionIds: [], transferIds: [] };
      spend.set(itemId, entry);
    }
    entry.total += amount;
    entry.byMonth.set(month, (entry.byMonth.get(month) ?? 0) + amount);
    return entry;
  }

  for (const t of input.transactions) {
    if (counted.has(t.id)) continue;
    const link = resolveLink({ ...t, month: monthKeyOf(t.date.toDate()) }, legacyLinks);
    if (!link) continue;
    counted.add(t.id);
    // Same direction rule as the month budget: money out counts for an
    // Expense/Savings item, money in for an Income one; a refund reduces.
    const signed = t.direction === 'Inflow' ? t.amount : -t.amount;
    const progress = t.type === 'Income' ? signed : -signed;
    add(link.itemId, link.month, toDisplay(progress, accountCurrency.get(t.accountId) ?? baseCurrency)).transactionIds.push(t.id);
  }
  for (const t of input.transfers) {
    if (counted.has(t.id)) continue;
    const link = resolveLink({ ...t, month: monthKeyOf(t.date.toDate()) }, legacyLinks);
    if (!link) continue;
    counted.add(t.id);
    add(link.itemId, link.month, toDisplay(t.amount, accountCurrency.get(t.fromAccountId) ?? baseCurrency)).transferIds.push(t.id);
  }

  // Legacy payments whose record wasn't in the linked set (it predates
  // explicit links): trust the amount the item recorded for it. Anything
  // already counted above — explicitly linked, including every payment
  // Budgets v2 itself synced into payments[] — is skipped, so nothing is
  // double-counted.
  const bucketCurrency = new Map(input.buckets.map((bucket) => [bucket.id, bucket.currency]));
  for (const [bucketId, items] of Object.entries(input.itemsByBucket)) {
    const currency = bucketCurrency.get(bucketId) ?? baseCurrency;
    for (const item of items) {
      for (const payment of item.payments ?? []) {
        if (counted.has(payment.id)) continue;
        counted.add(payment.id);
        const entry = add(item.id, monthKeyOf(payment.date.toDate()), toDisplay(payment.amount, currency));
        (payment.kind === 'transfer' ? entry.transferIds : entry.transactionIds).push(payment.id);
      }
      // Oldest shape of all: completed before payments[] existed, with
      // only expenseId/transferId (+ maybe actualAmount) to go on.
      const legacyId = item.transferId || item.expenseId;
      if (!item.payments?.length && item.completed && legacyId && !counted.has(legacyId)) {
        counted.add(legacyId);
        const when = item.completedAt?.toDate() ?? new Date();
        const entry = add(item.id, monthKeyOf(when), toDisplay(item.actualAmount ?? item.amount, currency));
        (item.transferId ? entry.transferIds : entry.transactionIds).push(legacyId);
      }
    }
  }

  for (const entry of spend.values()) {
    entry.total = round2(entry.total);
    for (const [month, amount] of entry.byMonth) entry.byMonth.set(month, round2(amount));
  }
  return spend;
}

export interface BucketProgress {
  scope: 'month' | 'total';
  planned: number;
  spent: number;
  remaining: number; // planned - spent, negative when over
  percent: number; // spent / planned, 0-100 (money, not item count)
  itemCount: number;
  doneCount: number;
}

export function bucketProgress(
  bucket: Pick<FirestoreBucket, 'id' | 'kind' | 'currency'>,
  items: ItemLike[],
  spend: Map<string, ItemSpend>,
  monthBudget: MonthBudget | null, // only read for a Fixed bucket
  toDisplay: (amount: number, currency: string) => number
): BucketProgress {
  let planned = 0;
  let spent = 0;
  let itemCount = 0;
  let doneCount = 0;

  if (bucket.kind === 'Fixed') {
    // This month, exactly as the Budget screen shows it.
    for (const entry of monthBudget?.items ?? []) {
      if (entry.bucketId !== bucket.id) continue;
      itemCount += 1;
      planned += entry.available;
      spent += entry.actual;
      if (entry.available > 0 && entry.actual >= entry.available) doneCount += 1;
    }
  } else {
    for (const item of items) {
      const itemPlanned = toDisplay(item.amount, itemCurrencyOf(item, bucket));
      const itemSpent = spend.get(item.id)?.total ?? 0;
      itemCount += 1;
      planned += itemPlanned;
      spent += itemSpent;
      if (isItemClosed(item, bucket.kind) || (itemPlanned > 0 && itemSpent >= itemPlanned)) doneCount += 1;
    }
  }

  planned = round2(planned);
  spent = round2(spent);
  return {
    scope: bucket.kind === 'Fixed' ? 'month' : 'total',
    planned,
    spent,
    remaining: round2(planned - spent),
    percent: planned > 0 ? Math.max(0, Math.min(100, Math.round((spent / planned) * 100))) : 0,
    itemCount,
    doneCount,
  };
}
