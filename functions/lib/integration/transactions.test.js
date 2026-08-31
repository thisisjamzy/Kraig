"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const admin = __importStar(require("firebase-admin"));
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set — run this via `npm run test:integration`, not directly, ' +
        'so the Firestore + Functions emulators are actually up.');
}
admin.initializeApp({ projectId: 'kraig-emu-test' });
const db = admin.firestore();
const TEST_UID = 'uid-int-test';
function userCol(name) {
    return db.collection('users').doc(TEST_UID).collection(name);
}
async function waitFor(fn, description, timeoutMs = 8000) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeoutMs) {
        last = await fn();
        if (last !== undefined && last !== null)
            return last;
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out waiting for: ${description}`);
}
async function getAccountBalance(accountId) {
    const snap = await userCol('accounts').doc(accountId).get();
    return snap.data()?.currentBalance ?? 0;
}
async function getMonthly(month) {
    const snap = await userCol('statsMonthly').doc(month).get();
    return snap.data() ?? {};
}
const ACCOUNT_ID = 'acc-int-test';
const CATEGORY_ID = 'cat-int-test';
const OTHER_CATEGORY_ID = 'cat-int-test-2';
const RULE_ID = 'rule-int-test';
const MONTH_A = '2031-03';
const MONTH_B = '2031-04';
(0, node_test_1.before)(async () => {
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
(0, node_test_1.after)(async () => {
    await Promise.all(['transactions', 'accounts', 'settings', 'statsMonthly', 'statsBudgetProgress', 'budgetRules'].map(async (col) => {
        const snap = await userCol(col).get();
        await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }));
    await db.collection('users').doc(TEST_UID).delete();
    await admin.app().delete();
});
(0, node_test_1.describe)('onTransactionWrite: create', () => {
    (0, node_test_1.it)('decrements the account and increments statsMonthly for a new expense', async () => {
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
        strict_1.default.equal(afterBalance, before - 100);
        const monthly = await waitFor(async () => {
            const m = await getMonthly(MONTH_A);
            return (m.totalExpense ?? 0) > 0 ? m : undefined;
        }, 'statsMonthly.totalExpense to increment');
        strict_1.default.equal(monthly.totalExpense, 100);
        strict_1.default.equal(monthly.perCategorySpend?.[CATEGORY_ID], 100);
        strict_1.default.equal(monthly.perCategoryCount?.[CATEGORY_ID], 1);
        strict_1.default.equal(monthly.transactionCount, 1);
        const progress = await waitFor(async () => {
            const snap = await userCol('statsBudgetProgress').doc(MONTH_A).get();
            const data = snap.data();
            return data?.[RULE_ID] ? data : undefined;
        }, 'statsBudgetProgress to reflect the new spend');
        strict_1.default.equal(progress[RULE_ID].spent, 100);
        strict_1.default.equal(progress[RULE_ID].budgeted, 500);
        strict_1.default.equal(progress[RULE_ID].remaining, 400);
        strict_1.default.equal(progress[RULE_ID].count, 1);
    });
});
(0, node_test_1.describe)('onTransactionWrite: edit', () => {
    (0, node_test_1.it)('shifts the account and stats by exactly the delta on a plain amount change', async () => {
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
        strict_1.default.equal(balanceAfterEdit, balanceAfterCreate - 30); // 80 - 50 extra outflow
        const monthly = await waitFor(async () => {
            const m = await getMonthly(MONTH_A);
            return (m.perCategorySpend?.[CATEGORY_ID] ?? 0) === 180 ? m : undefined;
        }, 'perCategorySpend to reflect the edited amount (100 + 80)');
        // Count must NOT double-count an edit — still 2 transactions in the
        // category (txn-create + txn-edit), never 3.
        strict_1.default.equal(monthly.perCategoryCount?.[CATEGORY_ID], 2);
    });
});
(0, node_test_1.describe)('onTransactionWrite: move to a different account/category/month', () => {
    (0, node_test_1.it)('fully un-charges the old bucket and fully charges the new one', async () => {
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
        strict_1.default.equal(oldMonth.perCategoryCount?.[CATEGORY_ID], 2); // txn-create + txn-edit only
        const newMonth = await waitFor(async () => {
            const m = await getMonthly(MONTH_B);
            return (m.perCategorySpend?.[OTHER_CATEGORY_ID] ?? 0) === 60 ? m : undefined;
        }, 'new bucket (MONTH_B, OTHER_CATEGORY_ID) to be fully charged');
        strict_1.default.equal(newMonth.perCategoryCount?.[OTHER_CATEGORY_ID], 1);
        strict_1.default.equal(newMonth.transactionCount, 1);
    });
});
(0, node_test_1.describe)('onTransactionWrite: delete', () => {
    (0, node_test_1.it)('fully reverses the account and stats contribution', async () => {
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
        strict_1.default.equal(balanceAfterDelete, balanceBefore);
        const monthlyAfterDelete = await waitFor(async () => {
            const m = await getMonthly(MONTH_A);
            return m.perCategorySpend?.[CATEGORY_ID] === monthlyBefore.perCategorySpend?.[CATEGORY_ID]
                ? m
                : undefined;
        }, 'perCategorySpend to fully reverse after delete');
        strict_1.default.equal(monthlyAfterDelete.perCategorySpend?.[CATEGORY_ID], monthlyBefore.perCategorySpend?.[CATEGORY_ID]);
        strict_1.default.equal(monthlyAfterDelete.perCategoryCount?.[CATEGORY_ID], monthlyBefore.perCategoryCount?.[CATEGORY_ID]);
    });
});
(0, node_test_1.describe)('onTransactionWrite: self-correcting signedAmount/month fixpoint', () => {
    (0, node_test_1.it)('overwrites a client-sent wrong signedAmount/month and still applies the delta exactly once', async () => {
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
        strict_1.default.equal(corrected.signedAmount, -40);
        strict_1.default.equal(corrected.month, MONTH_A);
        const afterBalance = await waitFor(async () => {
            const b = await getAccountBalance(ACCOUNT_ID);
            return b === before - 40 ? b : undefined;
        }, 'the balance to move by exactly -40, not double-counted');
        strict_1.default.equal(afterBalance, before - 40);
        // The wrong month (1999-01) must never have been touched.
        const bogusMonth = await getMonthly('1999-01');
        strict_1.default.equal(bogusMonth.totalExpense, undefined);
    });
});
//# sourceMappingURL=transactions.test.js.map