// Recurring task rules (app/src/viewmodels/recurrence.ts) — the brief's rule
// cases (1 to 4, 7) plus the edge cases it lists.
// Run: npx tsx --test test/recurrence.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKey,
  describeRule,
  expandRule,
  formatRRule,
  nextDates,
  parseRRule,
  presetFor,
  presetOptions,
  presetRule,
  splitRule,
} from '../app/src/viewmodels/recurrence';

const keys = (dates: Date[]) => dates.map(dateKey);
// 18 April 2023 is a Tuesday — the third Tuesday of the month.
const tue18Apr = new Date(2023, 3, 18, 9, 0);
const far = new Date(2030, 0, 1);

test('1. weekly on Tuesday from 18 April: 25 April, 2 May, 9 May', () => {
  const rule = parseRRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU')!;
  const next = nextDates(rule, tue18Apr, new Date(2023, 3, 19), 3);
  assert.deepEqual(keys(next), ['2023-04-25', '2023-05-02', '2023-05-09']);
  // Time of day is kept.
  assert.equal(next[0].getHours(), 9);
});

test('2. every 2 weeks on Mon and Wed, ends after 4: exactly 4', () => {
  const rule = parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4')!;
  const dates = expandRule(rule, new Date(2023, 3, 17, 9), far); // Monday 17 April
  assert.deepEqual(keys(dates), ['2023-04-17', '2023-04-19', '2023-05-01', '2023-05-03']);
});

test('3. monthly on the third Tuesday from 18 April: next is 16 May', () => {
  const rule = presetRule('monthlyNth', tue18Apr)!;
  assert.equal(formatRRule(rule), 'FREQ=MONTHLY;INTERVAL=1;BYDAY=3TU');
  assert.deepEqual(keys(nextDates(rule, tue18Apr, new Date(2023, 3, 19), 1)), ['2023-05-16']);
});

test('4. monthly on day 31 from 31 January: next is 31 March', () => {
  const start = new Date(2023, 0, 31, 8);
  const rule = presetRule('monthlyDay', start)!;
  assert.deepEqual(keys(nextDates(rule, start, new Date(2023, 1, 1), 3)), ['2023-03-31', '2023-05-31', '2023-07-31']);
});

test('7. this and following on the 5th occurrence: first series ends after the 4th', () => {
  const rule = parseRRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU')!;
  const all = expandRule(rule, tue18Apr, new Date(2023, 5, 1));
  const fifth = dateKey(all[4]); // 16 May
  const { before, after } = splitRule(rule, tue18Apr, fifth);
  const beforeDates = expandRule(before!, tue18Apr, far);
  assert.equal(beforeDates.length, 4);
  assert.equal(dateKey(beforeDates[3]), '2023-05-09');
  const newStart = all[4];
  assert.equal(dateKey(expandRule(after, newStart, far)[0]), '2023-05-16');
});

test('split shares a COUNT between the two series', () => {
  const rule = parseRRule('FREQ=DAILY;INTERVAL=1;COUNT=10')!;
  const start = new Date(2023, 3, 1, 9);
  const { before, after } = splitRule(rule, start, '2023-04-04');
  assert.equal(before!.count, 3);
  assert.equal(after.count, 7);
  // Splitting at the first occurrence leaves nothing before it.
  assert.equal(splitRule(rule, start, '2023-04-01').before, null);
});

test('annually on 29 February only lands in leap years', () => {
  const start = new Date(2024, 1, 29, 9);
  const dates = expandRule(presetRule('yearly', start)!, start, new Date(2033, 0, 1));
  assert.deepEqual(keys(dates), ['2024-02-29', '2028-02-29', '2032-02-29']);
});

test('last weekday option appears only on the last one of the month', () => {
  const lastTue = new Date(2023, 3, 25); // 25 April 2023, the last Tuesday
  assert.ok(presetOptions(lastTue).some((o) => o.id === 'monthlyLast' && o.label === 'Monthly on the last Tuesday'));
  assert.ok(!presetOptions(tue18Apr).some((o) => o.id === 'monthlyLast'));
  const rule = presetRule('monthlyLast', lastTue)!;
  assert.deepEqual(keys(nextDates(rule, lastTue, new Date(2023, 3, 26), 2)), ['2023-05-30', '2023-06-27']);
});

test('preset labels follow the date', () => {
  const labels = presetOptions(tue18Apr).map((o) => o.label);
  assert.deepEqual(labels, [
    'Does not repeat',
    'Daily',
    'Weekly on Tuesday',
    'Every weekday (Monday to Friday)',
    'Monthly on the third Tuesday',
    'Monthly on day 18',
    'Annually on 18 April',
    'Custom…',
  ]);
  const wed = new Date(2023, 3, 19);
  assert.equal(presetOptions(wed)[2].label, 'Weekly on Wednesday');
});

test('a stored rule maps back to its preset, or custom', () => {
  assert.equal(presetFor(parseRRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU'), tue18Apr), 'weekly');
  assert.equal(presetFor(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'), tue18Apr), 'custom');
  assert.equal(presetFor(parseRRule('FREQ=DAILY;INTERVAL=1;COUNT=5'), tue18Apr), 'custom');
  assert.equal(presetFor(null, tue18Apr), 'none');
});

test('until is inclusive and round-trips', () => {
  const rule = parseRRule('FREQ=DAILY;INTERVAL=1;UNTIL=20230420T235959')!;
  assert.equal(rule.until, '2023-04-20');
  assert.deepEqual(keys(expandRule(rule, tue18Apr, far)), ['2023-04-18', '2023-04-19', '2023-04-20']);
  assert.equal(formatRRule(rule), 'FREQ=DAILY;INTERVAL=1;UNTIL=20230420T235959');
});

test('plain-language summary', () => {
  const monday = new Date(2023, 3, 17);
  assert.equal(
    describeRule({ freq: 'WEEKLY', interval: 2, byDay: ['WE', 'MO'], until: '2023-06-30' }, monday),
    'Every 2 weeks on Monday and Wednesday, until 30 June'
  );
  assert.equal(describeRule(presetRule('weekdays', monday)!, monday), 'Every weekday (Monday to Friday)');
  assert.equal(describeRule({ freq: 'DAILY', interval: 1, count: 10 }, monday), 'Daily, 10 times');
});

test('daylight saving: wall-clock time is kept', () => {
  const start = new Date(2023, 2, 20, 9, 30);
  for (const d of expandRule({ freq: 'DAILY', interval: 1 }, start, new Date(2023, 3, 10))) {
    assert.equal(d.getHours(), 9);
    assert.equal(d.getMinutes(), 30);
  }
});
