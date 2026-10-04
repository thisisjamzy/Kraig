// A debt's wallet effect: switching between cash debt and record only, the
// cash-debt edits that move money, undo, idempotence and all-or-nothing
// saves. Runs the real runner (walletEffectRun.ts) on an in-memory store
// that commits only when the whole transaction succeeds, like Firestore's
// runTransaction.
// Run: npx tsx --test test/debtWalletEffect.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWalletChange, type WalletChange } from '../app/src/shared/debt/walletEffect';
import {
  runDeleteDebt,
  runWalletChange,
  undoWalletChange,
  walletStateOf,
  type LedgerDoc,
  type LedgerStore,
  type LedgerTxn,
} from '../app/src/shared/debt/walletEffectRun';

const LONG_DASH = /[–—]/;
const ctx = { base: 'XAF', rates: {} };
// Saturday 3 October 2026.
const now = new Date(2026, 9, 3, 15, 0);

type Docs = Map<string, LedgerDoc>;

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !(v instanceof Date) && !Array.isArray(v);
}

function deepMerge(target: LedgerDoc, patch: LedgerDoc): LedgerDoc {
  const out: LedgerDoc = { ...target };
  for (const [k, v] of Object.entries(patch)) out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k] as LedgerDoc, v) : v;
  return out;
}

/** An in-memory LedgerStore: writes are buffered and committed only if the whole run succeeds. */
class MemoryStore implements LedgerStore {
  docs: Docs;
  failOn: ((op: string, path: string) => boolean) | null = null;
  private seq = 0;
  constructor(docs: Record<string, LedgerDoc>) {
    this.docs = new Map(Object.entries(structuredClone(docs)));
  }
  async linkedTransactionIds(debtId: string) {
    return [...this.docs].filter(([p, d]) => p.startsWith('transactions/') && d.linkedDebtId === debtId).map(([p]) => p.split('/')[1]);
  }
  async repaymentIds(debtId: string) {
    const prefix = `debts/${debtId}/repayments/`;
    return [...this.docs.keys()].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
  }
  newId() {
    this.seq += 1;
    return `new${this.seq}`;
  }
  async run<T>(fn: (t: LedgerTxn) => Promise<T>): Promise<T> {
    const staged: Docs = new Map(this.docs);
    let wrote = false;
    const check = (op: string, path: string) => {
      wrote = true;
      if (this.failOn?.(op, path)) throw new Error(`Simulated failure writing ${path}`);
    };
    const t: LedgerTxn = {
      get: async (path) => {
        assert.equal(wrote, false, `read ${path} after a write`);
        const d = this.docs.get(path);
        return d ? structuredClone(d) : null;
      },
      set: (path, data) => {
        check('set', path);
        staged.set(path, structuredClone(data));
      },
      merge: (path, data) => {
        check('merge', path);
        staged.set(path, deepMerge(staged.get(path) ?? {}, structuredClone(data)));
      },
      delete: (path) => {
        check('delete', path);
        staged.delete(path);
      },
    };
    const result = await fn(t);
    this.docs = staged;
    return result;
  }
  get(path: string) {
    return this.docs.get(path) as Record<string, unknown> | undefined;
  }
  balance(id: string) {
    return this.get(`accounts/${id}`)!.currentBalance as number;
  }
  month(key: string) {
    return this.get(`statsMonthly/${key}`) as { totalIncome: number; totalExpense: number; transactionCount: number } | undefined;
  }
  /** Everything that counts: balances, month figures, home, transactions. */
  ledger() {
    const out: Record<string, unknown> = {};
    for (const [path, doc] of this.docs) {
      if (path.startsWith('accounts/')) out[path] = doc.currentBalance;
      else if (path.startsWith('statsMonthly/')) out[path] = { i: doc.totalIncome, e: doc.totalExpense, c: doc.transactionCount, s: doc.perCategorySpend ?? {} };
      else if (path === 'stats/home') out[path] = { b: doc.totalBalanceBase, i: doc.thisMonthIncome, e: doc.thisMonthExpense };
      else if (path.startsWith('transactions/')) out[path] = { amount: doc.amount, accountId: doc.accountId, month: doc.month, excluded: Boolean(doc.excluded) };
      else if (path.includes('/repayments/')) out[path] = { amount: doc.amount, transactionId: doc.transactionId ?? null };
      else if (path.startsWith('debts/') && !path.includes('/activity/')) {
        out[path] = { type: doc.debtType, accountId: doc.accountId, principal: doc.principalAmount, balance: doc.currentBalance, repaid: doc.totalRepaid };
      }
    }
    return out;
  }
}

const day = (m: number, d: number) => new Date(2026, m, d);

function cashWorld() {
  return {
    'accounts/mtn': { name: 'MTN Mobile Money', currency: 'XAF', currentBalance: 1_138_257 },
    'accounts/orange': { name: 'Orange Money', currency: 'XAF', currentBalance: 50_000 },
    'statsMonthly/2026-10': { totalIncome: 500_000, totalExpense: 300_000, transactionCount: 10, perCategorySpend: { food: 200_000 }, perCategoryCount: { food: 6 } },
    'statsMonthly/2026-09': { totalIncome: 400_000, totalExpense: 250_000, transactionCount: 9 },
    'stats/home': { totalBalanceBase: 1_188_257, thisMonthIncome: 500_000, thisMonthExpense: 300_000 },
    'debts/d1': {
      name: 'Momokash loan',
      debtType: 'cash',
      accountId: 'mtn',
      principalAmount: 200_000,
      currentBalance: 100_000,
      totalRepaid: 100_000,
      currency: 'XAF',
      startDate: day(9, 1),
      borrowingTransactionId: 'b1',
    },
    'transactions/b1': {
      date: day(9, 1), type: 'Income', description: 'Loan received: Momokash loan', accountId: 'mtn', categoryId: null,
      amount: 200_000, direction: 'Inflow', signedAmount: 200_000, month: '2026-10', incomeSubtype: 'debt_financing', linkedDebtId: 'd1',
    },
    'transactions/r1': {
      date: day(9, 2), type: 'Expense', description: 'Repayment: Momokash loan', accountId: 'mtn', categoryId: null,
      amount: 50_000, direction: 'Outflow', signedAmount: -50_000, month: '2026-10', isDebtRepayment: true, linkedDebtId: 'd1',
    },
    'transactions/r2': {
      date: day(9, 3), type: 'Expense', description: 'Repayment: Momokash loan', accountId: 'mtn', categoryId: null,
      amount: 50_000, direction: 'Outflow', signedAmount: -50_000, month: '2026-10', isDebtRepayment: true, linkedDebtId: 'd1',
    },
    'debts/d1/repayments/p1': { debtId: 'd1', amount: 50_000, date: day(9, 2), method: 'planned', notes: '', transactionId: 'r1' },
    'debts/d1/repayments/p2': { debtId: 'd1', amount: 50_000, date: day(9, 3), method: 'manual', notes: '', transactionId: 'r2' },
  } as Record<string, LedgerDoc>;
}

function recordOnlyWorld() {
  const w = cashWorld();
  delete w['transactions/b1'];
  delete w['transactions/r1'];
  delete w['transactions/r2'];
  w['debts/d1'] = { ...w['debts/d1'], debtType: 'existing', accountId: null, borrowingTransactionId: null, startDate: day(8, 15) };
  w['debts/d1/repayments/p1'] = { ...w['debts/d1/repayments/p1'], transactionId: null };
  w['debts/d1/repayments/p2'] = { ...w['debts/d1/repayments/p2'], transactionId: null };
  return w;
}

let ids = 0;
const run = (store: MemoryStore, change: WalletChange, changeId = `c${++ids}`) =>
  runWalletChange(store, { debtId: 'd1', change, ctx, now, changeId, uid: 'u1' });

test('cash debt to record only: wallet and October income drop, the borrowing is excluded, the debt stays', async () => {
  const store = new MemoryStore(cashWorld());
  const result = await run(store, { kind: 'toRecordOnly', repayments: 'keep' });
  assert.equal(result.applied, true);
  assert.equal(store.balance('mtn'), 938_257);
  assert.equal(store.month('2026-10')!.totalIncome, 300_000);
  assert.equal(store.month('2026-10')!.totalExpense, 300_000);
  assert.equal(store.get('stats/home')!.thisMonthIncome, 300_000);
  assert.equal(store.get('stats/home')!.totalBalanceBase, 988_257);
  const b1 = store.get('transactions/b1')!;
  assert.equal(b1.excluded, true);
  assert.equal(b1.excludedReason, 'Debt changed to record only on 3 Oct');
  assert.equal(b1.amount, 200_000, 'kept for the audit trail, not deleted');
  // Repayments kept: money really left the account.
  assert.equal(store.get('transactions/r1')!.excluded, undefined);
  const debt = store.get('debts/d1')!;
  assert.equal(debt.debtType, 'existing');
  assert.equal(debt.principalAmount, 200_000);
  assert.equal(debt.currentBalance, 100_000, 'balance owed never moves on a switch');
  assert.deepEqual(result.plan!.lines.slice(0, 2), [
    'MTN Mobile Money balance goes from 1,138,257 to 938,257.',
    'October income drops by 200,000 (borrowed).',
  ]);
  for (const line of result.plan!.lines) assert.doesNotMatch(line, LONG_DASH);
});

test('record only with "remove them from my balances": repayments come back to the wallet, stay on the debt', async () => {
  const keep = new MemoryStore(cashWorld());
  await run(keep, { kind: 'toRecordOnly', repayments: 'keep' });
  const remove = new MemoryStore(cashWorld());
  const result = await run(remove, { kind: 'toRecordOnly', repayments: 'remove' });
  assert.equal(remove.balance('mtn') - keep.balance('mtn'), 100_000);
  assert.equal(remove.get('transactions/r1')!.excluded, true);
  assert.equal(remove.get('transactions/r2')!.excluded, true);
  assert.equal(remove.month('2026-10')!.totalExpense, 200_000);
  assert.ok(remove.get('debts/d1/repayments/p1'), 'repayments remain on the debt');
  assert.equal(remove.get('debts/d1')!.currentBalance, 100_000);
  assert.ok(result.plan!.lines.includes('2 repayment transactions are excluded from your figures (kept under "Show excluded").'));
});

test('record only to cash debt into Orange Money in September: income appears in September, with a warning', async () => {
  const store = new MemoryStore(recordOnlyWorld());
  const result = await run(store, { kind: 'toCash', accountId: 'orange', receivedOn: day(8, 15), repayments: { fromAccounts: false } });
  assert.equal(result.applied, true);
  const created = [...store.docs].find(([p, d]) => p.startsWith('transactions/') && d.incomeSubtype === 'debt_financing');
  assert.ok(created, 'a debt financing income transaction exists');
  const [path, tx] = created!;
  assert.equal(tx.month, '2026-09');
  assert.equal(tx.accountId, 'orange');
  assert.equal(tx.amount, 200_000);
  assert.equal(tx.linkedDebtId, 'd1');
  assert.equal(store.balance('orange'), 250_000);
  assert.equal(store.month('2026-09')!.totalIncome, 600_000);
  assert.equal(store.month('2026-10')!.totalIncome, 500_000, 'October untouched');
  assert.equal(store.get('stats/home')!.thisMonthIncome, 500_000);
  assert.equal(store.get('debts/d1')!.debtType, 'cash');
  assert.equal(store.get('debts/d1')!.borrowingTransactionId, path.split('/')[1]);
  assert.deepEqual(result.plan!.warnings, ["This adds 200,000 to September's income and changes September's figures."]);
});

test('record only to cash debt with past repayments paid from an account creates and links their expenses', async () => {
  const store = new MemoryStore(recordOnlyWorld());
  await run(store, {
    kind: 'toCash',
    accountId: 'orange',
    receivedOn: day(8, 15),
    repayments: { fromAccounts: true, accountId: 'mtn', perRepayment: { p2: 'orange' } },
  });
  const p1 = store.get('debts/d1/repayments/p1')!.transactionId as string;
  const p2 = store.get('debts/d1/repayments/p2')!.transactionId as string;
  assert.ok(p1 && p2);
  assert.equal(store.get(`transactions/${p1}`)!.accountId, 'mtn');
  assert.equal(store.get(`transactions/${p2}`)!.accountId, 'orange');
  assert.equal(store.get(`transactions/${p1}`)!.isDebtRepayment, true);
  assert.equal(store.balance('mtn'), 1_088_257);
  assert.equal(store.balance('orange'), 200_000);
  assert.equal(store.month('2026-10')!.totalExpense, 400_000);
});

test('changing a cash debt amount from 200,000 to 250,000 raises the transaction and the wallet by 50,000', async () => {
  const store = new MemoryStore(cashWorld());
  const result = await run(store, { kind: 'edit', amount: 250_000 });
  assert.equal(store.get('transactions/b1')!.amount, 250_000);
  assert.equal(store.balance('mtn'), 1_188_257);
  assert.equal(store.month('2026-10')!.totalIncome, 550_000);
  assert.equal(store.get('debts/d1')!.principalAmount, 250_000);
  assert.equal(store.get('debts/d1')!.currentBalance, 150_000);
  assert.ok(result.plan!.lines.includes('What you owe goes from 100,000 to 150,000.'));
});

test('changing the account received into moves the balance effect', async () => {
  const store = new MemoryStore(cashWorld());
  await run(store, { kind: 'edit', accountId: 'orange' });
  assert.equal(store.balance('mtn'), 938_257);
  assert.equal(store.balance('orange'), 250_000);
  assert.equal(store.month('2026-10')!.totalIncome, 500_000, 'same month, same income');
  assert.equal(store.get('debts/d1')!.accountId, 'orange');
});

test('changing the date moves the income to the new month, with a warning', async () => {
  const store = new MemoryStore(cashWorld());
  const result = await run(store, { kind: 'edit', date: day(8, 20) });
  assert.equal(store.month('2026-10')!.totalIncome, 300_000);
  assert.equal(store.month('2026-09')!.totalIncome, 600_000);
  assert.equal(store.get('transactions/b1')!.month, '2026-09');
  assert.equal(store.balance('mtn'), 1_138_257);
  assert.match(result.plan!.warnings[0], /from October to September/);
});

test('undo after a switch restores every balance, month figure and transaction exactly', async () => {
  for (const change of [
    { kind: 'toRecordOnly', repayments: 'remove' },
    { kind: 'toRecordOnly', repayments: 'keep' },
    { kind: 'edit', amount: 250_000, accountId: 'orange', date: day(8, 20) },
  ] as WalletChange[]) {
    const store = new MemoryStore(cashWorld());
    const before = store.ledger();
    const { changeId } = await run(store, change);
    assert.notDeepEqual(store.ledger(), before);
    const undone = await undoWalletChange(store, { debtId: 'd1', changeId, undoId: `${changeId}-undo`, now, uid: 'u1' });
    assert.equal(undone.applied, true);
    assert.deepEqual(store.ledger(), before, `undo of ${change.kind}`);
    assert.equal(store.get(`debts/d1/activity/${changeId}`)!.undoneAt instanceof Date, true);
    assert.equal(store.get(`debts/d1/activity/${changeId}-undo`)!.kind, 'undo');
  }
  // Undo removes transactions the change created.
  const store = new MemoryStore(recordOnlyWorld());
  const before = store.ledger();
  const { changeId } = await run(store, { kind: 'toCash', accountId: 'orange', receivedOn: day(8, 15), repayments: { fromAccounts: true, accountId: 'mtn' } });
  await undoWalletChange(store, { debtId: 'd1', changeId, undoId: 'u', now, uid: 'u1' });
  assert.deepEqual(store.ledger(), before);
});

test('undo twice does nothing more; undo after a later change is refused', async () => {
  const store = new MemoryStore(cashWorld());
  const { changeId } = await run(store, { kind: 'toRecordOnly', repayments: 'keep' });
  await undoWalletChange(store, { debtId: 'd1', changeId, undoId: 'x1', now, uid: 'u1' });
  const after = store.ledger();
  assert.equal((await undoWalletChange(store, { debtId: 'd1', changeId, undoId: 'x2', now, uid: 'u1' })).applied, false);
  assert.deepEqual(store.ledger(), after);

  const other = new MemoryStore(cashWorld());
  const first = await run(other, { kind: 'edit', amount: 250_000 });
  await run(other, { kind: 'edit', amount: 260_000 });
  await assert.rejects(undoWalletChange(other, { debtId: 'd1', changeId: first.changeId, undoId: 'x3', now, uid: 'u1' }), /changed since/);
});

test('saving the same change twice makes no further difference', async () => {
  const store = new MemoryStore(cashWorld());
  const first = await run(store, { kind: 'toRecordOnly', repayments: 'remove' }, 'same');
  const once = store.ledger();
  // A retried save (same change id) stops at its activity entry.
  assert.equal((await run(store, { kind: 'toRecordOnly', repayments: 'remove' }, 'same')).applied, false);
  // The same request as a new change plans nothing: the debt is already there.
  const again = await run(store, { kind: 'toRecordOnly', repayments: 'remove' });
  assert.equal(again.applied, false);
  assert.equal(again.plan!.noop, true);
  assert.deepEqual(store.ledger(), once);
  assert.equal(first.applied, true);
  // Same for an edit to the amount it already has.
  const edit = new MemoryStore(cashWorld());
  assert.equal((await run(edit, { kind: 'edit', amount: 200_000 })).applied, false);
});

test('a save that fails part way leaves nothing changed', async () => {
  for (const failing of ['stats/home', 'debts/d1', 'statsMonthly/2026-10', 'accounts/mtn']) {
    const store = new MemoryStore(cashWorld());
    const before = structuredClone([...store.docs]);
    store.failOn = (_op, path) => path === failing;
    await assert.rejects(run(store, { kind: 'toRecordOnly', repayments: 'remove' }), /Simulated failure/);
    assert.deepEqual([...store.docs], before, `failing at ${failing}`);
  }
});

test('switching back after record only re-includes the same borrowing transaction', async () => {
  const store = new MemoryStore(cashWorld());
  const before = store.ledger();
  await run(store, { kind: 'toRecordOnly', repayments: 'keep' });
  await run(store, { kind: 'toCash', accountId: 'mtn', receivedOn: day(9, 1), repayments: { fromAccounts: true, accountId: 'mtn' } });
  assert.deepEqual(store.ledger(), before);
  assert.equal(store.get('transactions/b1')!.excluded, false);
  assert.equal(store.get('transactions/b1')!.excludedReason, null);
});

test('a frozen account blocks the change; going below zero only warns', async () => {
  const frozen = cashWorld();
  frozen['accounts/mtn'] = { ...frozen['accounts/mtn'], frozen: true };
  await assert.rejects(run(new MemoryStore(frozen), { kind: 'toRecordOnly', repayments: 'keep' }), /frozen/);

  const low = cashWorld();
  low['accounts/mtn'] = { ...low['accounts/mtn'], currentBalance: 120_000 };
  const docs = Object.entries(low).map(([p, d]) => ({ path: p, d: { ...d, id: p.split('/').pop()! } }));
  const pick = (prefix: string) => docs.filter((x) => x.path.startsWith(prefix)).map((x) => x.d);
  const state = walletStateOf('d1', low['debts/d1'], pick('debts/d1/repayments/'), pick('transactions/'), pick('accounts/'));
  const plan = planWalletChange(state, { kind: 'toRecordOnly', repayments: 'keep' }, ctx, now, () => 'n');
  assert.deepEqual(plan.warnings, ['MTN Mobile Money would go below zero (-80,000).']);
});

test('the preview for a record-only debt switch says balances change, never long dashes', () => {
  const w = recordOnlyWorld();
  const docs = Object.entries(w).map(([p, d]) => ({ path: p, d: { ...d, id: p.split('/').pop()! } }));
  const pick = (prefix: string) => docs.filter((x) => x.path.startsWith(prefix)).map((x) => x.d);
  const state = walletStateOf('d1', w['debts/d1'], pick('debts/d1/repayments/'), pick('transactions/'), pick('accounts/'));
  const plan = planWalletChange(state, { kind: 'toCash', accountId: 'orange', receivedOn: day(9, 3), repayments: { fromAccounts: false } }, ctx, now, () => 'n');
  assert.deepEqual(plan.lines, [
    'Orange Money balance goes from 50,000 to 250,000.',
    'October income rises by 200,000 (borrowed).',
    'A borrowing transaction of 200,000 is created on 3 Oct.',
    'What you owe stays 100,000.',
  ]);
  assert.deepEqual(plan.warnings, []);
  for (const line of [...plan.lines, ...plan.warnings]) assert.doesNotMatch(line, LONG_DASH);
});

test('deleting a debt without repayments removes it and reverses its borrowing; with repayments it is refused', async () => {
  const w = cashWorld();
  delete w['transactions/r1'];
  delete w['transactions/r2'];
  delete w['debts/d1/repayments/p1'];
  delete w['debts/d1/repayments/p2'];
  w['debts/d1/activity/a1'] = { kind: 'created' };
  const store = new MemoryStore(w);
  await runDeleteDebt(store, { debtId: 'd1', ctx, now, uid: 'u1', activityIds: ['a1'] });
  assert.equal(store.get('debts/d1'), undefined);
  assert.equal(store.get('debts/d1/activity/a1'), undefined);
  assert.equal(store.get('transactions/b1'), undefined);
  assert.equal(store.balance('mtn'), 938_257);
  assert.equal(store.month('2026-10')!.totalIncome, 300_000);

  await assert.rejects(runDeleteDebt(new MemoryStore(cashWorld()), { debtId: 'd1', ctx, now, uid: 'u1', activityIds: [] }), /Archive it instead/);
});
