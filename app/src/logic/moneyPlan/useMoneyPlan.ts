'use client';

// The money plan (/baskets/forecast): the user's baskets as the plan's
// input (src/viewmodels/planner/fromRecords.ts), the picked scenario
// (src/logic/planner/useScenarios.ts) and the plan run on both
// (src/viewmodels/planner/money.ts). Every change goes through the engine,
// which refuses locked items, and saves to the scenario at once with a
// short toast. "Apply to my records" is the only write to real data, and
// only after the user confirms the exact list.

import { useCallback, useMemo } from 'react';
import { Timestamp, arrayUnion, serverTimestamp, updateDoc } from 'firebase/firestore';
import { usePlansData } from '@/src/logic/plans/usePlansData';
import { useScenarios } from '@/src/logic/planner/useScenarios';
import { bucketLineItemRef } from '@/src/shared/firestore/refs';
import { skipItemMonth } from '@/src/shared/firestore/bucketBudget';
import { convert, itemCurrencyOf, toDisplay } from '@/src/shared/firestore/currency';
import { itemOccurrenceDetail } from '@/src/shared/budget/monthBudget';
import { incomeSubtypeOf } from '@/src/shared/budget/flow';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { shiftMonth } from '@/src/viewmodels/plans/model';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { showToast } from '@/src/widgets/Toast/Toast';
import { dateOf, dayOf, dayLabel, monthKeyOf, type Day } from '@/src/viewmodels/planner/days';
import { moneyInputFromRecords, type RecordItem } from '@/src/viewmodels/planner/fromRecords';
import {
  applyFix,
  isLocked,
  moneyPlan,
  moveTo,
  originalDate,
  setDate,
  setGoalMonthly,
  startingScenario,
  toggleItem,
  toggleSkip,
  type ChangeResult,
  type Fix,
  type MoneyHorizon,
  type MoneyInput,
  type MoneyScenario,
} from '@/src/viewmodels/planner/money';

/** One change the user could make real. */
export interface RecordChange {
  key: string;
  text: string;
  /** Why it can't be applied, when it can't. */
  blocked: string | null;
  run: (() => Promise<void>) | null;
  /** What to clear from the scenario once applied. */
  clear: { override?: string; goal?: string; disabled?: string };
}

export function useMoneyPlan() {
  const plans = usePlansData();
  const { data, buckets, itemsByBucket, categories, accounts, ctx, occurrences, currency } = plans;
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const today = dayOf(data.today);
  const store = useScenarios(today);
  const scenario = store.current.money;

  // ---- The plan's input, from the records ----
  const input: MoneyInput = useMemo(() => {
    const current = monthKeyOf(today);
    const months = Array.from({ length: 13 }, (_, i) => shiftMonth(current, i));
    const occByKey = new Map(occurrences.map((o) => [o.key, o]));
    const firstOcc = new Map<string, (typeof occurrences)[number]>();
    for (const o of occurrences) if (!firstOcc.has(o.itemId)) firstOcc.set(o.itemId, o);
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const items: RecordItem[] = [];
    for (const bucket of buckets) {
      if (bucket.archived) continue;
      const type = bucket.type ?? 'Expense';
      for (const item of itemsByBucket[bucket.id] ?? []) {
        const known = firstOcc.get(item.id);
        const kind: RecordItem['kind'] =
          known?.kind ?? (type === 'Income' ? 'income' : type === 'Savings' ? 'savings' : type === 'Transfer' ? 'transfer' : item.expenseKind === 'fixed' || bucket.kind === 'Fixed' ? 'fixed' : 'variable');
        const currencyOf = itemCurrencyOf(item, bucket);
        const byMonth: RecordItem['months'] = {};
        const paid: RecordItem['paid'] = {};
        for (const month of months) {
          const detail = itemOccurrenceDetail(item, month, bucket);
          if (!detail) continue;
          byMonth[month] = { dates: detail.dates, planned: toDisplay(ctx, detail.planned, currencyOf), frequency: detail.frequency };
          paid[month] = occByKey.get(`${item.id}@${month}`)?.paid ?? 0;
        }
        const earned = incomeSubtypeOf(item, item.categoryId ? categoryName.get(item.categoryId) : null) === 'earned';
        items.push({
          id: item.id,
          bucketId: bucket.id,
          name: item.name,
          kind,
          need: known?.need ?? (item.necessity === 'MustHave' ? 'must' : 'nice'),
          priority: known?.priority ?? (item.priority === 'Low' ? 'Low' : item.priority === 'High' || item.priority === 'Urgent' ? 'High' : 'Medium'),
          confidence: item.confidence ?? (earned ? 'Confirmed' : 'Expected'),
          fundedByGoalId: item.fundedByGoalId ?? null,
          done: (bucket.kind !== 'Fixed' && item.completed) || item.status === 'dropped',
          amount: toDisplay(ctx, item.amount, currencyOf),
          hasDueDate: Boolean(item.dueDate),
          months: byMonth,
          paid,
        });
      }
    }
    const savedByBasket: Record<string, number> = {};
    for (const t of data.txs) if (t.kind === 'savings' && t.link) savedByBasket[t.link.bucketId] = (savedByBasket[t.link.bucketId] ?? 0) + t.amount;
    const usable = accounts.filter((a) => !a.archived && isSavingsAccount(a) && a.usableForPlan);
    const balance = data.balance.spending + usable.reduce((s, a) => s + convert(a.currentBalance, a.currency, ctx.display, ctx.rates), 0);
    return moneyInputFromRecords({
      today: data.today,
      balance,
      baskets: buckets
        .filter((b) => !b.archived)
        .map((b) => ({
          id: b.id,
          name: b.name,
          type: b.type ?? 'Expense',
          target: b.targetAmount ? toDisplay(ctx, b.targetAmount, b.currency) : null,
          deadline: b.deadline?.toDate() ?? null,
          closedMonths: Object.keys(b.closedMonths ?? {}),
        })),
      items,
      savedByBasket,
    });
  }, [today, occurrences, categories, buckets, itemsByBucket, ctx, data, accounts]);

  const view = useMemo(() => moneyPlan(input, scenario), [input, scenario]);

  // ---- Changes (saved to the scenario straight away) ----
  const save = useCallback((money: MoneyScenario) => store.update({ money }), [store]);
  const run = useCallback(
    (result: ChangeResult) => {
      if (result.ok) save(result.scenario);
      showToast(result.message);
    },
    [save]
  );

  const actions = {
    setHorizon: (horizon: MoneyHorizon) => save({ ...scenario, horizon }),
    setBuffer: (buffer: number) => save({ ...scenario, buffer: Math.max(0, Math.round(buffer)) }),
    setConfirmedOnly: (confirmedOnly: boolean) => save({ ...scenario, confirmedOnly }),
    reset: () => {
      save(startingScenario(scenario));
      showToast('Back to the starting plan');
    },
    setDate: (id: string, day: Day) => run(setDate(input, scenario, id, day)),
    moveTo: (id: string, target: string) => run(moveTo(input, scenario, id, target)),
    toggleSkip: (id: string) => run(toggleSkip(input, scenario, id)),
    originalDate: (id: string) => run(originalDate(input, scenario, id)),
    toggleItem: (itemId: string) => run(toggleItem(input, scenario, itemId)),
    setGoalMonthly: (goalId: string, monthly: number) => save(setGoalMonthly(input, scenario, goalId, monthly)),
    applyFix: (fix: Fix) => run(applyFix(input, scenario, fix)),
  };

  // ---- From plan to reality ----
  const recordChanges: RecordChange[] = useMemo(() => {
    if (!uid) return [];
    const out: RecordChange[] = [];
    const occById = new Map(view.run.occ.map((o) => [o.id, o]));
    const rawOf = (bucketId: string, itemId: string) => (itemsByBucket[bucketId] ?? []).find((i) => i.id === itemId) ?? null;
    for (const [id, ov] of Object.entries(scenario.overrides)) {
      const o = occById.get(id);
      if (!o || isLocked(o.item)) continue;
      const src = o.item.source;
      const what = o.base != null ? `${o.item.name} (${dayLabel(o.base)})` : o.item.name;
      const change = (text: string, blocked: string | null, write: (() => Promise<void>) | null): RecordChange => ({ key: id, text, blocked, run: blocked ? null : write, clear: { override: id } });
      if (!src) {
        out.push(change(`${what}: ${ov.skip ? 'skip' : 'move'}`, 'Savings transfers change through the goal amount.', null));
        continue;
      }
      const ref = bucketLineItemRef(uid, src.bucketId, src.itemId);
      const month = o.base != null ? monthKeyOf(o.base) : null;
      if (ov.skip) {
        if (src.recurring && month) out.push(change(`Skip ${what}`, null, () => skipItemMonth(uid, src.bucketId, src.itemId, month)));
        else out.push(change(`Drop ${what}`, null, () => updateDoc(ref, { status: 'dropped', completed: true, completedAt: serverTimestamp(), updatedAt: serverTimestamp() })));
        continue;
      }
      if (!('date' in ov) || ov.date === o.base) continue;
      if (ov.date == null) {
        if (src.recurring) out.push(change(`Put off ${what}`, 'A repeating item stays on its dates; skip this one instead.', null));
        else out.push(change(`Put off ${what} to Not scheduled`, null, () => updateDoc(ref, { dueDate: null, updatedAt: serverTimestamp() })));
        continue;
      }
      const to = ov.date;
      if (!src.recurring) {
        out.push(
          change(`Move ${what} to ${dayLabel(to)}`, null, () =>
            updateDoc(ref, {
              dueDate: Timestamp.fromDate(dateOf(to)),
              postponeHistory: arrayUnion({ fromDate: o.base != null ? Timestamp.fromDate(dateOf(o.base)) : null, toDate: Timestamp.fromDate(dateOf(to)), reason: 'Planned in Priorities', at: Timestamp.now() }),
              updatedAt: serverTimestamp(),
            })
          )
        );
        continue;
      }
      const bucket = buckets.find((b) => b.id === src.bucketId);
      const raw = rawOf(src.bucketId, src.itemId);
      const detail = raw && month ? itemOccurrenceDetail(raw, month, bucket) : null;
      if (!month || monthKeyOf(to) !== month || !detail || detail.dates.length > 1) {
        out.push(change(`Move ${what} to ${dayLabel(to)}`, 'A repeating item can only move within its own month.', null));
        continue;
      }
      out.push(change(`Move ${what} to ${dayLabel(to)}`, null, () => updateDoc(ref, { [`monthOverrides.${month}`]: { amount: detail.planned, dueDate: Timestamp.fromDate(dateOf(to)) }, updatedAt: serverTimestamp() })));
    }
    for (const g of input.goals) {
      const monthly = scenario.goalMonthly[g.id];
      if (monthly === undefined || monthly === g.monthly) continue;
      const src = g.sources ?? [];
      const text = `Save ${Math.round(monthly).toLocaleString('en-US')} a month towards ${g.name}`;
      const clear = { goal: g.id };
      if (src.length !== 1) {
        out.push({ key: `goal-${g.id}`, text, blocked: src.length ? 'This goal has several savings items; change them on the basket.' : 'This goal has no savings item to change.', run: null, clear });
        continue;
      }
      const bucket = buckets.find((b) => b.id === src[0].bucketId);
      const raw = rawOf(src[0].bucketId, src[0].itemId);
      const rate = raw && bucket ? convert(1, ctx.display, itemCurrencyOf(raw, bucket), ctx.rates) : 1;
      out.push({ key: `goal-${g.id}`, text, blocked: null, run: () => updateDoc(bucketLineItemRef(uid, src[0].bucketId, src[0].itemId), { amount: Math.round(monthly * rate), updatedAt: serverTimestamp() }), clear });
    }
    for (const itemId of scenario.disabled) {
      const item = input.items.find((i) => i.id === itemId);
      if (!item?.source) continue;
      const src = item.source;
      const text = `Forgo ${item.name}`;
      if (src.recurring) out.push({ key: `off-${itemId}`, text, blocked: 'A repeating item is forgone only in the plan; skip its months instead.', run: null, clear: { disabled: itemId } });
      else out.push({ key: `off-${itemId}`, text, blocked: null, run: () => updateDoc(bucketLineItemRef(uid, src.bucketId, src.itemId), { status: 'dropped', completed: true, completedAt: serverTimestamp(), updatedAt: serverTimestamp() }), clear: { disabled: itemId } });
    }
    return out;
  }, [uid, view.run.occ, scenario, input, itemsByBucket, buckets, ctx]);

  const applyToRecords = useCallback(
    async (keys: string[]) => {
      const chosen = recordChanges.filter((c) => keys.includes(c.key) && c.run);
      let next = scenario;
      let done = 0;
      for (const c of chosen) {
        try {
          await c.run!();
          done += 1;
          if (c.clear.override) {
            const overrides = { ...next.overrides };
            delete overrides[c.clear.override];
            next = { ...next, overrides };
          }
          if (c.clear.goal) {
            const goalMonthly = { ...next.goalMonthly };
            delete goalMonthly[c.clear.goal];
            next = { ...next, goalMonthly };
          }
          if (c.clear.disabled) next = { ...next, disabled: next.disabled.filter((x) => x !== c.clear.disabled) };
        } catch {
          // Left in the plan; reported below.
        }
      }
      save(next);
      showToast(done === chosen.length ? `${done} change${done === 1 ? '' : 's'} applied to your records` : `${done} of ${chosen.length} changes applied. Try the rest again.`);
    },
    [recordChanges, scenario, save]
  );

  return {
    loading: plans.loading || store.loading,
    currency,
    input,
    scenario,
    view,
    store,
    actions,
    recordChanges,
    applyToRecords,
  };
}

export type MoneyPlanLogic = ReturnType<typeof useMoneyPlan>;
