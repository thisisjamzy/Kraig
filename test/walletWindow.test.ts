// A wallet over a window (app/src/shared/budget/walletWindow.ts): its
// balance on a past date, the window's statement, the presets, and the
// screens built on them (a wallet's audit, reconciling for a window,
// selecting transactions to delete).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { balanceAt, endsNow, reconciliationAdjustments, walletFlows, windowFor, windowStatement } from '../app/src/shared/budget/walletWindow';

const read = (path: string) => readFileSync(join(__dirname, '../app/src', path), 'utf8');
const d = (m: number, day: number, h = 12) => new Date(2026, m - 1, day, h);
const now = d(10, 14);

// MTN: salary in on 25 Sep, a transfer out with charges on 2 Oct, an
// expense on 9 Oct; a reconciliation took 5,000 off on 11 Oct.
const flows = walletFlows(
  'mtn',
  [
    { accountId: 'mtn', date: d(9, 25), amount: 100_000, direction: 'Inflow' },
    { accountId: 'mtn', date: d(10, 9), amount: 20_000, direction: 'Outflow' },
    { accountId: 'mtn', date: d(10, 10), amount: 999, direction: 'Outflow', excluded: true },
    { accountId: 'mtn', date: d(10, 10), amount: 5_000, direction: 'Outflow', isFrozenSavings: true },
    { accountId: 'uba', date: d(10, 3), amount: 7_000, direction: 'Outflow' },
  ],
  [
    { fromAccountId: 'mtn', toAccountId: 'uba', date: d(10, 2), amount: 30_000, charges: 500 },
    { fromAccountId: 'uba', toAccountId: 'mtn', date: d(10, 12), amount: 10_000 },
  ]
);
const adjustments = [{ at: d(10, 11), amount: -5_000 }];
const balanceNow = 100_000 - 30_500 - 20_000 - 5_000 + 10_000; // 54,500

test('flows: transactions on the wallet and both sides of its transfers, nothing excluded or frozen', () => {
  assert.deepEqual(flows.map((f) => f.amount).sort((a, b) => a - b), [-30_500, -20_000, 10_000, 100_000]);
});

test('the balance on a past date is now less everything after it', () => {
  assert.equal(balanceAt(balanceNow, flows, adjustments, d(9, 30, 23)), 100_000);
  assert.equal(balanceAt(balanceNow, flows, adjustments, d(10, 10)), 49_500);
  assert.equal(balanceAt(balanceNow, flows, adjustments, now), balanceNow);
});

test('a window statement: opening + in − out + reconciliation changes = closing', () => {
  const october = windowFor('thisMonth', now);
  const st = windowStatement(balanceNow, flows, adjustments, october);
  assert.deepEqual(st, { opening: 100_000, moneyIn: 10_000, moneyOut: 50_500, adjusted: -5_000, closing: balanceNow });
  const september = windowStatement(balanceNow, flows, adjustments, windowFor('lastMonth', now));
  assert.deepEqual(september, { opening: 0, moneyIn: 100_000, moneyOut: 0, adjusted: 0, closing: 100_000 });
});

test('presets: last month is a whole month, custom dates never end after now', () => {
  const last = windowFor('lastMonth', now);
  assert.equal(last.from?.getDate(), 1);
  assert.equal(last.to.getMonth(), 8);
  assert.equal(last.to.getDate(), 30);
  assert.equal(endsNow(windowFor('thisMonth', now), now), true);
  assert.equal(endsNow(last, now), false);
  const custom = windowFor('custom', now, { from: '2026-10-01', to: '2027-01-01' });
  assert.equal(custom.to.getTime(), now.getTime());
});

test('reconciliation changes: kept when stored, else reported less ledger', () => {
  const checks = [
    { performedAt: d(9, 7), reportedBalances: { mtn: 8_000 }, ledgerBalancesAtTime: { mtn: 10_000 } },
    { performedAt: d(10, 11), reportedBalances: { mtn: 1 }, ledgerBalancesAtTime: { mtn: 2 }, adjustments: { mtn: -5_000 } },
  ];
  assert.deepEqual(reconciliationAdjustments(checks, 'mtn'), [{ at: d(9, 7), amount: -2_000 }, { at: d(10, 11), amount: -5_000 }]);
});

test('reconciling for a window compares the ledger on its last day and applies the difference to today', () => {
  const src = read('shared/firestore/unaccountedBalance.ts');
  assert.match(src, /export async function balancesAsOf/);
  assert.match(src, /currentBalance: increment\(changes\[wallet\.id\]\)/);
  assert.match(src, /windowTo: Timestamp\.fromDate/);
  // Only the wallets reported take part, so one wallet can be reconciled alone.
  assert.match(src, /reportedBalances\[a\.id\] !== undefined/);
  assert.match(read('screens/Reconciliation/ReconciliationScreen.tsx'), /<WindowPicker/);
});

test('a wallet has its own audit page, linked from its page on phone and web', () => {
  assert.ok(existsSync(join(__dirname, '../app/app/(mobile)/wallets/[wallet]/audit/page.tsx')));
  assert.match(read('screens/WalletAudit/WalletAuditScreen.tsx'), /Opening balance[\s\S]*Money in[\s\S]*Money out[\s\S]*Closing balance/);
  for (const p of ['screens/WalletDetail/WalletDetailScreen.tsx', 'phone/screens/WalletDetail/WalletDetailScreen.tsx']) assert.match(read(p), /\/audit`/, p);
});

test('History lists can select transactions and delete them, each through the normal delete', () => {
  const logic = read('logic/planning/useRecordSelection.ts');
  assert.match(logic, /deleteTransactionWithAggregation\(uid, row\.id, ctx\)/);
  assert.match(logic, /deleteTransferWithAggregation\(uid, row\.id\)/);
  for (const p of ['screens/Planning/HistoryView.tsx', 'phone/screens/Planning/HistoryView.tsx']) assert.match(read(p), /<SelectionBar/, p);
  // Asks first, inline.
  assert.match(read('widgets/Selection/SelectionBar.tsx'), /can’t be undone/);
});

test('a transfer opens as a transfer from any in-app link, so it can be edited', () => {
  const page = readFileSync(join(__dirname, '../app/app/(mobile)/transactions/[id]/page.tsx'), 'utf8');
  assert.match(page, /transfer=\{search\.kind === 'transfer'\}/);
  const logic = read('logic/transactionDetails/useLogic.ts');
  assert.doesNotMatch(logic, /URLSearchParams\(window\.location/);
  // Looked up as both, so a link without the hint still finds a transfer.
  assert.match(logic, /uid \? transactionRef\(uid, id\) : null/);
  assert.match(logic, /uid \? transferRef\(uid, id\) : null/);
  // Never "not found" before sign-in has loaded.
  assert.match(logic, /missing: !authLoading && Boolean\(uid\)/);
  for (const p of ['logic/editTransfer/useLogic.ts', 'logic/editTransaction/useLogic.ts']) assert.match(read(p), /notFound: !authLoading && Boolean\(uid\)/, p);
});

test('rows swipe right to edit and left to delete; Select is an icon after Search', () => {
  for (const p of ['screens/Planning/HistoryView.tsx', 'phone/screens/Planning/HistoryView.tsx']) {
    const src = read(p);
    assert.match(src, /<SwipeRow[^>]*editHref=\{editHref\(row\)\}[^>]*onDelete=/, p);
    assert.match(src, /formLink\('edit-transfer'/, p);
    assert.match(src, /trailing=\{[\s\S]*<ListQueryTool[\s\S]*<ListChecks/, p);
  }
  const bar = read('widgets/ListQuery/ListQueryBar.tsx');
  assert.ok(bar.indexOf('aria-label="Search"') < bar.indexOf('{trailing}'), 'trailing tools come after Search');
  // Wide screens: Edit and Delete at the end of each table row.
  assert.match(read('screens/Planning/HistoryTable.tsx'), /<RowActions/);
});
