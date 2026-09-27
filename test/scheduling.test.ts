// Time blocking rules (app/src/viewmodels/scheduling.ts) — the brief's
// seven cases, plus suggestions.
// Run: npx tsx --test test/scheduling.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAvailability, defaultTimeMode, isInsideBlocked, type ScheduledTask } from '../app/src/viewmodels/scheduling';

const at = (h: number, m = 0) => new Date(2026, 8, 28, h, m);
const task = (id: string, s: [number, number], e: [number, number], mode: 'blocked' | 'free', extra: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id,
  title: id,
  start: at(...s),
  end: at(...e),
  mode,
  allDay: false,
  status: 'Pending',
  ...extra,
});

test('defaults: meetings and events blocked, to-dos free', () => {
  assert.equal(defaultTimeMode('Meeting'), 'blocked');
  assert.equal(defaultTimeMode('Event'), 'blocked');
  assert.equal(defaultTimeMode('ToDo'), 'free');
});

test('1. empty day, new blocked 09–10 → available, stays blocked', () => {
  const r = checkAvailability(at(9), at(10), 'blocked', null, []);
  assert.equal(r.status, 'available');
  assert.equal(r.effectiveMode, 'blocked');
  assert.equal(r.forcedMode, null);
});

test('2. blocked 09–10 exists, new free 09:30–10:30 → conflict', () => {
  const r = checkAvailability(at(9, 30), at(10, 30), 'free', null, [task('a', [9, 0], [10, 0], 'blocked')]);
  assert.equal(r.status, 'conflict');
  assert.deepEqual(r.overlappingTasks.map((t) => t.id), ['a']);
});

test('3. free 09–11 exists, new blocked 10–12 → forced free, shared', () => {
  const r = checkAvailability(at(10), at(12), 'blocked', null, [task('a', [9, 0], [11, 0], 'free')]);
  assert.equal(r.status, 'shared');
  assert.equal(r.forcedMode, 'free');
  assert.equal(r.effectiveMode, 'free');
});

test('4. blocked 09–10 exists, new 10–11 → available (touching edges)', () => {
  const r = checkAvailability(at(10), at(11), 'blocked', null, [task('a', [9, 0], [10, 0], 'blocked')]);
  assert.equal(r.status, 'available');
});

test('5. cancelled blocked 09–10 exists, new blocked 09–10 → available', () => {
  const r = checkAvailability(at(9), at(10), 'blocked', null, [task('a', [9, 0], [10, 0], 'blocked', { status: 'Cancelled' })]);
  assert.equal(r.status, 'available');
});

test('6. editing blocked 09–10 without changing time → available (excludes itself)', () => {
  const r = checkAvailability(at(9), at(10), 'blocked', 'a', [task('a', [9, 0], [10, 0], 'blocked')]);
  assert.equal(r.status, 'available');
});

test('7. free 09–10 and free 09:30–11; switching the first to blocked → conflict', () => {
  const tasks = [task('a', [9, 0], [10, 0], 'free'), task('b', [9, 30], [11, 0], 'free')];
  const r = checkAvailability(at(9), at(10), 'blocked', 'a', tasks);
  assert.equal(r.status, 'conflict');
  assert.equal(r.forcedMode, null);
  assert.deepEqual(r.overlappingTasks.map((t) => t.id), ['b']);
});

test('done tasks count; all-day tasks are ignored', () => {
  const done = checkAvailability(at(9), at(10), 'blocked', null, [task('a', [9, 0], [10, 0], 'blocked', { status: 'Done' })]);
  assert.equal(done.status, 'conflict');
  const allDay = checkAvailability(at(9), at(10), 'blocked', null, [task('a', [0, 0], [23, 59], 'blocked', { allDay: true })]);
  assert.equal(allDay.status, 'available');
});

test('free over free and blocked together → conflict (no forced switch)', () => {
  const r = checkAvailability(at(9), at(11), 'blocked', null, [task('f', [9, 0], [10, 0], 'free'), task('b', [10, 0], [10, 30], 'blocked')]);
  assert.equal(r.status, 'conflict');
  assert.equal(r.forcedMode, null);
});

test('suggestions: nearest same-length gaps, forward then backward, within 07–22', () => {
  // Busy 09–10 and 10:30–12; a 2h blocked task asked for 09:00.
  const tasks = [task('a', [9, 0], [10, 0], 'blocked'), task('b', [10, 30], [12, 0], 'blocked')];
  const r = checkAvailability(at(9), at(11), 'blocked', null, tasks);
  assert.equal(r.status, 'conflict');
  const text = r.suggestions.map((s) => `${s.start.getHours()}:${String(s.start.getMinutes()).padStart(2, '0')}`);
  assert.deepEqual(text, ['12:00', '7:00']);
});

test('suggestions: none when the day is full', () => {
  const r = checkAvailability(at(9), at(10), 'blocked', null, [task('a', [7, 0], [22, 0], 'blocked')]);
  assert.equal(r.status, 'conflict');
  assert.deepEqual(r.suggestions, []);
});

test('isInsideBlocked: start inclusive, end exclusive, ignores free and self', () => {
  const tasks = [task('a', [9, 0], [10, 0], 'blocked'), task('f', [13, 0], [14, 0], 'free')];
  assert.equal(isInsideBlocked(at(9, 0), tasks, null), true);
  assert.equal(isInsideBlocked(at(10, 0), tasks, null), false);
  assert.equal(isInsideBlocked(at(13, 30), tasks, null), false);
  assert.equal(isInsideBlocked(at(9, 30), tasks, 'a'), false);
});
