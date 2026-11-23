// Transaction templates (app/src/viewmodels/templates.ts, brief 23 Nov 2026, 4.x).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByRepeat, isDueOn, recentFirst, repeatText, searchTemplates } from '../app/src/viewmodels/templates';

const d = (iso: string) => new Date(`${iso}T09:00:00`);

describe('templates', () => {
  test('grouped Daily, Weekly, Monthly, No repeat; archived left out', () => {
    const groups = groupByRepeat([
      { id: 'a', name: 'Salary', repeat: 'monthly' as const },
      { id: 'b', name: 'Transport', repeat: 'daily' as const },
      { id: 'c', name: 'Gift' },
      { id: 'd', name: 'Old', repeat: 'daily' as const, archived: true },
    ]);
    assert.deepEqual(groups.map((g) => g.label), ['Daily', 'Monthly', 'No repeat']);
    assert.deepEqual(groups[0].templates.map((t) => t.id), ['b']);
  });

  test('most recently used first', () => {
    const list = recentFirst([
      { id: 'a', name: 'A', lastUsedAt: d('2026-11-01') },
      { id: 'b', name: 'B', lastUsedAt: d('2026-11-20') },
      { id: 'c', name: 'C' },
    ]);
    assert.deepEqual(list.map((t) => t.id), ['b', 'a', 'c']);
    assert.deepEqual(searchTemplates(list, 'b').map((t) => t.id), ['b']);
  });

  test('due days: daily, weekly by weekday, monthly clamped to the month', () => {
    assert.equal(isDueOn({ id: 'x', name: 'x', repeat: 'daily' }, d('2026-11-23')), true);
    // 23 Nov 2026 is a Monday.
    assert.equal(isDueOn({ id: 'x', name: 'x', repeat: 'weekly', repeatDay: 1 }, d('2026-11-23')), true);
    assert.equal(isDueOn({ id: 'x', name: 'x', repeat: 'weekly', repeatDay: 2 }, d('2026-11-23')), false);
    assert.equal(isDueOn({ id: 'x', name: 'x', repeat: 'monthly', repeatDay: 31 }, d('2026-11-30')), true);
    assert.equal(isDueOn({ id: 'x', name: 'x', repeat: 'none' }, d('2026-11-30')), false);
  });

  test('recorded or skipped today: no longer due', () => {
    assert.equal(isDueOn({ id: 'x', name: 'x', repeat: 'daily', lastUsedAt: d('2026-11-23') }, d('2026-11-23')), false);
    assert.equal(isDueOn({ id: 'x', name: 'x', repeat: 'daily', lastSkippedOn: '2026-11-23' }, d('2026-11-23')), false);
    assert.equal(isDueOn({ id: 'x', name: 'x', repeat: 'daily', lastSkippedOn: '2026-11-22' }, d('2026-11-23')), true);
  });

  test('repeat in words', () => {
    assert.equal(repeatText({ repeat: 'weekly', repeatDay: 5 }), 'Every Friday');
    assert.equal(repeatText({ repeat: 'monthly', repeatDay: 22 }), 'Every month on the 22nd');
  });
});
