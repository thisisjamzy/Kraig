'use client';

// Keeps users/{uid}/notifications in step with the household's money and
// time, while the app is open (no Cloud Functions). It gathers facts from
// the same modules the pages use (this month's budget, the Ready to pay
// queue, debts, the plan snapshot, tasks and projects, calendar sync), runs
// the pure rules (src/shared/notifications/rules.ts), and writes only what
// reconcile.ts says changed. It runs on app open, whenever any of those
// facts change (a sync, a payment recorded, a task done, a plan applied),
// and each minute for time-based rules (the morning summary, due today).
// New notifications whose type is set to push also send a push.

import { useEffect, useMemo, useRef } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { debtsRef, planSnapshotRef } from '@/src/shared/firestore/refs';
import { useReadyToPay } from '@/src/shared/hooks/useReadyToPay';
import { fromStored } from '@/src/shared/firestore/storedDates';
import { toDisplay } from '@/src/shared/firestore/currency';
import { applyNotificationWrites } from '@/src/shared/firestore/notificationWrites';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useNotifications } from '@/src/shared/hooks/useNotifications';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { monthPaceGuide } from '@/src/shared/budget/pace';
import { useCalendarSyncStatus, describeSyncError } from '@/src/shared/calendarSync/status';
import { computeCached, useInsightsSources } from '@/src/shared/insights/useInsightsData';
import { insightTasks } from '@/src/shared/insights/adapter';
import { notify } from '@/src/shared/insights/notify';
import { evaluateRules, type MoneyFacts, type NotificationFacts } from '@/src/shared/notifications/rules';
import { reconcileNotifications } from '@/src/shared/notifications/reconcile';
import type { PlanSnapshot } from '@/src/shared/notifications/types';
import { useBudgetMonth } from '@/src/logic/budgetMonth/useLogic';
import { rangeFor } from '@/src/viewmodels/insights/dates';
import { nextPayment } from '@/src/viewmodels/debt';
import type { FirestoreDebt, FirestoreTask } from '@/src/shared/firestore/types';
import { budgetFacts, timeFacts } from './facts';

export function NotificationsRunner() {
  const { uid, notifications, prefs, loading: notificationsLoading } = useNotifications();
  const month = monthKeyOf(new Date());

  // ---- Money ----
  const data = useMonthBudget(uid ? month : null);
  const budgetMonth = useBudgetMonth(month, data);
  // Ready to pay, derived from the current items: an item edit, delete or
  // new funding source updates or resolves these through their dedupe keys.
  const readyQueue = useReadyToPay();
  const queue = readyQueue.entries;
  const queueLoading = readyQueue.loading;
  const { data: debts, loading: debtsLoading } = useFirestoreCollection<FirestoreDebt>(
    useMemo(() => (uid ? query(debtsRef(uid), where('archivedAt', '==', null)) : null), [uid])
  );
  const { data: snapshotDoc } = useFirestoreDoc<Record<string, unknown>>(useMemo(() => (uid ? planSnapshotRef(uid) : null), [uid]));

  // ---- Time and system ----
  const time = useInsightsSources();
  const sync = useCalendarSyncStatus();

  const facts = useMemo((): NotificationFacts | null => {
    if (!uid || data.loading || budgetMonth.loading || queueLoading || debtsLoading || time.loading) return null;
    const now = new Date(time.minute * 60000);
    const { ctx } = data;
    const display = (amount: number, currency: string) => toDisplay(ctx, amount, currency);

    const b = budgetFacts(budgetMonth.rows, month, now);
    const unassigned = [...data.transactionsById.values()]
      .filter((t) => t.type === 'Expense' && t.direction === 'Outflow' && !t.bucketItem && (t.month ?? monthKeyOf(t.date.toDate())) === month)
      .map((t) => ({ id: t.id, label: t.description || 'Expense', amount: display(t.amount, data.accounts.find((a) => a.id === t.accountId)?.currency ?? ctx.base), date: t.date.toDate() }));
    // Income received, with what it made ready to pay: from the queue.
    const byIncome = new Map<string, { name: string; amount: number; count: number }>();
    for (const q of queue) {
      if (q.trigger.kind !== 'income' || !q.trigger.incomeKey) continue;
      const entry = byIncome.get(q.trigger.incomeKey) ?? { name: q.trigger.incomeName ?? 'Income', amount: q.trigger.incomeAmount ?? 0, count: 0 };
      entry.count += 1;
      byIncome.set(q.trigger.incomeKey, entry);
    }
    const snapshot = snapshotDoc ? (fromStored(snapshotDoc) as PlanSnapshot) : null;
    const pace = monthPaceGuide({ budget: data.budget, totals: data.totals, transactions: data.transactionsById.values(), accounts: data.accounts, ctx, today: now });
    const must = budgetMonth.must;
    const waitingFor = [...new Set([...budgetMonth.coverage.byKey.values()].map((c) => c.waitsFor).filter((x): x is string => Boolean(x)))];

    const money: MoneyFacts = {
      currency: ctx.display,
      month,
      lines: b.lines,
      overspends: b.overspends,
      leftovers: b.leftovers,
      mustHaves: must.count ? { status: must.status, count: must.count, due: must.due, short: Math.max(0, -must.spareByMonthEnd), waitingFor } : null,
      readyToPay: queue.map((q) => ({ id: q.id, name: q.name, amount: q.amount })),
      incomeReceived: [...byIncome].map(([key, v]) => ({ key, name: v.name, amount: v.amount, readyCount: v.count })),
      monthReview: budgetMonth.banner ? { month, text: budgetMonth.banner } : null,
      unassigned,
      reconcile: snapshot?.reconcile ?? [],
      debts: debts
        .filter((d) => d.currentBalance > 0 && d.paymentPlan.type === 'recurring' && d.paymentPlan.recurring)
        .flatMap((d) => {
          const r = d.paymentPlan.recurring!;
          const next = nextPayment({
            amount: r.amount,
            interval: r.interval,
            nextPaymentDate: r.nextPaymentDate.toDate(),
            isActive: r.isActive,
            nextOverride: r.nextOverride ? { amount: r.nextOverride.amount, date: r.nextOverride.date.toDate() } : null,
          });
          return next ? [{ id: d.id, name: d.name, amount: display(Math.min(next.amount, d.currentBalance), d.currency), due: next.date }] : [];
        }),
      savingsBehind: b.savingsBehind,
      pace: pace ? { status: pace.status, message: pace.message ?? 'At this pace the month’s spending runs out early.' } : null,
      forecast: snapshot?.forecast ?? null,
    };

    const range = rangeFor('today', now);
    const tasks = insightTasks(time.taskDocs, range, now);
    const result = computeCached('notifications', time.taskDocs, time.projectDocs, time.settings, time.minute, 'week', null);
    const conflicts = (time.taskDocs as FirestoreTask[]).flatMap((t) =>
      // Same rule as the task's sync badge: a block that reached Google.
      (t.googleSync && t.googleSync.state !== 'pending' ? (t.googleSync.conflicts ?? []) : [])
        .filter((c) => new Date(c.start) >= now)
        .map((c) => ({ taskId: t.id, title: t.title, eventTitle: c.title, date: new Date(c.start) }))
    );

    const syncProblems = sync.disabled
      ? [{ key: sync.disabled, message: sync.disabled === 'FORBIDDEN' ? 'Google Calendar access was removed. Connect it again.' : 'Google Calendar isn’t set up correctly. Check the connection.' }]
      : sync.lastError && (!sync.lastSuccessAt || sync.lastError.at > sync.lastSuccessAt)
        ? [{ key: sync.lastError.code, message: describeSyncError(sync.lastError.code) }]
        : [];

    return {
      now,
      money,
      time: timeFacts({ tasks, projects: result.projects, settings: time.settings, now, summaryTime: prefs.summaryTime || null, conflicts }),
      system: { syncProblems },
    };
  }, [uid, data, budgetMonth, queue, queueLoading, debts, debtsLoading, snapshotDoc, time, sync, prefs.summaryTime, month]);

  // Reconcile and write. One write at a time; the next run sees the result.
  const writing = useRef(false);
  const pushed = useRef(new Set<string>());
  useEffect(() => {
    if (!uid || !facts || notificationsLoading || writing.current) return;
    const writes = reconcileNotifications(notifications, evaluateRules(facts), prefs, facts.now);
    if (!writes.length) return;
    writing.current = true;
    applyNotificationWrites(uid, writes)
      .then(() => {
        // A push for what's new (or newly unread), when its type asks for one.
        for (const w of writes) {
          if (w.op === 'delete' || pushed.current.has(w.id)) continue;
          const n = w.op === 'create' ? w.data : { ...notifications.find((x) => x.id === w.id)!, ...w.data };
          const fresh = w.op === 'create' || (w.data.readAt === null && w.data.resolvedAt === undefined);
          if (!fresh || !n.type || !prefs.push.includes(n.type)) continue;
          pushed.current.add(w.id);
          void notify(n.title, n.body, n.primaryAction?.route ?? '/notifications', w.id);
        }
      })
      .catch((error) => console.error('[notifications] writing failed', error))
      .finally(() => {
        writing.current = false;
      });
  }, [uid, facts, notifications, notificationsLoading, prefs]);

  return null;
}
