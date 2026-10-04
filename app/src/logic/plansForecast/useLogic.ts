'use client';

// Plan and forecast: a planning sandbox on the shared plan model
// (usePlanModel.ts). The forecast chart, the month board and the backlog
// all read the draft; nothing reaches the budget until "Apply plan", which
// writes each change with the usual rules (a recurring line's month-only
// change or skip, a one-off's new date, a split's linked lines), records it
// in settings/planLog and clears the draft. "Discard draft" restores the
// plan exactly. Auto-allocate's placements are suggestions on top of the
// draft until accepted. While the page is open it keeps the plan snapshot
// (what the forecast notifications read) in step with the applied plan.

import { useEffect, useMemo, useState } from 'react';
import { arrayUnion, doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { bucketLineItemRef } from '@/src/shared/firestore/refs';
import { convert } from '@/src/shared/firestore/currency';
import { createBucket, createBucketLineItem } from '@/src/shared/firestore/aggregation';
import { editMonthLine, skipItemMonth, updateItemFields, type EditScope } from '@/src/shared/firestore/bucketBudget';
import { savePlanSnapshot } from '@/src/shared/firestore/notificationWrites';
import { monthLabel } from '@/src/viewmodels/plans/model';
import { addChange, dueIn, moveBlocked, type PlanChange, type PlanLine } from '@/src/viewmodels/plans/planDraft';
import { cushionState, runEngine, type EngineScenario } from '@/src/viewmodels/plans/engine';
import { autoAllocate, bestMonth, dropEffect, splitParts, waitingGain, type DropEffect } from '@/src/viewmodels/plans/allocate';
import { usePlanModel, type Horizon } from './usePlanModel';

interface LogDoc {
  entries?: { at: Timestamp; summary: string[] }[];
}

const WANT_BUCKET = 'Want to buy';

export function useLogic() {
  const model = usePlanModel();
  const { plans, uid, lines, drafted, planLines, changes, suggestions, saveDraft, income, months, current, today, forecast, draftInput, cushion } = model;
  const { occurrences, buckets, itemsByBucket, ctx, currency } = plans;
  const logRef = useMemo(() => (uid ? doc(getFirebaseFirestore(), 'users', uid, 'settings', 'planLog') : null), [uid]);
  const { data: logDoc } = useFirestoreDoc<LogDoc>(logRef);
  const [error, setError] = useState<string | null>(null);

  // Keep the snapshot's forecast in step with the applied plan (debounced).
  const factsKey = JSON.stringify(model.forecastFacts);
  useEffect(() => {
    if (!uid || model.loading) return;
    const id = window.setTimeout(() => {
      void savePlanSnapshot(uid, { computedAt: new Date(), forecast: model.forecastFacts }).catch(() => undefined);
    }, 2500);
    return () => window.clearTimeout(id);
    // factsKey stands for the facts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, model.loading, factsKey]);

  const lineByKey = (key: string) => planLines.find((l) => l.key === key) ?? drafted.find((l) => l.key === key) ?? lines.find((l) => l.key === key) ?? null;
  const toEngineLine = (l: PlanLine) => ({ key: l.key, name: l.name, kind: l.kind, need: l.need, month: l.month, due: l.due, amount: l.amount });

  async function change(next: PlanChange) {
    setError(null);
    await saveDraft({ changes: addChange(changes, next) });
  }

  /** Why a line can't go to that month, or null. */
  function blockedReason(line: PlanLine, toMonth: string | null): string | null {
    if (line.paid) return 'It’s already paid.';
    const income = moveBlocked(line, toMonth, model.income);
    if (income) return income;
    if (toMonth && line.notBefore && toMonth < line.notBefore) return `${line.name} can't go before ${monthLabel(line.notBefore, true)}.`;
    return null;
  }

  /** What dropping a line into a month does to the cushion (the friction popover). */
  function effectOf(key: string, toMonth: string): DropEffect | null {
    const line = lineByKey(key);
    if (!line) return null;
    return dropEffect(draftInput, toEngineLine(line), toMonth);
  }

  async function move(key: string, toMonth: string | null, options: { scope?: EditScope; date?: string | null } = {}) {
    const line = lineByKey(key);
    if (!line) return;
    const blocked = blockedReason(line, toMonth);
    if (blocked) throw new Error(blocked);
    await change({ type: 'move', key, toMonth, ...(options.scope ? { scope: options.scope } : {}), ...(options.date ? { date: options.date } : {}) });
  }

  async function split(key: string, count: number, startMonth: string) {
    const line = lineByKey(key);
    if (!line) return;
    await change({ type: 'split', key, parts: splitParts(line.amount, count, startMonth) });
  }

  // ---- Auto-allocate ----
  async function runAutoAllocate() {
    setError(null);
    const result = autoAllocate(draftInput, model.candidatesOf(drafted));
    const byKey = new Map(drafted.map((l) => [l.key, l]));
    await saveDraft({ suggestions: result.placements.map((p) => ({ ...p, name: byKey.get(p.key)?.name ?? '' })) });
    return result;
  }
  function suggestionToChange(key: string): PlanChange | null {
    const s = suggestions.find((x) => x.key === key);
    if (!s) return null;
    return s.parts.length > 1 ? { type: 'split', key, parts: s.parts } : { type: 'move', key, toMonth: s.parts[0].month };
  }
  async function acceptSuggestions(keys?: string[]) {
    const accept = keys ?? suggestions.map((s) => s.key);
    let next = changes;
    for (const key of accept) {
      const c = suggestionToChange(key);
      if (c) next = addChange(next, c);
    }
    await saveDraft({ changes: next, suggestions: suggestions.filter((s) => !accept.includes(s.key)) });
  }
  async function rejectSuggestions(keys?: string[]) {
    await saveDraft({ suggestions: keys ? suggestions.filter((s) => !keys.includes(s.key)) : [] });
  }

  // ---- Want to buy (saved at once: a backlog item, not a plan change) ----
  async function addWantToBuy(input: { name: string; amount: number; need: 'must' | 'nice'; neededBy: string | null; splittable: boolean }) {
    if (!uid) return;
    let bucket = buckets.find((b) => !b.archived && b.name === WANT_BUCKET && (b.type ?? 'Expense') === 'Expense');
    let bucketId = bucket?.id;
    if (!bucketId) {
      bucketId = await createBucket(uid, { name: WANT_BUCKET, description: 'Things to buy when they fit the plan.', deadline: null, currency: ctx.display, kind: 'Variable', type: 'Expense' });
    }
    bucket = buckets.find((b) => b.id === bucketId);
    const id = await createBucketLineItem(uid, bucketId, 'Variable', {
      name: input.name,
      description: '',
      amount: convert(input.amount, ctx.display, bucket?.currency ?? ctx.display, ctx.rates),
      priority: 'Medium',
      necessity: input.need === 'must' ? 'MustHave' : 'NiceToHave',
      categoryId: '',
      categoryType: 'Expense',
      accountId: null,
      dueDate: null,
      recurrence: null,
    });
    const [y, m] = (input.neededBy ?? '').split('-').map(Number);
    await updateItemFields(uid, bucketId, id, {
      source: 'want_to_buy',
      splittable: input.splittable,
      neededBy: input.neededBy ? Timestamp.fromDate(new Date(y, m - 1, 1)) : null,
    });
  }

  // ---- Applying ----
  const [applying, setApplying] = useState(false);
  const toBucket = (amount: number, bucketId: string) => convert(amount, ctx.display, buckets.find((b) => b.id === bucketId)?.currency ?? ctx.display, ctx.rates);
  const occurrenceOf = (key: string) => occurrences.find((o) => o.key === key) ?? null;

  async function apply() {
    if (!uid || !changes.length) return;
    setApplying(true);
    setError(null);
    const summary: string[] = [];
    try {
      for (const c of changes) {
        const base = lines.find((l) => l.key === c.key);
        if (!base) continue;
        const o = occurrenceOf(c.key);
        const ref = bucketLineItemRef(uid, base.bucketId, base.itemId);
        if (c.type === 'move') {
          // A line with no date of its own lands on the 15th.
          const due = c.toMonth ? (c.date ? new Date(`${c.date}T00:00:00`) : dueIn(c.toMonth, base.due ?? new Date(2000, 0, 15))) : null;
          if (base.recurring && base.month) {
            await skipItemMonth(uid, base.bucketId, base.itemId, base.month);
            const target = c.toMonth ? occurrences.find((x) => x.itemId === base.itemId && x.month === c.toMonth) : null;
            if (c.scope !== 'future' && c.toMonth && target) {
              await editMonthLine(uid, base.bucketId, base.itemId, c.toMonth, { amount: toBucket(target.planned + base.amount, base.bucketId) }, 'month', {
                amount: toBucket(target.planned, base.bucketId),
                due: target.due,
                recurring: true,
              });
            }
          } else {
            await updateDoc(ref, { dueDate: due ? Timestamp.fromDate(due) : null, updatedAt: serverTimestamp() });
          }
          summary.push(`${base.name}: moved to ${c.toMonth ? monthLabel(c.toMonth, true) : 'the backlog'}`);
        } else if (c.type === 'amount') {
          if (base.month) {
            const paid = o ? o.paid : 0;
            await editMonthLine(uid, base.bucketId, base.itemId, base.month, { amount: toBucket(c.amount + paid, base.bucketId) }, c.scope ?? 'month', {
              amount: toBucket(o?.planned ?? base.amount, base.bucketId),
              due: base.due,
              recurring: base.recurring,
            });
          } else {
            await updateItemFields(uid, base.bucketId, base.itemId, { amount: toBucket(c.amount, base.bucketId) });
          }
          summary.push(`${base.name}: amount ${Math.round(c.amount).toLocaleString('en-US')}`);
        } else if (c.type === 'drop') {
          if (base.recurring && base.month) await skipItemMonth(uid, base.bucketId, base.itemId, base.month);
          else if (o) await plans.drop(o);
          else await updateItemFields(uid, base.bucketId, base.itemId, { status: 'dropped', completed: true });
          summary.push(`${base.name}: dropped`);
        } else if (c.type === 'account') {
          await updateItemFields(uid, base.bucketId, base.itemId, { accountId: c.accountId });
          summary.push(`${base.name}: paid from another account`);
        } else if (c.type === 'priority') {
          await updateItemFields(uid, base.bucketId, base.itemId, {
            ...(c.need ? { necessity: c.need === 'must' ? 'MustHave' : 'NiceToHave' } : {}),
            ...(c.priority ? { priority: c.priority } : {}),
          });
          summary.push(`${base.name}: ${[c.need === 'must' ? 'must have' : c.need === 'nice' ? 'nice to have' : null, c.priority?.toLowerCase()].filter(Boolean).join(', ')}`);
        } else if (c.type === 'split') {
          const [first, ...rest] = c.parts;
          if (!first) continue;
          const groupId = crypto.randomUUID();
          const count = c.parts.length;
          if (base.recurring && base.month) {
            await editMonthLine(uid, base.bucketId, base.itemId, base.month, { amount: toBucket(first.amount, base.bucketId) }, 'month', {
              amount: toBucket(o?.planned ?? base.amount, base.bucketId),
              due: base.due,
              recurring: true,
            });
          } else {
            await updateDoc(ref, {
              name: `${base.name}, 1 of ${count}`,
              amount: toBucket(first.amount, base.bucketId),
              dueDate: Timestamp.fromDate(dueIn(first.month, base.due)),
              splitGroupId: groupId,
              updatedAt: serverTimestamp(),
            });
          }
          const bucket = buckets.find((b) => b.id === base.bucketId);
          for (const [i, part] of rest.entries()) {
            const id = await createBucketLineItem(uid, base.bucketId, 'Variable', {
              name: `${base.name}, ${i + 2} of ${count}`,
              description: '',
              amount: toBucket(part.amount, base.bucketId),
              priority: base.priority,
              necessity: base.need === 'must' ? 'MustHave' : 'NiceToHave',
              categoryId: itemsByBucket[base.bucketId]?.find((x) => x.id === base.itemId)?.categoryId ?? '',
              categoryType: bucket?.type ?? 'Expense',
              accountId: base.accountId,
              dueDate: dueIn(part.month, base.due),
              recurrence: null,
            });
            await updateItemFields(uid, base.bucketId, id, { splitGroupId: groupId, source: base.source ?? 'plan_item' });
          }
          summary.push(`${base.name}: split into ${count} payments`);
        }
      }
      if (logRef) await setDoc(logRef, { entries: arrayUnion({ at: Timestamp.now(), summary }) }, { merge: true });
      await saveDraft({ changes: [], suggestions: [] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the plan.');
    } finally {
      setApplying(false);
    }
  }

  // ---- What the page shows ----
  const lowest = forecast.lowest;
  const board = useMemo(
    () =>
      months.map((m) => {
        const engine = forecast.months.find((x) => x.month === m)!;
        const inMonth = planLines.filter((l) => l.month === m);
        return {
          month: m,
          engine,
          open: inMonth.filter((l) => !l.paid),
          paid: inMonth.filter((l) => l.paid),
          must: inMonth.filter((l) => l.need === 'must' && !l.paid).reduce((s, l) => s + l.amount, 0),
          nice: inMonth.filter((l) => l.need === 'nice' && !l.paid).reduce((s, l) => s + l.amount, 0),
          income: model.income.filter((i) => i.month === m),
          state: cushionState(engine.lowest, cushion),
        };
      }),
    [months, forecast, planLines, model.income, cushion]
  );
  const backlog = planLines.filter((l) => l.month === null);
  // A card that, as planned, pushes its month (or a later one) below the cushion.
  const dipping = useMemo(() => {
    const out = new Map<string, 'below' | 'zero'>();
    for (const b of forecast.breaches) {
      for (const l of planLines) if (l.month && l.month <= b.month && l.changed && !out.has(l.key)) out.set(l.key, b.belowZero ? 'zero' : 'below');
    }
    return out;
  }, [forecast, planLines]);

  /** "Waiting until January keeps 120,000 more cushion in November", when true. */
  function waitingText(line: PlanLine): string | null {
    if (line.need !== 'nice' || !line.month) return null;
    const later = months.filter((m) => m > line.month!).slice(1, 3);
    for (const m of later) {
      const g = waitingGain(draftInput, toEngineLine(line), m);
      if (g) return g.text;
    }
    return null;
  }

  const lastApplied = logDoc?.entries?.length ? logDoc.entries[logDoc.entries.length - 1].at.toDate() : null;

  return {
    loading: model.loading,
    currency,
    today,
    current,
    months,
    horizon: model.horizon,
    setHorizon: (h: Horizon) => saveDraft({ horizon: h }),
    scenario: model.scenario,
    setScenario: (s: EngineScenario) => saveDraft({ scenario: s }),
    cushion,
    cushionIsDefault: model.cushionIsDefault,
    setCushion: (amount: number | null) => saveDraft({ cushion: amount }),
    streak: model.streak,
    startBalance: model.startBalance,
    changes,
    hasDraft: changes.length > 0,
    lastApplied,
    forecast,
    applied: model.applied,
    lowest,
    lowestState: cushionState(lowest.balance, cushion),
    board,
    backlog,
    income,
    planLines,
    dipping,
    accounts: plans.accounts.filter((a) => !a.archived),
    // Changing the draft
    blockedReason,
    effectOf,
    bestMonthFor: (key: string) => {
      const line = lineByKey(key);
      return line ? bestMonth(draftInput, toEngineLine(line), line.notBefore && line.notBefore > current ? line.notBefore : current) : current;
    },
    draftInput,
    toEngineLine,
    move,
    toBacklog: (key: string) => change({ type: 'move', key, toMonth: null }),
    setAmount: (key: string, amount: number, scope?: EditScope) => change({ type: 'amount', key, amount, ...(scope ? { scope } : {}) }),
    setDate: (key: string, date: string) => {
      const line = lineByKey(key);
      return line?.month ? change({ type: 'move', key, toMonth: date.slice(0, 7), date }) : Promise.resolve();
    },
    setPriority: (key: string, patch: { need?: 'must' | 'nice'; priority?: 'High' | 'Medium' | 'Low' }) => change({ type: 'priority', key, ...patch }),
    setAccount: (key: string, accountId: string) => change({ type: 'account', key, accountId }),
    split,
    splitPreview: (key: string, count: number, startMonth: string) => {
      const line = lineByKey(key);
      if (!line) return null;
      const parts = splitParts(line.amount, count, startMonth);
      const others = draftInput.lines.filter((l) => l.key !== key);
      const extra = parts.map((p, i) => ({ ...toEngineLine(line), key: `${key}#${i}`, month: p.month, due: null, amount: p.amount }));
      const lowestAfter = Math.min(...runEngine({ ...draftInput, lines: [...others, ...extra] }).months.map((m) => m.lowest));
      return { parts, lowestAfter };
    },
    waitingText,
    suggestions,
    runAutoAllocate,
    acceptSuggestions,
    rejectSuggestions,
    addWantToBuy,
    discard: () => saveDraft({ changes: [], suggestions: [] }),
    apply,
    applying,
    error,
    setError,
  };
}

export type PlanForecastLogic = ReturnType<typeof useLogic>;
