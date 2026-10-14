// The balance audit (app/src/shared/firestore/reconciliation.ts) next to
// reconciling and clearing the unaccounted balance: a reconciliation and a
// clear are deliberate changes, so the audit must never propose putting
// the unaccounted money back into the wallets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adjustmentsFor, computeAudit } from '../app/src/shared/firestore/reconciliation';
import type { FirestoreAccount } from '../app/src/shared/firestore/types';

const read = (path: string) => readFileSync(join(__dirname, '../app/src', path), 'utf8');

const wallet = (id: string, currentBalance: number, extra: Partial<FirestoreAccount> = {}): FirestoreAccount =>
  ({ id, name: id, type: 'Bank', currency: 'XAF', startingBalance: 0, currentBalance, notes: '', archived: false, ...extra }) as FirestoreAccount;
const income = (id: string, accountId: string, amount: number) => ({ id, accountId, amount, direction: 'Inflow' as const, description: '' });
const expense = (id: string, accountId: string, amount: number) => ({ id, accountId, amount, direction: 'Outflow' as const, description: '' });
const diff = (audit: ReturnType<typeof computeAudit>, id: string) => audit.accounts.find((a) => a.accountId === id)!.difference;

test('after a reconciliation the audit agrees, and finds no money to put back', () => {
  const entries = [income('i', 'bank', 100_000)];
  // Before: the ledger says 100,000, the bank says 60,000.
  const before = computeAudit([wallet('bank', 100_000), wallet('unjustified', 0, { isSystemWallet: true, balanceAdjustments: 0 })], entries, [], new Set());
  assert.equal(diff(before, 'bank'), 0);
  const adj = adjustmentsFor(before, { bank: 60_000, unjustified: 40_000 });
  // After the check: bank set to 60,000, 40,000 unaccounted.
  const after = computeAudit(
    [wallet('bank', 60_000, { balanceAdjustments: adj.bank }), wallet('unjustified', 40_000, { isSystemWallet: true, balanceAdjustments: adj.unjustified })],
    entries,
    [],
    new Set(['bank'])
  );
  assert.deepEqual(after.accounts.map((a) => a.difference), [0, 0]);
  // A later expense still adds up.
  const later = computeAudit(
    [wallet('bank', 50_000, { balanceAdjustments: adj.bank }), wallet('unjustified', 40_000, { isSystemWallet: true, balanceAdjustments: adj.unjustified })],
    [...entries, expense('e', 'bank', 10_000)],
    [],
    new Set(['bank'])
  );
  assert.equal(diff(later, 'bank'), 0);
});

test('clearing the unaccounted balance leaves every wallet as it is, and the audit agrees', () => {
  const accounts = [wallet('bank', 60_000, { balanceAdjustments: -40_000 }), wallet('unjustified', 40_000, { isSystemWallet: true, balanceAdjustments: 40_000 })];
  const entries = [income('i', 'bank', 100_000)];
  const adj = adjustmentsFor(computeAudit(accounts, entries, [], new Set(['bank'])), { unjustified: 0 });
  assert.deepEqual(Object.keys(adj), ['unjustified']);
  const after = computeAudit([accounts[0], wallet('unjustified', 0, { isSystemWallet: true, balanceAdjustments: adj.unjustified })], entries, [], new Set(['bank']));
  assert.deepEqual(after.accounts.map((a) => a.difference), [0, 0]);
});

test('wallets reconciled before adjustments were kept take their balance as right, once', () => {
  const audit = computeAudit([wallet('bank', 60_000), wallet('cash', 5_000)], [income('i', 'bank', 100_000), income('c', 'cash', 8_000)], [], new Set(['bank']));
  assert.deepEqual(audit.needsBaseline, ['bank']);
  assert.equal(diff(audit, 'bank'), 0);
  // Never reconciled: a real fault still shows.
  assert.equal(diff(audit, 'cash'), 3_000);
});

test('a transfer moves both sides, charges from the sender', () => {
  const audit = computeAudit([wallet('a', 69_000), wallet('b', 30_000)], [income('i', 'a', 100_000)], [{ id: 't', fromAccountId: 'a', toAccountId: 'b', amount: 30_000, charges: 1_000, description: '' }], new Set());
  assert.deepEqual(audit.accounts.map((a) => a.difference), [0, 0]);
});

test('reconciling and clearing write balanceAdjustments; the reconciliation screen offers the clear', () => {
  const src = read('shared/firestore/unaccountedBalance.ts');
  assert.match(src, /balanceAdjustments: adjustments\[wallet\.id\]/);
  assert.match(src, /export async function clearUnaccountedBalance/);
  assert.match(read('screens/Reconciliation/ReconciliationScreen.tsx'), /Clear unaccounted balance/);
});

test('a wallet page lists every transaction and transfer on it with the history filters', () => {
  const hook = read('logic/walletDetail/useHistory.ts');
  for (const field of ["'accountId'", "'fromAccountId'", "'toAccountId'"]) assert.ok(hook.includes(field), field);
  assert.match(read('screens/WalletDetail/WalletDetailScreen.tsx'), /<HistoryView/);
  assert.match(read('phone/screens/WalletDetail/WalletDetailScreen.tsx'), /<HistoryView/);
});

test('frozen savings never changed the balance, so the audit leaves them out', () => {
  const audit = computeAudit([wallet('bank', 100_000)], [income('i', 'bank', 100_000), { ...expense('f', 'bank', 20_000), isFrozenSavings: true }], [], new Set());
  assert.equal(diff(audit, 'bank'), 0);
});
