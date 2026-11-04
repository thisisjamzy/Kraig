// Reverting a reconciliation (app/src/shared/budget/revertPlan.ts): every
// wallet back to its balance just before the check.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRevert, loggedAfter, checkChangesOf, type RevertCheck, type RevertAccount } from '../app/src/shared/budget/revertPlan';

const U = 'unjustified';
const d = (m: number, day: number, h = 12) => new Date(2026, m - 1, day, h);

// Before the check on 10 Oct: MTN 100,000, UBA 50,000, Unjustified 0.
// The check reported MTN 95,000 and UBA 50,000: MTN -5,000, Unjustified +5,000.
const check: RevertCheck = {
  id: 'r1',
  performedAt: d(10, 10),
  reportedBalances: { mtn: 95_000, uba: 50_000 },
  ledgerBalancesAtTime: { mtn: 100_000, uba: 50_000 },
  totalGap: 5_000,
  adjustments: { mtn: -5_000, uba: 0, [U]: 5_000 },
};
const earlier: RevertCheck = { ...check, id: 'r0', performedAt: d(9, 1), adjustments: { mtn: -1_000, [U]: 1_000 } };

// After it: a 20,000 expense on MTN, a 10,000 transfer MTN -> UBA with 500
// charges, a salary of 30,000 into UBA, and an expense backdated to 5 Oct
// but logged on 12 Oct.
const transactions = [
  { id: 't1', accountId: 'mtn', amount: 20_000, direction: 'Outflow', date: d(10, 11), loggedAt: d(10, 11), description: 'Rent' },
  { id: 't2', accountId: 'uba', amount: 30_000, direction: 'Inflow', date: d(10, 13), loggedAt: d(10, 13), description: 'Salary' },
  { id: 't3', accountId: 'mtn', amount: 2_000, direction: 'Outflow', date: d(10, 5), loggedAt: d(10, 12), description: 'Backdated' },
  { id: 'old', accountId: 'mtn', amount: 7_000, direction: 'Outflow', date: d(10, 1), loggedAt: d(10, 1), description: 'Before' },
];
const transfers = [{ id: 'x1', fromAccountId: 'mtn', toAccountId: 'uba', amount: 10_000, charges: 500, date: d(10, 12), loggedAt: d(10, 12) }];

// Now: MTN 95,000 - 20,000 - 2,000 - 10,500 = 62,500; UBA 50,000 + 10,000 + 30,000 = 90,000.
const accounts: RevertAccount[] = [
  { id: 'mtn', name: 'MTN', currentBalance: 62_500 },
  { id: 'uba', name: 'UBA', currentBalance: 90_000 },
  { id: U, name: 'Unjustified', currentBalance: 5_000 },
];

const plan = planRevert({ target: check, checks: [earlier, check], transactions, transfers, accounts, unjustifiedId: U });
const after = (id: string) => plan.balances.find((b) => b.accountId === id)?.after;

test('every wallet goes back to its balance before the check', () => {
  assert.equal(after('mtn'), 100_000);
  assert.equal(after('uba'), 50_000);
  assert.equal(after(U), 0);
});

test('only the check and later ones are undone, never an earlier one', () => {
  assert.deepEqual(plan.checkIds, ['r1']);
});

test('entries logged after go, including one backdated to before the check; older ones stay', () => {
  assert.deepEqual(plan.entries.map((e) => e.id).sort(), ['t1', 't2', 't3', 'x1']);
});

test('expenses are deleted first and income last', () => {
  const order = plan.entries.map((e) => e.id);
  assert.ok(order.indexOf('t1') < order.indexOf('x1'));
  assert.ok(order.indexOf('x1') < order.indexOf('t2'));
});

test('later checks and clears after the check are undone too', () => {
  const later: RevertCheck = { ...check, id: 'r2', performedAt: d(10, 20), adjustments: { uba: 1_000, [U]: -1_000 } };
  const withClear: RevertAccount[] = [
    { id: 'mtn', name: 'MTN', currentBalance: 62_500 },
    { id: 'uba', name: 'UBA', currentBalance: 91_000 },
    // 5,000 - 1,000, then cleared to 0 on 21 Oct; a clear on 1 Sep is older and stays.
    { id: U, name: 'Unjustified', currentBalance: 0, unaccountedClears: [{ at: d(9, 2), amount: 1_000 }, { at: d(10, 21), amount: 4_000 }] },
  ];
  const p = planRevert({ target: check, checks: [later, check, earlier], transactions, transfers, accounts: withClear, unjustifiedId: U });
  assert.deepEqual(p.checkIds, ['r2', 'r1']);
  assert.equal(p.clears.length, 1);
  // Unchanged wallets aren't listed: Unjustified is 0 now and after.
  const a = (id: string) => p.balances.find((b) => b.accountId === id)?.after ?? withClear.find((w) => w.id === id)?.currentBalance;
  assert.equal(a('mtn'), 100_000);
  assert.equal(a('uba'), 50_000);
  assert.equal(a(U), 0);
  assert.equal(p.balances.some((b) => b.accountId === U), false);
});

test('excluded transactions are left alone, frozen savings delete without moving the balance', () => {
  const p = planRevert({
    target: check,
    checks: [check],
    transactions: [
      { id: 'e', accountId: 'mtn', amount: 999, direction: 'Outflow', date: d(10, 11), excluded: true },
      { id: 'f', accountId: 'mtn', amount: 3_000, direction: 'Outflow', date: d(10, 11), isFrozenSavings: true },
    ],
    transfers: [],
    accounts: [{ id: 'mtn', name: 'MTN', currentBalance: 95_000 }, { id: U, name: 'Unjustified', currentBalance: 5_000 }],
    unjustifiedId: U,
  });
  assert.deepEqual(p.skipped.map((e) => e.id), ['e']);
  assert.deepEqual(p.entries.map((e) => e.id), ['f']);
  assert.equal(p.balances.find((b) => b.accountId === 'mtn')?.after, 100_000);
});

test('a frozen wallet the entries touch blocks the revert', () => {
  const frozen = accounts.map((a) => (a.id === 'uba' ? { ...a, frozen: true } : a));
  const p = planRevert({ target: check, checks: [check], transactions, transfers, accounts: frozen, unjustifiedId: U });
  assert.deepEqual(p.frozen, ['uba']);
});

test('entries older than loggedAt fall back to their date', () => {
  assert.equal(loggedAfter({ date: d(10, 11) }, d(10, 10)), true);
  assert.equal(loggedAfter({ date: d(10, 9) }, d(10, 10)), false);
  assert.equal(loggedAfter({ date: d(10, 9), loggedAt: d(10, 11) }, d(10, 10)), true);
});

test('a check saved before adjustments existed: reported less ledger, gap on Unjustified', () => {
  const legacy = { ...check, adjustments: undefined };
  assert.deepEqual(checkChangesOf(legacy, U), { mtn: -5_000, uba: 0, [U]: 5_000 });
});
