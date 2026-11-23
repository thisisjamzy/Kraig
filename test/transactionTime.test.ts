// A time on every transaction (app/src/viewmodels/transactionTime.ts, brief 23 Nov 2026).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clockIn,
  dayIn,
  dayOfDateField,
  editedTransactionTime,
  hhmm,
  parseTimeText,
  timeWords,
  transactionInstant,
  withTransactionTime,
} from '../app/src/viewmodels/transactionTime';

const TZ = 'Africa/Douala';
const at = (isoUtc: string) => new Date(isoUtc);
const field = (day: string) => new Date(`${day}T00:00:00`);
const read = (d: Date) => ({ day: dayIn(d, TZ), time: hhmm(clockIn(d, TZ)) });

describe('transactionInstant', () => {
  test('a user time is used as is', () => {
    const tx = { date: field('2026-11-23'), occurredAt: at('2026-11-23T06:15:00Z') };
    assert.deepEqual(read(transactionInstant(tx, TZ)), { day: '2026-11-23', time: '07:15' });
  });

  test('a recorded time: the clock time it was logged, on its own date', () => {
    const tx = { date: field('2026-11-23'), loggedAt: at('2026-11-23T13:30:00Z') };
    assert.deepEqual(read(transactionInstant(tx, TZ)), { day: '2026-11-23', time: '14:30' });
  });

  test('a backdated record logged days later keeps its date', () => {
    const tx = { date: field('2026-11-03'), loggedAt: at('2026-11-20T08:45:00Z') };
    assert.deepEqual(read(transactionInstant(tx, TZ)), { day: '2026-11-03', time: '09:45' });
  });

  test('logged at 00:30 in Douala (23:30 UTC the day before) reads 00:30, date unchanged', () => {
    const tx = { date: field('2026-11-23'), createdAt: at('2026-11-22T23:30:00Z') };
    assert.deepEqual(read(transactionInstant(tx, TZ)), { day: '2026-11-23', time: '00:30' });
  });

  test('nothing to go on: 12:00. A createdAt that is just a copy of the date does not count', () => {
    assert.deepEqual(read(transactionInstant({ date: field('2026-11-23') }, TZ)), { day: '2026-11-23', time: '12:00' });
    const d = field('2026-11-23');
    assert.deepEqual(read(transactionInstant({ date: d, createdAt: new Date(d) }, TZ)), { day: '2026-11-23', time: '12:00' });
  });

  test('Timestamps work as well as Dates', () => {
    const ts = (d: Date) => ({ toDate: () => d });
    assert.deepEqual(read(transactionInstant({ date: ts(field('2026-11-23')), loggedAt: ts(at('2026-11-23T17:00:00Z')) }, TZ)), { day: '2026-11-23', time: '18:00' });
  });
});

describe('withTransactionTime', () => {
  const now = at('2026-11-23T10:20:00Z'); // 11:20 in Douala
  test('no time set: the save time, today', () => {
    const r = withTransactionTime('2026-11-23', null, now, TZ);
    assert.equal(r.timeSource, 'recorded');
    assert.deepEqual(read(r.occurredAt), { day: '2026-11-23', time: '11:20' });
    assert.equal(dayOfDateField(r.date), '2026-11-23');
  });
  test('backdated with no time: the chosen date at the save time', () => {
    assert.deepEqual(read(withTransactionTime('2026-11-03', null, now, TZ).occurredAt), { day: '2026-11-03', time: '11:20' });
  });
  test('a picked time', () => {
    const r = withTransactionTime('2026-11-23', 7 * 60 + 15, now, TZ);
    assert.equal(r.timeSource, 'user');
    assert.deepEqual(read(r.occurredAt), { day: '2026-11-23', time: '07:15' });
  });
  test('just after midnight in Douala is still that day', () => {
    assert.deepEqual(read(withTransactionTime('2026-12-05', 30, now, TZ).occurredAt), { day: '2026-12-05', time: '00:30' });
  });
});

describe('editing', () => {
  const original = { date: field('2026-11-10'), loggedAt: at('2026-11-12T15:05:00Z'), occurredAt: at('2026-11-10T15:05:00Z'), timeSource: 'recorded' as const };
  test('changing only the date keeps the clock time', () => {
    const r = editedTransactionTime(original, '2026-11-08', 16 * 60 + 5, TZ);
    assert.deepEqual(read(r.occurredAt), { day: '2026-11-08', time: '16:05' });
    assert.equal(r.timeSource, 'recorded');
  });
  test('changing the time makes it the user’s', () => {
    assert.equal(editedTransactionTime(original, '2026-11-10', 9 * 60, TZ).timeSource, 'user');
  });
  test('clearing the time goes back to the recorded time', () => {
    const r = editedTransactionTime({ ...original, occurredAt: at('2026-11-10T06:00:00Z'), timeSource: 'user' }, '2026-11-10', null, TZ);
    assert.deepEqual(read(r.occurredAt), { day: '2026-11-10', time: '16:05' });
    assert.equal(r.timeSource, 'recorded');
  });
});

describe('typing and words', () => {
  test('typed times', () => {
    assert.equal(parseTimeText('14:30'), 870);
    assert.equal(parseTimeText('1430'), 870);
    assert.equal(parseTimeText('2:30 pm'), 870);
    assert.equal(parseTimeText('9h30'), 570);
    assert.equal(parseTimeText('930'), 570);
    assert.equal(parseTimeText('25:00'), null);
  });
  test('in words', () => {
    const w = timeWords(at('2026-12-05T13:30:00Z'), TZ);
    assert.equal(w.long, 'Saturday 5 December 2026, 14:30');
    assert.equal(w.shortWithTime, '5 Dec 2026, 14:30');
  });
});
