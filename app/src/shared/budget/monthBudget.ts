// PRD-BUDGETS-V2.md section 5 — a month's budget, derived. Nothing here is
// ever typed in or stored: every figure is computed from the bucket items
// that apply to the month, the transactions/transfers linked to them
// (FirestoreTransaction.bucketItem), and the allocation ledger
// (FirestoreAllocation). Pure — no Firestore reads, no React — so the Budget
// screen, bucket item sheet, and Add Transaction all agree on the same
// numbers, and test/monthBudget.test.ts can pin them down.
//
// Every amount out of here is in the caller's display currency, via the
// `toDisplay` it passes in (items are native to their bucket's currency,
// transactions to their account's, allocations to whatever they were
// entered in).

import { bucketLineItemAppliesToMonth } from '../firestore/recurrence';
import type {
  AllocationEndpoint,
  BucketItemLink,
  FirestoreAllocation,
  FirestoreBucket,
  FirestoreBucketLineItem,
  FirestoreOverspendJustification,
  FirestoreTransaction,
  FirestoreTransfer,
} from '../firestore/types';

export type BudgetItemType = 'Expense' | 'Income' | 'Savings' | 'Transfer';
export type BudgetItemStatus = 'under' | 'on' | 'over';

/**
 * Budgets v2 (explicit bucket-item links on transactions) started in this
 * month. Before it, transactions were never linked to a budget item, so
 * they'd all read as unplanned. For those months only, an unlinked
 * transaction paying a recurring item — same category and type as an item
 * in a Fixed (recurring) bucket that month — counts against that item
 * (the one whose planned amount is closest, when there are several).
 */
export const BUDGETS_V2_START = '2026-09';

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(month: string, delta: number): string {
  const [year, monthNum] = month.split('-').map(Number);
  return monthKeyOf(new Date(year, monthNum - 1 + delta, 1));
}

export function monthLabel(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  return new Date(year, monthNum - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type BudgetItemLike = Pick<
  FirestoreBucketLineItem,
  'id' | 'goalId' | 'name' | 'amount' | 'categoryId' | 'dueDate' | 'recurrence' | 'excludedMonths' | 'monthOverrides' | 'completed' | 'charges'
> &
  Partial<Pick<FirestoreBucketLineItem, 'payments' | 'expenseId' | 'transferId' | 'monthJustifications'>>;

/**
 * Which item a transaction/transfer pays for — THE one attribution rule
 * every spend figure in the app goes through (this file's buildMonthBudget,
 * bucketProgress.ts's lifetime spend). An explicit `bucketItem` link wins.
 * Without one, a record an item's legacy `payments[]` (or pre-payments
 * expenseId/transferId) points at still belongs to that item, in the
 * record's own month — so spend recorded before Budgets v2 counts
 * everywhere even before scripts/migrate-budgets-v2.ts has written the
 * explicit links.
 */
export type LegacyLinks = Map<string, { bucketId: string; itemId: string }>;

export function buildLegacyLinks(itemsByBucket: Record<string, BudgetItemLike[]>): LegacyLinks {
  const links: LegacyLinks = new Map();
  for (const [bucketId, items] of Object.entries(itemsByBucket)) {
    for (const item of items) {
      const ids = item.payments?.length
        ? item.payments.map((payment) => payment.id)
        : [item.expenseId, item.transferId].filter((id): id is string => Boolean(id));
      for (const id of ids) links.set(id, { bucketId, itemId: item.id });
    }
  }
  return links;
}

export function resolveLink(
  record: { id: string; bucketItem?: BucketItemLink | null; month: string },
  legacyLinks: LegacyLinks
): BucketItemLink | null {
  if (record.bucketItem) return record.bucketItem;
  const legacy = legacyLinks.get(record.id);
  return legacy ? { ...legacy, month: record.month } : null;
}

/**
 * Does `item` have an occurrence in `month`, and if so what's planned for
 * it — the one place excludedMonths/monthOverrides are applied, same role
 * @dreda/shared-recurrence's effectiveBudgetedAmount played for rules. A
 * Planned item with no dueDate is unscheduled: in no month's budget.
 */
export function itemOccurrence(item: BudgetItemLike, month: string): { planned: number; isOverride: boolean } | null {
  if (item.excludedMonths?.includes(month)) return null;
  const [year, monthNum] = month.split('-').map(Number);
  const occurrence = bucketLineItemAppliesToMonth(item, year, monthNum);
  if (!occurrence) return null;
  const override = item.monthOverrides?.[month];
  if (override) return { planned: override.amount, isOverride: true };
  return { planned: item.amount * occurrence.multiplier, isOverride: false };
}

export function endpointKey(endpoint: AllocationEndpoint): string {
  if (endpoint.kind === 'item') return itemMonthKey(endpoint.itemId, endpoint.month);
  if (endpoint.kind === 'pool') return 'pool';
  return `savings:${endpoint.accountId}`;
}

export function itemMonthKey(itemId: string, month: string) {
  return `${itemId}@${month}`;
}

export interface ItemMonth {
  key: string; // itemMonthKey(itemId, month)
  bucketId: string;
  bucketName: string;
  itemId: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  type: BudgetItemType;
  kind: 'Fixed' | 'Planned';
  month: string;
  planned: number;
  isOverride: boolean;
  allocatedIn: number;
  allocatedOut: number;
  available: number; // planned + allocatedIn - allocatedOut
  actual: number; // spent (Expense/Savings/Transfer) or received (Income)
  remaining: number; // available - actual
  status: BudgetItemStatus;
  // This item's part of its BUCKET's overspend no allocation has covered
  // yet, >= 0. A bucket is only over when its spending items together
  // spend more than planned — an item past its own amount while the
  // bucket still has room is just a mis-estimate (remaining < 0,
  // unfunded 0). The bucket's net overspend is shared among its items
  // that went over, in proportion to how far over each went.
  unfunded: number;
  // The part of that overspend explained instead ("justified"), and why —
  // FirestoreBucketLineItem.monthJustifications. unfunded − justified.amount
  // is what still needs action.
  justified: { reason: string; note: string; amount: number } | null;
  // Cover-or-justify settlements recorded for this item-month (not
  // reverted): their ids, and how much of the overspend each left open
  // ("not covered yet") — still counted in unfunded − justified.amount.
  settlement: { ids: string[]; reason: string; open: number; discoveredLater: boolean } | null;
  // Its bucket is archived — kept only for what was recorded against it
  // this month; never flagged as needing action.
  archived: boolean;
  // Done with: a Planned item marked closed, or any item of a bucket
  // closed for this month (FirestoreBucket.closedMonths). Leftover on a
  // closed item is money that can be reallocated right now.
  closed: boolean;
  transactionIds: string[];
  transferIds: string[];
  allocationIds: string[];
}

export interface CategoryGroup {
  categoryId: string;
  name: string;
  type: BudgetItemType;
  planned: number;
  available: number;
  actual: number; // linked + unplanned
  unplanned: number; // category-only spend with no bucket item
  remaining: number; // available - actual
  items: ItemMonth[];
}

export interface BucketGroup {
  bucketId: string;
  name: string;
  planned: number;
  available: number;
  actual: number;
  remaining: number;
  items: ItemMonth[];
  /** Closed for this month, with the household's note. */
  closed: { at: Date | null; note: string } | null;
  /** Archived — shown only for what was recorded against it. */
  archived: boolean;
}

export interface MonthBudget {
  month: string;
  items: ItemMonth[];
  itemsByKey: Map<string, ItemMonth>;
  categories: CategoryGroup[];
  buckets: BucketGroup[];
  plannedIncome: number;
  actualIncome: number;
  plannedOutflow: number; // Expense + Savings items, plus planned Transfer charges
  actualOutflow: number; // linked + unplanned Expense/Savings, plus actual transfer charges
  // "Left to budget": planned income not yet claimed by any outflow item,
  // adjusted by every allocation into or out of this month's pool. Negative
  // means the plan itself overspends income.
  pool: number;
  unplannedTotal: number;
  unfundedTotal: number;
}

export interface MonthBudgetInput {
  month: string;
  // Archived buckets may be passed too: their items then only appear in a
  // month where something was recorded against them (payments, moves), so
  // archiving never hides money that was actually spent or received.
  buckets: (Pick<FirestoreBucket, 'id' | 'name' | 'currency' | 'type' | 'kind' | 'closedMonths'> & { archived?: boolean })[];
  itemsByBucket: Record<string, BudgetItemLike[]>;
  // Every transaction dated in `month` AND every transaction linked to an
  // occurrence in `month` (bucketItem.month) — the two can differ for an
  // early/late payment. Duplicates are fine, they're de-duplicated by id.
  transactions: (Pick<FirestoreTransaction, 'id' | 'accountId' | 'amount' | 'direction' | 'type' | 'categoryId' | 'bucketItem'> & {
    month: string;
  })[];
  transfers: (Pick<FirestoreTransfer, 'id' | 'fromAccountId' | 'amount' | 'charges' | 'kind' | 'bucketItem'> & { month: string })[];
  allocations: FirestoreAllocation[];
  // This month's overspend settlements (FirestoreOverspendJustification);
  // reverted ones are ignored. Optional so older callers/tests still work.
  justifications?: FirestoreOverspendJustification[];
  accountCurrency: Map<string, string>;
  categories: Map<string, { name: string; transactionType: 'Expense' | 'Income' | 'Savings' }>;
  baseCurrency: string;
  toDisplay: (amount: number, currency: string) => number;
}

function itemType(
  bucketType: BudgetItemType,
  categoryId: string | null | undefined,
  categories: MonthBudgetInput['categories']
): BudgetItemType {
  if (bucketType === 'Transfer') return 'Transfer';
  const category = categoryId ? categories.get(categoryId) : undefined;
  return category?.transactionType ?? bucketType;
}

// "Progress" toward an item/category in its own direction: money out for
// Expense/Savings, money in for Income. A refund against an Expense
// category reduces spend rather than counting as income.
function progressOf(type: string, direction: 'Inflow' | 'Outflow', amount: number) {
  const signed = direction === 'Inflow' ? amount : -amount;
  return type === 'Income' ? signed : -signed;
}


export function buildMonthBudget(input: MonthBudgetInput): MonthBudget {
  const { month, categories, toDisplay, accountCurrency, baseCurrency } = input;
  const bucketById = new Map(input.buckets.map((bucket) => [bucket.id, bucket]));

  const items: ItemMonth[] = [];
  // The raw item behind each entry, for per-month notes (justifications).
  const rawItems = new Map<string, BudgetItemLike>();
  const itemsByKey = new Map<string, ItemMonth>();
  for (const [bucketId, bucketItems] of Object.entries(input.itemsByBucket)) {
    const bucket = bucketById.get(bucketId);
    if (!bucket) continue;
    const bucketType = (bucket.type ?? 'Expense') as BudgetItemType;
    const kind = bucket.kind === 'Fixed' ? 'Fixed' : 'Planned';
    for (const item of bucketItems) {
      const occurrence = itemOccurrence(item, month);
      if (!occurrence) continue;
      const type = itemType(bucketType, item.categoryId, categories);
      const planned = round2(toDisplay(occurrence.planned, bucket.currency));
      const entry: ItemMonth = {
        key: itemMonthKey(item.id, month),
        bucketId,
        bucketName: bucket.name,
        itemId: item.id,
        name: item.name,
        categoryId: item.categoryId ?? null,
        categoryName: (item.categoryId && categories.get(item.categoryId)?.name) || item.categoryId || 'Uncategorized',
        type,
        kind,
        month,
        planned,
        isOverride: occurrence.isOverride,
        allocatedIn: 0,
        allocatedOut: 0,
        available: 0,
        actual: 0,
        remaining: 0,
        status: 'on',
        unfunded: 0,
        justified: null,
        settlement: null,
        archived: Boolean(bucket.archived),
        closed: (kind === 'Planned' && item.completed) || Boolean(bucket.closedMonths?.[month]),
        transactionIds: [],
        transferIds: [],
        allocationIds: [],
      };
      items.push(entry);
      itemsByKey.set(entry.key, entry);
      rawItems.set(entry.key, item);
    }
  }

  // Pre-Budgets-v2 months: the recurring item an unlinked transaction paid.
  function recurringMatch(t: MonthBudgetInput['transactions'][number], amount: number): ItemMonth | undefined {
    if (!t.categoryId) return undefined;
    const type = t.type === 'Income' ? 'Income' : t.type === 'Savings' ? 'Savings' : 'Expense';
    let best: ItemMonth | undefined;
    for (const entry of items) {
      if (entry.kind !== 'Fixed' || entry.archived || entry.categoryId !== t.categoryId || entry.type !== type) continue;
      if (!best || Math.abs(entry.planned - amount) < Math.abs(best.planned - amount)) best = entry;
    }
    return best;
  }

  // Linked spend, plus category-only (unplanned) spend by category.
  const legacyLinks = buildLegacyLinks(input.itemsByBucket);
  const unplannedByCategory = new Map<string, number>();
  let unplannedIncome = 0;
  let unplannedOutflow = 0;
  const seenTransactions = new Set<string>();
  for (const t of input.transactions) {
    if (seenTransactions.has(t.id)) continue;
    seenTransactions.add(t.id);
    const amount = toDisplay(progressOf(t.type, t.direction, t.amount), accountCurrency.get(t.accountId) ?? baseCurrency);
    const link = resolveLink(t, legacyLinks);
    let linkedEntry = link && link.month === month ? itemsByKey.get(itemMonthKey(link.itemId, month)) : undefined;
    if (!link && t.month === month && month < BUDGETS_V2_START) linkedEntry = recurringMatch(t, amount);
    if (linkedEntry) {
      linkedEntry.actual += amount;
      linkedEntry.transactionIds.push(t.id);
      continue;
    }
    // Only this month's own transactions can be unplanned spend here. One
    // linked to another month's occurrence (an early/late payment) counts
    // there instead. One linked to an occurrence in this month that no
    // longer exists (the item was skipped or deleted after paying) is still
    // real spend, so it falls through to unplanned rather than vanishing.
    if (t.month !== month || !t.categoryId) continue;
    if (link && link.month !== month) continue;
    unplannedByCategory.set(t.categoryId, (unplannedByCategory.get(t.categoryId) ?? 0) + amount);
    if (t.type === 'Income') unplannedIncome += amount;
    else unplannedOutflow += amount;
  }

  let actualTransferCharges = 0;
  const seenTransfers = new Set<string>();
  for (const t of input.transfers) {
    if (seenTransfers.has(t.id)) continue;
    seenTransfers.add(t.id);
    const currency = accountCurrency.get(t.fromAccountId) ?? baseCurrency;
    if (t.month === month && t.charges) actualTransferCharges += toDisplay(t.charges, currency);
    const link = resolveLink(t, legacyLinks);
    if (!link || link.month !== month) continue;
    const entry = itemsByKey.get(itemMonthKey(link.itemId, month));
    if (!entry) continue;
    entry.actual += toDisplay(t.amount, currency);
    entry.transferIds.push(t.id);
  }

  // Allocations. Pool endpoints only count toward the allocation's own month.
  let poolDelta = 0;
  for (const allocation of input.allocations) {
    // Undone moves stay stored (the audit trail) but no longer count.
    if (allocation.revertedAt) continue;
    const amount = toDisplay(allocation.amount, allocation.currency);
    if (allocation.from.kind === 'item') {
      const entry = itemsByKey.get(itemMonthKey(allocation.from.itemId, allocation.from.month));
      if (entry) {
        entry.allocatedOut += amount;
        entry.allocationIds.push(allocation.id);
      }
    }
    if (allocation.to.kind === 'item') {
      const entry = itemsByKey.get(itemMonthKey(allocation.to.itemId, allocation.to.month));
      if (entry) {
        entry.allocatedIn += amount;
        if (!entry.allocationIds.includes(allocation.id)) entry.allocationIds.push(allocation.id);
      }
    }
    if (allocation.month === month) {
      if (allocation.from.kind === 'pool') poolDelta -= amount;
      if (allocation.to.kind === 'pool') poolDelta += amount;
    }
  }

  // An archived bucket's items stay only where something was recorded.
  for (let i = items.length - 1; i >= 0; i--) {
    const entry = items[i];
    if (!entry.archived) continue;
    if (entry.transactionIds.length || entry.transferIds.length || entry.allocationIds.length) continue;
    items.splice(i, 1);
    itemsByKey.delete(entry.key);
  }

  // Settlements: the part of an overspend paid for outside the plan
  // (savings, a loan, extra income, ...) is explained; a "not covered yet"
  // part stays open.
  const settled = new Map<string, { ids: string[]; reason: string; note: string; explained: number; open: number; later: boolean }>();
  for (const j of input.justifications ?? []) {
    if (j.status === 'reverted' || j.month !== month) continue;
    for (const share of j.items) {
      const key = itemMonthKey(share.itemId, month);
      if (!itemsByKey.has(key)) continue;
      const current = settled.get(key) ?? { ids: [], reason: j.reason, note: j.note, explained: 0, open: 0, later: false };
      current.ids.push(j.id);
      current.reason = j.reason; // the latest settlement's reason wins
      current.note = j.note || current.note;
      current.explained += toDisplay(share.external, j.currency);
      current.open += toDisplay(share.uncovered, j.currency);
      current.later ||= j.awareness === 'discovered_later';
      settled.set(key, current);
    }
  }

  for (const entry of items) {
    entry.allocatedIn = round2(entry.allocatedIn);
    entry.allocatedOut = round2(entry.allocatedOut);
    entry.actual = round2(entry.actual);
    entry.available = round2(entry.planned + entry.allocatedIn - entry.allocatedOut);
    entry.remaining = round2(entry.available - entry.actual);
    // Income runs the other way: receiving more than planned is good, not
    // an overspend, and there's nothing to "fund".
    if (entry.type === 'Income') {
      entry.status = entry.actual > entry.available ? 'over' : entry.actual === entry.available ? 'on' : 'under';
    } else {
      entry.status = entry.remaining > 0 ? 'under' : entry.remaining === 0 ? 'on' : 'over';
    }
  }

  // A bucket is over only when its spending items TOGETHER spent more than
  // planned: leftover on one item covers another's overspend. The net
  // overspend is shared among the items that went over.
  const spendingByBucket = new Map<string, ItemMonth[]>();
  for (const entry of items) {
    if (entry.type === 'Income' || entry.archived) continue;
    spendingByBucket.set(entry.bucketId, [...(spendingByBucket.get(entry.bucketId) ?? []), entry]);
  }
  for (const list of spendingByBucket.values()) {
    const net = round2(-list.reduce((total, entry) => total + entry.remaining, 0));
    const overs = list.filter((entry) => entry.remaining < 0);
    const totalOver = overs.reduce((total, entry) => total - entry.remaining, 0);
    if (net <= 0 || totalOver <= 0) continue;
    let assigned = 0;
    overs.forEach((entry, index) => {
      const share = index === overs.length - 1 ? round2(net - assigned) : round2((-entry.remaining / totalOver) * net);
      entry.unfunded = share;
      assigned = round2(assigned + share);
    });
  }

  for (const entry of items) {
    if (entry.type === 'Income') continue;
    // Legacy per-item justification (monthJustifications) plus any
    // settlement's explained part — together, never more than unfunded.
    const note = rawItems.get(entry.key)?.monthJustifications?.[month];
    const settlement = settled.get(entry.key);
    const explained = (note ? input.toDisplay(note.amount, note.currency) : 0) + (settlement?.explained ?? 0);
    entry.justified =
      (note || settlement) && entry.unfunded > 0
        ? {
            reason: settlement?.reason ?? note!.reason,
            note: settlement?.note || note?.note || '',
            amount: round2(Math.min(entry.unfunded, explained)),
          }
        : null;
    entry.settlement = settlement
      ? { ids: settlement.ids, reason: settlement.reason, open: round2(settlement.open), discoveredLater: settlement.later }
      : null;
  }

  // Category lens — read-only groups over the items, plus unplanned spend.
  const categoryGroups = new Map<string, CategoryGroup>();
  function groupFor(categoryId: string, name: string, type: BudgetItemType) {
    let group = categoryGroups.get(categoryId);
    if (!group) {
      group = { categoryId, name, type, planned: 0, available: 0, actual: 0, unplanned: 0, remaining: 0, items: [] };
      categoryGroups.set(categoryId, group);
    }
    return group;
  }
  for (const entry of items) {
    const group = groupFor(entry.categoryId ?? 'uncategorized', entry.categoryName, entry.type);
    group.items.push(entry);
    group.planned += entry.planned;
    group.available += entry.available;
    group.actual += entry.actual;
  }
  for (const [categoryId, amount] of unplannedByCategory) {
    const category = categories.get(categoryId);
    const group = groupFor(categoryId, category?.name ?? categoryId, category?.transactionType ?? 'Expense');
    group.unplanned += amount;
    group.actual += amount;
  }
  const categoryList = [...categoryGroups.values()]
    .map((group) => ({
      ...group,
      planned: round2(group.planned),
      available: round2(group.available),
      actual: round2(group.actual),
      unplanned: round2(group.unplanned),
      remaining: round2(group.available - group.actual),
    }))
    .sort((a, b) => b.available - a.available || b.actual - a.actual);

  const bucketGroups = new Map<string, BucketGroup>();
  for (const entry of items) {
    let group = bucketGroups.get(entry.bucketId);
    if (!group) {
      const closed = bucketById.get(entry.bucketId)?.closedMonths?.[month];
      group = {
        bucketId: entry.bucketId,
        name: entry.bucketName,
        planned: 0,
        available: 0,
        actual: 0,
        remaining: 0,
        items: [],
        closed: closed ? { at: closed.at?.toDate() ?? null, note: closed.note ?? '' } : null,
        archived: entry.archived,
      };
      bucketGroups.set(entry.bucketId, group);
    }
    group.items.push(entry);
    group.planned += entry.planned;
    group.available += entry.available;
    group.actual += entry.actual;
  }
  const bucketList = [...bucketGroups.values()].map((group) => ({
    ...group,
    planned: round2(group.planned),
    available: round2(group.available),
    actual: round2(group.actual),
    remaining: round2(group.available - group.actual),
  }));

  const sum = (list: ItemMonth[], pick: (entry: ItemMonth) => number) => list.reduce((total, entry) => total + pick(entry), 0);
  const incomeItems = items.filter((entry) => entry.type === 'Income');
  const outflowItems = items.filter((entry) => entry.type === 'Expense' || entry.type === 'Savings');
  const transferItems = items.filter((entry) => entry.type === 'Transfer');
  // A Transfer item's own `amount` is money moved between the household's
  // own accounts, not spend — only what the move costs (charges) is an
  // outflow, same reasoning the old Budget screen's dedicatedByCategory used.
  const plannedTransferCharges = transferItems.reduce((total, entry) => {
    const bucket = bucketById.get(entry.bucketId);
    const item = input.itemsByBucket[entry.bucketId]?.find((candidate) => candidate.id === entry.itemId);
    return total + (bucket && item?.charges ? toDisplay(item.charges, bucket.currency) : 0);
  }, 0);

  const plannedIncome = round2(sum(incomeItems, (entry) => entry.planned));
  const plannedOutflow = round2(sum(outflowItems, (entry) => entry.planned) + plannedTransferCharges);

  return {
    month,
    items,
    itemsByKey,
    categories: categoryList,
    buckets: bucketList,
    plannedIncome,
    actualIncome: round2(sum(incomeItems, (entry) => entry.actual) + unplannedIncome),
    plannedOutflow,
    actualOutflow: round2(sum(outflowItems, (entry) => entry.actual) + unplannedOutflow + actualTransferCharges),
    pool: round2(plannedIncome - plannedOutflow + poolDelta),
    unplannedTotal: round2(unplannedOutflow),
    unfundedTotal: round2(sum(items, (entry) => entry.unfunded)),
  };
}
