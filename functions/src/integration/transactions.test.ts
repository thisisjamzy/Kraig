// Integration test for onTransactionWrite (transactions.ts) — the file's own
// header comment calls this "the highest-risk correctness surface in this
// whole migration", so this is the one trigger worth testing end-to-end
// rather than trusting by inspection. Exercises the three real correctness
// bugs it calls out: a plain amount edit, a delete, and an edit that moves a
// transaction to a different account/category/month — plus the
// self-correcting signedAmount/month fixpoint.
//
// Every collection here lives under users/{TEST_UID}/... (see refs.ts's and
// firestore.rules' headers — no more top-level ledger collections, each
// account's data is private) — userCol() below is the one place that knows
// that path shape.
//
// Requires the Firestore + Functions emulators actually running with this
// package's real trigger attached (`npm run test:integration`, or from the
// repo root `npm run test:functions`, both wrap
// `firebase emulators:exec`) — this is a real onDocumentWritten trigger
// firing asynchronously in response to writes made here via the Admin SDK,
// not a mock.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    'FIRESTORE_EMULATOR_HOST is not set — run this via `npm run test:integration`, not directly, ' +
      'so the Firestore + Functions emulators are actually up.'
  );
}

admin.initializeApp({ projectId: 'dreda-emu-test' });
const db = admin.firestore();

const TEST_UID = 'uid-int-test';

function userCol(name: string) {
  return db.collection('users').doc(TEST_UID).collection(name);
}

async function waitFor<T>(fn: () => Promise<T | undefined | null>, description: string, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  let last: T | undefined | null;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last !== undefined && last !== null) return last;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

async function getAccountBalance(accountId: string): Promise<number> {
  const snap = await userCol('accounts').doc(accountId).get();
  return snap.data()?.currentBalance ?? 0;
}

async function getMonthly(month: string) {
  const snap = await userCol('statsMonthly').doc(month).get();
  return snap.data() ?? {};
}

const ACCOUNT_ID = 'acc-int-test';
const CATEGORY_ID = 'cat-int-test';
const OTHER_CATEGORY_ID = 'cat-int-test-2';
const RULE_ID = 'rule-int-test';
const MONTH_A = '2031-03';
const MONTH_B = '2031-04';

before(async () => {
  // Fresh baseline for every field this test touches — Admin SDK bypasses
  // Security Rules entirely, same as the real Cloud Functions runtime.
  await db.collection('users').doc(TEST_UID).set({ email: 'int-test@example.com', name: 'Int Test', archived: false });
  await userCol('accounts').doc(ACCOUNT_ID).set({
    name: 'Test Wallet',
    type: 'Wallet',
    currency: 'XAF',
    startingBalance: 0,
    currentBalance: 0,
    notes: '',
    archived: false,
  });
  await userCol('settings').doc('app').set({
    defaultCurrency: 'XAF',
    displayCurrency: 'XAF',
    timezone: 'UTC',
    householdName: 'Test',
  });
  await userCol('statsMonthly').doc(MONTH_A).set({
    totalIncome: 0,
    totalExpense: 0,
    transactionCount: 0,
    perCategorySpend: {},
    perCategoryCount: {},
  });
  await userCol('statsMonthly').doc(MONTH_B).set({
    totalIncome: 0,
    totalExpense: 0,
    transactionCount: 0,
    perCategorySpend: {},
    perCategoryCount: {},
  });
  await userCol('budgetRules').doc(RULE_ID).set({
    categoryId: CATEGORY_ID,
    description: 'Integration test rule',
    budgetedAmount: 500,
    frequency: 'Monthly',
    interval: 1,
    anchorDate: admin.firestore.Timestamp.fromDate(new Date(`${MONTH_A}-01T00:00:00Z`)),
    endCondition: 'Never',
    endOccurrences: null,
    endDate: null,
    accountId: null,
    tag: '',
    archived: false,
  });
  // Let the onBudgetRuleWrite trigger settle (it only maintains the
  // *current* month — irrelevant here, but avoids racing its own write).
  await new Promise((resolve) => setTimeout(resolve, 500));
});

after(async () => {
  await Promise.all(
    ['transactions', 'accounts', 'settings', 'statsMonthly', 'statsBudgetProgress', 'budgetRules'].map(
      async (col) => {
        const snap = await userCol(col).get();
        await Promise.all(snap.docs.map((d) => d.ref.delete()));
      }
    )
  );
  await db.collection('users').doc(TEST_UID).delete();
  await admin.app().delete();
});

describe('onTransactionWrite: create', () => {
  it('decrements the account and increments statsMonthly for a new expense', async () => {
    const before = await getAccountBalance(ACCOUNT_ID);
    await userCol('transactions').doc('txn-create').set({
      date: admin.firestore.Timestamp.fromDate(new Date(`${MONTH_A}-15T00:00:00Z`)),
      type: 'Expense',
      description: 'Groceries',
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      amount: 100,
      direction: 'Outflow',
      createdBy: TEST_UID,
    });

    const afterBalance = await waitFor(async () => {
      const b = await getAccountBalance(ACCOUNT_ID);
      return b !== before ? b : undefined;
    }, 'account balance to decrement after create');
    assert.equal(afterBalance, before - 100);

    const monthly = await waitFor(async () => {
      const m = await getMonthly(MONTH_A);
      return (m.totalExpense ?? 0) > 0 ? m : undefined;
    }, 'statsMonthly.totalExpense to increment');
    assert.equal(monthly.totalExpense, 100);
    assert.equal(monthly.perCategorySpend?.[CATEGORY_ID], 100);
    assert.equal(monthly.perCategoryCount?.[CATEGORY_ID], 1);
    assert.equal(monthly.transactionCount, 1);

    const progress = await waitFor(async () => {
      const snap = await userCol('statsBudgetProgress').doc(MONTH_A).get();
      const data = snap.data();
      return data?.[RULE_ID] ? data : undefined;
    }, 'statsBudgetProgress to reflect the new spend');
    assert.equal(progress[RULE_ID].spent, 100);
    assert.equal(progress[RULE_ID].budgeted, 500);
    assert.equal(progress[RULE_ID].remaining, 400);
    assert.equal(progress[RULE_ID].count, 1);
  });
});

describe('onTransactionWrite: edit', () => {
  it('shifts the account and stats by exactly the delta on a plain amount change', async () => {
    await userCol('transactions').doc('txn-edit').set({
      date: admin.firestore.Timestamp.fromDate(new Date(`${MONTH_A}-16T00:00:00Z`)),
      type: 'Expense',
      description: 'Utilities',
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      amount: 50,
      direction: 'Outflow',
      createdBy: TEST_UID,
    });
    const balanceAfterCreate = await waitFor(async () => {
      const m = await getMonthly(MONTH_A);
      return (m.perCategorySpend?.[CATEGORY_ID] ?? 0) >= 150 ? await getAccountBalance(ACCOUNT_ID) : undefined;
    }, 'edit test create to settle (cumulative spend >= 150)');

    await userCol('transactions').doc('txn-edit').update({ amount: 80 });

    const balanceAfterEdit = await waitFor(async () => {
      const b = await getAccountBalance(ACCOUNT_ID);
      return b !== balanceAfterCreate ? b : undefined;
    }, 'account balance to shift after edit');
    assert.equal(balanceAfterEdit, balanceAfterCreate - 30); // 80 - 50 extra outflow

    const monthly = await waitFor(async () => {
      const m = await getMonthly(MONTH_A);
      return (m.perCategorySpend?.[CATEGORY_ID] ?? 0) === 180 ? m : undefined;
    }, 'perCategorySpend to reflect the edited amount (100 + 80)');
    // Count must NOT double-count an edit — still 2 transactions in the
    // category (txn-create + txn-edit), never 3.
    assert.equal(monthly.perCategoryCount?.[CATEGORY_ID], 2);
  });
});

describe('onTransactionWrite: move to a different account/category/month', () => {
  it('fully un-charges the old bucket and fully charges the new one', async () => {
    await userCol('transactions').doc('txn-move').set({
      date: admin.firestore.Timestamp.fromDate(new Date(`${MONTH_A}-17T00:00:00Z`)),
      type: 'Expense',
      description: 'Subscription',
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      amount: 60,
      direction: 'Outflow',
      createdBy: TEST_UID,
    });
    await waitFor(async () => {
      const m = await getMonthly(MONTH_A);
      return (m.perCategorySpend?.[CATEGORY_ID] ?? 0) === 240 ? true : undefined; // 100 + 80 + 60
    }, 'move test create to settle');

    await userCol('transactions').doc('txn-move').update({
      date: admin.firestore.Timestamp.fromDate(new Date(`${MONTH_B}-01T00:00:00Z`)),
      categoryId: OTHER_CATEGORY_ID,
    });

    const oldMonth = await waitFor(async () => {
      const m = await getMonthly(MONTH_A);
      return (m.perCategorySpend?.[CATEGORY_ID] ?? 0) === 180 ? m : undefined; // back to pre-move
    }, 'old bucket (MONTH_A, CATEGORY_ID) to be fully un-charged');
    assert.equal(oldMonth.perCategoryCount?.[CATEGORY_ID], 2); // txn-create + txn-edit only

    const newMonth = await waitFor(async () => {
      const m = await getMonthly(MONTH_B);
      return (m.perCategorySpend?.[OTHER_CATEGORY_ID] ?? 0) === 60 ? m : undefined;
    }, 'new bucket (MONTH_B, OTHER_CATEGORY_ID) to be fully charged');
    assert.equal(newMonth.perCategoryCount?.[OTHER_CATEGORY_ID], 1);
    assert.equal(newMonth.transactionCount, 1);
  });
});

describe('onTransactionWrite: delete', () => {
  it('fully reverses the account and stats contribution', async () => {
    const balanceBefore = await getAccountBalance(ACCOUNT_ID);
    const monthlyBefore = await getMonthly(MONTH_A);

    await userCol('transactions').doc('txn-delete-me').set({
      date: admin.firestore.Timestamp.fromDate(new Date(`${MONTH_A}-18T00:00:00Z`)),
      type: 'Expense',
      description: 'Temporary',
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      amount: 25,
      direction: 'Outflow',
      createdBy: TEST_UID,
    });
    await waitFor(async () => {
      const b = await getAccountBalance(ACCOUNT_ID);
      return b === balanceBefore - 25 ? b : undefined;
    }, 'delete test create to settle');

    await userCol('transactions').doc('txn-delete-me').delete();

    const balanceAfterDelete = await waitFor(async () => {
      const b = await getAccountBalance(ACCOUNT_ID);
      return b === balanceBefore ? b : undefined;
    }, 'account balance to fully reverse after delete');
    assert.equal(balanceAfterDelete, balanceBefore);

    const monthlyAfterDelete = await waitFor(async () => {
      const m = await getMonthly(MONTH_A);
      return m.perCategorySpend?.[CATEGORY_ID] === monthlyBefore.perCategorySpend?.[CATEGORY_ID]
        ? m
        : undefined;
    }, 'perCategorySpend to fully reverse after delete');
    assert.equal(monthlyAfterDelete.perCategorySpend?.[CATEGORY_ID], monthlyBefore.perCategorySpend?.[CATEGORY_ID]);
    assert.equal(monthlyAfterDelete.perCategoryCount?.[CATEGORY_ID], monthlyBefore.perCategoryCount?.[CATEGORY_ID]);
  });
});

describe('onTransactionWrite: self-correcting signedAmount/month fixpoint', () => {
  it('overwrites a client-sent wrong signedAmount/month and still applies the delta exactly once', async () => {
    const before = await getAccountBalance(ACCOUNT_ID);
    // A well-behaved client never sets these — this simulates a stale or
    // hostile write to prove the trigger never trusts them.
    await userCol('transactions').doc('txn-fixpoint').set({
      date: admin.firestore.Timestamp.fromDate(new Date(`${MONTH_A}-20T00:00:00Z`)),
      type: 'Expense',
      description: 'Fixpoint check',
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      amount: 40,
      direction: 'Outflow',
      signedAmount: 999999, // deliberately wrong
      month: '1999-01', // deliberately wrong
      createdBy: TEST_UID,
    });

    const corrected = await waitFor(async () => {
      const snap = await userCol('transactions').doc('txn-fixpoint').get();
      const data = snap.data();
      return data?.signedAmount === -40 && data?.month === MONTH_A ? data : undefined;
    }, 'the trigger to self-correct signedAmount/month');
    assert.equal(corrected.signedAmount, -40);
    assert.equal(corrected.month, MONTH_A);

    const afterBalance = await waitFor(async () => {
      const b = await getAccountBalance(ACCOUNT_ID);
      return b === before - 40 ? b : undefined;
    }, 'the balance to move by exactly -40, not double-counted');
    assert.equal(afterBalance, before - 40);

    // The wrong month (1999-01) must never have been touched.
    const bogusMonth = await getMonthly('1999-01');
    assert.equal(bogusMonth.totalExpense, undefined);
  });
});
