'use client';

// The plan behind Plan and forecast, shared by the page (useLogic.ts) and
// the daily background snapshot (src/widgets/Notifications/
// PlanSnapshotWorker.tsx): budget lines in the horizon's months and the
// backlog (lines with no date, "Want to buy" items), income lines (with
// their recent range, for Cautious and Optimistic), the draft (settings/
// planDraft) and its suggestions, and the forecast engine run twice: with
// the draft (what the page shows) and on the applied plan only (what the
// notification rules read). Also the cushion, the cushion streak and the
// facts the forecast notifications need.

import { useMemo } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { usePlansData } from '@/src/logic/plans/usePlansData';
import { convert, itemCurrencyOf } from '@/src/shared/firestore/currency';
import type { ForecastFacts } from '@/src/shared/notifications/rules';
import { isOpen, monthKey, remaining, shiftMonth } from '@/src/viewmodels/plans/model';
import { applyDraft, UNSCHEDULED, type IncomeLine, type PlanChange, type PlanLine } from '@/src/viewmodels/plans/planDraft';
import { cushionStreak, defaultCushion, pastMonthLows, runEngine, type EngineInput, type EngineScenario } from '@/src/viewmodels/plans/engine';
import { autoAllocate, type Candidate, type Placement } from '@/src/viewmodels/plans/allocate';
import { isSavingsAccount } from '@/src/viewmodels/wallets';

export type Horizon = 3 | 6 | 12;

/** An Auto-allocate suggestion waiting for Accept or Reject. */
export interface Suggestion extends Placement {
  name: string;
}

export interface DraftDoc {
  changes?: PlanChange[];
  /** Older drafts said 2 or 3: read as 3. */
  horizon?: number;
  scenario?: EngineScenario;
  /** The minimum balance to keep; null = one month of must-haves. */
  cushion?: number | null;
  suggestions?: Suggestion[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const toMonth = (d: Date | null | undefined) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : null);

export function usePlanModel() {
  const plans = usePlansData();
  const { occurrences, today, data, itemsByBucket, buckets, accounts, ctx } = plans;
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const draftRef = useMemo(() => (uid ? doc(getFirebaseFirestore(), 'users', uid, 'settings', 'planDraft') : null), [uid]);
  const { data: draftDoc, loading: draftLoading } = useFirestoreDoc<DraftDoc>(draftRef);

  const changes = useMemo(() => draftDoc?.changes ?? [], [draftDoc]);
  const suggestions = useMemo(() => draftDoc?.suggestions ?? [], [draftDoc]);
  const rawHorizon = draftDoc?.horizon ?? 6;
  const horizon: Horizon = rawHorizon >= 12 ? 12 : rawHorizon >= 6 ? 6 : 3;
  const scenario: EngineScenario = draftDoc?.scenario ?? 'expected';

  async function saveDraft(patch: DraftDoc) {
    if (!draftRef) return;
    await setDoc(draftRef, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
  }

  const current = monthKey(today);
  const months = useMemo(() => Array.from({ length: horizon }, (_, i) => shiftMonth(current, i)), [current, horizon]);
  const last = months[months.length - 1];

  // ---- Lines: the horizon's months and the backlog ----
  const { lines, income } = useMemo(() => {
    const raw = new Map(Object.values(itemsByBucket).flat().map((i) => [i.id, i]));
    const fixedBucket = new Map(buckets.map((b) => [b.id, b.kind === 'Fixed']));
    const scheduled: PlanLine[] = occurrences
      .filter((o) => (o.kind === 'fixed' || o.kind === 'variable' || o.kind === 'savings') && !o.dropped && o.month >= current && o.month <= last)
      .filter((o) => isOpen(o) || o.month === current)
      .map((o) => {
        const item = raw.get(o.itemId);
        const a = item?.automation;
        const paid = !isOpen(o);
        return {
          key: o.key,
          itemId: o.itemId,
          bucketId: o.bucketId,
          bucketName: o.bucketName,
          name: o.name,
          kind: o.kind as PlanLine['kind'],
          need: o.need,
          priority: o.priority,
          month: o.month,
          due: o.due,
          amount: paid ? o.paid : remaining(o),
          accountId: o.accountId ?? null,
          recurring: o.recurring,
          incomeItemId: a?.mode === 'prepare' && a.trigger === 'income' ? (a.incomeItemId ?? null) : null,
          notBefore: toMonth(item?.notBefore?.toDate()),
          neededBy: toMonth(item?.neededBy?.toDate()),
          splittable: Boolean(item?.splittable),
          movable: !(o.recurring && fixedBucket.get(o.bucketId)),
          splitGroupId: item?.splitGroupId ?? null,
          source: item?.source ?? 'budget_line',
          waitingSince: null,
          paid,
        };
      });
    // The backlog: lines with no date (unscheduled, postponed without a new date, Want to buy).
    const backlog: PlanLine[] = [];
    for (const bucket of buckets) {
      if (bucket.archived || bucket.type === 'Income' || bucket.type === 'Transfer') continue;
      for (const item of itemsByBucket[bucket.id] ?? []) {
        if (item.dueDate || item.completed || item.status === 'dropped') continue;
        backlog.push({
          key: `${item.id}@${UNSCHEDULED}`,
          itemId: item.id,
          bucketId: bucket.id,
          bucketName: bucket.name,
          name: item.name,
          kind: bucket.type === 'Savings' ? 'savings' : item.expenseKind === 'variable' ? 'variable' : 'fixed',
          need: item.necessity === 'MustHave' ? 'must' : 'nice',
          priority: item.priority === 'Urgent' || item.priority === 'High' ? 'High' : item.priority === 'Low' ? 'Low' : 'Medium',
          month: null,
          due: null,
          amount: r2(convert(item.amount, itemCurrencyOf(item, bucket), ctx.display, ctx.rates)),
          accountId: item.accountId ?? null,
          recurring: false,
          incomeItemId: item.automation?.mode === 'prepare' && item.automation.trigger === 'income' ? (item.automation.incomeItemId ?? null) : null,
          notBefore: toMonth(item.notBefore?.toDate()),
          neededBy: toMonth(item.neededBy?.toDate()),
          splittable: Boolean(item.splittable),
          movable: true,
          splitGroupId: item.splitGroupId ?? null,
          source: item.source ?? 'plan_item',
          waitingSince: item.createdAt?.toDate() ?? null,
          paid: false,
        });
      }
    }
    // Income in the horizon (and a little beyond, for income-tied moves),
    // with its range over the last 6 months when it varies.
    const received = new Map<string, number[]>();
    for (let k = 1; k <= 6; k++) {
      const m = shiftMonth(current, -k);
      const byItem = new Map<string, number>();
      for (const t of data.txs) if (t.kind === 'income' && t.month === m && t.link) byItem.set(t.link.itemId, (byItem.get(t.link.itemId) ?? 0) + t.amount);
      for (const [id, amount] of byItem) received.set(id, [...(received.get(id) ?? []), amount]);
    }
    const incomeLines: (IncomeLine & { date: Date; received: boolean; range: { low: number; high: number } | null })[] = occurrences
      .filter((o) => o.kind === 'income' && !o.dropped && o.month >= current && o.month <= shiftMonth(last, 3))
      .map((o) => {
        const history = received.get(o.itemId) ?? [];
        const low = history.length >= 2 ? Math.min(...history) : null;
        const high = history.length >= 2 ? Math.max(...history) : null;
        const irregular = low !== null && high !== null && high > 0 && (high - low) / high > 0.1;
        const [y, m] = o.month.split('-').map(Number);
        return {
          key: o.key,
          itemId: o.itemId,
          name: o.name,
          month: o.month,
          amount: o.month === current ? remaining(o) : o.planned,
          date: o.due ?? new Date(y, m - 1, 1),
          received: o.month === current && remaining(o) <= 0,
          range: irregular ? { low: low!, high: high! } : null,
        };
      });
    return { lines: [...scheduled, ...backlog], income: incomeLines };
  }, [occurrences, itemsByBucket, buckets, current, last, ctx, data]);

  // ---- The draft, its suggestions shown in place ----
  const drafted = useMemo(() => applyDraft(lines, changes), [lines, changes]);
  const withSuggestions = useMemo(() => {
    if (!suggestions.length) return drafted;
    let out = drafted;
    for (const s of suggestions) {
      const base = out.find((l) => l.key === s.key);
      if (!base) continue;
      const parts: PlanLine[] = s.parts.map((p, i) => ({
        ...base,
        key: i === 0 ? base.key : `${base.key}#${p.month}`,
        name: s.parts.length > 1 ? `${base.name}, ${i + 1} of ${s.parts.length}` : base.name,
        month: p.month,
        due: null,
        amount: p.amount,
        suggested: { reason: s.reason },
      }));
      out = [...out.filter((l) => l.key !== s.key), ...parts];
    }
    return out;
  }, [drafted, suggestions]);

  // ---- The engine ----
  const usableSavings = accounts.filter((a) => !a.archived && isSavingsAccount(a) && a.usableForPlan);
  const startBalance = r2(data.balance.spending + usableSavings.reduce((s, a) => s + convert(a.currentBalance, a.currency, ctx.display, ctx.rates), 0));
  const cushion = draftDoc?.cushion ?? defaultCushion(lines, current);
  const fees = useMemo(() => data.transfers.filter((t) => t.date >= today && t.charges > 0).map((t) => ({ date: t.date, amount: t.charges })), [data, today]);
  const inputFor = (planLines: PlanLine[]): EngineInput => ({
    today,
    months,
    startBalance,
    income: income.map((i) => ({ key: i.key, name: i.name, month: i.month, date: i.date, amount: i.amount, received: i.received, range: i.range })),
    lines: planLines.filter((l) => l.month && !l.paid),
    fees,
    scenario,
    cushion,
  });
  const appliedInput = useMemo(() => inputFor(lines), [lines, months, startBalance, income, fees, scenario, cushion]); // eslint-disable-line react-hooks/exhaustive-deps
  const draftInput = useMemo(() => inputFor(withSuggestions), [withSuggestions, months, startBalance, income, fees, scenario, cushion]); // eslint-disable-line react-hooks/exhaustive-deps
  const applied = useMemo(() => runEngine(appliedInput), [appliedInput]);
  const forecast = useMemo(() => runEngine(draftInput), [draftInput]);

  // ---- Cushion streak: past months' lowest actual balance ----
  const streak = useMemo(() => {
    const flows: { date: Date; amount: number }[] = [];
    for (const t of data.txs) {
      if (t.kind === 'income') flows.push({ date: t.date, amount: t.amount });
      else if (t.kind === 'expense') flows.push({ date: t.date, amount: -t.amount });
      else flows.push({ date: t.date, amount: -(t.savingsFlow || t.amount) });
    }
    for (const t of data.transfers) flows.push({ date: t.date, amount: -t.savingsFlow - t.charges });
    return cushionStreak(pastMonthLows(data.balance.spending, flows, today, 12), cushion);
  }, [data, today, cushion]);

  // ---- Backlog candidates for Auto-allocate ----
  const candidatesOf = (planLines: PlanLine[]): Candidate[] =>
    planLines
      .filter((l) => l.month === null && l.movable !== false)
      .map((l) => {
        // An income-tied item never goes before its income's first month.
        const incomeMonth = l.incomeItemId ? income.filter((i) => i.itemId === l.incomeItemId).map((i) => i.month).sort()[0] ?? null : null;
        const notBefore = [l.notBefore, incomeMonth].filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
        return { key: l.key, name: l.name, kind: l.kind, need: l.need, priority: l.priority, amount: l.amount, notBefore, neededBy: l.neededBy ?? null, splittable: Boolean(l.splittable), createdAt: l.waitingSince ?? null };
      });

  /** The forecast notification facts, from the applied plan only. */
  const forecastFacts = useMemo((): ForecastFacts => {
    const allocation = autoAllocate(appliedInput, candidatesOf(lines));
    const byKey = new Map(lines.map((l) => [l.key, l]));
    const thirtyDays = today.getTime() - 30 * 86_400_000;
    return {
      cushion,
      breaches: applied.breaches,
      shortMonths: applied.months.filter((m) => m.free < 0).map((m) => ({ month: m.month, shortfall: r2(-m.free) })),
      autoAllocate: { count: allocation.placements.length, names: allocation.placements.map((p) => byKey.get(p.key)?.name ?? '').filter(Boolean) },
      wantToBuyFits: allocation.placements
        .map((p) => ({ p, l: byKey.get(p.key) }))
        .filter(({ l }) => l?.source === 'want_to_buy' && l.waitingSince && l.waitingSince.getTime() <= thirtyDays)
        .map(({ p, l }) => ({ id: l!.itemId, name: l!.name, month: p.parts[0].month, amount: l!.amount })),
      streak,
    };
  }, [appliedInput, applied, lines, cushion, streak, today]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    plans,
    uid,
    loading: plans.loading || draftLoading,
    today,
    current,
    months,
    horizon,
    scenario,
    cushion,
    cushionIsDefault: draftDoc?.cushion == null,
    startBalance,
    changes,
    suggestions,
    saveDraft,
    lines,
    income,
    drafted,
    planLines: withSuggestions,
    draftInput,
    appliedInput,
    forecast,
    applied,
    streak,
    candidatesOf,
    forecastFacts,
  };
}

export type PlanModel = ReturnType<typeof usePlanModel>;
