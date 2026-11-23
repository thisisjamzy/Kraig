// Month on month accountability (app/src/viewmodels/accountability.ts, brief 23 Nov 2026, 3.3).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { accountabilitySentence, periodKey, periodKeys, rateText, unaccountedByPeriod, type TxLike } from '../app/src/viewmodels/accountability';

// Noon UTC is 13:00 in Douala: always the same calendar day.
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const spend = (iso: string, amount: number, extra: Partial<TxLike> = {}): TxLike => ({ date: at(iso), amount, direction: 'Outflow', accountId: 'w1', ...extra });
const end = at('2026-11-20');

describe('unaccountedByPeriod', () => {
  test('each month carries its own unaccounted figure; a new month opens at zero', () => {
    const rows = unaccountedByPeriod([spend('2026-10-03', 100_000), spend('2026-11-03', 50_000)], [{ performedAt: at('2026-10-28'), totalGap: 12_000 }], {
      period: 'month',
      range: { end, count: 2 },
    });
    assert.deepEqual(rows.map((r) => r.key), ['2026-10', '2026-11']);
    assert.equal(rows[0].unaccounted, 12_000);
    assert.equal(rows[1].unaccounted, 0);
    assert.equal(rows[0].outflow, 100_000);
    assert.equal(rows[0].rate, 0.88);
    assert.equal(rows[1].rate, 1);
    assert.equal(rows[1].change.unaccounted, -12_000);
  });

  test('money explained in a later month lowers the month it happened in', () => {
    const tx = [
      spend('2026-10-03', 100_000),
      // Typed in on 18 November, dated 20 October, paid from Unaccounted money.
      spend('2026-10-20', 7_000, { accountId: 'unjustified', isUnjustifiedAdjustment: true }),
      spend('2026-11-04', 40_000),
    ];
    const rows = unaccountedByPeriod(tx, [{ performedAt: at('2026-10-28'), totalGap: 12_000 }], { period: 'month', range: { end, count: 2 } });
    assert.equal(rows[0].explained, 7_000);
    assert.equal(rows[0].unaccounted, 5_000);
    assert.equal(rows[1].unaccounted, 0);
  });

  test('a month with no outflow shows "No spending", not 100%', () => {
    const rows = unaccountedByPeriod([], [], { period: 'month', range: { end, count: 1 } });
    assert.equal(rows[0].rate, null);
    assert.equal(rateText(rows[0].rate), 'No spending');
  });

  test('transfers between own wallets are not outflow; fees and transfers out are', () => {
    const rows = unaccountedByPeriod([spend('2026-11-02', 10_000)], [], {
      period: 'month',
      range: { end, count: 1 },
      ownWalletIds: new Set(['w1', 'w2']),
      transfers: [
        { id: 't1', date: at('2026-11-05'), amount: 30_000, charges: 300, fromAccountId: 'w1', toAccountId: 'w2' },
        { id: 't2', date: at('2026-11-06'), amount: 5_000, fromAccountId: 'w1', toAccountId: 'someone-else' },
      ],
    });
    assert.equal(rows[0].outflow, 15_300);
  });

  test('money moved out of Unaccounted money into a wallet explains the gap; a paired leg does not count twice', () => {
    const rows = unaccountedByPeriod(
      [spend('2026-11-02', 50_000), spend('2026-11-03', 2_000, { accountId: 'w1', isUnjustifiedAdjustment: true, pairedTransferId: 'leg' })],
      [{ performedAt: at('2026-11-10'), totalGap: 10_000 }],
      {
        period: 'month',
        range: { end, count: 1 },
        transfers: [
          { id: 'found', date: at('2026-11-12'), amount: 3_000, fromAccountId: 'unjustified', toAccountId: 'w1' },
          { id: 'leg', date: at('2026-11-03'), amount: 2_000, fromAccountId: 'unjustified', toAccountId: 'w1' },
        ],
      }
    );
    assert.equal(rows[0].explained, 5_000);
    assert.equal(rows[0].unaccounted, 5_000);
  });

  test('excluded entries do not count; unaccounted never goes below zero', () => {
    const rows = unaccountedByPeriod([spend('2026-11-02', 9_000, { excluded: true }), spend('2026-11-03', 4_000, { accountId: 'unjustified', isUnjustifiedAdjustment: true })], [], {
      period: 'month',
      range: { end, count: 1 },
    });
    assert.equal(rows[0].outflow, 4_000);
    assert.equal(rows[0].unaccounted, 0);
  });

  test('weeks run Monday to Sunday in Douala time', () => {
    // Sunday 22 Nov 23:30 in Douala is 22:30 UTC: still the week of 16 Nov.
    assert.equal(periodKey(new Date('2026-11-22T22:30:00Z'), 'week'), '2026-11-16');
    // Monday 23 Nov 00:30 in Douala is 23:30 UTC on Sunday.
    assert.equal(periodKey(new Date('2026-11-22T23:30:00Z'), 'week'), '2026-11-23');
    assert.equal(periodKey(new Date('2026-11-30T23:30:00Z'), 'month'), '2026-12');
    assert.deepEqual(periodKeys(end, 3, 'week'), ['2026-11-02', '2026-11-09', '2026-11-16']);
    assert.deepEqual(periodKeys(at('2026-01-10'), 3, 'month'), ['2025-11', '2025-12', '2026-01']);
    const rows = unaccountedByPeriod([], [], { period: 'week', range: { end, count: 8 } });
    assert.equal(rows.length, 8);
    assert.equal(rows[7].label, '16 to 22 Nov');
  });

  test('the sentence names both months', () => {
    const rows = unaccountedByPeriod(
      [spend('2026-10-03', 100_000), spend('2026-11-03', 100_000)],
      [{ performedAt: at('2026-10-28'), totalGap: 12_000 }, { performedAt: at('2026-11-15'), totalGap: 6_000 }],
      { period: 'month', range: { end, count: 2 } }
    );
    assert.equal(accountabilitySentence(rows), 'You accounted for 94% of your spending in November, up from 88% in October.');
  });
});
