// Tests for budgets.getRule and settings.setTotalBudget, added alongside
// budgets.upcoming so the Budget screen can edit a rule's amount without
// losing its original recurrence, and edit the monthly ceiling for real.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCodeGs, createMockSheet } = require('./support/gasEnv');

function baseSheets(extra = {}) {
  const settings = createMockSheet(['Key', 'Value'], 6);
  settings.getRange(2, 1, 4, 2).setValues([
    ['TotalBudget', 500000],
    ['DefaultCurrency', 'XAF'],
    ['DisplayCurrency', 'XAF'],
    ['HouseholdName', 'Kraig'],
  ]);
  const rates = createMockSheet(['Currency', 'RateToBase', 'UpdatedAt', 'Notes'], 4);
  rates.getRange(2, 1, 1, 4).setValues([['XAF', 1, new Date(), 'base']]);
  const accounts = createMockSheet(
    ['ID', 'Name', 'Type', 'Currency', 'StartingBalance', 'CurrentBalance', 'Notes', 'Archived'],
    4
  );
  const budgetRules = createMockSheet(
    [
      'ID', 'CategoryID', 'Description', 'BudgetedAmount', 'Frequency', 'Interval', 'AnchorDate',
      'EndCondition', 'EndOccurrences', 'EndDate', 'AccountID', 'Tag', 'Archived',
    ],
    10
  );
  return loadCodeGs({ Settings: settings, ExchangeRates: rates, Accounts: accounts, BudgetRules: budgetRules, ...extra });
}

test('budgets.getRule returns the raw row a display-shaped listRules entry can\'t', () => {
  const ctx = baseSheets();
  const created = ctx.upsertBudgetRule_({
    categoryId: 'cat_test', description: 'Rent', budgetedAmount: 250000,
    frequency: 'Monthly', interval: 1, anchorDate: '2026-01-15',
    endCondition: 'After Occurrences', endOccurrences: 12,
  });

  const fetched = ctx.getBudgetRule_({ id: created.id });
  assert.equal(fetched.anchorDate, '2026-01-15');
  assert.equal(fetched.frequency, 'Monthly');
  assert.equal(fetched.endCondition, 'After Occurrences');
  assert.equal(fetched.endOccurrences, 12);
});

test('budgets.getRule throws NOT_FOUND for an archived (deleted) rule', () => {
  const ctx = baseSheets();
  const created = ctx.upsertBudgetRule_({
    categoryId: 'cat_test', description: 'Rent', budgetedAmount: 250000,
    frequency: 'Monthly', anchorDate: '2026-01-15',
  });
  ctx.deleteBudgetRule_({ id: created.id });

  assert.throws(() => ctx.getBudgetRule_({ id: created.id }), (err) => err.code === 'NOT_FOUND');
});

test('settings.setTotalBudget updates the ceiling read back by settings.get', () => {
  const ctx = baseSheets();
  const result = ctx.setTotalBudget_({ amount: 750000 });
  assert.equal(result.totalBudget, 750000);
  assert.equal(ctx.getSettings_().totalBudget, 750000);
});
