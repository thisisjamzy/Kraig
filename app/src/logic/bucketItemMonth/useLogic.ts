'use client';

// PRD-BUDGETS-V2.md section 6.2 — one occurrence of one bucket item in one
// month: what was planned, what moved in/out (the funding trail), what was
// spent (the payments), and the actions that move budget around it —
// reallocate a leftover, cover an overspend (four sources), skip the month,
// or change just this month's amount.
//
// Every figure comes from the same MonthBudget the Budget screen rendered
// (src/shared/budget/monthBudget.ts), so the "available in this source"
// limits below are exactly what the household just saw.

import { useMemo, useState } from 'react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useAccounts, useCurrencyContext } from '@/src/shared/firestore/queries';
import { convert, round2, toDisplay } from '@/src/shared/firestore/currency';
import {
  createAllocation,
  deleteAllocation,
  setItemMonthOverride,
  skipItemMonth,
} from '@/src/shared/firestore/bucketBudget';
import { addMonths, itemOccurrence, itemMonthKey, monthLabel, type ItemMonth, type MonthBudget } from '@/src/shared/budget/monthBudget';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import type {
  AllocationEndpoint,
  AllocationReason,
  FirestoreAllocation,
  FirestoreBucket,
  FirestoreBucketLineItem,
  FirestoreTransaction,
  FirestoreTransfer,
} from '@/src/shared/firestore/types';

export type SheetMode = 'view' | 'reallocate' | 'cover' | 'override';

export interface MoveOption {
  id: string;
  label: string;
  available: number | null; // null = no limit (a destination)
  endpoint: AllocationEndpoint;
  reason: AllocationReason;
  isSavings: boolean;
}

export interface SheetInput {
  entry: ItemMonth;
  month: string;
  budget: MonthBudget;
  buckets: FirestoreBucket[];
  itemsByBucket: Record<string, FirestoreBucketLineItem[]>;
  allocations: FirestoreAllocation[];
  transactionsById: Map<string, FirestoreTransaction>;
  transfersById: Map<string, FirestoreTransfer>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

// Floating-point slack for "is this within what's available".
const EPSILON = 0.005;

export function useLogic({ entry, month, budget, buckets, itemsByBucket, allocations, transactionsById, transfersById }: SheetInput) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx } = useCurrencyContext();
  const { data: accounts } = useAccounts();
  const [mode, setMode] = useState<SheetMode>('view');
  const [optionId, setOptionId] = useState('');
  const [amountString, setAmountString] = useState('');
  const [note, setNote] = useState('');
  const [landsInAccountId, setLandsInAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);

  const bucket = buckets.find((candidate) => candidate.id === entry.bucketId);
  const rawItem = itemsByBucket[entry.bucketId]?.find((candidate) => candidate.id === entry.itemId);
  const nextMonth = addMonths(month, 1);
  const nextOccurrence = rawItem ? itemOccurrence(rawItem, nextMonth) : null;
  const accountName = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);

  function itemName(bucketId: string, itemId: string) {
    return itemsByBucket[bucketId]?.find((candidate) => candidate.id === itemId)?.name ?? 'Deleted item';
  }

  function endpointLabel(endpoint: AllocationEndpoint, allocationMonth: string) {
    if (endpoint.kind === 'pool') return `Unallocated income · ${monthLabel(allocationMonth)}`;
    if (endpoint.kind === 'savings') return `Savings · ${accountName.get(endpoint.accountId) ?? 'account'}`;
    const name = itemName(endpoint.bucketId, endpoint.itemId);
    return endpoint.month === month ? name : `${name} · ${monthLabel(endpoint.month)}`;
  }

  // Funding trail — every allocation touching this item-month, signed from
  // this item's point of view, with the other side named so a move can be
  // traced from either end.
  const fundingTrail = useMemo(() => {
    const own = itemMonthKey(entry.itemId, month);
    return allocations
      .filter((allocation) => entry.allocationIds.includes(allocation.id))
      .map((allocation) => {
        const incoming = allocation.to.kind === 'item' && itemMonthKey(allocation.to.itemId, allocation.to.month) === own;
        const counterpart = incoming ? allocation.from : allocation.to;
        return {
          id: allocation.id,
          incoming,
          amount: toDisplay(ctx, allocation.amount, allocation.currency),
          counterpart: endpointLabel(counterpart, allocation.month),
          reason: allocation.reason,
          note: allocation.note,
          hasTransfer: Boolean(allocation.transferId),
          date: allocation.createdAt?.toDate() ?? null,
        };
      })
      .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocations, entry, month, ctx, accountName, itemsByBucket]);

  const payments = useMemo(() => {
    const rows = [
      ...entry.transactionIds.flatMap((id) => {
        const t = transactionsById.get(id);
        if (!t) return [];
        const currency = accounts.find((account) => account.id === t.accountId)?.currency ?? ctx.base;
        return [{
          id,
          date: t.date.toDate(),
          description: t.description,
          account: accountName.get(t.accountId) ?? '',
          amount: toDisplay(ctx, t.amount, currency),
          earlyOrLate: t.month !== undefined && t.month !== month,
          href: `/edit-transaction/${id}`,
        }];
      }),
      ...entry.transferIds.flatMap((id) => {
        const t = transfersById.get(id);
        if (!t) return [];
        const currency = accounts.find((account) => account.id === t.fromAccountId)?.currency ?? ctx.base;
        return [{
          id,
          date: t.date.toDate(),
          description: t.description,
          account: `${accountName.get(t.fromAccountId) ?? ''} → ${accountName.get(t.toAccountId) ?? ''}`,
          amount: toDisplay(ctx, t.amount, currency),
          earlyOrLate: false,
          href: `/edit-transfer/${id}`,
        }];
      }),
    ];
    return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [entry, transactionsById, transfersById, accounts, accountName, ctx, month]);

  const selfEndpoint: AllocationEndpoint = { kind: 'item', bucketId: entry.bucketId, itemId: entry.itemId, month };

  // Where an overspend can be funded from — PRD-BUDGETS-V2.md section 4.4's
  // four sources, each capped at what it actually has.
  const coverSources = useMemo<MoveOption[]>(() => {
    const options: MoveOption[] = [];
    for (const other of budget.items) {
      if (other.key === entry.key || other.type === 'Income' || other.remaining <= 0) continue;
      options.push({
        id: `item:${other.key}`,
        label: `${other.name} (${other.bucketName})`,
        available: other.remaining,
        endpoint: { kind: 'item', bucketId: other.bucketId, itemId: other.itemId, month },
        reason: 'cover_overspend',
        isSavings: false,
      });
    }
    if (budget.pool > 0) {
      options.push({ id: 'pool', label: 'Unallocated income', available: budget.pool, endpoint: { kind: 'pool' }, reason: 'cover_overspend', isSavings: false });
    }
    for (const account of accounts.filter(isSavingsAccount)) {
      const free = account.currentBalance - (account.lockedAmount ?? 0);
      if (free <= 0) continue;
      options.push({
        id: `savings:${account.id}`,
        label: `Savings · ${account.name}`,
        available: toDisplay(ctx, free, account.currency),
        endpoint: { kind: 'savings', accountId: account.id },
        reason: 'cover_overspend',
        isSavings: true,
      });
    }
    if (nextOccurrence && bucket) {
      options.push({
        id: 'next',
        label: `${entry.name} · ${monthLabel(nextMonth)}`,
        available: toDisplay(ctx, nextOccurrence.planned, bucket.currency),
        endpoint: { kind: 'item', bucketId: entry.bucketId, itemId: entry.itemId, month: nextMonth },
        reason: 'borrow_next_month',
        isSavings: false,
      });
    }
    return options;
  }, [budget, entry, month, accounts, ctx, nextOccurrence, nextMonth, bucket]);

  // Where a leftover can go.
  const reallocateTargets = useMemo<MoveOption[]>(() => {
    // Overspent items first — that's usually where a leftover should go.
    const options: MoveOption[] = budget.items
      .filter((other) => other.key !== entry.key && other.type !== 'Income')
      .sort((a, b) => b.unfunded - a.unfunded)
      .map((other) => ({
        id: `item:${other.key}`,
        label:
          other.unfunded > 0
            ? `${other.name} — over by ${formatNumber(other.unfunded)}`
            : `${other.name} (${other.bucketName})`,
        available: null,
        endpoint: { kind: 'item', bucketId: other.bucketId, itemId: other.itemId, month },
        reason: 'reallocate_leftover',
        isSavings: false,
      }));
    options.push({ id: 'pool', label: 'Unallocated income', available: null, endpoint: { kind: 'pool' }, reason: 'return_to_pool', isSavings: false });
    if (nextOccurrence) {
      options.push({
        id: 'next',
        label: `${entry.name} · ${monthLabel(nextMonth)} (roll over)`,
        available: null,
        endpoint: { kind: 'item', bucketId: entry.bucketId, itemId: entry.itemId, month: nextMonth },
        reason: 'reallocate_leftover',
        isSavings: false,
      });
    }
    return options;
  }, [budget, entry, month, nextOccurrence, nextMonth]);

  const options = mode === 'cover' ? coverSources : reallocateTargets;
  const selected = options.find((option) => option.id === optionId) ?? null;
  // What this item itself can give (reallocate) or needs (cover).
  const selfLimit = mode === 'reallocate' ? Math.max(0, entry.remaining) : entry.unfunded;

  function start(nextMode: SheetMode) {
    setError(null);
    setNote('');
    setMode(nextMode);
    if (nextMode === 'override') {
      setAmountString(String(entry.planned));
      return;
    }
    const list = nextMode === 'cover' ? coverSources : reallocateTargets;
    const first = list[0];
    setOptionId(first?.id ?? '');
    const limit = nextMode === 'reallocate' ? Math.max(0, entry.remaining) : entry.unfunded;
    setAmountString(String(round2(first?.available != null ? Math.min(limit, first.available) : limit)));
    // A savings withdrawal lands in the wallet that paid — the latest
    // payment's, else the item's own earmarked wallet.
    const lastPayment = entry.transactionIds.map((id) => transactionsById.get(id)).filter(Boolean).at(-1);
    setLandsInAccountId(lastPayment?.accountId ?? rawItem?.accountId ?? accounts.find((account) => !isSavingsAccount(account))?.id ?? '');
  }

  function chooseOption(id: string) {
    setOptionId(id);
    const option = options.find((candidate) => candidate.id === id);
    if (option?.available != null) setAmountString(String(round2(Math.min(selfLimit, option.available))));
  }

  async function confirmMove() {
    if (!uid || !selected) return;
    const amount = Number(amountString);
    if (!(amount > 0)) return setError('Enter an amount greater than zero.');
    if (mode === 'reallocate' && amount > selfLimit + EPSILON) return setError(`Only ${formatNumber(selfLimit)} is left on this item.`);
    if (selected.available != null && amount > selected.available + EPSILON) return setError('That is more than the source has available.');
    setBusy(true);
    setError(null);
    try {
      await createAllocation(
        uid,
        {
          month,
          from: mode === 'cover' ? selected.endpoint : selfEndpoint,
          to: mode === 'cover' ? selfEndpoint : selected.endpoint,
          amount,
          currency: ctx.display,
          reason: selected.reason,
          note: note.trim(),
          savingsToAccountId: selected.isSavings ? landsInAccountId : undefined,
        },
        ctx
      );
      setMode('view');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move that money.');
    } finally {
      setBusy(false);
    }
  }

  async function undo(allocationId: string) {
    if (!uid) return;
    setBusy(true);
    try {
      await deleteAllocation(uid, allocationId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not undo that move.');
    } finally {
      setBusy(false);
      setConfirmUndoId(null);
    }
  }

  const hasPayments = entry.transactionIds.length + entry.transferIds.length > 0;

  async function skip(onDone: () => void) {
    if (!uid || hasPayments) return;
    setBusy(true);
    try {
      await skipItemMonth(uid, entry.bucketId, entry.itemId, month);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  // The override is stored in the bucket's own currency, same as the
  // item's `amount` — the household typed it in display currency.
  async function saveOverride(amount: number | null) {
    if (!uid || !bucket) return;
    if (amount !== null && !(amount >= 0)) return setError('Enter an amount of zero or more.');
    setBusy(true);
    try {
      const native = amount === null ? null : round2(convert(amount, ctx.display, bucket.currency, ctx.rates));
      await setItemMonthOverride(uid, entry.bucketId, entry.itemId, month, native);
      setMode('view');
    } finally {
      setBusy(false);
    }
  }

  return {
    currency: ctx.display,
    mode,
    setMode,
    start,
    options,
    optionId,
    chooseOption,
    selected,
    amountString,
    setAmountString,
    note,
    setNote,
    landsInAccountId,
    setLandsInAccountId,
    spendingAccounts: accounts.filter((account) => !isSavingsAccount(account)),
    busy,
    error,
    fundingTrail,
    payments,
    hasPayments,
    confirmMove,
    // The most this move can be: what this item can give (reallocate) or
    // needs (cover), capped by what the chosen source has.
    maxAmount: round2(selected?.available != null ? Math.min(selfLimit, selected.available) : selfLimit),
    confirmUndoId,
    setConfirmUndoId,
    undo,
    skip,
    saveOverride,
    canReallocate: entry.type !== 'Income' && entry.remaining > 0,
    canCover: entry.unfunded > 0 && coverSources.length > 0,
    recordPaymentHref: `/add-transaction?bucketItem=${encodeURIComponent(`${entry.bucketId}:${entry.itemId}:${month}`)}`,
  };
}
