'use client';

// Keeps the budget set up while the app is open — no Cloud Functions, so
// the client does it (same pattern as CalendarSyncRunner):
//   1. once per session, runs the flow-type migration and the baskets
//      migration (item kinds, basket cadences) if they haven't run yet;
//   2. sets up the current and next month (and any skipped since the last
//      visit) from the recurring items, once each (monthSetup.ts);
//   3. once, repairs the Ready to pay copies stored by older versions:
//      payments are derived from the current items now (occurrences.ts),
//      so nothing is prepared or copied as triggers fire;
//   4. "Remind me" lines get a push on their due date.
// Alerts (overdue, off pace, ...) are notifications now, written by
// src/widgets/Notifications/NotificationsRunner.tsx.
// Every step is idempotent, so two open devices can't double anything up.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDocs, query, where } from 'firebase/firestore';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketLineItemsRef, bucketsRef, categoriesRef, paymentQueueRef } from '@/src/shared/firestore/refs';
import { runFlowMigration } from '@/src/shared/firestore/flowMigration';
import { runBasketsMigration } from '@/src/shared/firestore/basketsMigration';
import { existingMonths, setUpMonths } from '@/src/shared/firestore/budgetMonths';
import { repairQueue } from '@/src/shared/firestore/paymentQueue';
import { showToast } from '@/src/widgets/Toast/Toast';
import { notify } from '@/src/shared/insights/notify';
import { monthKeyOf } from './monthBudget';
import { monthLines, monthsToSetUp } from './monthSetup';
import { deriveOccurrences } from './occurrences';
import type { FirestoreBucket, FirestoreBucketLineItem, FirestorePaymentQueueEntry } from '@/src/shared/firestore/types';

const REMINDED_KEY = 'dreda.budget.reminded';

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
        // Item kinds and basket cadences, stored once, with a review list.
        await runBasketsMigration(uid);
      } catch (error) {
        console.error('[budget] baskets migration failed', error);
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
  const { budget, loading, ctx } = useMonthBudget(ready ? month : null);
  const { data: queued, loading: queueLoading } = useFirestoreCollection<FirestorePaymentQueueEntry>(
    useMemo(() => (uid && ready ? query(paymentQueueRef(uid), where('month', '==', month)) : null), [uid, ready, month])
  );

  // The one-time repair of stored copies (a no-op once it has run).
  const repaired = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || !ready || loading || queueLoading || repaired.current === uid) return;
    repaired.current = uid;
    const occurrences = deriveOccurrences(budget, new Date(), new Map(queued.map((q) => [q.id, q])));
    repairQueue(uid, occurrences)
      .then((report) => {
        if (report) showToast(report);
      })
      .catch((error) => console.error('[budget] Ready to pay repair failed', error));
  }, [uid, ready, loading, queueLoading, budget, queued]);

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

  return null;
}
