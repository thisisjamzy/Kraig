// Recurring tasks, the task side — occurrences, exceptions, edit scopes and
// conflicts (brief cases 5 to 8, plus the listing rules).
// Run: npx tsx --test test/recurringTasks.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import type { FirestoreTask } from '../app/src/shared/firestore/types';
import {
  actionableTasks,
  expandTasks,
  occurrenceFor,
  occurrencesInRange,
  parseOccurrenceId,
  seriesProgress,
} from '../app/src/shared/tasks/recurringTasks';
import { planDelete, planEdit, type TaskForm } from '../app/src/shared/tasks/recurringPlan';
import { checkOccurrences, type ScheduledTask } from '../app/src/viewmodels/scheduling';
import { dateKey, expandRule, parseRRule } from '../app/src/viewmodels/recurrence';

const ts = (d: Date) => Timestamp.fromDate(d);
const far = new Date(2024, 0, 1);

/** Weekly on Tuesday from 18 April 2023, 09:00 to 10:00, blocked. */
function weekly(extra: Partial<FirestoreTask> = {}): FirestoreTask {
  return {
    id: 's1',
    title: 'Standup',
    emoji: null,
    type: 'Meeting',
    priority: 'Medium',
    projectId: null,
    areaId: null,
    bucketId: null,
    parentTaskId: null,
    done: false,
    status: 'Pending',
    startTime: ts(new Date(2023, 3, 18, 9)),
    dueDate: ts(new Date(2023, 3, 18, 10)),
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
    rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU',
    exceptions: {},
    ...extra,
  };
}

function formFor(series: FirestoreTask, start: Date, end: Date, extra: Partial<TaskForm> = {}): TaskForm {
  return {
    title: series.title,
    emoji: null,
    type: series.type,
    priority: series.priority,
    projectId: null,
    areaId: null,
    bucketId: null,
    startTime: start,
    dueDate: end,
    allDay: false,
    quadrant: null,
    timeMode: 'blocked',
    notes: '',
    done: false,
    rrule: series.rrule ?? null,
    ...extra,
  };
}

/** Applies planned exception writes to an in-memory series. */
function applyException(series: FirestoreTask, writes: ReturnType<typeof planEdit>): FirestoreTask {
  const exceptions = { ...(series.exceptions ?? {}) };
  for (const w of writes) if (w.kind === 'exception') exceptions[w.key] = w.exception;
  return { ...series, exceptions };
}

test('occurrences keep the series time and length, with their own ids', () => {
  const list = occurrencesInRange(weekly(), new Date(2023, 3, 1), new Date(2023, 4, 3));
  assert.deepEqual(
    list.map((o) => o.id),
    ['s1@2023-04-18', 's1@2023-04-25', 's1@2023-05-02']
  );
  assert.equal(list[1].startTime!.toDate().getHours(), 9);
  assert.equal(list[1].dueDate!.toDate().getHours(), 10);
  assert.deepEqual(parseOccurrenceId('s1@2023-04-25'), { seriesId: 's1', key: '2023-04-25' });
  assert.equal(parseOccurrenceId('plainTaskId'), null);
});

test('5. marking one occurrence done: only that date is done', () => {
  const series = weekly({ exceptions: { '2023-04-25': { status: 'Done' } } });
  const list = occurrencesInRange(series, new Date(2023, 3, 1), new Date(2023, 4, 10));
  assert.deepEqual(
    list.map((o) => [dateKey(o.startTime!.toDate()), o.done]),
    [
      ['2023-04-18', false],
      ['2023-04-25', true],
      ['2023-05-02', false],
      ['2023-05-09', false],
    ]
  );
});

test('6. editing the time of one occurrence with "this task" leaves the others', () => {
  const series = weekly();
  const writes = planEdit(
    series,
    '2023-04-25',
    'this',
    formFor(series, new Date(2023, 3, 25, 14), new Date(2023, 3, 25, 15))
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].kind, 'exception');
  const after = applyException(series, writes);
  const list = occurrencesInRange(after, new Date(2023, 3, 1), new Date(2023, 4, 3));
  assert.deepEqual(
    list.map((o) => o.startTime!.toDate().getHours()),
    [9, 14, 9]
  );
  // Only the changed fields are stored.
  const exception = after.exceptions!['2023-04-25'];
  assert.equal(exception.title, undefined);
  assert.ok(exception.startTime);
});

test('7. "this and following" on the 5th occurrence splits the series', () => {
  const series = weekly();
  const fifth = '2023-05-16';
  const writes = planEdit(
    series,
    fifth,
    'following',
    formFor(series, new Date(2023, 4, 16, 11), new Date(2023, 4, 16, 12), { title: 'Standup (new time)' })
  );
  assert.deepEqual(
    writes.map((w) => w.kind),
    ['endSeries', 'create']
  );
  const end = writes[0] as Extract<(typeof writes)[number], { kind: 'endSeries' }>;
  const original = expandRule(parseRRule(end.rrule)!, new Date(2023, 3, 18, 9), far);
  assert.equal(original.length, 4);
  assert.equal(dateKey(original[3]), '2023-05-09');
  const created = writes[1] as Extract<(typeof writes)[number], { kind: 'create' }>;
  assert.equal(created.form.title, 'Standup (new time)');
  assert.equal(dateKey(created.form.startTime), fifth);
  assert.equal(created.form.startTime.getHours(), 11);
  assert.equal(created.form.rrule, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU');
});

test('"all tasks" keeps per-date statuses and moves them with the dates', () => {
  const series = weekly({ exceptions: { '2023-04-25': { status: 'Done' }, '2023-05-02': { title: 'Renamed' } } });
  // Edit the 2 May date, moving it to Wednesday 3 May at 10:00.
  const writes = planEdit(
    series,
    '2023-05-02',
    'all',
    formFor(series, new Date(2023, 4, 3, 10), new Date(2023, 4, 3, 11), { rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=WE' })
  );
  assert.equal(writes.length, 1);
  const update = writes[0] as Extract<(typeof writes)[number], { kind: 'update' }>;
  assert.equal(dateKey(update.input.startTime), '2023-04-19');
  assert.equal(update.input.startTime.getHours(), 10);
  assert.deepEqual(update.input.exceptions, { '2023-04-26': { status: 'Done' } });
});

test('deleting: this date, this and following, all', () => {
  const series = weekly();
  assert.deepEqual(planDelete(series, '2023-04-25', 'this'), [
    { kind: 'exception', seriesId: 's1', key: '2023-04-25', exception: { deleted: true } },
  ]);
  const following = planDelete(series, '2023-05-02', 'following');
  assert.equal(following[0].kind, 'endSeries');
  // From the first date, "this and following" is the whole series.
  assert.deepEqual(planDelete(series, '2023-04-18', 'following'), [{ kind: 'archive', taskId: 's1' }]);
  assert.deepEqual(planDelete(series, '2023-05-02', 'all'), [{ kind: 'archive', taskId: 's1' }]);
  // A deleted date disappears but still counts toward COUNT.
  const counted = weekly({ rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;COUNT=3', exceptions: { '2023-04-25': { deleted: true } } });
  assert.deepEqual(
    occurrencesInRange(counted, new Date(2023, 3, 1), far).map((o) => o.occurrenceKey),
    ['2023-04-18', '2023-05-02']
  );
  assert.equal(occurrenceFor(counted, '2023-04-25'), null);
});

test('8. two clashing dates are listed; skipping them saves the rest', () => {
  const blocked = (id: string, day: Date): ScheduledTask => ({
    id,
    title: id,
    start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 30),
    end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 30),
    mode: 'blocked',
    allDay: false,
  });
  const existing = [blocked('Dentist', new Date(2023, 3, 25)), blocked('Review', new Date(2023, 4, 9))];
  const dates = expandRule(parseRRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;COUNT=6')!, new Date(2023, 3, 18, 9), far);
  const checks = checkOccurrences(
    dates.map((d) => ({ start: d, end: new Date(d.getTime() + 3600000) })),
    'blocked',
    null,
    existing
  );
  const conflicts = checks.filter((c) => c.status === 'conflict');
  assert.deepEqual(
    conflicts.map((c) => [dateKey(c.start), c.clashWith!.title]),
    [
      ['2023-04-25', 'Dentist'],
      ['2023-05-09', 'Review'],
    ]
  );
  const skipped = Object.fromEntries(conflicts.map((c) => [dateKey(c.start), { deleted: true }]));
  const saved = weekly({ rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;COUNT=6', exceptions: skipped });
  assert.equal(occurrencesInRange(saved, new Date(2023, 3, 1), far).length, 4);
});

test('a series excludes itself from its own conflict check', () => {
  const own: ScheduledTask = {
    id: 's1@2023-04-25',
    seriesId: 's1',
    title: 'Standup',
    start: new Date(2023, 3, 25, 9),
    end: new Date(2023, 3, 25, 10),
    mode: 'blocked',
    allDay: false,
  };
  const [check] = checkOccurrences([{ start: own.start!, end: own.end! }], 'blocked', 's1', [own]);
  assert.equal(check.status, 'available');
});

test('listing rules: a day lists its occurrence, undated lists stay short', () => {
  const now = new Date(2023, 4, 3, 12); // Wednesday 3 May
  const daily = weekly({ id: 'd1', rrule: 'FREQ=DAILY;INTERVAL=1' });
  const oneOff = weekly({ id: 'o1', rrule: null });
  const day = expandTasks([daily, oneOff], new Date(2023, 4, 3), new Date(2023, 4, 3, 23, 59));
  assert.deepEqual(
    day.map((t) => t.id),
    ['d1@2023-05-03', 'o1']
  );
  // Today plus the last 7 days' pending dates, not the whole series.
  const actionable = actionableTasks([daily], now).map((t) => t.occurrenceKey);
  assert.equal(actionable.length, 8);
  assert.equal(actionable[actionable.length - 1], '2023-05-03');
  // A weekly task with nothing today shows its next date when asked.
  const tuesdays = weekly({ startTime: ts(new Date(2023, 4, 2, 9)), dueDate: ts(new Date(2023, 4, 2, 10)), exceptions: { '2023-05-02': { status: 'Done' } } });
  assert.deepEqual(
    actionableTasks([tuesdays], now, { includeUpcoming: true }).map((t) => t.occurrenceKey),
    ['2023-05-09']
  );
});

test('series progress: "7 of 10 done"', () => {
  const exceptions = Object.fromEntries(
    ['2023-04-18', '2023-04-25', '2023-05-02'].map((k) => [k, { status: 'Done' as const }])
  );
  const series = weekly({ rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;COUNT=10', exceptions });
  assert.deepEqual(seriesProgress(series, new Date(2023, 4, 10)), { done: 3, total: 10, finished: false });
});
