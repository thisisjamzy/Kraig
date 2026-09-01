// Tests for budgets.upcoming (Payments Calendar's data source, see the
// comment on upcomingBudgetPayments_ in Code.gs and PRD-BACKEND.md section 10).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCodeGs, createMockSheet } = require('./support/gasEnv');

function baseSheets(extra = {}) {
  const settings = createMockSheet(['Key', 'Value'], 4);
  settings.getRange(2, 1, 2, 2).setValues([
    ['DefaultCurrency', 'XAF'],
    ['DisplayCurrency', 'XAF'],
  ]);
  const rates = createMockSheet(['Currency', 'RateToBase', 'UpdatedAt', 'Notes'], 4);
  rates.getRange(2, 1, 1, 4).setValues([['XAF', 1, new Date(), 'base']]);
  const categories = createMockSheet(['ID', 'Name', 'TransactionType', 'Group', 'Notes', 'Archived'], 4);
  categories.getRange(2, 1, 1, 6).setValues([['cat_test', 'Test Category', 'Expense', 'Fixed', '', false]]);
  const accounts = createMockSheet(
    ['ID', 'Name', 'Type', 'Currency', 'StartingBalance', 'CurrentBalance', 'Notes', 'Archived'],
    4
  );
  const budgetRules = createMockSheet(
    [
      'ID', 'CategoryID', 'Description', 'BudgetedAmount', 'Frequency', 'Interval', 'AnchorDate',
      'EndCondition', 'EndOccurrences', 'EndDate', 'AccountID', 'Tag', 'Archived',
    ],
    20
  );
  return loadCodeGs({
    Settings: settings,
    ExchangeRates: rates,
    Categories: categories,
    Accounts: accounts,
    BudgetRules: budgetRules,
    ...extra,
  });
}

test('budgets.upcoming finds the next monthly occurrence within the horizon', () => {
  const ctx = baseSheets();
  ctx.upsertBudgetRule_({
    categoryId: 'cat_test', description: 'Rent', budgetedAmount: 250000,
    frequency: 'Monthly', interval: 1, anchorDate: '2026-01-15', endCondition: 'Never',
  });

  const upcoming = ctx.upcomingBudgetPayments_({ from: '2026-08-01', horizonDays: 60 });
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].dueDate, '2026-08-15');
  assert.equal(upcoming[0].amount, 250000);
  assert.equal(upcoming[0].recurring, true);
});

test('budgets.upcoming excludes a Once rule whose single occurrence already passed', () => {
  const ctx = baseSheets();
  ctx.upsertBudgetRule_({
    categoryId: 'cat_test', description: 'One-time fee', budgetedAmount: 5000,
    frequency: 'Once', anchorDate: '2026-01-01', endCondition: 'Never',
  });

  const upcoming = ctx.upcomingBudgetPayments_({ from: '2026-08-01', horizonDays: 60 });
  assert.equal(upcoming.length, 0);
});

test('budgets.upcoming finds a weekly occurrence on or after `from`', () => {
  const ctx = baseSheets();
  ctx.upsertBudgetRule_({
    categoryId: 'cat_test', description: 'Groceries', budgetedAmount: 20000,
    frequency: 'Weekly', interval: 1, anchorDate: '2026-08-03', endCondition: 'Never',
  });

  const upcoming = ctx.upcomingBudgetPayments_({ from: '2026-08-01', horizonDays: 14 });
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].dueDate, '2026-08-03');
  assert.equal(upcoming[0].recurring, true);
});

test('budgets.upcoming respects "After Occurrences" — excludes a rule that already ended', () => {
  const ctx = baseSheets();
  ctx.upsertBudgetRule_({
    categoryId: 'cat_test', description: 'Short-lived rule', budgetedAmount: 1000,
    frequency: 'Monthly', interval: 1, anchorDate: '2026-01-15',
    endCondition: 'After Occurrences', endOccurrences: 1,
  });

  // The rule's only occurrence is January; by August it's long past.
  const upcoming = ctx.upcomingBudgetPayments_({ from: '2026-08-01', horizonDays: 60 });
  assert.equal(upcoming.length, 0);
});

test('budgets.upcoming sorts multiple rules soonest-first', () => {
  const ctx = baseSheets();
  ctx.upsertBudgetRule_({
    categoryId: 'cat_test', description: 'Later', budgetedAmount: 1000,
    frequency: 'Monthly', interval: 1, anchorDate: '2026-01-25', endCondition: 'Never',
  });
  ctx.upsertBudgetRule_({
    categoryId: 'cat_test', description: 'Sooner', budgetedAmount: 2000,
    frequency: 'Monthly', interval: 1, anchorDate: '2026-01-05', endCondition: 'Never',
  });

  // upcoming is an Array from the vm sandbox's own realm, so compare content
  // (not deepEqual, which is realm-sensitive for arrays/objects — see
  // gasEnv.js) via a plain-string join instead.
  const upcoming = ctx.upcomingBudgetPayments_({ from: '2026-08-01', horizonDays: 30 });
  assert.equal(upcoming.map((p) => p.title).join(','), 'Sooner,Later');
});
