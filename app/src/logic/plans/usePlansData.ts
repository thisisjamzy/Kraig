'use client';

// The data behind Buckets, Priorities and the Plans forecast — one hook so
// all three read the same figures. Built on the finance Insights data
// (useFinanceData): every month's budget comes from the same
// buildMonthBudget Planning uses (so what's "paid" matches the budget and
// the payments calendar), and each budget item is expanded into
// src/viewmodels/plans Occurrences. Also the writes these screens make:
// record a payment, postpone, drop, reorder, create a savings plan.

import { useMemo } from 'react';
import { Timestamp, arrayUnion, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFinanceData } from '@/src/logic/financeInsights/useFinanceData';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { bucketLineItemRef } from '@/src/shared/firestore/refs';
import { toDisplay } from '@/src/shared/firestore/currency';
import { itemOccurrence } from '@/src/shared/budget/monthBudget';
import { automationLabel, automationOf, expenseKindOf, savingsModeOf, type FlowType } from '@/src/shared/budget/flow';
import { skipItemMonth } from '@/src/shared/firestore/bucketBudget';
import {
  createBucket,
  createBucketLineItem,
  recordBucketLineItemPayment,
  setBucketLineItemRanks,
} from '@/src/shared/firestore/aggregation';
import { historyMonths, monthTotal } from '@/src/viewmodels/finance/metrics';
import { weightedAverage, type ForecastInput } from '@/src/viewmodels/plans/forecast';
import { monthKey, r2, shiftMonth, type Kind, type Occurrence } from '@/src/viewmodels/plans/model';
import { available } from '@/src/viewmodels/plans/overview';

/** Months of recurring occurrences built around today. */
const BACK = 11;
const AHEAD = 12;

function dueIn(month: string, anchor: Date | null): Date | null {
  if (!anchor) return null;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(anchor.getDate(), last));
}

export function usePlansData() {
  const fin = useFinanceData();
  const { data, buckets, itemsByBucket, categories, accounts, ctx, currency } = fin;
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const occurrences = useMemo<Occurrence[]>(() => {
    const today = data.today;
    const current = monthKey(today);
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const out: Occurrence[] = [];
    for (const bucket of buckets) {
      if (bucket.archived) continue;
      const bucketType = bucket.type ?? 'Expense';
      for (const item of itemsByBucket[bucket.id] ?? []) {
        const category = item.categoryId ? categoryById.get(item.categoryId) : undefined;
        const type = bucketType === 'Transfer' ? 'Transfer' : (category?.transactionType ?? bucketType);
        const recurring = bucket.kind === 'Fixed' && Boolean(item.recurrence) && item.recurrence!.frequency !== 'Once';
        const anchor = item.dueDate?.toDate() ?? null;
        // Expenses are fixed or variable by their own kind (flow.ts), not
        // by having a date: a monthly food limit is still variable.
        const kind: Kind =
          type === 'Income'
            ? 'income'
            : type === 'Savings'
              ? 'savings'
              : type === 'Transfer'
                ? 'transfer'
                : expenseKindOf(item, { categoryName: category?.name, recurring, hasDueDate: Boolean(anchor) });
        const need = item.necessity ? (item.necessity === 'MustHave' ? 'must' : 'nice') : kind === 'fixed' ? 'must' : 'nice';
        const priority = item.priority === 'Urgent' || item.priority === 'High' ? 'High' : item.priority === 'Low' ? 'Low' : 'Medium';
        // A one-off only in its own month; a repeating item around today.
        const months = recurring || !anchor
          ? Array.from({ length: BACK + AHEAD + 1 }, (_, i) => shiftMonth(current, i - BACK))
          : [monthKey(anchor)];
        for (const month of months) {
          const occurrence = itemOccurrence(item, month, bucket);
          if (!occurrence) continue;
          const key = `${item.id}@${month}`;
          const planItem = data.plan(month).items.find((i) => i.key === key);
          out.push({
            key,
            itemId: item.id,
            bucketId: bucket.id,
            bucketName: bucket.name,
            name: item.name,
            month,
            kind,
            need,
            priority,
            tag: category?.name ?? (type === 'Transfer' ? 'Transfer' : ''),
            due: recurring ? dueIn(month, anchor) : anchor,
            planned: r2(toDisplay(ctx, occurrence.planned, bucket.currency)),
            paid: planItem ? r2(Math.max(0, planItem.actual)) : 0,
            recurring,
            inPlan: bucket.kind !== 'Fixed' && Boolean(anchor) && kind !== 'variable' && kind !== 'income' && kind !== 'transfer',
            consequence: Boolean(item.penaltyIfLate),
            manualRank: item.rank ?? 0,
            postponed: Boolean(item.postponeHistory?.length),
            dropped: item.status === 'dropped',
            closed: (bucket.kind !== 'Fixed' && item.completed && item.status !== 'dropped') || Boolean(bucket.closedMonths?.[month]),
            accountId: item.accountId ?? null,
            automationText: automationLabel(automationOf(type as FlowType, item, type === 'Savings' ? savingsModeOf(item) : null)),
          });
        }
      }
    }
    return out;
  }, [buckets, itemsByBucket, categories, data, ctx]);

  // Money this month, and what the forecast needs from history.
  const money = useMemo(() => {
    const today = data.today;
    const month = monthKey(today);
    const received = monthTotal(data, month, 'income');
    const spent = monthTotal(data, month, 'expense') + monthTotal(data, month, 'savings');
    const avail = available(occurrences, received, spent, today);
    const hist = historyMonths(data, 6);
    const forecastInput: ForecastInput = {
      today,
      occurrences,
      availableNow: avail.now,
      irregularIncome: weightedAverage(hist.map((m) => monthTotal(data, m, 'income', (t) => !t.link))),
      incomeHistory: hist.map((m) => monthTotal(data, m, 'income')),
      variableHistory: hist.map((m) => monthTotal(data, m, 'expense', (t) => !t.fixed)),
      variablePlan: (m: string) => r2(occurrences.filter((o) => o.month === m && o.kind === 'variable').reduce((s, o) => s + o.planned, 0)),
      variableSpentThisMonth: monthTotal(data, month, 'expense', (t) => !t.fixed),
      historyMonths: hist.length,
    };
    return { received, spent, available: avail, forecastInput };
  }, [data, occurrences]);

  // ---- Writes ----
  const bucketById = new Map(buckets.map((b) => [b.id, b]));
  const itemOf = (o: Occurrence) => (itemsByBucket[o.bucketId] ?? []).find((i) => i.id === o.itemId);

  /** Moves a one-off to a new date (with the reason), or skips this month of a repeating one. */
  async function postpone(o: Occurrence, to: Date, reason: string) {
    if (!uid) return;
    if (o.recurring) {
      await skipItemMonth(uid, o.bucketId, o.itemId, o.month);
      return;
    }
    await updateDoc(bucketLineItemRef(uid, o.bucketId, o.itemId), {
      dueDate: Timestamp.fromDate(to),
      postponeHistory: arrayUnion({ fromDate: o.due ? Timestamp.fromDate(o.due) : null, toDate: Timestamp.fromDate(to), reason, at: Timestamp.now() }),
      updatedAt: serverTimestamp(),
    });
  }

  /** Not buying it after all: a one-off closes as dropped; a repeating one skips this month. */
  async function drop(o: Occurrence) {
    if (!uid) return;
    if (o.recurring) {
      await skipItemMonth(uid, o.bucketId, o.itemId, o.month);
      return;
    }
    await updateDoc(bucketLineItemRef(uid, o.bucketId, o.itemId), {
      status: 'dropped',
      completed: true,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function saveOrder(list: Occurrence[]) {
    if (!uid) return;
    const seen = new Set<string>();
    const ranks = list.filter((o) => !seen.has(o.itemId) && seen.add(o.itemId)).map((o, index) => ({ goalId: o.bucketId, lineItemId: o.itemId, rank: index }));
    await setBucketLineItemRanks(uid, ranks);
  }

  /** Records a real payment against the item (same write as the bucket page). */
  async function recordPayment(o: Occurrence, amount: number, accountId: string, fullyPaid: boolean) {
    if (!uid) return;
    const item = itemOf(o);
    const bucket = bucketById.get(o.bucketId);
    if (!item || !bucket) throw new Error('This item could not be found.');
    const category = item.categoryId ? categories.find((c) => c.id === item.categoryId) : undefined;
    await recordBucketLineItemPayment(
      uid,
      o.bucketId,
      o.itemId,
      amount,
      fullyPaid,
      {
        accountId,
        categoryId: item.categoryId ?? null,
        date: new Date(),
        description: item.name,
        categoryType: (category?.transactionType ?? 'Expense') as 'Expense' | 'Savings' | 'Income',
        occurrenceMonth: o.month,
      },
      ctx
    );
  }

  /** "Create savings plan": a Fixed Savings bucket with one monthly item per plan. */
  async function createSavingsPlan(rows: { name: string; amount: number }[]) {
    if (!uid) return;
    const savingsCategory = categories.find((c) => c.transactionType === 'Savings');
    if (!savingsCategory) throw new Error('Add a Savings category first.');
    const bucketId = await createBucket(uid, {
      name: 'Plan savings',
      description: 'Monthly set-asides suggested by the Plans forecast.',
      deadline: null,
      currency: ctx.display,
      kind: 'Fixed',
      type: 'Savings',
    });
    const now = new Date();
    for (const row of rows) {
      if (row.amount <= 0) continue;
      await createBucketLineItem(uid, bucketId, 'Fixed', {
        name: `Set aside: ${row.name}`,
        description: '',
        amount: Math.ceil(row.amount),
        priority: 'Medium',
        necessity: 'MustHave',
        categoryId: savingsCategory.id,
        categoryType: 'Savings',
        accountId: null,
        dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        recurrence: { frequency: 'Monthly', interval: 1 },
      });
    }
    return bucketId;
  }

  return {
    loading: fin.loading,
    currency,
    data,
    buckets,
    accounts,
    occurrences,
    itemsByBucket,
    ctx,
    money,
    today: data.today,
    postpone,
    drop,
    saveOrder,
    recordPayment,
    createSavingsPlan,
  };
}

export type PlansData = ReturnType<typeof usePlansData>;
