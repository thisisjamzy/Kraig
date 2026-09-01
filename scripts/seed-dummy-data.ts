/**
 * One-time (repeatable) seed: writes realistic dummy accounts, categories,
 * budget rules, and ~3 months of transactions/transfers into a real Firebase
 * project, for testing/demoing the app before real data exists.
 *
 * Every dummy document uses a deterministic id prefixed "dummy_" — safe to
 * re-run (overwrites the same rows instead of duplicating), and trivial to
 * find and wipe later with `npm run unseed`.
 *
 * Does NOT rely on the Cloud Function triggers being deployed — the final
 * pass (scripts/lib/recomputeStats.ts) recomputes account currentBalance,
 * statsMonthly, stats/home, and statsBudgetProgress directly from every
 * transaction/transfer/budgetRule actually in Firestore (dummy and real
 * alike), the same "materialized stats computed once, here" approach
 * scripts/migrate-notion-to-firestore.ts uses for currentBalance.
 *
 * Every ledger collection lives under users/{uid}/... now (see refs.ts's
 * and firestore.rules' headers — no more shared top-level collections, each
 * account's data is private), so this needs to know WHICH account to seed
 * for.
 *
 * Setup:
 *   FIREBASE_ADMIN_PROJECT_ID=... FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=...
 *   TARGET_UID=<firebase auth uid> (or TARGET_EMAIL=<the account's email>)
 *   npx tsx scripts/seed-dummy-data.ts
 */

import { db, Timestamp, requireTargetUid } from './lib/adminApp';
import { recomputeEverything } from './lib/recomputeStats';
import type { DocumentReference } from 'firebase-admin/firestore';

const bulkWriter = db.bulkWriter();

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function randInt(min: number, max: number) {
  return Math.round(rand(min, max));
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------
// settings + exchangeRates — only initialized if missing, never clobbers real config
// ---------------------------------------------------------------------------------

async function ensureSettingsAndRates(userDoc: DocumentReference) {
  const settingsSnap = await userDoc.collection('settings').doc('app').get();
  if (!settingsSnap.exists) {
    await userDoc.collection('settings').doc('app').set({
      defaultCurrency: 'XAF',
      displayCurrency: 'XAF',
      timezone: 'Africa/Douala',
      householdName: 'Demo Household',
    });
    console.log('settings/app: initialized (was missing)');
  } else {
    console.log('settings/app: already exists, left untouched');
  }

  // budgetPlans replaced the old single global settings.totalBudget — one
  // doc per month now (src/shared/firestore/types.ts's FirestoreBudgetPlan
  // header). Only seed the current month, only if missing.
  const currentMonth = monthKey(new Date());
  const planRef = userDoc.collection('budgetPlans').doc(currentMonth);
  const planSnap = await planRef.get();
  if (!planSnap.exists) {
    await planRef.set({ totalBudget: 200000, projectedIncome: 350000, plannedSavings: 50000 });
    console.log(`budgetPlans/${currentMonth}: initialized (was missing)`);
  } else {
    console.log(`budgetPlans/${currentMonth}: already exists, left untouched`);
  }

  const ratesSnap = await userDoc.collection('exchangeRates').get();
  if (ratesSnap.empty) {
    const rates: Record<string, number> = { XAF: 1, EUR: 655.957, USD: 605, GBP: 765 };
    for (const [code, rateToBase] of Object.entries(rates)) {
      bulkWriter.set(userDoc.collection('exchangeRates').doc(code), {
        rateToBase,
        updatedAt: Timestamp.now(),
        notes: code === 'EUR' ? 'fixed peg' : 'approximate, for demo data',
      });
    }
    await bulkWriter.flush();
    console.log('exchangeRates: initialized (was empty) — XAF, EUR, USD, GBP');
  } else {
    console.log('exchangeRates: already has entries, left untouched');
  }
}

// ---------------------------------------------------------------------------------
// phase 1: accounts
// ---------------------------------------------------------------------------------

const ACCOUNTS = [
  { id: 'dummy_acc_wallet', name: 'Cash Wallet', type: 'Cash', currency: 'XAF', startingBalance: 150_000 },
  { id: 'dummy_acc_bank', name: 'Bank Account', type: 'Current Account', currency: 'XAF', startingBalance: 250_000 },
  { id: 'dummy_acc_savings', name: 'Savings', type: 'Savings Account', currency: 'XAF', startingBalance: 500_000 },
  { id: 'dummy_acc_travel', name: 'Travel Fund', type: 'E-wallet', currency: 'USD', startingBalance: 300 },
] as const;

async function seedAccounts(userDoc: DocumentReference) {
  for (const account of ACCOUNTS) {
    bulkWriter.set(userDoc.collection('accounts').doc(account.id), {
      name: account.name,
      type: account.type,
      currency: account.currency,
      startingBalance: account.startingBalance,
      currentBalance: account.startingBalance, // corrected below, see recomputeEverything()
      notes: 'Demo data',
      archived: false,
      notSpendable: false,
      frozen: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
  console.log(`accounts: seeded ${ACCOUNTS.length}`);
}

// ---------------------------------------------------------------------------------
// phase 2: categories
// ---------------------------------------------------------------------------------

const EXPENSE_CATEGORIES = [
  'Groceries',
  'Transport',
  'Rent',
  'Utilities',
  'Entertainment',
  'Dining Out',
  'Health',
  'Shopping',
  'Subscriptions',
] as const;
const INCOME_CATEGORIES = ['Salary', 'Freelance'] as const;
const SAVINGS_CATEGORIES = ['Emergency Fund', 'Investments'] as const;

function categoryId(name: string) {
  return 'dummy_cat_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

async function seedCategories(userDoc: DocumentReference) {
  let count = 0;
  for (const name of EXPENSE_CATEGORIES) {
    bulkWriter.set(userDoc.collection('categories').doc(categoryId(name)), {
      name,
      transactionType: 'Expense',
      group: null,
      notes: '',
      archived: false,
    });
    count++;
  }
  for (const name of INCOME_CATEGORIES) {
    bulkWriter.set(userDoc.collection('categories').doc(categoryId(name)), {
      name,
      transactionType: 'Income',
      group: null,
      notes: '',
      archived: false,
    });
    count++;
  }
  for (const name of SAVINGS_CATEGORIES) {
    bulkWriter.set(userDoc.collection('categories').doc(categoryId(name)), {
      name,
      transactionType: 'Savings',
      group: null,
      notes: '',
      archived: false,
    });
    count++;
  }
  console.log(`categories: seeded ${count}`);
}

// ---------------------------------------------------------------------------------
// phase 3: budget rules — Monthly, anchored to the 1st of the current month
// ---------------------------------------------------------------------------------

const BUDGET_RULES: { category: (typeof EXPENSE_CATEGORIES)[number]; amount: number }[] = [
  { category: 'Groceries', amount: 60_000 },
  { category: 'Transport', amount: 20_000 },
  { category: 'Entertainment', amount: 15_000 },
  { category: 'Dining Out', amount: 25_000 },
  { category: 'Utilities', amount: 30_000 },
];

async function seedBudgetRules(userDoc: DocumentReference) {
  const now = new Date();
  const anchor = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), 1));
  let i = 0;
  for (const rule of BUDGET_RULES) {
    bulkWriter.set(userDoc.collection('budgetRules').doc(`dummy_rule_${i++}`), {
      categoryId: categoryId(rule.category),
      description: `${rule.category} budget`,
      budgetedAmount: rule.amount,
      frequency: 'Monthly',
      interval: 1,
      anchorDate: anchor,
      endCondition: 'Never',
      endOccurrences: null,
      endDate: null,
      accountId: null,
      tag: '',
      archived: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
  console.log(`budgetRules: seeded ${BUDGET_RULES.length}`);
}

// ---------------------------------------------------------------------------------
// phase 3b: planned payments — real bills with due dates, NOT budgetRules
// (src/shared/firestore/types.ts's FirestorePlannedPayment header) — several
// can share one budgetRules category, e.g. both of these count against
// "Subscriptions" and "Rent" respectively.
// ---------------------------------------------------------------------------------

const PLANNED_PAYMENTS: { id: string; category: (typeof EXPENSE_CATEGORIES)[number]; description: string; amount: number; day: number }[] = [
  { id: 'dummy_payment_netflix', category: 'Subscriptions', description: 'Netflix', amount: 6_000, day: 5 },
  { id: 'dummy_payment_rent', category: 'Rent', description: 'Rent', amount: 150_000, day: 1 },
];

async function seedPlannedPayments(userDoc: DocumentReference) {
  const now = new Date();
  for (const payment of PLANNED_PAYMENTS) {
    const anchor = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), payment.day));
    bulkWriter.set(userDoc.collection('plannedPayments').doc(payment.id), {
      categoryId: categoryId(payment.category),
      description: payment.description,
      amount: payment.amount,
      frequency: 'Monthly',
      interval: 1,
      anchorDate: anchor,
      endCondition: 'Never',
      endOccurrences: null,
      endDate: null,
      accountId: null,
      archived: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
  console.log(`plannedPayments: seeded ${PLANNED_PAYMENTS.length}`);
}

// ---------------------------------------------------------------------------------
// phase 4: transactions — ~3 months, income + a spread of expenses
// ---------------------------------------------------------------------------------

const EXPENSE_TEMPLATES: { category: (typeof EXPENSE_CATEGORIES)[number]; description: string; min: number; max: number }[] = [
  { category: 'Groceries', description: 'Supermarket run', min: 8_000, max: 25_000 },
  { category: 'Groceries', description: 'Local market', min: 3_000, max: 10_000 },
  { category: 'Transport', description: 'Fuel', min: 10_000, max: 20_000 },
  { category: 'Transport', description: 'Ride hailing', min: 1_500, max: 6_000 },
  { category: 'Rent', description: 'Monthly rent', min: 80_000, max: 80_000 },
  { category: 'Utilities', description: 'Electricity bill', min: 8_000, max: 18_000 },
  { category: 'Utilities', description: 'Water bill', min: 3_000, max: 7_000 },
  { category: 'Utilities', description: 'Internet', min: 15_000, max: 15_000 },
  { category: 'Entertainment', description: 'Movies', min: 3_000, max: 8_000 },
  { category: 'Entertainment', description: 'Streaming', min: 4_000, max: 4_000 },
  { category: 'Dining Out', description: 'Restaurant', min: 5_000, max: 20_000 },
  { category: 'Dining Out', description: 'Coffee shop', min: 1_500, max: 4_000 },
  { category: 'Health', description: 'Pharmacy', min: 2_000, max: 12_000 },
  { category: 'Health', description: 'Clinic visit', min: 10_000, max: 30_000 },
  { category: 'Shopping', description: 'Clothing', min: 10_000, max: 40_000 },
  { category: 'Shopping', description: 'Electronics accessory', min: 5_000, max: 25_000 },
  { category: 'Subscriptions', description: 'App subscription', min: 2_000, max: 6_000 },
];

// Day-to-day expenses only ever come out of the wallet or the bank account —
// never savings, which should only move via the explicit transfers below
// (a savings account randomly getting hit by grocery runs isn't realistic
// and made the demo balance look wrong).
const EXPENSE_SOURCE_ACCOUNTS = ACCOUNTS.filter((a) => a.id !== 'dummy_acc_savings' && a.currency === 'XAF');
const BANK_ACCOUNT = ACCOUNTS.find((a) => a.id === 'dummy_acc_bank')!;

async function seedTransactions(userDoc: DocumentReference, monthsBack: number) {
  const now = new Date();
  let index = 0;

  for (let m = monthsBack; m >= 0; m--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const isCurrentMonth = m === 0;
    const lastDay = isCurrentMonth ? now.getDate() : daysInMonth;

    function dateInMonth(day: number) {
      return new Date(monthDate.getFullYear(), monthDate.getMonth(), day, randInt(8, 20), randInt(0, 59));
    }

    // Salary, always, day 1-3
    writeTransaction(userDoc, index++, {
      date: dateInMonth(randInt(1, 3)),
      type: 'Income',
      description: 'Salary',
      accountId: 'dummy_acc_bank',
      categoryId: categoryId('Salary'),
      amount: randInt(380_000, 450_000),
      direction: 'Inflow',
    });

    // Freelance, ~60% of months
    if (Math.random() < 0.6) {
      writeTransaction(userDoc, index++, {
        date: dateInMonth(randInt(5, Math.max(6, lastDay))),
        type: 'Income',
        description: 'Freelance project',
        accountId: 'dummy_acc_bank',
        categoryId: categoryId('Freelance'),
        amount: randInt(50_000, 150_000),
        direction: 'Inflow',
      });
    }

    // A spread of expenses across the month
    const expenseCount = randInt(14, 20);
    for (let i = 0; i < expenseCount; i++) {
      const template = pick(EXPENSE_TEMPLATES);
      // Big-ticket items (rent, clinic visits, electronics) come out of the
      // bank, never petty cash — keeps the wallet from getting wiped out by
      // one large random pick.
      const account = template.max > 30_000 ? BANK_ACCOUNT : pick(EXPENSE_SOURCE_ACCOUNTS);
      writeTransaction(userDoc, index++, {
        date: dateInMonth(randInt(1, Math.max(1, lastDay))),
        type: 'Expense',
        description: template.description,
        accountId: account.id,
        categoryId: categoryId(template.category),
        amount: randInt(template.min, template.max),
        direction: 'Outflow',
      });
    }

    // A savings contribution, modeled as an Expense-side wallet transaction
    // into the Savings category (matches how the app's own add-transaction
    // flow records a "Savings" type transaction — see
    // src/logic/addTransaction/useLogic.ts).
    writeTransaction(userDoc, index++, {
      date: dateInMonth(randInt(lastDay > 5 ? lastDay - 3 : lastDay, lastDay)),
      type: 'Savings',
      description: 'Monthly savings transfer',
      accountId: 'dummy_acc_bank',
      categoryId: categoryId('Emergency Fund'),
      amount: randInt(30_000, 60_000),
      direction: 'Outflow',
    });

    // A couple of Travel Fund (USD) transactions for currency-conversion coverage
    if (Math.random() < 0.5) {
      writeTransaction(userDoc, index++, {
        date: dateInMonth(randInt(1, Math.max(1, lastDay))),
        type: 'Expense',
        description: 'Travel booking',
        accountId: 'dummy_acc_travel',
        categoryId: categoryId('Entertainment'),
        amount: randInt(20, 80),
        direction: 'Outflow',
      });
    }
  }

  console.log(`transactions: seeded ${index}`);
}

function writeTransaction(
  userDoc: DocumentReference,
  index: number,
  t: {
    date: Date;
    type: string;
    description: string;
    accountId: string;
    categoryId: string;
    amount: number;
    direction: 'Inflow' | 'Outflow';
  }
) {
  const signedAmount = t.direction === 'Inflow' ? t.amount : -t.amount;
  const id = `dummy_txn_${String(index).padStart(4, '0')}`;
  bulkWriter.set(userDoc.collection('transactions').doc(id), {
    date: Timestamp.fromDate(t.date),
    type: t.type,
    description: t.description,
    accountId: t.accountId,
    categoryId: t.categoryId,
    amount: t.amount,
    direction: t.direction,
    signedAmount,
    month: monthKey(t.date),
    createdBy: userDoc.id,
    createdAt: Timestamp.fromDate(t.date),
    updatedAt: Timestamp.now(),
  });
}

// ---------------------------------------------------------------------------------
// phase 5: monthly transfers — bank funds both savings and the cash wallet
// ---------------------------------------------------------------------------------

async function seedTransfers(userDoc: DocumentReference, monthsBack: number) {
  const now = new Date();
  let count = 0;
  for (let m = monthsBack; m >= 0; m--) {
    const savingsDate = new Date(now.getFullYear(), now.getMonth() - m, randInt(10, 20));
    bulkWriter.set(userDoc.collection('transfers').doc(`dummy_transfer_savings_${m}`), {
      date: Timestamp.fromDate(savingsDate),
      description: 'Top up savings',
      fromAccountId: 'dummy_acc_bank',
      toAccountId: 'dummy_acc_savings',
      amount: randInt(20_000, 40_000),
      kind: 'Wallet to savings',
      notes: '',
      createdBy: userDoc.id,
      createdAt: Timestamp.fromDate(savingsDate),
    });
    count++;

    // ATM withdrawal — replenishes the cash wallet monthly, otherwise it's a
    // strictly-declining account with no income of its own and eventually
    // goes negative (see EXPENSE_SOURCE_ACCOUNTS's comment above).
    const withdrawalDate = new Date(now.getFullYear(), now.getMonth() - m, randInt(1, 5));
    bulkWriter.set(userDoc.collection('transfers').doc(`dummy_transfer_atm_${m}`), {
      date: Timestamp.fromDate(withdrawalDate),
      description: 'ATM withdrawal',
      fromAccountId: 'dummy_acc_bank',
      toAccountId: 'dummy_acc_wallet',
      amount: randInt(60_000, 90_000),
      kind: 'Wallet to wallet',
      notes: '',
      createdBy: userDoc.id,
      createdAt: Timestamp.fromDate(withdrawalDate),
    });
    count++;
  }
  console.log(`transfers: seeded ${count}`);
}

// ---------------------------------------------------------------------------------

const MONTHS_BACK = 2; // + the current month = 3 months of history

async function main() {
  const uid = await requireTargetUid();
  const userDoc = db.collection('users').doc(uid);
  console.log(`Seeding dummy data for uid ${uid}...`);

  await ensureSettingsAndRates(userDoc);
  await seedAccounts(userDoc);
  await seedCategories(userDoc);
  await seedBudgetRules(userDoc);
  await seedPlannedPayments(userDoc);
  await seedTransactions(userDoc, MONTHS_BACK);
  await seedTransfers(userDoc, MONTHS_BACK);
  await bulkWriter.flush(); // land every write above before reading any of it back
  await recomputeEverything(bulkWriter, uid);
  await bulkWriter.close();
  console.log('\nDone. Re-running this script overwrites the same dummy_* documents and');
  console.log('recomputes every materialized stats doc from whatever is in this account now.');
  console.log('Run `npm run unseed` (same TARGET_UID/TARGET_EMAIL) to remove every dummy_* document again.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
