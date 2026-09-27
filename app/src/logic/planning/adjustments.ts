// Budget adjustments as a timeline — shared by bucket details' "Adjustments"
// section and the History tab's "Budget move" rows (adjustmentRows below). An entry is either one
// overspend settlement (its moves, how the rest was paid for, and why) or
// one plain move (a reallocated leftover, or a settlement's move seen from
// the bucket that gave the money). Reverted ones stay, marked reverted.

import { round2, toDisplay, type CurrencyContext } from '@/src/shared/firestore/currency';
import type {
  AllocationEndpoint,
  FirestoreAccount,
  FirestoreAllocation,
  FirestoreBucketLineItem,
  FirestoreOverspendJustification,
} from '@/src/shared/firestore/types';
import { avoidabilityLabel, externalSourceLabel, reasonLabel } from '@/src/viewmodels/planning';
import type { HistoryRow } from './rows';

export interface AdjustmentMove {
  from: string;
  to: string;
  amount: number;
}

export interface AdjustmentEntry {
  id: string;
  kind: 'settlement' | 'move';
  date: Date | null;
  title: string;
  amount: number;
  moves: AdjustmentMove[];
  external: { label: string; amount: number }[];
  open: number;
  reason: string | null;
  discoveredLater: boolean;
  noticedOn: Date | null;
  avoidability: string | null;
  note: string;
  reverted: boolean;
  /** The settlement behind this entry (to edit or undo it), if any. */
  justification: FirestoreOverspendJustification | null;
  /** A plain move's own allocation. */
  allocationId: string | null;
  /** Every bucket it touches — for filtering the History tab by bucket. */
  bucketIds: string[];
}

export interface AdjustmentLookups {
  itemsByBucket: Record<string, (FirestoreBucketLineItem & { id: string })[]>;
  accounts: FirestoreAccount[];
  ctx: CurrencyContext;
}

function endpointBucket(endpoint: AllocationEndpoint): string | null {
  return endpoint.kind === 'item' ? endpoint.bucketId : null;
}

export function endpointName(endpoint: AllocationEndpoint, lookups: AdjustmentLookups): string {
  if (endpoint.kind === 'pool') return 'Left to budget';
  if (endpoint.kind === 'savings') return `Savings · ${lookups.accounts.find((a) => a.id === endpoint.accountId)?.name ?? 'account'}`;
  return lookups.itemsByBucket[endpoint.bucketId]?.find((i) => i.id === endpoint.itemId)?.name ?? 'an item';
}

function moveOf(allocation: FirestoreAllocation, lookups: AdjustmentLookups): AdjustmentMove {
  return {
    from: endpointName(allocation.from, lookups),
    to: endpointName(allocation.to, lookups),
    amount: round2(toDisplay(lookups.ctx, allocation.amount, allocation.currency)),
  };
}

/**
 * Every adjustment in `allocations`/`justifications` — all of them, or
 * only those touching `bucketId` — newest first.
 */
export function buildAdjustments(
  allocations: FirestoreAllocation[],
  justifications: FirestoreOverspendJustification[],
  lookups: AdjustmentLookups,
  bucketId: string | null = null
): AdjustmentEntry[] {
  const byId = new Map(allocations.map((a) => [a.id, a]));
  const settlementById = new Map(justifications.map((j) => [j.id, j]));
  const entries: AdjustmentEntry[] = [];
  const shownAsSettlement = new Set<string>();

  for (const j of justifications) {
    if (bucketId && j.bucketId !== bucketId) continue;
    const own = j.adjustmentIds.map((id) => byId.get(id)).filter((a): a is FirestoreAllocation => Boolean(a));
    own.forEach((a) => shownAsSettlement.add(a.id));
    const touched = new Set([j.bucketId, ...own.flatMap((a) => [endpointBucket(a.from), endpointBucket(a.to)]).filter((b): b is string => Boolean(b))]);
    const itemName = j.itemId ? (lookups.itemsByBucket[j.bucketId]?.find((i) => i.id === j.itemId)?.name ?? null) : null;
    entries.push({
      id: `settlement:${j.id}`,
      kind: 'settlement',
      date: j.createdAt?.toDate() ?? null,
      title: `Overspend settled${itemName ? ` · ${itemName}` : ''}`,
      amount: round2(toDisplay(lookups.ctx, j.overspendAmount, j.currency)),
      moves: own.map((a) => moveOf(a, lookups)),
      external: j.externalSources
        .filter((e) => e.source !== 'not_covered')
        .map((e) => ({ label: externalSourceLabel(e.source), amount: round2(toDisplay(lookups.ctx, e.amount, j.currency)) })),
      open: round2(toDisplay(lookups.ctx, j.uncoveredAmount, j.currency)),
      reason: reasonLabel(j.reason),
      discoveredLater: j.awareness === 'discovered_later',
      noticedOn: j.noticedOn?.toDate() ?? null,
      avoidability: avoidabilityLabel(j.avoidability),
      note: j.note,
      reverted: j.status === 'reverted',
      justification: j,
      allocationId: null,
      bucketIds: [...touched],
    });
  }

  for (const a of allocations) {
    if (shownAsSettlement.has(a.id)) continue;
    const buckets = [endpointBucket(a.from), endpointBucket(a.to)].filter((b): b is string => Boolean(b));
    if (bucketId && !buckets.includes(bucketId)) continue;
    const j = a.justificationId ? (settlementById.get(a.justificationId) ?? null) : null;
    const move = moveOf(a, lookups);
    entries.push({
      id: `move:${a.id}`,
      kind: 'move',
      date: a.createdAt?.toDate() ?? null,
      title: `${move.from} → ${move.to}`,
      amount: move.amount,
      moves: [move],
      external: [],
      open: 0,
      reason: j ? reasonLabel(j.reason) : a.reason === 'reallocate_leftover' ? 'Leftover' : null,
      discoveredLater: j?.awareness === 'discovered_later',
      noticedOn: j?.noticedOn?.toDate() ?? null,
      avoidability: j ? avoidabilityLabel(j.avoidability) : null,
      note: a.note,
      reverted: Boolean(a.revertedAt),
      justification: j,
      allocationId: a.id,
      bucketIds: buckets,
    });
  }

  return entries.sort((x, y) => (y.date?.getTime() ?? Infinity) - (x.date?.getTime() ?? Infinity));
}

/** History-tab rows ("Budget move") — never counted as money in or out. */
export function adjustmentRows(entries: AdjustmentEntry[], month: string, bucketName: Map<string, string>): HistoryRow[] {
  return entries
    .filter((e) => e.date)
    .map((e) => {
      const bucketId = e.justification?.bucketId ?? e.bucketIds[e.bucketIds.length - 1] ?? null;
      return {
        id: e.id,
        kind: 'adjustment' as const,
        type: 'Adjustment' as const,
        flow: 'adjust' as const,
        name: 'Budget move',
        note: `${e.title}${e.reverted ? ' (reverted)' : ''}`,
        method: [e.reason, e.discoveredLater ? 'discovered later' : null].filter(Boolean).join(' · '),
        amount: e.amount,
        date: e.date!,
        bucketId,
        bucketName: bucketId ? (bucketName.get(bucketId) ?? null) : null,
        assignable: false,
        categoryId: null,
        accountIds: [],
        href: bucketId ? `/budget/bucket/${bucketId}?month=${month}` : `/budget?month=${month}`,
      };
    });
}
