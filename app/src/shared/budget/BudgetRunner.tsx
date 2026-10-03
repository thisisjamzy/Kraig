'use client';

// Keeps the budget set up while the app is open — no Cloud Functions, so
// the client does it (same pattern as CalendarSyncRunner):
//   1. once per session, runs the flow-type migration if it hasn't run yet;
//   2. sets up the current and next month (and any skipped since the last
//      visit) from the recurring items, once each (monthSetup.ts);
//   3. watches this month's budget and prepares payments in the Ready to
//      pay queue as their triggers fire (automation.ts) — an income line
//      received, any income received, or a due date reached;
//   4. "Remind me" lines get a notification on their due date;
//   5. once a day, a notification when day-to-day spending is off track
//      (dailyGuide.ts, the same figures as Plan and forecast).
// Every step is idempotent, so two open devices can't double anything up.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDocs, query, where } from 'firebase/firestore';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketLineItemsRef, bucketsRef, categoriesRef, paymentQueueRef } from '@/src/shared/firestore/refs';
import { runFlowMigration } from '@/src/shared/firestore/flowMigration';
import { existingMonths, setUpMonths } from '@/src/shared/firestore/budgetMonths';
import { queuePayments } from '@/src/shared/firestore/paymentQueue';
import { notify } from '@/src/shared/insights/notify';
import { toDisplay } from '@/src/shared/firestore/currency';
import { dailyGuide, dayKey, variableBudget, variableSpendByDay } from './dailyGuide';
import { monthKeyOf } from './monthBudget';
import { monthLines, monthsToSetUp } from './monthSetup';
import { preparePayments } from './automation';
import type { FirestoreBucket, FirestoreBucketLineItem, FirestorePaymentQueueEntry } from '@/src/shared/firestore/types';

const REMINDED_KEY = 'dreda.budget.reminded';
const OFF_TRACK_KEY = 'dreda.budget.offTrackNotified';

async function setUpOpenMonths(uid: string) {
  const have = await existingMonths(uid);
  const last = have.length ? [...have].sort().at(-1)! : null;
  const months = monthsToSetUp(new Date(), have, last);
  if (!months.length) return;
  const [bucketSnap, categorySnap] = await Promise.all([getDocs(bucketsRef(uid)), getDocs(categoriesRef(uid))]);
  const buckets = bucketSnap.docs.map((d) => ({ ...(d.data() as FirestoreBucket), id: d.id }));
  const itemsByBucket: Record<string, (FirestoreBucketLineItem & { id: string })[]> = {};
  await Promise.all(
    buckets.map(async (b) => {
      const snap = await getDocs(bucketLineItemsRef(uid, b.id));
      itemsByBucket[b.id] = snap.docs.map((d) => ({ ...(d.data() as FirestoreBucketLineItem), id: d.id }));
    })
  );
  const categories = new Map(categorySnap.docs.map((d) => [d.id, { transactionType: d.data().transactionType }]));
  await setUpMonths(
    uid,
    months.map((month) => ({ month, lines: monthLines(month, buckets, itemsByBucket, categories) }))
  );
}

export function BudgetRunner() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [ready, setReady] = useState(false);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || started.current === uid) return;
    started.current = uid;
    (async () => {
      try {
        await runFlowMigration(uid);
      } catch (error) {
        console.error('[budget] flow-type migration failed', error);
      }
      try {
        await setUpOpenMonths(uid);
      } catch (error) {
        console.error('[budget] month setup failed', error);
      }
      setReady(true);
    })();
  }, [uid]);

  const month = monthKeyOf(new Date());
  const { budget, totals, transactionsById, accounts, loading, ctx } = useMonthBudget(ready ? month : null);
  const { data: queued, loading: queueLoading } = useFirestoreCollection<FirestorePaymentQueueEntry>(
    useMemo(() => (uid && ready ? query(paymentQueueRef(uid), where('month', '==', month)) : null), [uid, ready, month])
  );

  // Prepare payments whose trigger has fired.
  const writing = useRef(false);
  useEffect(() => {
    if (!uid || !ready || loading || queueLoading || writing.current) return;
    const drafts = preparePayments(budget, new Date(), new Set(queued.map((q) => q.id)));
    if (!drafts.length) return;
    writing.current = true;
    queuePayments(uid, drafts, ctx.display)
      .catch((error) => console.error('[budget] preparing payments failed', error))
      .finally(() => {
        writing.current = false;
      });
  }, [uid, ready, loading, queueLoading, budget, queued, ctx.display]);

  // "Remind me": once per line, on its due date.
  useEffect(() => {
    if (!ready || loading) return;
    const today = new Date();
    const day = today.toDateString();
    let reminded: Record<string, string> = {};
    try {
      reminded = JSON.parse(localStorage.getItem(REMINDED_KEY) ?? '{}');
    } catch {
      reminded = {};
    }
    let changed = false;
    for (const entry of budget.items) {
      if (entry.automation.mode !== 'remind' || !entry.due || entry.closed) continue;
      if (entry.due.toDateString() !== day || entry.actual >= entry.available - 0.5 || reminded[entry.key]) continue;
      reminded[entry.key] = day;
      changed = true;
      void notify(`${entry.name} is due today`, `${Math.round(entry.available - entry.actual).toLocaleString('en-US')} ${ctx.display} · ${entry.bucketName}`, `/budget/item/${entry.bucketId}/${entry.itemId}?month=${entry.month}`, `due-${entry.key}`);
    }
    if (changed) {
      try {
        localStorage.setItem(REMINDED_KEY, JSON.stringify(reminded));
      } catch {
        // Not remembered: it may remind again, which is harmless.
      }
    }
  }, [ready, loading, budget, ctx.display]);

  // Off track: at most one notification a day.
  const offTrackDay = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || loading) return;
    const today = new Date();
    const day = dayKey(today);
    if (offTrackDay.current === day) return;
    try {
      if (localStorage.getItem(OFF_TRACK_KEY) === day) return;
    } catch {
      // Not remembered: checked again next time, still at most once per session.
    }
    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
    const expenses = [...transactionsById.values()]
      .filter((t) => t.type === 'Expense')
      .map((t) => ({
        id: t.id,
        spend: toDisplay(ctx, t.direction === 'Outflow' ? t.amount : -t.amount, currencyOf.get(t.accountId) ?? ctx.base),
        date: t.date.toDate(),
        month: t.month ?? monthKeyOf(t.date.toDate()),
      }));
    const variable = variableBudget(budget);
    if (variable.planned <= 0) return;
    const fixedStillDue = budget.items
      .filter((i) => !i.archived && !i.closed && ((i.type === 'Expense' && i.expenseKind !== 'variable') || i.type === 'Savings'))
      .reduce((s, i) => s + Math.max(0, i.available - i.actual), 0);
    const guide = dailyGuide({
      today,
      variablePlanned: variable.planned,
      variableLeft: variable.left,
      spentByDay: variableSpendByDay(budget, expenses),
      availableNow: totals.availableNow,
      expectedStill: totals.income.notYetReceived,
      fixedStillDue,
    });
    if (guide.status !== 'off_track' || !guide.message) return;
    offTrackDay.current = day;
    try {
      localStorage.setItem(OFF_TRACK_KEY, day);
    } catch {
      // See above.
    }
    void notify('Spending is off track', guide.message, '/buckets/forecast', `off-track-${day}`);
  }, [ready, loading, budget, totals, transactionsById, accounts, ctx]);

  return null;
}
