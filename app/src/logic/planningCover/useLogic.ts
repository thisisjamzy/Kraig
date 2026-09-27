'use client';

// Cover or justify an overspend (Planning) — a full page for a bucket's
// overspent items (or one item): cover it from buckets with money left,
// unallocated income, savings or next month's plan, and/or justify
// whatever isn't covered with a reason. Covers are allocations
// (FirestoreAllocation), one per source item → overspent item pair;
// a justification is stored on the item for the month.

import { useMemo, useState } from 'react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { createAllocation, justifyItemMonth } from '@/src/shared/firestore/bucketBudget';
import { toDisplay } from '@/src/shared/firestore/currency';
import { addMonths, itemOccurrence } from '@/src/shared/budget/monthBudget';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { JUSTIFY_REASONS, monthOf, pairUp, takeFrom, uncovered, unexplained, type Need } from '@/src/viewmodels/planning';
import type { AllocationEndpoint, JustificationReason } from '@/src/shared/firestore/types';

export interface CoverSource {
  id: string;
  label: string;
  sub: string;
  available: number;
  kind: 'bucket' | 'pool' | 'savings' | 'next';
  /** Bucket sources: its items with money left, most first. */
  pots: Need[];
}

function paramsFromSearch() {
  if (typeof window === 'undefined') return { month: monthOf(new Date()), bucket: '', item: null as string | null };
  const q = new URLSearchParams(window.location.search);
  const month = q.get('month');
  return {
    month: month && /^\d{4}-\d{2}$/.test(month) ? month : monthOf(new Date()),
    bucket: q.get('bucket') ?? '',
    item: q.get('item'),
  };
}

const EPS = 0.005;

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [{ month, bucket: bucketId, item: itemId }] = useState(paramsFromSearch);
  const data = useMonthBudget(month);
  const { budget, buckets, itemsByBucket, accounts, ctx } = data;

  const group = budget.buckets.find((g) => g.bucketId === bucketId) ?? null;
  const targets = (group?.items ?? []).filter((i) => (!itemId || i.itemId === itemId) && unexplained(i) > 0);
  const needs: Need[] = targets.map((i) => ({ key: i.key, amount: unexplained(i) }));
  const need = Math.round(needs.reduce((s, n) => s + n.amount, 0) * 100) / 100;
  const targetKeys = new Set(targets.map((t) => t.key));

  const sources = useMemo<CoverSource[]>(() => {
    const out: CoverSource[] = [];
    for (const g of budget.buckets) {
      const pots = g.items
        .filter((i) => i.type !== 'Income' && i.remaining > 0 && !targetKeys.has(i.key))
        .sort((a, b) => b.remaining - a.remaining)
        .map((i) => ({ key: i.key, amount: i.remaining }));
      const available = Math.round(pots.reduce((s, p) => s + p.amount, 0) * 100) / 100;
      if (available <= 0) continue;
      out.push({
        id: `bucket:${g.bucketId}`,
        label: g.bucketId === bucketId ? `${g.name} (other items)` : g.name,
        sub: `${pots.length} ${pots.length === 1 ? 'item' : 'items'} with money left`,
        available,
        kind: 'bucket',
        pots,
      });
    }
    if (budget.pool > 0) {
      out.push({ id: 'pool', label: 'Unallocated income', sub: 'Income no bucket has claimed', available: budget.pool, kind: 'pool', pots: [] });
    }
    for (const a of accounts.filter(isSavingsAccount)) {
      const free = a.currentBalance - (a.lockedAmount ?? 0);
      if (free <= 0) continue;
      out.push({
        id: `savings:${a.id}`,
        label: `Savings · ${a.name}`,
        sub: 'A real withdrawal into the wallet that paid',
        available: Math.round(toDisplay(ctx, free, a.currency) * 100) / 100,
        kind: 'savings',
        pots: [],
      });
    }
    // Borrowing from next month works for one item at a time.
    if (targets.length === 1) {
      const t = targets[0];
      const raw = itemsByBucket[t.bucketId]?.find((i) => i.id === t.itemId);
      const bucket = buckets.find((b) => b.id === t.bucketId);
      const next = raw ? itemOccurrence(raw, addMonths(month, 1)) : null;
      if (next && bucket && next.planned > 0) {
        out.push({
          id: 'next',
          label: `Next month's ${t.name}`,
          sub: 'Borrow from next month’s plan',
          available: Math.round(toDisplay(ctx, next.planned, bucket.currency) * 100) / 100,
          kind: 'next',
          pots: [],
        });
      }
    }
    return out.sort((a, b) => (a.kind === 'bucket' ? 0 : 1) - (b.kind === 'bucket' ? 0 : 1) || b.available - a.available);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget, accounts, ctx, month, bucketId, itemsByBucket, buckets, targets.length]);

  // ---- The user's choices ----
  const [coverOn, setCoverOn] = useState(true);
  const [justifyOn, setJustifyOn] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<JustificationReason | null>(null);
  const [note, setNote] = useState('');
  const [landsIn, setLandsIn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountOf = (id: string) => {
    const n = Number(amounts[id] ?? '');
    return coverOn && Number.isFinite(n) && n > 0 ? n : 0;
  };
  const covered = Math.round(sources.reduce((s, src) => s + amountOf(src.id), 0) * 100) / 100;
  const left = Math.max(0, Math.round((need - covered) * 100) / 100);
  const overLimit = sources.find((s) => amountOf(s.id) > s.available + EPS) ?? null;
  const usesSavings = sources.some((s) => s.kind === 'savings' && amountOf(s.id) > 0);
  const spending = accounts.filter((a) => !isSavingsAccount(a));
  const landsInId = landsIn || spending[0]?.id || '';

  /** Fill a source with what's still needed (up to what it has). */
  function fill(id: string) {
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    const others = covered - amountOf(id);
    const value = Math.max(0, Math.min(src.available, need - others));
    setAmounts((a) => ({ ...a, [id]: value ? String(Math.round(value * 100) / 100) : '' }));
  }

  let problem: string | null = null;
  if (overLimit) problem = `${overLimit.label} only has ${overLimit.available.toLocaleString('en-US')} available.`;
  else if (covered > need + EPS) problem = 'That covers more than the overspend.';
  else if (justifyOn && left > 0 && !reason) problem = 'Pick a reason for the part you justify.';
  else if (covered <= 0 && !(justifyOn && left > 0)) problem = 'Cover some of it, or justify it.';
  const canConfirm = !problem && need > 0 && !busy;

  async function confirm() {
    if (!uid || !canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      const gives: (Need & { source: CoverSource })[] = [];
      for (const src of sources) {
        const amount = amountOf(src.id);
        if (amount <= 0) continue;
        if (src.kind === 'bucket') for (const g of takeFrom(src.pots, amount)) gives.push({ ...g, source: src });
        else gives.push({ key: src.id, amount, source: src });
      }
      const pairs = pairUp(gives, needs);
      for (const pair of pairs) {
        const target = budget.itemsByKey.get(pair.toKey)!;
        const to: AllocationEndpoint = { kind: 'item', bucketId: target.bucketId, itemId: target.itemId, month };
        const give = gives.find((g) => g.key === pair.fromKey)!;
        let from: AllocationEndpoint;
        if (give.source.kind === 'bucket') {
          const pot = budget.itemsByKey.get(pair.fromKey)!;
          from = { kind: 'item', bucketId: pot.bucketId, itemId: pot.itemId, month };
        } else if (give.source.kind === 'pool') {
          from = { kind: 'pool' };
        } else if (give.source.kind === 'savings') {
          from = { kind: 'savings', accountId: give.source.id.slice('savings:'.length) };
        } else {
          from = { kind: 'item', bucketId: target.bucketId, itemId: target.itemId, month: addMonths(month, 1) };
        }
        await createAllocation(
          uid,
          {
            month,
            from,
            to,
            amount: pair.amount,
            currency: ctx.display,
            reason: give.source.kind === 'next' ? 'borrow_next_month' : 'cover_overspend',
            note: justifyOn && note.trim() ? note.trim() : '',
            savingsToAccountId: give.source.kind === 'savings' ? landsInId : undefined,
          },
          ctx
        );
      }
      if (justifyOn && reason) {
        for (const rest of uncovered(needs, pairs)) {
          const target = budget.itemsByKey.get(rest.key)!;
          await justifyItemMonth(uid, target.bucketId, target.itemId, month, {
            reason,
            note: note.trim(),
            amount: rest.amount + (target.justified?.amount ?? 0),
            currency: ctx.display,
          });
        }
      }
      goBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(`/budget/bucket/${bucketId}?month=${month}`);
  }

  return {
    month,
    currency: ctx.display,
    loading: data.loading,
    targetName: targets.length === 1 ? targets[0].name : group ? `${group.name}` : '',
    targetCount: targets.length,
    need,
    sources,
    coverOn,
    setCoverOn,
    justifyOn,
    setJustifyOn,
    amounts,
    setAmount: (id: string, value: string) => setAmounts((a) => ({ ...a, [id]: value })),
    fill,
    covered,
    left,
    reasons: JUSTIFY_REASONS,
    reason,
    setReason,
    note,
    setNote,
    usesSavings,
    spending,
    landsInId,
    setLandsIn,
    problem,
    canConfirm,
    confirm,
    busy,
    error,
    goBack,
  };
}
