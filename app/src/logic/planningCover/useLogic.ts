'use client';

// Cover or justify an overspend (Planning) — a full page for a bucket's
// overspent items (or one item) in one month. Two parts, one settlement:
//   A. cover it by moving money planned elsewhere (other items, left to
//      budget, savings) — each move an allocation;
//   B. explain it — always required, so every overspend has a record: why,
//      how any part not covered in A was paid for, whether it was noticed
//      at the time, and whether it was avoidable.
// Confirm writes both through settleOverspend (src/shared/firestore/
// overspend.ts); every figure comes from the same MonthBudget the bucket
// card and bucket details read, so the page can never disagree with the
// button that opened it.

import { useMemo, useState } from 'react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useCategories } from '@/src/shared/firestore/queries';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { settleOverspend } from '@/src/shared/firestore/overspend';
import { toDisplay } from '@/src/shared/firestore/currency';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { buildRows, type HistoryRow } from '@/src/logic/planning/rows';
import { monthPayments } from '@/src/logic/planning/usePaymentsTab';
import { showToast } from '@/src/widgets/Toast/Toast';
import {
  avoidabilityLabel,
  externalSourceLabel,
  money,
  monthOf,
  pairUp,
  reasonLabel,
  unexplained,
  type Need,
} from '@/src/viewmodels/planning';
import type {
  AllocationEndpoint,
  OverspendAvoidability,
  OverspendAwareness,
  OverspendExternalSource,
  OverspendItemShare,
  OverspendReason,
} from '@/src/shared/firestore/types';
import type { ItemMonth } from '@/src/shared/budget/monthBudget';

const EPS = 0.005;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CoverSource {
  id: string;
  kind: 'item' | 'pool' | 'savings';
  name: string;
  /** "AIMS YDE Trip" for an item, a short description otherwise. */
  sub: string;
  available: number;
  sameBucket: boolean;
  item: ItemMonth | null;
  accountId: string | null;
  /** Payments still planned from this item this month (unpaid). */
  upcoming: { count: number; total: number; amounts: number[]; next: Date | null };
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

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayMonth(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const EXTERNAL_PHRASES: Record<OverspendExternalSource, string> = {
  savings_outside_plan: 'paid from savings outside the plan',
  loan: 'borrowed',
  extra_income: 'paid from extra income not in the budget',
  untracked_cash: 'paid with personal cash not tracked in the budget',
  unplanned_reallocation: 'pulled from somewhere without planning',
  not_covered: 'left not covered yet',
};

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [{ month, bucket: bucketId, item: itemId }] = useState(paramsFromSearch);
  const data = useMonthBudget(month);
  const { budget, buckets, accounts, ctx, transactionsById, transfersById } = data;
  const { data: categories, loading: categoriesLoading } = useCategories();
  const loading = data.loading || categoriesLoading;
  const currency = ctx.display;

  // ---- What's over ----
  const group = budget.buckets.find((g) => g.bucketId === bucketId) ?? null;
  const targets = useMemo(
    () => (group?.items ?? []).filter((i) => i.type !== 'Income' && (!itemId || i.itemId === itemId) && unexplained(i) > 0),
    [group, itemId]
  );
  const needs: Need[] = targets.map((i) => ({ key: i.key, amount: unexplained(i) }));
  const need = r2(needs.reduce((s, n) => s + n.amount, 0));
  const single = itemId ? (group?.items.find((i) => i.itemId === itemId) ?? null) : null;
  const scope = itemId ? (single ? [single] : []) : (group?.items ?? []).filter((i) => i.type !== 'Income');
  const planned = r2(scope.reduce((s, i) => s + i.available, 0));
  const spent = r2(scope.reduce((s, i) => s + i.actual, 0));
  const targetName = single ? single.name : (group?.name ?? '');
  const contextName = single ? `${single.name} · ${single.bucketName}` : (group?.name ?? '');
  const followsUp = [...new Set(targets.flatMap((t) => t.settlement?.ids ?? []))];

  // "What caused it": each target's own payments in date order, from the
  // one that took it past its plan onward.
  const causes = useMemo<HistoryRow[]>(() => {
    const bucketName = new Map(buckets.map((b) => [b.id, b.name]));
    const out: HistoryRow[] = [];
    for (const t of targets) {
      const rows = buildRows(
        t.transactionIds.map((id) => transactionsById.get(id)).filter((x) => x !== undefined),
        t.transferIds.map((id) => transfersById.get(id)).filter((x) => x !== undefined),
        { accounts, categories, budget, bucketName, ctx }
      ).sort((a, b) => a.date.getTime() - b.date.getTime());
      let running = 0;
      for (const row of rows) {
        running += Math.abs(row.amount);
        if (running > t.available + EPS) out.push(row);
      }
    }
    return out.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [targets, buckets, transactionsById, transfersById, accounts, categories, budget, ctx]);

  // ---- Section A: where money can come from ----
  const sources = useMemo<CoverSource[]>(() => {
    const targetKeys = new Set(targets.map((t) => t.key));
    const payments = loading ? [] : monthPayments(month, data, categories).filter((p) => p.status !== 'paid');
    const none = { count: 0, total: 0, amounts: [] as number[], next: null as Date | null };
    const out: CoverSource[] = [];
    for (const item of budget.items) {
      if (item.type === 'Income' || targetKeys.has(item.key) || item.remaining <= 0) continue;
      const mine = payments.filter((p) => p.itemId === item.itemId).sort((a, b) => a.due.getTime() - b.due.getTime());
      out.push({
        id: `item:${item.key}`,
        kind: 'item',
        name: item.name,
        sub: item.bucketName,
        available: item.remaining,
        sameBucket: item.bucketId === bucketId,
        item,
        accountId: null,
        upcoming: mine.length
          ? { count: mine.length, total: r2(mine.reduce((s, p) => s + p.amount, 0)), amounts: mine.map((p) => p.amount), next: mine[0].due }
          : none,
      });
    }
    if (budget.pool > 0) {
      out.push({
        id: 'pool',
        kind: 'pool',
        name: 'Left to budget',
        sub: 'Income no budget has claimed yet',
        available: budget.pool,
        sameBucket: false,
        item: null,
        accountId: null,
        upcoming: none,
      });
    }
    for (const a of accounts.filter(isSavingsAccount)) {
      const free = a.currentBalance - (a.lockedAmount ?? 0);
      if (free <= 0) continue;
      out.push({
        id: `savings:${a.id}`,
        kind: 'savings',
        name: `Savings · ${a.name}`,
        sub: 'Current balance — a real withdrawal',
        available: r2(toDisplay(ctx, free, a.currency)),
        sameBucket: false,
        item: null,
        accountId: a.id,
        upcoming: none,
      });
    }
    return out.sort((a, b) => Number(b.sameBucket) - Number(a.sameBucket) || b.available - a.available);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget, targets, accounts, ctx, month, bucketId, loading, categories]);

  // ---- The user's choices ----
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [landsIn, setLandsIn] = useState('');
  const [reason, setReason] = useState<OverspendReason | null>(null);
  const [external, setExternal] = useState<Partial<Record<OverspendExternalSource, string>>>({});
  const [awareness, setAwareness] = useState<OverspendAwareness | null>(null);
  const [noticedOn, setNoticedOn] = useState(todayInput);
  const [avoidability, setAvoidability] = useState<OverspendAvoidability | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (raw: string | undefined) => {
    const n = Number(raw ?? '');
    return Number.isFinite(n) && n > 0 ? r2(n) : 0;
  };
  const amountOf = (id: string) => (id in picked ? num(picked[id]) : 0);
  const covered = r2(sources.reduce((s, src) => s + amountOf(src.id), 0));
  const externalEntries = (Object.keys(external) as OverspendExternalSource[]).map((source) => ({ source, amount: num(external[source]) }));
  const externalTotal = r2(externalEntries.reduce((s, e) => s + e.amount, 0));
  const explainedOutside = r2(externalEntries.filter((e) => e.source !== 'not_covered').reduce((s, e) => s + e.amount, 0));
  const accounted = r2(covered + externalTotal);
  const difference = r2(need - accounted);
  const progress = r2(Math.min(need, covered + explainedOutside));
  const stillUncovered = Math.max(0, r2(need - accounted));

  function sourceError(src: CoverSource): string | null {
    return amountOf(src.id) > src.available + EPS ? `Only ${money(src.available)} available` : null;
  }
  function sourceWarning(src: CoverSource): string | null {
    const take = amountOf(src.id);
    if (!take || !src.upcoming.count || !src.upcoming.next) return null;
    const short = r2(src.upcoming.total - (src.available - take));
    if (short <= EPS) return null;
    return `This will leave ${src.name} ${money(short)} short for a planned payment on ${dayMonth(src.upcoming.next)}.`;
  }
  function upcomingText(src: CoverSource): string {
    const { count, total, amounts } = src.upcoming;
    const same = amounts.every((a) => Math.abs(a - amounts[0]) < EPS);
    const what = count === 1 ? `1 payment of ${money(total)}` : same ? `${count} payments of ${money(amounts[0])}` : `${count} payments (${money(total)} in all)`;
    return `${what} ${count === 1 ? 'is' : 'are'} still planned from this budget.`;
  }

  function toggleSource(id: string) {
    setPicked((current) => {
      if (id in current) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      const src = sources.find((s) => s.id === id);
      const open = Math.max(0, r2(need - accounted));
      const value = src ? Math.min(src.available, open) : 0;
      return { ...current, [id]: value > 0 ? String(value) : '' };
    });
  }
  function quickFill(id: string, how: 'max' | 'half' | 'rest') {
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    const others = r2(accounted - amountOf(id));
    const value = how === 'max' ? src.available : how === 'half' ? r2(src.available / 2) : Math.max(0, r2(need - others));
    setPicked((current) => ({ ...current, [id]: value > 0 ? String(value) : '' }));
  }
  function toggleExternal(source: OverspendExternalSource) {
    setExternal((current) => {
      if (source in current) {
        const next = { ...current };
        delete next[source];
        return next;
      }
      const open = Math.max(0, r2(need - accounted));
      return { ...current, [source]: open > 0 ? String(open) : '' };
    });
  }

  const query = search.trim().toLowerCase();
  const matching = query ? sources.filter((s) => `${s.name} ${s.sub}`.toLowerCase().includes(query)) : sources;
  // Picked rows always stay visible, even past the first six.
  const visibleSources = showAll || query ? matching : matching.filter((s, i) => i < 6 || s.id in picked);

  const usesSavings = sources.some((s) => s.kind === 'savings' && amountOf(s.id) > 0);
  const spending = accounts.filter((a) => !isSavingsAccount(a));
  const landsInId = landsIn || spending[0]?.id || '';

  // ---- Checks ----
  const overLimit = sources.some((s) => sourceError(s));
  let problem: string | null = null;
  if (overLimit) problem = 'One of the amounts is more than that budget has available.';
  else if (covered > need + EPS) problem = 'That moves more than the overspend.';
  else if (difference < -EPS) problem = `That's ${money(-difference)} ${currency} more than the overspend.`;
  else if (difference > EPS) problem = `${money(difference)} ${currency} still needs a source — move it, say how it was paid, or mark it “Not covered yet”.`;
  else if (!reason) problem = 'Pick why it went over.';
  else if (!awareness) problem = 'Say when this was dealt with.';
  else if (awareness === 'discovered_later' && !noticedOn) problem = 'Add the date you noticed it.';
  else if (!avoidability) problem = 'Say whether it could have been avoided.';
  else if (usesSavings && !landsInId) problem = 'Pick the wallet the savings go into.';
  const canConfirm = !problem && need > 0 && !busy && Boolean(uid);

  // ---- Review ----
  const plan = useMemo(() => {
    const gives: (Need & { src: CoverSource })[] = sources
      .filter((s) => amountOf(s.id) > 0)
      .map((src) => ({ key: src.id, amount: amountOf(src.id), src }));
    const pairs = pairUp(gives, needs);
    return { gives, pairs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, picked, need]);

  const review = useMemo(() => {
    const lines: string[] = [];
    for (const g of plan.gives) lines.push(`Move ${money(g.amount)} ${currency} from ${g.src.name} to ${targetName}.`);
    for (const e of externalEntries) if (e.amount > 0) lines.push(`${money(e.amount)} ${currency} ${EXTERNAL_PHRASES[e.source]}.`);
    const why = [
      reason ? `Reason: ${reasonLabel(reason)}` : null,
      awareness === 'conscious' ? 'Handled at the time' : null,
      awareness === 'discovered_later' ? `Discovered later${noticedOn ? ` on ${dayMonth(new Date(`${noticedOn}T00:00`))}` : ''}` : null,
      avoidability ? avoidabilityLabel(avoidability) : null,
    ].filter(Boolean);
    if (why.length) lines.push(`${why.join(' · ')}.`);
    const changes: { name: string; before: number; after: number; unit: string }[] = [];
    for (const g of plan.gives) {
      if (g.src.kind === 'item') changes.push({ name: g.src.name, before: g.src.item!.available, after: r2(g.src.item!.available - g.amount), unit: 'planned' });
      else changes.push({ name: g.src.name, before: g.src.available, after: r2(g.src.available - g.amount), unit: g.src.kind === 'pool' ? 'unassigned' : 'balance' });
    }
    for (const t of targets) {
      const gets = r2(plan.pairs.filter((p) => p.toKey === t.key).reduce((s, p) => s + p.amount, 0));
      if (gets > 0) changes.push({ name: t.name, before: t.available, after: r2(t.available + gets), unit: 'planned' });
    }
    return { lines, changes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, external, reason, awareness, noticedOn, avoidability, targets, currency, targetName]);

  // ---- Confirm ----
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(`/budget/bucket/${bucketId}?month=${month}`);
  }

  async function confirm() {
    if (!uid || !canConfirm || !reason || !awareness || !avoidability) return;
    setBusy(true);
    setError(null);
    try {
      const moves = plan.pairs.map((pair) => {
        const target = budget.itemsByKey.get(pair.toKey)!;
        const src = plan.gives.find((g) => g.key === pair.fromKey)!.src;
        const to: AllocationEndpoint = { kind: 'item', bucketId: target.bucketId, itemId: target.itemId, month };
        const from: AllocationEndpoint =
          src.kind === 'item'
            ? { kind: 'item', bucketId: src.item!.bucketId, itemId: src.item!.itemId, month }
            : src.kind === 'pool'
              ? { kind: 'pool' }
              : { kind: 'savings', accountId: src.accountId! };
        return { from, to, amount: pair.amount, savingsToAccountId: src.kind === 'savings' ? landsInId : undefined };
      });
      // Split what's paid outside the plan, then what's left open, over
      // whatever each item still needs after the moves.
      const rest = needs.map((n) => ({
        key: n.key,
        amount: r2(n.amount - plan.pairs.filter((p) => p.toKey === n.key).reduce((s, p) => s + p.amount, 0)),
      }));
      const openAmount = r2(externalEntries.filter((e) => e.source === 'not_covered').reduce((s, e) => s + e.amount, 0));
      const split = pairUp(
        [
          { key: 'external', amount: explainedOutside },
          { key: 'open', amount: openAmount },
        ],
        rest.filter((x) => x.amount > EPS)
      );
      const items: OverspendItemShare[] = targets.map((t) => {
        const part = (key: string) => r2(split.filter((p) => p.toKey === t.key && p.fromKey === key).reduce((s, p) => s + p.amount, 0));
        return {
          itemId: t.itemId,
          overspend: unexplained(t),
          covered: r2(plan.pairs.filter((p) => p.toKey === t.key).reduce((s, p) => s + p.amount, 0)),
          external: part('external'),
          uncovered: part('open'),
        };
      });
      await settleOverspend(
        uid,
        {
          month,
          bucketId,
          itemId: itemId ?? null,
          currency,
          overspendAmount: need,
          moves,
          externalSources: externalEntries.filter((e) => e.amount > 0),
          items,
          reason,
          awareness,
          noticedOn: awareness === 'discovered_later' ? new Date(`${noticedOn}T12:00`) : null,
          avoidability,
          note,
          followsUp,
        },
        ctx
      );
      showToast('Overspend settled and recorded.');
      goBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
      setBusy(false);
    }
  }

  return {
    month,
    currency,
    loading,
    found: Boolean(group),
    bucketHref: `/budget/bucket/${bucketId}?month=${month}`,
    need,
    contextName,
    targetName,
    targetCount: targets.length,
    planned,
    spent,
    causes,
    // Section A
    sources,
    visibleSources,
    hiddenCount: matching.length - visibleSources.length,
    manySources: sources.length > 6,
    search,
    setSearch,
    showAll,
    setShowAll,
    picked,
    isPicked: (id: string) => id in picked,
    amountText: (id: string) => picked[id] ?? '',
    setAmount: (id: string, value: string) => setPicked((c) => ({ ...c, [id]: value.replace(/[^\d.]/g, '') })),
    toggleSource,
    quickFill,
    sourceError,
    sourceWarning,
    upcomingText,
    usesSavings,
    spending,
    landsInId,
    setLandsIn,
    // Section B
    reason,
    setReason,
    external,
    toggleExternal,
    setExternalAmount: (source: OverspendExternalSource, value: string) =>
      setExternal((c) => ({ ...c, [source]: value.replace(/[^\d.]/g, '') })),
    externalLabel: externalSourceLabel,
    needsExternal: need - covered > EPS,
    awareness,
    setAwareness,
    noticedOn,
    setNoticedOn,
    avoidability,
    setAvoidability,
    note,
    setNote,
    // Totals
    covered,
    accounted,
    difference,
    progress,
    stillUncovered,
    fullyCovered: need > 0 && progress >= need - EPS,
    review,
    problem,
    canConfirm,
    confirm,
    busy,
    error,
    goBack,
  };
}
