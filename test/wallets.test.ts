// Wallets' figures (app/src/logic/wallets/model.ts).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceHistory, committedByAccount, freeTone, groupOf, groupWallets, lastReconciledByAccount, latestByAccount } from '../app/src/logic/wallets/model';

const d = (iso: string) => new Date(`${iso}T00:00:00`);

describe('wallets', () => {
  test('type groups', () => {
    assert.equal(groupOf('Mobile Money'), 'Mobile money');
    assert.equal(groupOf('E-wallet'), 'Mobile money');
    assert.equal(groupOf('Current Account'), 'Bank');
    assert.equal(groupOf('Debit Card'), 'Card');
    assert.equal(groupOf('Cash'), 'Cash');
    assert.equal(groupOf('Savings Account'), 'Savings');
  });

  test('committed this month: unpaid lines paid from each wallet, income never', () => {
    const c = committedByAccount([
      { type: 'Expense', accountId: 'momo', available: 150_000, actual: 0 },
      { type: 'Expense', accountId: 'momo', available: 60_000, actual: 20_000 },
      { type: 'Expense', accountId: 'momo', available: 10_000, actual: 12_000 },
      { type: 'Income', accountId: 'momo', available: 500_000, actual: 0 },
      { type: 'Savings', accountId: 'uba', available: 50_000, actual: 0, closed: true },
      { type: 'Expense', accountId: null, available: 5_000, actual: 0 },
    ]);
    assert.deepEqual([...c.entries()], [['momo', 190_000]]);
  });

  test('free after commitments is colored by state', () => {
    assert.equal(freeTone(-1_000, 50_000), 'bad');
    assert.equal(freeTone(2_000, 50_000), 'watch');
    assert.equal(freeTone(30_000, 50_000), 'good');
  });

  test('last activity and last reconciled per wallet', () => {
    const last = latestByAccount([
      { accountIds: ['momo'], date: d('2026-10-01') },
      { accountIds: ['momo', 'uba'], date: d('2026-10-03') },
      { accountIds: ['uba'], date: d('2026-09-20') },
    ]);
    assert.deepEqual(last.get('momo'), d('2026-10-03'));
    assert.deepEqual(last.get('uba'), d('2026-10-03'));
    const rec = lastReconciledByAccount([
      { performedAt: d('2026-09-01'), reportedBalances: { momo: 1 } },
      { performedAt: d('2026-09-15'), reportedBalances: { uba: 1 } },
    ]);
    assert.deepEqual(rec.get('momo'), d('2026-09-01'));
    assert.equal(rec.has('cash'), false);
  });

  test('balance at each month end works back from today', () => {
    const h = balanceHistory(
      100_000,
      [
        { date: d('2026-10-02'), signed: -50_000 },
        { date: d('2026-09-25'), signed: 200_000 },
      ],
      ['2026-08', '2026-09', '2026-10'],
      d('2026-10-05')
    );
    assert.deepEqual(h, [
      { month: '2026-08', balance: -50_000 },
      { month: '2026-09', balance: 150_000 },
      { month: '2026-10', balance: 100_000 },
    ]);
  });

  test('groups in order with subtotals', () => {
    const g = groupWallets([
      { group: 'Bank' as const, balance: 10 },
      { group: 'Mobile money' as const, balance: 5 },
      { group: 'Bank' as const, balance: 7 },
    ]);
    assert.deepEqual(
      g.map((x) => [x.group, x.subtotal]),
      [
        ['Mobile money', 5],
        ['Bank', 17],
      ]
    );
  });
});
