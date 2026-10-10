// Notifications: the rules (batching, keys, words), reconcile (dedupe,
// update, resolve, mute, purge), the inbox order and the app-open prompt.
// Run: npx tsx --test test/notifications.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRules, type FactLine, type MoneyFacts, type NotificationFacts, type TimeFacts } from '../app/src/shared/notifications/rules';
import { reconcileNotifications, type NotificationWrite } from '../app/src/shared/notifications/reconcile';
import { afterPrompt, comparePriority, dayGroup, inView, promptText, shouldPrompt, unreadCount } from '../app/src/shared/notifications/inbox';
import { notificationId, type StoredNotification } from '../app/src/shared/notifications/types';

const LONG_DASH = /[–—]/;
const EMOJI = /\p{Extended_Pictographic}/u;
// Saturday 3 October 2026, 10:00.
const now = new Date(2026, 9, 3, 10, 0);

function line(i: number, patch: Partial<FactLine> = {}): FactLine {
  return {
    key: `item${i}@2026-10`,
    bucketId: 'b1',
    itemId: `item${i}`,
    name: `Bill ${i}`,
    type: 'Expense',
    state: 'Overdue',
    left: 40_000 + i * 1000,
    due: new Date(2026, 9, 1),
    necessity: 'MustHave',
    closed: false,
    ...patch,
  };
}

function money(patch: Partial<MoneyFacts> = {}): MoneyFacts {
  return {
    currency: 'XAF',
    month: '2026-10',
    lines: [],
    overspends: [],
    leftovers: [],
    mustHaves: null,
    readyToPay: [],
    incomeReceived: [],
    monthReview: null,
    unassigned: [],
    reconcile: [],
    debts: [],
    savingsBehind: [],
    pace: null,
    forecast: null,
    ...patch,
  };
}

const facts = (m: Partial<MoneyFacts> = {}, t: TimeFacts | null = null): NotificationFacts => ({ now, money: money(m), time: t, system: null });

/** A tiny store: applies writes to a list. */
function apply(stored: StoredNotification[], writes: NotificationWrite[]): StoredNotification[] {
  const map = new Map(stored.map((n) => [n.id, n]));
  for (const w of writes) {
    if (w.op === 'create') map.set(w.id, w.data);
    else if (w.op === 'update') map.set(w.id, { ...map.get(w.id)!, ...w.data });
    else map.delete(w.id);
  }
  return [...map.values()];
}

const run = (stored: StoredNotification[], f: NotificationFacts, muted: string[] = [], at = now) =>
  apply(stored, reconcileNotifications(stored, evaluateRules(f), { muted: muted as never[] }, at));

test('8 overdue payments make one batched notification with 8 items', () => {
  const drafts = evaluateRules(facts({ lines: Array.from({ length: 8 }, (_, i) => line(i)) }));
  const overdue = drafts.filter((d) => d.type === 'payment_overdue');
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].items.length, 8);
  assert.equal(overdue[0].severity, 'urgent');
  assert.equal(overdue[0].groupKey, 'payment_overdue:2026-10');
  assert.equal(overdue[0].title, '8 payments are overdue · 348,000 XAF');
  assert.equal(overdue[0].items[0].key, 'payment_overdue:item0@2026-10');
  assert.equal(overdue[0].items[0].action?.handler, 'markPaid');
});

test('a missed payment that was partly paid is still overdue, for what is left', () => {
  const drafts = evaluateRules(facts({ lines: [line(1, { name: 'Rent', left: 40_000 })] }));
  const overdue = drafts.find((d) => d.type === 'payment_overdue');
  assert.equal(overdue?.title, 'Rent is overdue · 40,000 XAF');
  assert.equal(overdue?.items[0].amount, 40_000);
});

test('a snoozed payment stays out of overdue and due soon until the snooze ends, however they are grouped', () => {
  const lines = [line(1), line(2, { state: 'Unpaid', due: new Date(2026, 9, 4) })];
  const snoozedLines = { [lines[0].key]: new Date(2026, 9, 4, 10).toISOString(), [lines[1].key]: new Date(2026, 9, 4, 10).toISOString() };
  const drafts = evaluateRules(facts({ lines, snoozedLines }));
  assert.equal(drafts.some((d) => d.type === 'payment_overdue' || d.type === 'payment_due_soon'), false);
  // The next day's due soon group (a new group key) still leaves them out.
  const nextMorning = evaluateRules({ ...facts({ lines, snoozedLines }), now: new Date(2026, 9, 4, 8) });
  assert.equal(nextMorning.some((d) => d.type === 'payment_due_soon' || d.type === 'payment_overdue'), false);
  // After it ends, both come back.
  const later = evaluateRules({ ...facts({ lines, snoozedLines }), now: new Date(2026, 9, 4, 11) });
  assert.ok(later.some((d) => d.type === 'payment_overdue'));
  assert.ok(later.some((d) => d.type === 'payment_due_soon'));
  // Snoozing one leaves the other.
  const one = evaluateRules(facts({ lines, snoozedLines: { [lines[0].key]: snoozedLines[lines[0].key] } }));
  assert.equal(one.some((d) => d.type === 'payment_overdue'), false);
  assert.ok(one.some((d) => d.type === 'payment_due_soon'));
});

test('items whose basket kind was guessed make one notification that opens the check', () => {
  const drafts = evaluateRules(facts({ itemsToCheck: 3 }));
  const check = drafts.find((d) => d.type === 'items_to_check');
  assert.equal(check?.title, '3 items to check');
  assert.equal(check?.primaryAction?.route, '/budget/item-kinds');
  assert.equal(evaluateRules(facts({ itemsToCheck: 0 })).some((d) => d.type === 'items_to_check'), false);
});

test('paying one updates it to 7 (still one notification); paying all resolves it', () => {
  let stored = run([], facts({ lines: Array.from({ length: 8 }, (_, i) => line(i)) }));
  assert.equal(stored.length, 1);
  const id = stored[0].id;
  // Read it, then one gets paid.
  stored = stored.map((n) => ({ ...n, readAt: now }));
  const later = new Date(now.getTime() + 60_000);
  stored = run(stored, facts({ lines: Array.from({ length: 7 }, (_, i) => line(i)) }), [], later);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, id);
  assert.equal(stored[0].items.length, 7);
  assert.match(stored[0].title, /^7 payments/);
  assert.ok(stored[0].readAt, 'fewer items keeps it read');
  // All paid.
  stored = run(stored, facts({ lines: [] }), [], later);
  assert.ok(stored[0].resolvedAt);
  assert.equal(inView(stored[0], 'inbox', later), false);
  assert.equal(inView(stored[0], 'resolved', later), true);
});

test('a new overdue item makes it unread again', () => {
  let stored = run([], facts({ lines: [line(1)] }));
  stored = stored.map((n) => ({ ...n, readAt: now }));
  stored = run(stored, facts({ lines: [line(1), line(2)] }));
  assert.equal(stored[0].readAt, null);
});

test('running the same rules twice writes nothing the second time', () => {
  const f = facts({ lines: [line(1), line(2, { state: 'Unpaid', due: new Date(2026, 9, 4) })] });
  const stored = run([], f);
  assert.equal(stored.length, 2);
  assert.deepEqual(reconcileNotifications(stored, evaluateRules(f), { muted: [] }, now), []);
  // Dedupe ids are the group keys.
  assert.deepEqual(stored.map((n) => n.id).sort(), [notificationId('payment_due_soon:2026-10-03'), notificationId('payment_overdue:2026-10')].sort());
});

test('a resolved situation that comes back reopens unread', () => {
  let stored = run([], facts({ lines: [line(1)] }));
  stored = run(stored, facts());
  assert.ok(stored[0].resolvedAt);
  stored = run(stored, facts({ lines: [line(1)] }));
  assert.equal(stored[0].resolvedAt, null);
  assert.equal(stored[0].readAt, null);
});

test('muting a type stops new ones; an existing one stays until resolved', () => {
  const f = facts({ lines: [line(1)] });
  assert.equal(run([], f, ['payment_overdue']).length, 0);
  let stored = run([], f);
  stored = run(stored, facts({ lines: [line(1), line(2)] }), ['payment_overdue']);
  assert.equal(stored[0].items.length, 2, 'still updated while it lasts');
  stored = run(stored, facts(), ['payment_overdue']);
  assert.ok(stored[0].resolvedAt);
});

test('resolved notifications are deleted after 30 days', () => {
  let stored = run([], facts({ lines: [line(1)] }));
  stored = run(stored, facts());
  const later = new Date(now.getTime() + 31 * 86_400_000);
  const writes = reconcileNotifications(stored, [], { muted: [] }, later);
  assert.deepEqual(writes, [{ op: 'delete', id: stored[0].id }]);
});

test('messages resolve on expiry, not when the rules stop producing them', () => {
  const time: TimeFacts = {
    overdueTasks: [],
    overdueUrgentCount: 5,
    dueToday: [],
    projects: [],
    milestones: [],
    days: [],
    doFirstHeavy: null,
    conflicts: [],
    streakBroken: null,
    morning: { day: '2026-10-03', title: 'Today: 4 tasks, 5h scheduled', body: 'Nothing at risk.' },
    evening: null,
  };
  let stored = run([], { now, money: null, time, system: null });
  assert.equal(stored[0].type, 'morning_summary');
  stored = run(stored, { now, money: null, time: { ...time, morning: null }, system: null });
  assert.equal(stored[0].resolvedAt, null, 'still in the inbox today');
  stored = run(stored, { now: new Date(2026, 9, 4, 9), money: null, time: { ...time, morning: null }, system: null }, [], new Date(2026, 9, 4, 9));
  assert.ok(stored[0].resolvedAt);
});

test('projects at risk batch: "7 projects at risk: nothing done lately"', () => {
  const time: TimeFacts = {
    overdueTasks: [],
    overdueUrgentCount: 5,
    dueToday: [],
    projects: Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `Project ${i}`, risk: 'at risk' as const, reason: 'Nothing done lately' })),
    milestones: [],
    days: [],
    doFirstHeavy: null,
    conflicts: [],
    streakBroken: null,
    morning: null,
    evening: null,
  };
  const [d] = evaluateRules({ now, money: null, time, system: null });
  assert.equal(d.title, '7 projects at risk: nothing done lately');
  assert.equal(d.items.length, 7);
  assert.equal(d.module, 'time');
});

test('every rule speaks without long dashes or emoji', () => {
  const drafts = evaluateRules({
    now,
    money: money({
      lines: [line(1), line(2, { state: 'Unpaid', due: now }), line(3, { type: 'Income', state: 'Late' })],
      overspends: [{ key: 'k', bucketId: 'b', itemId: 'i', name: 'Food', amount: 12_000 }],
      leftovers: [{ bucketId: 'b', name: 'Fuel', amount: 8000 }],
      mustHaves: { status: 'short', count: 3, due: 300_000, short: 50_000, waitingFor: [] },
      readyToPay: [{ id: 'q', name: 'Rent', amount: 100_000 }],
      incomeReceived: [{ key: 'salary@2026-10', name: 'Salary', amount: 900_000, readyCount: 2 }],
      monthReview: { month: '2026-11', text: '14 lines added.' },
      itemsToCheck: 2,
      unassigned: [{ id: 't', label: 'Taxi', amount: 2000, date: now }],
      reconcile: [{ accountId: 'a', name: 'MTN', difference: 500 }],
      debts: [{ id: 'd', name: 'Momokash', amount: 50_000, due: new Date(2026, 8, 28) }],
      savingsBehind: [{ key: 's', bucketId: 'b', name: 'Emergency fund', short: 30_000 }],
      pace: { status: 'off_track', message: 'At this pace the month runs out on 24 Oct.' },
      forecast: {
        cushion: 200_000,
        breaches: [
          { month: '2026-11', lowest: 45_000, date: new Date(2026, 10, 28), belowZero: false },
          { month: '2026-12', lowest: -10_000, date: new Date(2026, 11, 20), belowZero: true },
        ],
        shortMonths: [{ month: '2026-12', shortfall: 80_000 }],
        autoAllocate: { count: 3, names: ['Couch', 'Laptop', 'Shoes'] },
        wantToBuyFits: [{ id: 'w', name: 'Laptop', month: '2026-12', amount: 400_000 }],
        streak: 6,
      },
    }),
    time: null,
    system: { syncProblems: [{ key: 'auth', message: 'Sign in to Google again.' }] },
  });
  assert.ok(drafts.length >= 20);
  for (const d of drafts) {
    for (const text of [d.title, d.body, ...d.items.map((i) => i.label)]) {
      assert.doesNotMatch(text, LONG_DASH, text);
      assert.doesNotMatch(text, EMOJI, text);
    }
  }
  assert.ok(drafts.some((d) => d.type === 'cushion_streak' && d.severity === 'positive' && d.title === '6 months above your cushion'));
  assert.ok(drafts.some((d) => d.type === 'debt_payment_late' && d.title === 'Momokash: 50,000 XAF is 5 days late'));
});

test('cushion streak milestones only at 3, 6 and 12 months', () => {
  const base = { cushion: 1, breaches: [], shortMonths: [], autoAllocate: { count: 0, names: [] }, wantToBuyFits: [] };
  const streakTypes = (streak: number) => evaluateRules(facts({ forecast: { ...base, streak } })).filter((d) => d.type === 'cushion_streak').map((d) => d.groupKey);
  assert.deepEqual(streakTypes(2), []);
  assert.deepEqual(streakTypes(3), ['cushion_streak:3']);
  assert.deepEqual(streakTypes(4), []);
  assert.deepEqual(streakTypes(12), ['cushion_streak:12']);
});

test('inbox order: unread first, then urgent, warning, info, positive, then newest', () => {
  const n = (id: string, severity: StoredNotification['severity'], read: boolean, minutes: number) =>
    ({ id, severity, readAt: read ? now : null, updatedAt: new Date(now.getTime() - minutes * 60_000) }) as StoredNotification;
  const sorted = [n('a', 'info', false, 1), n('b', 'urgent', true, 0), n('c', 'urgent', false, 30), n('d', 'positive', false, 0), n('e', 'warning', false, 5), n('f', 'warning', false, 2)].sort(comparePriority);
  assert.deepEqual(sorted.map((x) => x.id), ['c', 'f', 'e', 'a', 'd', 'b']);
  assert.equal(dayGroup(new Date(2026, 9, 2, 22), now), 'Yesterday');
  assert.equal(dayGroup(new Date(2026, 8, 29), now), 'This week');
  assert.equal(dayGroup(new Date(2026, 8, 1), now), 'Earlier');
});

test('the badge counts unread in the inbox only (not snoozed, resolved or archived)', () => {
  const base = { readAt: null, resolvedAt: null, archivedAt: null, snoozedUntil: null, severity: 'warning' } as unknown as StoredNotification;
  const all = [
    { ...base, id: '1', severity: 'urgent' as const },
    { ...base, id: '2' },
    { ...base, id: '3', readAt: now },
    { ...base, id: '4', snoozedUntil: new Date(now.getTime() + 3600_000) },
    { ...base, id: '5', resolvedAt: now },
    { ...base, id: '6', archivedAt: now },
  ];
  assert.deepEqual(unreadCount(all, now), { unread: 2, urgent: 1 });
});

test('the prompt: once a session, waits for forms, quiet after three Laters unless urgent', () => {
  const memory = { laterStreak: 0 };
  assert.equal(shouldPrompt({ unread: 6, urgent: 2, shownThisSession: false, overlayOpen: false, memory }), true);
  assert.equal(shouldPrompt({ unread: 6, urgent: 2, shownThisSession: true, overlayOpen: false, memory }), false);
  assert.equal(shouldPrompt({ unread: 6, urgent: 2, shownThisSession: false, overlayOpen: true, memory }), false);
  assert.equal(shouldPrompt({ unread: 0, urgent: 0, shownThisSession: false, overlayOpen: false, memory }), false);
  let m = memory;
  for (let i = 0; i < 3; i++) m = afterPrompt(m, 'later', 0);
  assert.equal(shouldPrompt({ unread: 4, urgent: 0, shownThisSession: false, overlayOpen: false, memory: m }), false);
  assert.equal(shouldPrompt({ unread: 4, urgent: 1, shownThisSession: false, overlayOpen: false, memory: m }), true);
  assert.deepEqual(afterPrompt(m, 'view', 1), { laterStreak: 0 });
  assert.equal(promptText(6, 2), 'You have 6 unread updates, 2 urgent.');
  assert.equal(promptText(1, 0), 'You have 1 unread update.');
});
