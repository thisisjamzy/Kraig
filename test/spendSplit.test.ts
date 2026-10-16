// A category's spend, planned and unplanned (app/src/viewmodels/
// spendSplit.ts and the category page built on it).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { categoryContribution, spendSplit } from '../app/src/viewmodels/spendSplit';

const read = (path: string) => readFileSync(join(__dirname, '../app/src', path), 'utf8');

test('the two parts add up to the total, with counts and the planned share', () => {
  const split = spendSplit([
    { amount: 30_000, planned: true },
    { amount: 10_000, planned: true },
    { amount: 15_000, planned: false },
    // A refund back in lowers the unplanned part.
    { amount: -5_000, planned: false },
  ]);
  assert.deepEqual(split, { total: 50_000, planned: 40_000, unplanned: 10_000, plannedCount: 2, unplannedCount: 2, plannedPercent: 80 });
  assert.equal(spendSplit([]).plannedPercent, 0);
});

test('spend counts money out for an expense category and money in for an income one', () => {
  assert.equal(categoryContribution({ type: 'Expense', direction: 'Outflow', amount: 100 }), 100);
  assert.equal(categoryContribution({ type: 'Expense', direction: 'Inflow', amount: 100 }), -100);
  assert.equal(categoryContribution({ type: 'Income', direction: 'Inflow', amount: 100 }), 100);
});

test('the category page always shows the split, filters by part and labels each row', () => {
  const logic = read('logic/categoryTransactions/useLogic.ts');
  // Opened for a month, the same links the Budget screen counts.
  assert.match(logic, /showSummaryCard \? linkedInMonth\.has\(t\.id\) : Boolean\(t\.bucketItem\)/);
  const screen = read('screens/CategoryTransactions/CategoryTransactionsScreen.tsx');
  assert.match(screen, /aria-label="Planned and unplanned"/);
  assert.match(screen, /setSpendFilter\(spendFilter === part \? 'all' : part\)/);
  assert.match(screen, /Planned\$\{transaction\.plannedIn/);
});
