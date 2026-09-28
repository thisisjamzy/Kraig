// Google Calendar sync (app/src/shared/calendarSync): block formatting,
// which tasks are pushed, recurrence ids, pull reconciling, the offline
// safety rule, push result roll-up, and Google events in conflict checks.
// Run: npx tsx --test test/calendarSync.test.ts

// Recurrences expand in the device's zone — pin it so dates are stable.
process.env.TZ = 'Europe/London';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import type { FirestoreTask } from '../app/src/shared/firestore/types';
import type { BridgeBlock, GoogleEvent } from '../app/src/shared/calendarBridge/types';
import {
  buildBlocks,
  formatIsoWithOffset,
  toBridgeBlock,
  widenWindow,
  zonedMidnight,
} from '../app/src/shared/calendarSync/blocks';
import { planReconcile, GOOGLE_FIELDS } from '../app/src/shared/calendarSync/reconcile';
import { normalizePushResult, rollUpPushResults } from '../app/src/shared/calendarSync/results';
import { executeSync, type SyncDeps } from '../app/src/shared/calendarSync/engine';
import { googleEventsAsScheduled } from '../app/src/shared/calendarSync/availability';
import { checkAvailability } from '../app/src/viewmodels/scheduling';

const ts = (d: Date) => Timestamp.fromDate(d);
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const TZ = 'Europe/London';
const NOW = local(2026, 9, 28, 8);
const WINDOW = { from: local(2026, 9, 21), to: local(2026, 11, 27) };

function task(id: string, start: Date, end: Date, extra: Partial<FirestoreTask> = {}): FirestoreTask {
  return {
    id,
    title: id,
    emoji: null,
    type: 'Meeting',
    priority: 'Medium',
    projectId: null,
    areaId: null,
    bucketId: null,
    parentTaskId: null,
    done: false,
    status: 'Pending',
    startTime: ts(start),
    dueDate: ts(end),
    allDay: false,
    timeMode: 'blocked',
    originalDueDate: null,
    rescheduleCount: 0,
    completedAt: null,
    calendarEventId: null,
    dependsOnTaskId: null,
    estimatedCost: null,
    linkedTransactionId: null,
    notes: '',
    tags: [],
    archived: false,
    createdBy: 'u',
    ...extra,
  };
}

const opts = (includeFree = false) => ({ includeFree, timeZone: TZ, now: NOW });

// ---- 2. Formatting ----

test('timed blocks carry an offset, across a daylight-saving change', () => {
  // London: BST (+01:00) until 25 October 2026, GMT (+00:00) after.
  assert.equal(formatIsoWithOffset(new Date('2026-09-28T08:00:00Z'), TZ), '2026-09-28T09:00:00+01:00');
  assert.equal(formatIsoWithOffset(new Date('2026-10-26T09:00:00Z'), TZ), '2026-10-26T09:00:00+00:00');
  assert.equal(formatIsoWithOffset(new Date('2026-09-28T14:30:00Z'), 'America/New_York'), '2026-09-28T10:30:00-04:00');
  assert.equal(formatIsoWithOffset(new Date('2026-09-28T04:15:00Z'), 'Asia/Kolkata'), '2026-09-28T09:45:00+05:30');

  const { blocks } = buildBlocks([task('a', local(2026, 10, 26, 9), local(2026, 10, 26, 10))], WINDOW, opts());
  assert.equal(blocks[0].start, '2026-10-26T09:00:00+00:00');
  assert.equal(blocks[0].end, '2026-10-26T10:00:00+00:00');
  assert.equal(blocks[0].timeZone, TZ);
  assert.equal(blocks[0].allDay, false);
});

test('all-day blocks use plain dates with an exclusive end', () => {
  const item = task('d', local(2026, 9, 28, 0, 0), local(2026, 9, 28, 23, 59), { allDay: true });
  const block = toBridgeBlock(item, 'd', TZ);
  assert.equal(block.allDay, true);
  assert.equal(block.start, '2026-09-28');
  assert.equal(block.end, '2026-09-29');
  // And the other way: an all-day Google event starts at midnight in the
  // calendar's zone.
  assert.equal(zonedMidnight('2026-09-28', TZ).toISOString(), '2026-09-27T23:00:00.000Z');
  assert.equal(zonedMidnight('2026-10-26', TZ).toISOString(), '2026-10-26T00:00:00.000Z');
});

// ---- 3. Recurrence ----

test('a weekly blocked task expands to one block per date, deleted dates skipped', () => {
  const series = task('wk', local(2026, 9, 28, 10), local(2026, 9, 28, 11), {
    rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
    exceptions: { '2026-10-05': { deleted: true }, '2026-10-12': { startTime: ts(local(2026, 10, 13, 15)), dueDate: ts(local(2026, 10, 13, 16)) } },
  });
  const window = { from: local(2026, 9, 21), to: local(2026, 10, 20) };
  const { blocks, taskIdByBlock } = buildBlocks([series], window, opts());
  assert.deepEqual(
    blocks.map((b) => b.id),
    ['wk__20260928', 'wk__20261012', 'wk__20261019']
  );
  // A date moved on its own keeps its generated date's id, at its new time.
  const moved = blocks.find((b) => b.id === 'wk__20261012')!;
  assert.equal(moved.start, '2026-10-13T15:00:00+01:00');
  assert.equal(taskIdByBlock.get('wk__20261019'), 'wk');
});

// ---- 4. What is pushed ----

test('free tasks only with the setting; cancelled, date-only and done-and-past never', () => {
  const tasks = [
    task('blocked', local(2026, 9, 29, 10), local(2026, 9, 29, 11)),
    task('free', local(2026, 9, 29, 15), local(2026, 9, 29, 16), { timeMode: 'free' }),
    task('todo-default-free', local(2026, 9, 29, 17), local(2026, 9, 29, 18), { type: 'ToDo', timeMode: undefined }),
    task('cancelled', local(2026, 9, 29, 12), local(2026, 9, 29, 13), { status: 'Cancelled' }),
    task('date-only', local(2026, 9, 29), local(2026, 9, 29, 23, 59), { allDay: true }),
    task('done-past', local(2026, 9, 27, 10), local(2026, 9, 27, 11), { done: true, status: 'Done' }),
    task('done-future', local(2026, 9, 30, 10), local(2026, 9, 30, 11), { done: true, status: 'Done' }),
    task('deleted', local(2026, 9, 29, 19), local(2026, 9, 29, 20), { archived: true }),
  ];
  const ids = (includeFree: boolean) => buildBlocks(tasks, WINDOW, opts(includeFree)).blocks.map((b) => b.id).sort();
  assert.deepEqual(ids(false), ['blocked', 'done-future']);
  assert.deepEqual(ids(true), ['blocked', 'done-future', 'free', 'todo-default-free']);
});

test('the window: default 7 days back to 60 ahead, widened by a visible range, never over 180 days', () => {
  const w = widenWindow(null, NOW);
  assert.equal(w.from.getTime(), local(2026, 9, 21).getTime());
  assert.equal(w.to.getTime(), local(2026, 11, 27).getTime());
  const wide = widenWindow({ from: local(2026, 8, 25), to: local(2026, 12, 6) }, NOW);
  assert.equal(wide.from.getTime(), local(2026, 8, 25).getTime());
  assert.equal(wide.to.getTime(), local(2026, 12, 6).getTime());
  const far = widenWindow({ from: local(2027, 6, 1), to: local(2027, 7, 12) }, NOW);
  assert.ok(far.to.getTime() - far.from.getTime() <= 180 * 86400000);
  assert.equal(far.from.getTime(), local(2027, 6, 1).getTime());
});

// ---- 5. Reconcile ----

function gEvent(id: string, start: string, end: string, extra: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    googleEventId: id,
    recurringEventId: null,
    kind: 'meeting',
    source: 'google',
    title: id,
    description: null,
    location: null,
    allDay: false,
    start: { dateTime: start },
    end: { dateTime: end },
    blocksTime: true,
    selfResponse: 'accepted',
    organizer: { email: 'me@example.com', name: 'Me', self: true },
    attendees: [{ email: 'booker@example.com', name: 'Booker', responseStatus: 'accepted', optional: false }],
    meetingLink: null,
    htmlLink: null,
    updated: null,
    ...extra,
  };
}

test('reconcile: adds new, updates changed (Google fields only), deletes missing inside the window, keeps outside', () => {
  const stored = [
    { id: 'kept', startAt: local(2026, 9, 29, 10) },
    { id: 'gone', startAt: local(2026, 9, 30, 10) },
    { id: 'before-window', startAt: local(2026, 9, 1, 10) },
    { id: 'after-window', startAt: local(2027, 1, 5, 10) },
  ];
  const pulled = [
    gEvent('kept', '2026-09-29T11:00:00+01:00', '2026-09-29T12:00:00+01:00', { title: 'Moved call' }),
    gEvent('new', '2026-10-02T09:00:00+01:00', '2026-10-02T09:30:00+01:00'),
    gEvent('allday', '', '', { allDay: true, start: { date: '2026-10-03' }, end: { date: '2026-10-04' } }),
    gEvent('mine', '2026-10-05T09:00:00+01:00', '2026-10-05T10:00:00+01:00', { kind: 'dreda-block', source: 'dreda', dredaId: 't1' }),
  ];
  const plan = planReconcile(stored, pulled, WINDOW, TZ);
  assert.deepEqual(plan.upserts.map((u) => u.googleEventId).sort(), ['allday', 'kept', 'new']);
  assert.deepEqual(plan.deletes, ['gone']);

  const kept = plan.upserts.find((u) => u.googleEventId === 'kept')!;
  assert.equal(kept.title, 'Moved call');
  assert.deepEqual(kept.organizer, { email: 'me@example.com', name: 'Me', self: true });
  assert.deepEqual(kept.attendees, [{ email: 'booker@example.com', name: 'Booker', responseStatus: 'accepted', optional: false }]);
  assert.equal(kept.startAt.toISOString(), '2026-09-29T10:00:00.000Z');
  // Only Google's own fields are written — a merge leaves the app's intact.
  for (const key of Object.keys(kept)) assert.ok(GOOGLE_FIELDS.includes(key as never), key);
  const storedDoc = { title: 'Old call', linkedTaskId: 't1', notes: 'Bring the plan' };
  const merged = { ...storedDoc, ...kept };
  assert.equal(merged.linkedTaskId, 't1');
  assert.equal(merged.notes, 'Bring the plan');
  assert.equal(merged.title, 'Moved call');

  // The app's own mirrored blocks are never imported as events.
  assert.ok(!plan.upserts.some((u) => u.googleEventId === 'mine'));

  const allDay = plan.upserts.find((u) => u.googleEventId === 'allday')!;
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.startAt.toISOString(), '2026-10-02T23:00:00.000Z');
});

// ---- 6. Safety rule ----

function fakeDeps(loadTasks: SyncDeps['loadTasks']) {
  const syncCalls: (BridgeBlock[] | undefined)[] = [];
  let taskWrites = 0;
  const deps: SyncDeps = {
    now: () => NOW,
    timeZone: () => TZ,
    loadSettings: async () => ({ includeFree: false, calendarName: 'Home', calendarTimeZone: TZ }),
    loadTasks,
    bridgeSync: async (_w, blocks) => {
      syncCalls.push(blocks);
      return { push: blocks ? ({ results: [] } as never) : null, pull: { events: [], complete: true } };
    },
    bridgePush: async () => ({}),
    bridgePing: async () => ({ calendarId: 'c', calendarName: 'Home', timeZone: TZ }),
    writeTaskSync: async () => {
      taskWrites++;
    },
    applyPull: async () => {},
    saveState: async () => {},
  };
  return { deps, syncCalls, taskWrites: () => taskWrites };
}

test('safety: a cached or failed task read syncs without blocks (pull only)', async () => {
  const tasks = [task('a', local(2026, 9, 29, 10), local(2026, 9, 29, 11))];

  const cached = fakeDeps(async () => ({ tasks, fromServer: false }));
  const r1 = await executeSync(WINDOW, cached.deps);
  assert.equal(cached.syncCalls.length, 1);
  assert.equal(cached.syncCalls[0], undefined);
  assert.equal(r1.pushed, false);
  assert.equal(cached.taskWrites(), 0);

  const failed = fakeDeps(async () => {
    throw new Error('offline');
  });
  await executeSync(WINDOW, failed.deps);
  assert.equal(failed.syncCalls[0], undefined);

  const server = fakeDeps(async () => ({ tasks, fromServer: true }));
  await executeSync(WINDOW, server.deps);
  assert.deepEqual(server.syncCalls[0]!.map((b) => b.id), ['a']);

  // A confirmed server read with nothing to push sends an empty list.
  const empty = fakeDeps(async () => ({ tasks: [], fromServer: true }));
  await executeSync(WINDOW, empty.deps);
  assert.deepEqual(empty.syncCalls[0], []);
});

// ---- 7. Roll-up ----

test('push results roll up to each task: state, event ids, errors, conflicts', () => {
  const taskIdByBlock = new Map([
    ['wk__20260928', 'wk'],
    ['wk__20261005', 'wk'],
    ['one', 'one'],
    ['clash', 'clash'],
    ['later', 'later'],
  ]);
  // Exactly as CALENDAR-BRIDGE.md documents push's result.
  const raw = {
    calendarId: 'primary',
    window: { timeMin: '2026-09-21T00:00:00Z', timeMax: '2026-11-27T00:00:00Z' },
    results: [
      { dredaId: 'wk__20260928', googleEventId: 'g1', status: 'created' },
      { dredaId: 'one', googleEventId: 'g3', status: 'restored' },
      { dredaId: 'clash', googleEventId: 'g4', status: 'unchanged' },
    ],
    deleted: [
      { dredaId: 'old', googleEventId: 'x1' },
      { dredaId: null, googleEventId: 'x2' },
    ],
    // A block that failed validation may only be known by its index.
    failed: [{ dredaId: null, index: 1, code: 'BAD_REQUEST', message: 'Calendar quota' }],
    conflicts: [
      {
        dredaId: 'clash',
        googleEventId: 'm1',
        kind: 'meeting',
        title: 'Client call',
        start: { dateTime: '2026-09-29T10:00:00+01:00' },
        end: { dateTime: '2026-09-29T11:00:00+01:00' },
      },
    ],
    truncated: true,
    skipped: ['later'],
  };
  const result = normalizePushResult(raw, [...taskIdByBlock.keys()]);
  assert.equal(result.deleted, 2);
  const rolled = rollUpPushResults([...taskIdByBlock.keys()], taskIdByBlock, result);

  const wk = rolled.get('wk')!;
  assert.equal(wk.state, 'error');
  assert.equal(wk.error, 'Calendar quota');
  assert.deepEqual(wk.googleEventIds, { wk__20260928: 'g1' });

  assert.equal(rolled.get('one')!.state, 'synced');
  assert.deepEqual(rolled.get('one')!.googleEventIds, { one: 'g3' });

  const clash = rolled.get('clash')!;
  assert.equal(clash.state, 'synced');
  assert.deepEqual(clash.conflicts, [
    { googleEventId: 'm1', title: 'Client call', start: '2026-09-29T10:00:00+01:00', end: '2026-09-29T11:00:00+01:00', blockId: 'clash' },
  ]);

  assert.equal(rolled.get('later')!.state, 'pending');
});

test('push results in other shapes (outcome lists, a deleted count) are still read', () => {
  const result = normalizePushResult({ created: [{ id: 'a', googleEventId: 'g' }], unchanged: ['b'], failed: ['c'], deleted: 2 });
  assert.deepEqual(result.blocks.map((b) => [b.id, b.outcome, b.googleEventId]), [
    ['a', 'created', 'g'],
    ['b', 'unchanged', null],
  ]);
  assert.deepEqual(result.failed.map((f) => f.id), ['c']);
  assert.equal(result.deleted, 2);
});

// ---- 8. Conflict checks ----

test('a Google meeting that blocks time is a conflict; one marked Free is not', () => {
  const google = googleEventsAsScheduled([
    { id: 'm1', title: 'Client call', startAt: local(2026, 9, 29, 10), endAt: local(2026, 9, 29, 11), allDay: false, blocksTime: true },
    { id: 'f1', title: 'Gym (free)', startAt: local(2026, 9, 29, 14), endAt: local(2026, 9, 29, 15), allDay: false, blocksTime: false },
  ]);
  const clash = checkAvailability(local(2026, 9, 29, 10, 30), local(2026, 9, 29, 11, 30), 'blocked', null, google);
  assert.equal(clash.status, 'conflict');
  assert.equal(clash.overlappingTasks[0].title, 'Client call');
  assert.equal(clash.overlappingTasks[0].source, 'google');
  // Suggested slots skip the Google meeting too.
  assert.ok(clash.suggestions.every((s) => s.end <= local(2026, 9, 29, 10) || s.start >= local(2026, 9, 29, 11)));

  const free = checkAvailability(local(2026, 9, 29, 14), local(2026, 9, 29, 15), 'blocked', null, google);
  assert.equal(free.status, 'available');
});
