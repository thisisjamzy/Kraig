/**
 * One-time (repeatable) seed: writes realistic dummy goals (with line
 * items) and debts (with repayments) into a real Firebase project, so the
 * Goals & Debt UI (src/screens/Goals, GoalDetail, DebtDetail) has something
 * to show before real data exists.
 *
 * Fully self-contained — does NOT depend on scripts/seed-dummy-data.ts
 * having been run first. It writes its own small set of dummy accounts/
 * categories/transactions under a distinct "dummy_gd_" prefix (rather than
 * reusing seed-dummy-data.ts's "dummy_acc_"/"dummy_cat_" ids), so the two
 * seed scripts never collide and either can be unseeded independently.
 *
 * One of the two dummy accounts gets a `lockedAmount` (the existing
 * wallet-partial-locking feature) specifically so the Goal Detail screen's
 * frozen-funds check has something real to compare against — one line item
 * comes out green (funds available), one comes out red (short).
 *
 * Every dummy_gd_* document id is deterministic — safe to re-run (overwrites
 * the same rows instead of duplicating), and trivial to find and wipe later
 * with `npm run unseed:goals-debt`.
 *
 * Setup:
 *   FIREBASE_ADMIN_PROJECT_ID=... FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=...
 *   TARGET_UID=<firebase auth uid> (or TARGET_EMAIL=<the account's email>)
 *   npx tsx scripts/seed-goals-debt-dummy-data.ts
 */

import { db, Timestamp, requireTargetUid } from './lib/adminApp';
import { recomputeEverything } from './lib/recomputeStats';
import type { DocumentReference } from 'firebase-admin/firestore';

const bulkWriter = db.bulkWriter();

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

// ---------------------------------------------------------------------------------
// phase 1: two dedicated dummy accounts + two dedicated dummy categories
// ---------------------------------------------------------------------------------

const ACCOUNT_MAIN = 'dummy_gd_acc_main';
const ACCOUNT_SAVINGS = 'dummy_gd_acc_savings';
const CATEGORY_GOAL = 'dummy_gd_cat_goal';
const CATEGORY_DEBT = 'dummy_gd_cat_debt';

async function seedAccountsAndCategories(userDoc: DocumentReference) {
  bulkWriter.set(userDoc.collection('accounts').doc(ACCOUNT_MAIN), {
    name: 'Demo Bank (Goals & Debt)',
    type: 'Current Account',
    currency: 'XAF',
    startingBalance: 2_000_000,
    currentBalance: 2_000_000, // corrected below, see recomputeEverything()
    notes: 'Demo data for Goals & Debt',
    archived: false,
    notSpendable: false,
    frozen: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  bulkWriter.set(userDoc.collection('accounts').doc(ACCOUNT_SAVINGS), {
    name: 'Demo Savings (Goals & Debt)',
    type: 'Savings Account',
    currency: 'XAF',
    startingBalance: 1_000_000,
    currentBalance: 1_000_000,
    // The frozen-funds pool the Goal Detail screen's per-line-item check
    // (checkFrozenFundsAvailable — sums lockedAmount across every account)
    // compares against. 300K covers the small goal's line item but falls
    // short of the large one, so the demo shows both states.
    lockedAmount: 300_000,
    notes: 'Demo data for Goals & Debt',
    archived: false,
    notSpendable: false,
    frozen: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  bulkWriter.set(userDoc.collection('categories').doc(CATEGORY_GOAL), {
    name: 'Goal Funding',
    transactionType: 'Expense',
    group: null,
    notes: '',
    archived: false,
  });
  bulkWriter.set(userDoc.collection('categories').doc(CATEGORY_DEBT), {
    name: 'Debt Repayment',
    transactionType: 'Expense',
    group: null,
    notes: '',
    archived: false,
  });
  console.log('accounts: seeded 2 (dummy_gd_acc_main, dummy_gd_acc_savings — one with lockedAmount 300,000)');
  console.log('categories: seeded 2 (Goal Funding, Debt Repayment)');
}

// A real Expense transaction, same shape createTransactionWithAggregation
// itself writes (src/shared/firestore/aggregation.ts) — so recomputeStats'
// balance/stats recompute picks these up exactly like it would a live one.
function writeExpenseTransaction(
  userDoc: DocumentReference,
  id: string,
  opts: {
    date: Date;
    description: string;
    accountId: string;
    categoryId: string;
    amount: number;
    isDebtRepayment?: boolean;
    linkedDebtId?: string;
  }
) {
  bulkWriter.set(userDoc.collection('transactions').doc(id), {
    date: Timestamp.fromDate(opts.date),
    type: 'Expense',
    description: opts.description,
    accountId: opts.accountId,
    categoryId: opts.categoryId,
    amount: opts.amount,
    direction: 'Outflow',
    signedAmount: -opts.amount,
    month: monthKey(opts.date),
    ...(opts.isDebtRepayment ? { isDebtRepayment: true, linkedDebtId: opts.linkedDebtId } : {}),
    createdBy: userDoc.id,
    createdAt: Timestamp.fromDate(opts.date),
    updatedAt: Timestamp.now(),
  });
}

// ---------------------------------------------------------------------------------
// phase 2: goals + line items
// ---------------------------------------------------------------------------------

async function seedGoals(userDoc: DocumentReference) {
  // Goal 1: "Buy a New Car" — 2 completed line items (real linked expenses)
  // + 1 not-yet-completed line item whose amount (500K) exceeds the 300K
  // frozen pool above, so its frozen-funds check comes out red/short.
  const carGoalId = 'dummy_gd_goal_car';
  const carDownPaymentId = 'dummy_gd_li_car_down';
  const carRegistrationId = 'dummy_gd_li_car_registration';
  const carInsuranceId = 'dummy_gd_li_car_insurance';
  const carDownPaymentTxnId = 'dummy_gd_txn_car_down';
  const carRegistrationTxnId = 'dummy_gd_txn_car_registration';

  const carDownPaymentDate = daysAgo(20);
  const carRegistrationDate = daysAgo(10);

  writeExpenseTransaction(userDoc, carDownPaymentTxnId, {
    date: carDownPaymentDate,
    description: 'Buy a New Car: Down Payment',
    accountId: ACCOUNT_MAIN,
    categoryId: CATEGORY_GOAL,
    amount: 400_000,
  });
  writeExpenseTransaction(userDoc, carRegistrationTxnId, {
    date: carRegistrationDate,
    description: 'Buy a New Car: Registration',
    accountId: ACCOUNT_MAIN,
    categoryId: CATEGORY_GOAL,
    amount: 100_000,
  });

  bulkWriter.set(userDoc.collection('goals').doc(carGoalId), {
    name: 'Buy a New Car',
    description: 'Multi-purpose vehicle for family trips',
    totalAmount: 1_000_000,
    lineItemCount: 3,
    completedLineItemCount: 2,
    amountCompleted: 500_000,
    currency: 'XAF',
    deadline: Timestamp.fromDate(addMonths(new Date(), 4)),
    archived: false,
    createdAt: Timestamp.fromDate(daysAgo(30)),
    updatedAt: Timestamp.now(),
  });
  bulkWriter.set(userDoc.collection('goals').doc(carGoalId).collection('lineItems').doc(carDownPaymentId), {
    goalId: carGoalId,
    name: 'Down Payment',
    description: '',
    amount: 400_000,
    completed: true,
    completedAt: Timestamp.fromDate(carDownPaymentDate),
    expenseId: carDownPaymentTxnId,
    createdAt: Timestamp.fromDate(daysAgo(30)),
    updatedAt: Timestamp.fromDate(carDownPaymentDate),
  });
  bulkWriter.set(userDoc.collection('goals').doc(carGoalId).collection('lineItems').doc(carRegistrationId), {
    goalId: carGoalId,
    name: 'Registration',
    description: '',
    amount: 100_000,
    completed: true,
    completedAt: Timestamp.fromDate(carRegistrationDate),
    expenseId: carRegistrationTxnId,
    createdAt: Timestamp.fromDate(daysAgo(30)),
    updatedAt: Timestamp.fromDate(carRegistrationDate),
  });
  bulkWriter.set(userDoc.collection('goals').doc(carGoalId).collection('lineItems').doc(carInsuranceId), {
    goalId: carGoalId,
    name: 'Insurance',
    description: 'Annual premium',
    amount: 500_000,
    completed: false,
    completedAt: null,
    expenseId: null,
    createdAt: Timestamp.fromDate(daysAgo(30)),
    updatedAt: Timestamp.fromDate(daysAgo(30)),
  });

  // Goal 2: "Emergency Fund Buffer" — one not-yet-completed line item small
  // enough that the same 300K frozen pool covers it (green/available).
  const emergencyGoalId = 'dummy_gd_goal_emergency';
  const emergencyLineItemId = 'dummy_gd_li_emergency_topup';

  bulkWriter.set(userDoc.collection('goals').doc(emergencyGoalId), {
    name: 'Emergency Fund Buffer',
    description: 'Top up the buffer to 3 months of expenses',
    totalAmount: 200_000,
    lineItemCount: 1,
    completedLineItemCount: 0,
    amountCompleted: 0,
    currency: 'XAF',
    deadline: null,
    archived: false,
    createdAt: Timestamp.fromDate(daysAgo(15)),
    updatedAt: Timestamp.fromDate(daysAgo(15)),
  });
  bulkWriter.set(userDoc.collection('goals').doc(emergencyGoalId).collection('lineItems').doc(emergencyLineItemId), {
    goalId: emergencyGoalId,
    name: 'Top-up buffer',
    description: '',
    amount: 200_000,
    completed: false,
    completedAt: null,
    expenseId: null,
    createdAt: Timestamp.fromDate(daysAgo(15)),
    updatedAt: Timestamp.fromDate(daysAgo(15)),
  });

  console.log('goals: seeded 2 (Buy a New Car — 2/3 items done; Emergency Fund Buffer — 0/1 items done)');
}

// ---------------------------------------------------------------------------------
// phase 3: debts + repayments
// ---------------------------------------------------------------------------------

async function seedDebts(userDoc: DocumentReference) {
  // Debt 1: "Personal Loan from Brother" — cash debt, active monthly plan,
  // 2 repayments so far, both linked to a real wallet transaction (cash
  // debt repayments always debit an account — PRD Files/prd debt n goals
  // section 2.3).
  const loanDebtId = 'dummy_gd_debt_personal_loan';
  const loanRepayment1Id = 'dummy_gd_repay_loan_1';
  const loanRepayment2Id = 'dummy_gd_repay_loan_2';
  const loanTxn1Id = 'dummy_gd_txn_loan_1';
  const loanTxn2Id = 'dummy_gd_txn_loan_2';
  const loanRepay1Date = daysAgo(50);
  const loanRepay2Date = daysAgo(20);

  writeExpenseTransaction(userDoc, loanTxn1Id, {
    date: loanRepay1Date,
    description: 'Repayment: Personal Loan from Brother',
    accountId: ACCOUNT_MAIN,
    categoryId: CATEGORY_DEBT,
    amount: 150_000,
    isDebtRepayment: true,
    linkedDebtId: loanDebtId,
  });
  writeExpenseTransaction(userDoc, loanTxn2Id, {
    date: loanRepay2Date,
    description: 'Repayment: Personal Loan from Brother',
    accountId: ACCOUNT_MAIN,
    categoryId: CATEGORY_DEBT,
    amount: 150_000,
    isDebtRepayment: true,
    linkedDebtId: loanDebtId,
  });

  bulkWriter.set(userDoc.collection('debts').doc(loanDebtId), {
    name: 'Personal Loan from Brother',
    description: 'Borrowed for car down payment',
    debtType: 'cash',
    principalAmount: 1_500_000,
    currentBalance: 1_200_000,
    totalRepaid: 300_000,
    currency: 'XAF',
    priority: 'high',
    startDate: Timestamp.fromDate(daysAgo(90)),
    paymentPlan: {
      type: 'recurring',
      recurring: {
        amount: 150_000,
        interval: 'monthly',
        nextPaymentDate: Timestamp.fromDate(addMonths(loanRepay2Date, 1)),
        isActive: true,
      },
    },
    notes: '',
    archivedAt: null,
    createdAt: Timestamp.fromDate(daysAgo(90)),
    updatedAt: Timestamp.fromDate(loanRepay2Date),
  });
  bulkWriter.set(userDoc.collection('debts').doc(loanDebtId).collection('repayments').doc(loanRepayment1Id), {
    debtId: loanDebtId,
    amount: 150_000,
    date: Timestamp.fromDate(loanRepay1Date),
    method: 'manual',
    notes: '',
    transactionId: loanTxn1Id,
    createdAt: Timestamp.fromDate(loanRepay1Date),
  });
  bulkWriter.set(userDoc.collection('debts').doc(loanDebtId).collection('repayments').doc(loanRepayment2Id), {
    debtId: loanDebtId,
    amount: 150_000,
    date: Timestamp.fromDate(loanRepay2Date),
    method: 'manual',
    notes: '',
    transactionId: loanTxn2Id,
    createdAt: Timestamp.fromDate(loanRepay2Date),
  });

  // Debt 2: "Car Loan" — existing debt, one repayment logged without a
  // linked wallet transaction (the PRD's default for "existing" debts).
  const carLoanDebtId = 'dummy_gd_debt_car_loan';
  const carLoanRepaymentId = 'dummy_gd_repay_car_loan_1';
  const carLoanRepayDate = daysAgo(15);

  bulkWriter.set(userDoc.collection('debts').doc(carLoanDebtId), {
    name: 'Car Loan',
    description: 'Financed through the dealership',
    debtType: 'existing',
    principalAmount: 800_000,
    currentBalance: 700_000,
    totalRepaid: 100_000,
    currency: 'XAF',
    priority: 'medium',
    startDate: Timestamp.fromDate(daysAgo(120)),
    paymentPlan: { type: 'none' },
    notes: 'Dealership handles most payments directly',
    archivedAt: null,
    createdAt: Timestamp.fromDate(daysAgo(120)),
    updatedAt: Timestamp.fromDate(carLoanRepayDate),
  });
  bulkWriter.set(userDoc.collection('debts').doc(carLoanDebtId).collection('repayments').doc(carLoanRepaymentId), {
    debtId: carLoanDebtId,
    amount: 100_000,
    date: Timestamp.fromDate(carLoanRepayDate),
    method: 'manual',
    notes: 'Paid directly to dealership, outside the ledger',
    transactionId: null,
    createdAt: Timestamp.fromDate(carLoanRepayDate),
  });

  // Debt 3: "Phone Installment" — existing debt, no repayments yet (shows
  // the Debt Detail screen's empty-repayment-history state).
  const phoneDebtId = 'dummy_gd_debt_phone';

  bulkWriter.set(userDoc.collection('debts').doc(phoneDebtId), {
    name: 'Phone Installment',
    description: '12-month installment plan',
    debtType: 'existing',
    principalAmount: 250_000,
    currentBalance: 250_000,
    totalRepaid: 0,
    currency: 'XAF',
    priority: 'low',
    startDate: Timestamp.fromDate(daysAgo(10)),
    paymentPlan: { type: 'none' },
    notes: '',
    archivedAt: null,
    createdAt: Timestamp.fromDate(daysAgo(10)),
    updatedAt: Timestamp.fromDate(daysAgo(10)),
  });

  console.log('debts: seeded 3 (Personal Loan from Brother — cash, high; Car Loan — existing, medium; Phone Installment — existing, low)');
}

// ---------------------------------------------------------------------------------

async function main() {
  const uid = await requireTargetUid();
  const userDoc = db.collection('users').doc(uid);
  console.log(`Seeding dummy Goals & Debt data for uid ${uid}...`);

  await seedAccountsAndCategories(userDoc);
  await seedGoals(userDoc);
  await seedDebts(userDoc);
  await bulkWriter.flush(); // land every write above before reading any of it back
  await recomputeEverything(bulkWriter, uid);
  await bulkWriter.close();
  console.log('\nDone. Re-running this script overwrites the same dummy_gd_* documents and');
  console.log('recomputes account balances/stats from every transaction actually in Firestore.');
  console.log('Run `npm run unseed:goals-debt` (same TARGET_UID/TARGET_EMAIL) to remove every dummy_gd_* document again.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
