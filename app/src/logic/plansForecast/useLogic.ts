'use client';

// Plan and forecast — where the money stands today, planning the next one
// or two months by moving budget lines between them, a daily spending
// amount that keeps the plan on track, and where it's heading.
//
// Every change is a DRAFT (settings/planDraft, saved as it's made, so it
// survives reloads) until "Apply plan" writes it to the budget with the
// usual exception rules (a recurring line's month-only change or skip, a
// one-off's new date), records it in settings/planLog, and clears the
// draft. "Discard draft" clears it. While there's a draft, every figure on
// the page is computed from it.

import { useMemo, useState } from 'react';
import { arrayUnion, doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { usePlansData } from '@/src/logic/plans/usePlansData';
import { bucketLineItemRef } from '@/src/shared/firestore/refs';
import { convert } from '@/src/shared/firestore/currency';
import { createBucketLineItem } from '@/src/shared/firestore/aggregation';
import { editMonthLine, skipItemMonth, updateItemFields, type EditScope } from '@/src/shared/firestore/bucketBudget';
import { dailyGuide, variableBudget, variableSpendByDay } from '@/src/shared/budget/dailyGuide';
import { isOpen, monthKey, monthLabel, remaining, shiftMonth, urgency, type Occurrence } from '@/src/viewmodels/plans/model';
import { planSchedule } from '@/src/viewmodels/plans/forecast';
import {
  addChange,
  applyDraft,
  dueIn,
  monthColumns,
  moveBlocked,
  runningBalance,
  SCENARIO_FACTOR,
  UNSCHEDULED,
  type IncomeLine,
  type PlanChange,
  type PlanLine,
  type PlanScenario,
} from '@/src/viewmodels/plans/planDraft';
import { isSavingsAccount } from '@/src/viewmodels/wallets';

interface DraftDoc {
  changes?: PlanChange[];
  horizon?: 2 | 3;
  scenario?: PlanScenario;
}
interface LogDoc {
  entries?: { at: Timestamp; summary: string[] }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function useLogic() {
  const plans = usePlansData();
  const { occurrences, today, money, data, currency, itemsByBucket, buckets, accounts, ctx } = plans;
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const draftRef = useMemo(() => (uid ? doc(getFirebaseFirestore(), 'users', uid, 'settings', 'planDraft') : null), [uid]);
  const logRef = useMemo(() => (uid ? doc(getFirebaseFirestore(), 'users', uid, 'settings', 'planLog') : null), [uid]);
  const { data: draftDoc } = useFirestoreDoc<DraftDoc>(draftRef);
  const { data: logDoc } = useFirestoreDoc<LogDoc>(logRef);

  const changes = useMemo(() => draftDoc?.changes ?? [], [draftDoc]);
  const horizon = draftDoc?.horizon ?? 2;
  const scenario = draftDoc?.scenario ?? 'expected';
  const factor = SCENARIO_FACTOR[scenario];

  async function saveDraft(patch: DraftDoc) {
    if (!draftRef) return;
    await setDoc(draftRef, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
  }

  const current = monthKey(today);
  const months = useMemo(() => Array.from({ length: horizon }, (_, i) => shiftMonth(current, i)), [current, horizon]);
  const lastPlanned = months[months.length - 1];

  // ---- Lines and income in the horizon ----
  const { lines, income } = useMemo(() => {
    const raw = new Map(Object.values(itemsByBucket).flat().map((i) => [i.id, i]));
    const scheduled: PlanLine[] = occurrences
      .filter((o) => (o.kind === 'fixed' || o.kind === 'variable' || o.kind === 'savings') && !o.dropped && isOpen(o) && o.month >= current && o.month <= lastPlanned)
      .map((o) => {
        const a = raw.get(o.itemId)?.automation;
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
          amount: remaining(o),
          accountId: o.accountId ?? null,
          recurring: o.recurring,
          incomeItemId: a?.mode === 'prepare' && a.trigger === 'income' ? (a.incomeItemId ?? null) : null,
        };
      });
    // Lines with no date: the Unscheduled column.
    const unscheduled: PlanLine[] = [];
    for (const bucket of buckets) {
      if (bucket.archived || bucket.type === 'Income' || bucket.type === 'Transfer') continue;
      for (const item of itemsByBucket[bucket.id] ?? []) {
        if (item.dueDate || item.completed || item.status === 'dropped') continue;
        unscheduled.push({
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
          amount: r2(convert(item.amount, bucket.currency, ctx.display, ctx.rates)),
          accountId: item.accountId ?? null,
          recurring: false,
          incomeItemId: null,
        });
      }
    }
    const incomeLines: IncomeLine[] = occurrences
      .filter((o) => o.kind === 'income' && !o.dropped && o.month >= current && o.month <= shiftMonth(current, horizon + 3))
      .map((o) => ({ key: o.key, itemId: o.itemId, name: o.name, month: o.month, amount: o.month === current ? remaining(o) : o.planned }));
    return { lines: [...scheduled, ...unscheduled], income: incomeLines };
  }, [occurrences, itemsByBucket, buckets, current, lastPlanned, horizon, ctx]);

  const applied = useMemo(() => applyDraft(lines, changes), [lines, changes]);
  const columns = useMemo(() => monthColumns(months, applied, income, today, factor), [months, applied, income, today, factor]);
  const unscheduledLines = applied.filter((l) => l.month === null);

  // ---- Where do I stand today? ----
  const spendable = accounts.filter((a) => !a.archived && !isSavingsAccount(a));
  const savingsAccounts = accounts.filter((a) => !a.archived && isSavingsAccount(a));
  const perAccount = [...spendable, ...savingsAccounts].map((a) => ({ id: a.id, name: a.name, savings: isSavingsAccount(a), amount: r2(convert(a.currentBalance, a.currency, ctx.display, ctx.rates)) }));
  const cash = r2(data.balance.spending);
  const savings = r2(data.balance.savings);
  const expectedNow = income.filter((i) => i.month === current && i.amount > 0);
  const stillExpected = r2(expectedNow.reduce((s, i) => s + i.amount, 0));
  const nowColumn = columns[0];
  const stillToPay = nowColumn ? nowColumn.plannedOut : 0;
  const overdue = r2(
    applied
      .filter((l) => l.month === current && l.due && urgency({ due: l.due, month: l.month }, today) === 'overdue')
      .reduce((s, l) => s + l.amount, 0)
  );
  const endOfMonth = r2(cash + stillExpected * factor - stillToPay);

  // ---- How much can I spend each day? ----
  const guide = useMemo(() => {
    const budget = data.budget?.(current);
    if (!budget) return null;
    const v = variableBudget(budget);
    // The draft's changes to this month's variable lines count too.
    const draftVariable = r2(applied.filter((l) => l.month === current && l.kind === 'variable').reduce((s, l) => s + l.amount, 0));
    const baseVariable = r2(lines.filter((l) => l.month === current && l.kind === 'variable').reduce((s, l) => s + l.amount, 0));
    const left = r2(Math.max(0, v.left + (draftVariable - baseVariable)));
    const expenses = data.txs.filter((t) => t.kind === 'expense').map((t) => ({ id: t.id, spend: t.amount, date: t.date, month: t.month }));
    return dailyGuide({
      today,
      variablePlanned: r2(v.planned + (draftVariable - baseVariable)),
      variableLeft: left,
      spentByDay: variableSpendByDay(budget, expenses),
      availableNow: money.available.now,
      expectedStill: stillExpected,
      fixedStillDue: r2(applied.filter((l) => l.month === current && l.kind !== 'variable').reduce((s, l) => s + l.amount, 0)),
      incomeFactor: factor,
    });
  }, [data, current, applied, lines, today, money.available.now, stillExpected, factor]);

  // ---- Where is this heading? ----
  const forecast = useMemo(() => {
    const later = Array.from({ length: 4 }, (_, i) => shiftMonth(lastPlanned, i + 1));
    const rows = [
      ...columns.map((c) => ({ month: c.month, expectedIncome: c.expectedIncome, plannedOut: c.plannedOut })),
      ...later.map((m) => ({
        month: m,
        expectedIncome: r2(occurrences.filter((o) => o.kind === 'income' && o.month === m && !o.dropped).reduce((s, o) => s + o.planned, 0) * factor),
        plannedOut: r2(occurrences.filter((o) => (o.kind === 'fixed' || o.kind === 'variable' || o.kind === 'savings') && o.month === m && !o.dropped).reduce((s, o) => s + o.planned, 0)),
      })),
    ];
    return runningBalance(cash, rows);
  }, [columns, occurrences, lastPlanned, factor, cash]);
  const leftOverPeriod = r2(columns.reduce((s, c) => s + c.left, 0));
  const schedule = useMemo(() => planSchedule(money.forecastInput, scenario), [money.forecastInput, scenario]);

  // ---- Changing the draft ----
  const [error, setError] = useState<string | null>(null);
  function lineByKey(key: string) {
    return applied.find((l) => l.key === key) ?? lines.find((l) => l.key === key) ?? null;
  }
  async function change(next: PlanChange) {
    setError(null);
    await saveDraft({ changes: addChange(changes, next) });
  }
  async function move(key: string, toMonth: string | null, scope?: EditScope) {
    const line = lineByKey(key);
    if (!line) return;
    const blocked = moveBlocked(line, toMonth, income);
    if (blocked) throw new Error(blocked);
    await change({ type: 'move', key, toMonth, ...(scope ? { scope } : {}) });
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
            await updateDoc(ref, { dueDate: c.toMonth ? Timestamp.fromDate(dueIn(c.toMonth, base.due)) : null, updatedAt: serverTimestamp() });
          }
          summary.push(`${base.name}: moved to ${c.toMonth ? monthLabel(c.toMonth, true) : 'Unscheduled'}`);
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
        } else if (c.type === 'split') {
          const [first, ...rest] = c.parts;
          if (!first) continue;
          if (base.recurring && base.month) {
            await editMonthLine(uid, base.bucketId, base.itemId, base.month, { amount: toBucket(first.amount, base.bucketId) }, 'month', {
              amount: toBucket(o?.planned ?? base.amount, base.bucketId),
              due: base.due,
              recurring: true,
            });
          } else {
            await updateDoc(ref, { amount: toBucket(first.amount, base.bucketId), dueDate: Timestamp.fromDate(dueIn(first.month, base.due)), updatedAt: serverTimestamp() });
          }
          const bucket = buckets.find((b) => b.id === base.bucketId);
          for (const part of rest) {
            await createBucketLineItem(uid, base.bucketId, 'Variable', {
              name: `${base.name} (${monthLabel(part.month)})`,
              description: '',
              amount: toBucket(part.amount, base.bucketId),
              priority: base.priority,
              necessity: base.need === 'must' ? 'MustHave' : 'NiceToHave',
              categoryId: itemsByBucket[base.bucketId]?.find((i) => i.id === base.itemId)?.categoryId ?? '',
              categoryType: bucket?.type ?? 'Expense',
              accountId: base.accountId,
              dueDate: dueIn(part.month, base.due),
              recurrence: null,
            });
          }
          summary.push(`${base.name}: split over ${c.parts.length} months`);
        }
      }
      if (logRef) await setDoc(logRef, { entries: arrayUnion({ at: Timestamp.now(), summary }) }, { merge: true });
      await saveDraft({ changes: [] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the plan.');
    } finally {
      setApplying(false);
    }
  }

  const lastApplied = logDoc?.entries?.length ? logDoc.entries[logDoc.entries.length - 1].at.toDate() : null;

  return {
    loading: plans.loading,
    currency,
    today,
    current,
    months,
    horizon,
    setHorizon: (h: 2 | 3) => saveDraft({ horizon: h }),
    scenario,
    setScenario: (s: PlanScenario) => saveDraft({ scenario: s }),
    changes,
    hasDraft: changes.length > 0,
    lastApplied,
    // where I stand
    cash,
    savings,
    perAccount,
    expectedNow,
    stillExpected,
    stillToPay,
    overdue,
    endOfMonth,
    // planning board
    applied,
    columns,
    unscheduledLines,
    income,
    accounts: spendable,
    move,
    setAmount: (key: string, amount: number, scope?: EditScope) => change({ type: 'amount', key, amount, ...(scope ? { scope } : {}) }),
    drop: (key: string) => change({ type: 'drop', key }),
    split: (key: string, parts: { month: string; amount: number }[]) => change({ type: 'split', key, parts }),
    setAccount: (key: string, accountId: string) => change({ type: 'account', key, accountId }),
    discard: () => saveDraft({ changes: [] }),
    apply,
    applying,
    error,
    setError,
    // daily guide
    guide,
    // forecast
    forecast,
    leftOverPeriod,
    schedule,
    occurrenceOf: (key: string): Occurrence | null => occurrenceOf(key),
  };
}

export type PlanForecastLogic = ReturnType<typeof useLogic>;
