// The four money flow types: month setup, the shared totals module, the
// automation queue and the flow-type migration. Numbered tests follow the
// budgeting rebuild's test list.
// Run: npx tsx --test test/budgetFlow.test.ts

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthBudget, itemOccurrence, type MonthBudgetInput } from '../app/src/shared/budget/monthBudget';
import { linesOf, lineStatus, monthTotals } from '../app/src/shared/budget/monthTotals';
import { monthLines, monthsToSetUp, setupBannerText, setupCounts } from '../app/src/shared/budget/monthSetup';
import { incomePrompts, preparePayments, proposeQueue, queueId } from '../app/src/shared/budget/automation';
import { classifyItem, planFlowMigration, type MigrationInput } from '../app/src/shared/budget/flowMigration';
import { inferExpenseKind, savingsSign, incomeSubtypeOfTransaction } from '../app/src/shared/budget/flow';

const ts = (iso: string) => ({ toDate: () => new Date(`${iso}T00:00:00`) }) as never;

const categories: MonthBudgetInput['categories'] = new Map([
  ['housing', { name: 'Housing', transactionType: 'Expense' }],
  ['food', { name: 'Food', transactionType: 'Expense' }],
  ['salary', { name: 'Salary', transactionType: 'Income' }],
  ['save', { name: 'Emergency fund', transactionType: 'Savings' }],
]);

function item(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    goalId: 'b',
    name: id,
    amount: 100,
    categoryId: 'food',
    dueDate: ts('2026-01-05'),
    recurrence: { frequency: 'Monthly' as const, interval: 1 },
    completed: false,
    charges: null,
    ...extra,
  };
}

const BUCKETS: MonthBudgetInput['buckets'] = [
  { id: 'home', name: 'Home', currency: 'XAF', type: 'Expense', kind: 'Fixed' },
  { id: 'pay', name: 'Income streams', currency: 'XAF', type: 'Income', kind: 'Fixed' },
  { id: 'save', name: 'Savings', currency: 'XAF', type: 'Savings', kind: 'Fixed' },
  { id: 'move', name: 'Transfers', currency: 'XAF', type: 'Transfer', kind: 'Fixed' },
];

function budgetFor(month: string, overrides: Partial<MonthBudgetInput> = {}) {
  return buildMonthBudget({
    month,
    buckets: BUCKETS,
    itemsByBucket: {
      home: [item('rent', { categoryId: 'housing', amount: 150_000, necessity: 'MustHave', priority: 'High' }), item('food', { amount: 60_000 })],
      pay: [item('aims', { name: 'AIMS salary', categoryId: 'salary', amount: 1_013_381, dueDate: ts('2026-01-25') })],
      save: [item('emergency', { name: 'Emergency savings', categoryId: 'save', amount: 150_000, savingsMode: 'absolute' })],
      move: [item('momo', { name: 'MoMo to UBA', categoryId: 'Wallet to wallet', amount: 100_000, charges: 1_000, accountId: 'momo', toAccountId: 'uba' })],
    },
    transactions: [],
    transfers: [],
    allocations: [],
    accountCurrency: new Map([
      ['momo', 'XAF'],
      ['uba', 'XAF'],
      ['vault', 'XAF'],
    ]),
    accountType: new Map([
      ['momo', 'Mobile Money'],
      ['uba', 'Bank'],
      ['vault', 'Savings Account'],
    ]),
    categories,
    baseCurrency: 'XAF',
    toDisplay: (amount) => amount,
    ...overrides,
  });
}

const tx = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id,
  accountId: 'momo',
  amount,
  direction: 'Outflow' as const,
  type: 'Expense',
  categoryId: 'food',
  month: '2026-11',
  bucketItem: null,
  ...extra,
});

describe('month setup', () => {
  test('1. on 1 Nov, opening the app sets November up exactly once', () => {
    const nov1 = new Date(2026, 10, 1, 8);
    const first = monthsToSetUp(nov1, ['2026-09', '2026-10'], '2026-10');
    assert.deepEqual(first, ['2026-11', '2026-12']);
    const lines = monthLines('2026-11', BUCKETS, { home: [item('rent')], pay: [item('aims', { categoryId: 'salary' })] }, categories);
    assert.equal(lines.length, 2);
    assert.deepEqual(new Set(lines.map((l) => l.key)), new Set(['rent@2026-11', 'aims@2026-11']));
    // Opening again creates nothing new.
    assert.deepEqual(monthsToSetUp(nov1, ['2026-09', '2026-10', '2026-11', '2026-12'], '2026-12'), []);
  });

  test('months skipped since the last visit are set up too', () => {
    assert.deepEqual(monthsToSetUp(new Date(2027, 1, 3), ['2026-10'], '2026-10'), ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
  });

  test('2. a line deleted for November is not recreated; December still has it', () => {
    const rent = item('rent', { excludedMonths: ['2026-11'] });
    assert.equal(monthLines('2026-11', BUCKETS, { home: [rent] }, categories).length, 0);
    assert.equal(monthLines('2026-12', BUCKETS, { home: [rent] }, categories).length, 1);
  });

  test('3. editing November rent "this month only" leaves December unchanged', () => {
    const rent = item('rent', { amount: 150_000, monthOverrides: { '2026-11': { amount: 175_000, dueDate: ts('2026-11-03') } } });
    assert.equal(itemOccurrence(rent, '2026-11')!.planned, 175_000);
    assert.equal(itemOccurrence(rent, '2026-11')!.due!.getDate(), 3);
    assert.equal(itemOccurrence(rent, '2026-12')!.planned, 150_000);
    assert.equal(itemOccurrence(rent, '2026-12')!.due!.getDate(), 5);
  });

  test('"this and future months" changes November on, not October', () => {
    const rent = item('rent', { amount: 150_000, changesFrom: { '2026-11': { amount: 160_000, dueDay: 2 } } });
    assert.equal(itemOccurrence(rent, '2026-10')!.planned, 150_000);
    assert.equal(itemOccurrence(rent, '2026-11')!.planned, 160_000);
    assert.equal(itemOccurrence(rent, '2027-03')!.due!.getDate(), 2);
  });

  test('the banner counts lines per type', () => {
    const lines = monthLines('2026-10', BUCKETS, { home: [item('rent'), item('food')], pay: [item('aims', { categoryId: 'salary' })], move: [item('momo')] }, categories);
    assert.equal(
      setupBannerText('2026-10', setupCounts(lines)),
      'October is set up from your recurring items. 4 lines added: 1 income, 2 expenses, 0 savings, 1 transfer.'
    );
  });
});

describe('totals per flow type', () => {
  test('4. income lists only income; expense totals never include transfers or savings', () => {
    const budget = budgetFor('2026-11');
    assert.deepEqual(linesOf(budget, 'Income').map((l) => l.itemId), ['aims']);
    assert.ok(linesOf(budget, 'Expense').every((l) => l.type === 'Expense'));
    const totals = monthTotals(budget, new Date(2026, 10, 2));
    // rent + food + the transfer's planned 1,000 fee; not savings, not the transfer.
    assert.equal(totals.expenses.planned, 150_000 + 60_000 + 1_000);
    assert.equal(totals.savings.planned, 150_000);
    assert.equal(totals.transfers.planned, 100_000);
    assert.equal(totals.leftToPlan, 1_013_381 - 211_000 - 150_000);
  });

  test('5. a 150,000 savings line reads 0 of 150,000 saved, never negative', () => {
    const before = monthTotals(budgetFor('2026-11'), new Date(2026, 10, 2));
    assert.equal(before.savings.saved, 0);
    assert.equal(before.savings.planned, 150_000);
    // A bucket item payment credits the savings account (an Inflow) — saved, not negative.
    const after = budgetFor('2026-11', {
      transactions: [
        tx('s1', 150_000, { type: 'Savings', direction: 'Inflow', accountId: 'vault', categoryId: 'save', bucketItem: { bucketId: 'save', itemId: 'emergency', month: '2026-11' } }),
      ],
    });
    const line = after.itemsByKey.get('emergency@2026-11')!;
    assert.equal(line.actual, 150_000);
    assert.equal(monthTotals(after, new Date(2026, 10, 2)).savings.saved, 150_000);
    assert.equal(lineStatus(line, new Date(2026, 10, 2)), 'Saved');
  });

  test('a withdrawal from savings is shown as withdrawn, not negative savings', () => {
    const b = budgetFor('2026-11', { transactions: [tx('w', 20_000, { type: 'Savings', direction: 'Outflow', accountId: 'vault', categoryId: 'save' })] });
    const totals = monthTotals(b, new Date(2026, 10, 2));
    assert.equal(totals.savings.saved, 0);
    assert.equal(totals.savings.withdrawn, 20_000);
  });

  test('the savings sign reads every way savings were recorded', () => {
    const types = new Map([['vault', 'Savings Account']]);
    assert.equal(savingsSign({ direction: 'Inflow', accountId: 'vault' }, types), 1);
    assert.equal(savingsSign({ direction: 'Outflow', accountId: 'momo', isFrozenSavings: true }, types), 1);
    assert.equal(savingsSign({ direction: 'Outflow', accountId: 'momo' }, types), 1);
    assert.equal(savingsSign({ direction: 'Outflow', accountId: 'vault' }, types), -1);
  });

  test('6. a 200,000 loan received counts as income, of which 200,000 borrowed', () => {
    const b = budgetFor('2026-11', {
      transactions: [tx('loan', 200_000, { type: 'Income', direction: 'Inflow', categoryId: null, description: 'Loan received: Uncle', linkedDebtId: 'd1' })],
    });
    const totals = monthTotals(b, new Date(2026, 10, 2));
    assert.equal(totals.income.received, 200_000);
    assert.equal(totals.income.borrowed, 200_000);
    assert.equal(totals.income.earned, 0);
    assert.equal(incomeSubtypeOfTransaction({ linkedDebtId: 'd1' }), 'debt_financing');
    assert.equal(incomeSubtypeOfTransaction({ linkedDebtId: 'd1', isDebtRepayment: true }), 'earned');
  });

  test('7. available now with no income received is 0, whatever is expected', () => {
    const quiet = monthTotals(budgetFor('2026-11'), new Date(2026, 10, 2));
    assert.equal(quiet.income.expected, 1_013_381);
    assert.equal(quiet.availableNow, 0);
    // Spending before income arrives: available stays 0, the month-end estimate drops.
    const spent = monthTotals(budgetFor('2026-11', { transactions: [tx('f', 44_074)] }), new Date(2026, 10, 2));
    assert.equal(spent.availableNow, 0);
    assert.equal(spent.availableByMonthEnd, 1_013_381 - 44_074);
  });

  test('8. a 100,000 transfer with a 1,000 fee: transfers 100,000, expenses include 1,000', () => {
    const b = budgetFor('2026-11', {
      transfers: [
        { id: 't', fromAccountId: 'momo', toAccountId: 'uba', amount: 100_000, charges: 1_000, kind: 'Wallet to wallet', month: '2026-11', bucketItem: { bucketId: 'move', itemId: 'momo', month: '2026-11' } },
      ],
    });
    const totals = monthTotals(b, new Date(2026, 10, 2));
    assert.equal(totals.transfers.moved, 100_000);
    assert.equal(totals.expenses.spent, 1_000);
    assert.equal(totals.expenses.fees, 1_000);
  });

  test('an unlinked income within 10% of an expected line marks it received', () => {
    const b = budgetFor('2026-11', { transactions: [tx('sal', 1_000_000, { type: 'Income', direction: 'Inflow', categoryId: 'salary' })] });
    assert.equal(b.itemsByKey.get('aims@2026-11')!.actual, 1_000_000);
  });
});

describe('automation queue', () => {
  const withAutomation = (extra: Partial<MonthBudgetInput> = {}) =>
    budgetFor('2026-11', {
      itemsByBucket: {
        home: [item('rent', { categoryId: 'housing', amount: 150_000, necessity: 'MustHave', priority: 'High', accountId: 'momo' })],
        pay: [item('aims', { name: 'AIMS salary', categoryId: 'salary', amount: 1_013_381, dueDate: ts('2026-01-25') })],
        save: [
          item('emergency', {
            name: 'Emergency savings',
            categoryId: 'save',
            amount: 150_000,
            savingsMode: 'absolute',
            automation: { mode: 'prepare', trigger: 'income', incomeItemId: 'aims', amountMode: 'percent', percent: 10 },
          }),
        ],
      },
      ...extra,
    });

  test('9. salary received prepares Rent and 10% Emergency savings; each only once', () => {
    const today = new Date(2026, 10, 25);
    assert.deepEqual(preparePayments(withAutomation(), today, new Set()), []);
    const paid = withAutomation({ transactions: [tx('sal', 1_013_381, { type: 'Income', direction: 'Inflow', categoryId: 'salary', bucketItem: { bucketId: 'pay', itemId: 'aims', month: '2026-11' } })] });
    const drafts = preparePayments(paid, today, new Set());
    assert.deepEqual(drafts.map((d) => [d.id, d.flow, d.amount]).sort(), [
      ['emergency__202611', 'Savings', 101_338.1],
      ['rent__202611', 'Expense', 150_000],
    ]);
    const rent = drafts.find((d) => d.itemId === 'rent')!;
    assert.equal(rent.trigger.incomeName, 'AIMS salary');
    assert.equal(rent.first, true);
    // Already queued: never prepared again.
    assert.deepEqual(preparePayments(paid, today, new Set(drafts.map((d) => d.id))), []);
    assert.equal(queueId('rent', '2026-11'), 'rent__202611');
  });

  test('a paid line is not prepared', () => {
    const paid = withAutomation({
      transactions: [
        tx('sal', 1_013_381, { type: 'Income', direction: 'Inflow', categoryId: 'salary' }),
        tx('r', 150_000, { categoryId: 'housing', bucketItem: { bucketId: 'home', itemId: 'rent', month: '2026-11' } }),
      ],
    });
    assert.deepEqual(preparePayments(paid, new Date(2026, 10, 25), new Set()).map((d) => d.itemId), ['emergency']);
  });

  test('10. 200,000 received with 300,000 prepared: highest priority first, the rest wait', () => {
    const entries = [
      { id: 'phone', name: 'Phone', amount: 50_000, first: false, due: new Date(2026, 10, 2), priority: 'Low' as const },
      { id: 'rent', name: 'Rent', amount: 150_000, first: true, due: new Date(2026, 10, 5), priority: 'High' as const },
      { id: 'gym', name: 'Gym', amount: 100_000, first: false, due: new Date(2026, 10, 1), priority: 'Medium' as const },
    ];
    const { proposed, notEnough, total } = proposeQueue(entries, 200_000);
    assert.deepEqual(proposed.map((e) => e.id), ['rent']);
    assert.deepEqual(notEnough.map((e) => e.id), ['gym', 'phone']);
    assert.equal(total, 150_000);
    assert.deepEqual(proposeQueue(entries, 300_000).proposed.map((e) => e.id), ['rent', 'gym', 'phone']);
  });

  test('late expected income is asked about, unless answered "not yet" today', () => {
    const b = budgetFor('2026-11');
    const today = new Date(2026, 10, 27);
    assert.deepEqual(incomePrompts(b, today).map((e) => e.key), ['aims@2026-11']);
    assert.deepEqual(incomePrompts(b, today, { 'aims@2026-11': '2026-11-27' }), []);
    assert.equal(incomePrompts(b, new Date(2026, 10, 28), { 'aims@2026-11': '2026-11-27' }).length, 1);
  });
});

describe('flow-type migration', () => {
  const input = (): MigrationInput => ({
    buckets: [
      { id: 'run', name: 'Running Douala', type: 'Expense', kind: 'Fixed', currency: 'XAF' },
      { id: 'tr', name: 'Transfers', type: 'Expense', kind: 'Fixed', currency: 'XAF' },
      { id: 'inc', name: 'Income streams', type: 'Income', kind: 'Fixed', currency: 'XAF' },
    ],
    itemsByBucket: {
      run: [
        { id: 'rent', name: 'Rent', amount: 150_000, categoryId: 'housing', dueDate: {}, recurrence: { frequency: 'Monthly' }, necessity: 'MustHave' },
        { id: 'food', name: 'Food', amount: 60_000, categoryId: 'food', dueDate: {}, recurrence: { frequency: 'Monthly' } },
        { id: 'sav', name: 'Emergency', amount: -150_000, categoryId: 'save', dueDate: {}, recurrence: { frequency: 'Monthly' }, necessity: 'MustHave' },
      ],
      tr: [{ id: 'mv', name: 'MoMo to UBA', amount: 550_000, categoryId: 'Wallet to wallet', accountId: 'momo', toAccountId: 'uba', dueDate: {}, recurrence: { frequency: 'Monthly' } }],
      inc: [
        { id: 'sal', name: 'AIMS salary', amount: 1_013_381, categoryId: 'salary', dueDate: {}, recurrence: { frequency: 'Monthly' } },
        { id: 'out', name: 'Outstanding payments from AIMS', amount: 765_000, categoryId: 'salary', dueDate: {}, recurrence: null },
      ],
    },
    categories,
    accountType: new Map([['vault', 'Savings Account']]),
    incomeTransactions: [
      { id: 'l1', description: 'Loan received: Bank', linkedDebtId: 'd1' },
      { id: 's1', description: 'Salary' },
    ],
  });

  test('11. a bucket with expense and savings items is split in two, with a report', () => {
    const plan = planFlowMigration(input());
    assert.deepEqual(plan.newBuckets.map((b) => [b.id, b.name, b.type]), [['run__savings', 'Running Douala · Savings', 'Savings']]);
    assert.deepEqual(plan.itemMoves, [{ itemId: 'sav', from: 'run', to: 'run__savings' }]);
    assert.ok(plan.report.some((r) => r.kind === 'split' && r.subject === 'Running Douala'));
    // The transfers bucket becomes a Transfer bucket.
    assert.deepEqual(plan.bucketPatches, [{ bucketId: 'tr', patch: { type: 'Transfer' } }]);
    // Savings sign fixed, on the item's new bucket.
    const sav = plan.itemPatches.find((p) => p.itemId === 'sav')!;
    assert.equal(sav.bucketId, 'run__savings');
    assert.equal(sav.patch.amount, 150_000);
    assert.equal(sav.patch.savingsMode, 'absolute');
    // Food reads as variable, rent as fixed.
    assert.equal(plan.itemPatches.find((p) => p.itemId === 'food')!.patch.expenseKind, 'variable');
    assert.equal(plan.itemPatches.find((p) => p.itemId === 'rent')!.patch.expenseKind, 'fixed');
    // The loan becomes debt financing; the salary doesn't.
    assert.deepEqual(plan.transactionPatches, [{ id: 'l1', patch: { incomeSubtype: 'debt_financing' } }]);
  });

  test('running the migration on migrated data changes nothing', () => {
    const first = planFlowMigration(input());
    const after = input();
    // Apply the plan to the input.
    for (const p of first.bucketPatches) Object.assign(after.buckets.find((b) => b.id === p.bucketId)!, p.patch);
    for (const b of first.newBuckets) {
      after.buckets.push({ id: b.id, name: b.name, type: b.type, kind: b.kind, currency: b.currency });
      after.itemsByBucket[b.id] = [];
    }
    for (const m of first.itemMoves) {
      const moving = after.itemsByBucket[m.from].find((i) => i.id === m.itemId)!;
      after.itemsByBucket[m.from] = after.itemsByBucket[m.from].filter((i) => i.id !== m.itemId);
      after.itemsByBucket[m.to].push(moving);
    }
    for (const p of first.itemPatches) Object.assign(after.itemsByBucket[p.bucketId].find((i) => i.id === p.itemId)!, p.patch);
    for (const p of first.transactionPatches) Object.assign(after.incomeTransactions.find((t) => t.id === p.id)!, p.patch);

    const second = planFlowMigration(after);
    assert.deepEqual(second.newBuckets, []);
    assert.deepEqual(second.bucketPatches, []);
    assert.deepEqual(second.itemMoves, []);
    assert.deepEqual(second.itemPatches, []);
    assert.deepEqual(second.transactionPatches, []);
  });

  test('expense kind: a set amount on a set date is fixed, a limit used through the month is variable', () => {
    assert.equal(inferExpenseKind({ name: 'Rent', recurring: true, hasDueDate: true }).kind, 'fixed');
    assert.equal(inferExpenseKind({ name: 'Bunk bed', recurring: false, hasDueDate: true }).kind, 'fixed');
    assert.equal(inferExpenseKind({ name: 'Food', recurring: true, hasDueDate: true }).kind, 'variable');
    assert.equal(inferExpenseKind({ name: 'Household', recurring: true, hasDueDate: true, hasSubItems: true }).kind, 'variable');
    assert.equal(inferExpenseKind({ name: 'Someday', recurring: false, hasDueDate: false }).kind, 'variable');
  });

  test('a transfer into a savings account is savings; a fee in a transfers bucket is an expense', () => {
    const bucket = { id: 'tr', name: 'Transfers', type: 'Transfer' as const, currency: 'XAF' };
    const ctx = { categories, accountType: new Map([['vault', 'Savings Account']]) };
    assert.equal(classifyItem(bucket, { id: 'a', name: 'Put away', amount: 1, accountId: 'momo', toAccountId: 'vault', dueDate: null }, ctx), 'Savings');
    assert.equal(classifyItem(bucket, { id: 'b', name: 'Transfer fees', amount: 1, dueDate: null }, ctx), 'Expense');
    assert.equal(classifyItem(bucket, { id: 'c', name: 'MoMo to UBA', amount: 1, toAccountId: 'uba', dueDate: null }, ctx), 'Transfer');
  });
});
