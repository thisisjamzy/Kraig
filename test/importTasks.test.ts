// Reading spreadsheet cells (src/shared/import/projectTasks.ts). The review
// itself is tested in test/importTemplates.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, parseImportance, parseSubtasks, parseTime, samples } from '../app/src/shared/import/projectTasks';

test('dates: day first by default, ISO and Excel numbers; nonsense is unreadable', () => {
  assert.deepEqual(parseDate('05/10/2026'), { date: '2026-10-05', invalid: false });
  assert.deepEqual(parseDate('05/10/2026', false), { date: '2026-05-10', invalid: false });
  assert.deepEqual(parseDate('2026-10-05'), { date: '2026-10-05', invalid: false });
  assert.deepEqual(parseDate(46300), { date: '2026-10-05', invalid: false });
  assert.equal(parseDate('31/02/2026').invalid, true);
  assert.equal(parseDate('next tuesday').invalid, true);
  assert.deepEqual(parseDate(''), { date: null, invalid: false });
});

test('times: 24-hour and am/pm', () => {
  assert.equal(parseTime('14:30').minutes, 870);
  assert.equal(parseTime('2:30 pm').minutes, 870);
  assert.equal(parseTime('9am').minutes, 540);
  assert.equal(parseTime('12am').minutes, 0);
  assert.equal(parseTime('25:00').invalid, true);
});

test('importance words and urgent/important columns', () => {
  assert.equal(parseImportance('Do first'), 'do');
  assert.equal(parseImportance('Schedule'), 'schedule');
  assert.equal(parseImportance('', 'yes', 'no'), 'delegate');
  assert.equal(parseImportance('', 'no', 'yes'), 'schedule');
  assert.equal(parseImportance(''), null);
});

test('subtasks split on semicolons; samples skip empty cells', () => {
  assert.deepEqual(parseSubtasks('Buy book; Read chapter 1;'), ['Buy book', 'Read chapter 1']);
  assert.deepEqual(samples([{ A: '' }, { A: 'x' }, { A: 'y' }, { A: 'z' }, { A: 'w' }], 'A'), ['x', 'y', 'z']);
});
