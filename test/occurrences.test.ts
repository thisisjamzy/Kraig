// Planned payment occurrences derived from the current basket items
// (app/src/shared/budget/occurrences.ts): change handling, stored user
// actions, Waiting for income and the one-time repair.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthBudget, type MonthBudgetInput } from '../app/src/shared/budget/monthBudget';
import { deriveOccurrences, repairPlan, type OccurrenceAction } from '../app/src/shared/budget/occurrences';

const ts = (iso: string) => ({ toDate: () => new Date(`${iso}T00:00:00`) }) as never;

const categories: MonthBudgetInput['categories'] = new Map([
  ['housing', { name: 'Housing', transactionType: 'Expense' }],
  ['salary', { name: 'Salary', transactionType: 'Income' }],
]);

function item(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    goalId: 'b',
    name: id,
    amount: 100,
    categoryId: 'housing',
    dueDate: ts('2026-01-01'),
    recurrence: { frequency: 'Monthly' as const, interval: 1 },
    completed: false,
    charges: null,
    ...extra,
  };
}

const rent = (extra: Record<string, unknown> = {}) =>
  item('rent', { name: 'Rent', amount: 150_000, necessity: 'MustHave', priority: 'High', accountId: 'momo', automation: { mode: 'prepare', trigger: 'any_income', amountMode: 'fixed' }, ...extra });
const salary = item('aims', { name: 'AIMS salary', categoryId: 'salary', amount: 1_013_381, dueDate: ts('2026-01-25') });
const salaryIn = {
  id: 'sal',
  accountId: 'momo',
  amount: 1_013_381,
  direction: 'Inflow' as const,
  type: 'Income',
  categoryId: 'salary',
  month: '2026-11',
  date: ts('2026-11-02'),
  bucketItem: { bucketId: 'pay', itemId: 'aims', month: '2026-11' },
};

function budget(homeItems: unknown[], transactions: unknown[] = [salaryIn]) {
  return buildMonthBudget({
    month: '2026-11',
    buckets: [
      { id: 'home', name: 'Home', currency: 'XAF', type: 'Expense', kind: 'Fixed' },
      { id: 'pay', name: 'Income streams', currency: 'XAF', type: 'Income', kind: 'Fixed' },
    ],
    itemsByBucket: { home: homeItems as never, pay: [salary] },
    transactions: transactions as never,
    transfers: [],
    allocations: [],
    accountCurrency: new Map([['momo', 'XAF']]),
    accountType: new Map([['momo', 'Mobile Money']]),
    categories,
    baseCurrency: 'XAF',
    toDisplay: (amount) => amount,
  });
}

const today = new Date(2026, 10, 5);
const none = new Map<string, OccurrenceAction>();

describe('derived occurrences', () => {
  test('an unconfirmed payment takes the item\'s new amount at once (Rent 150,000 to 160,000)', () => {
    assert.equal(deriveOccurrences(budget([rent()]), today, none)[0].amount, 150_000);
    const after = deriveOccurrences(budget([rent({ changesFrom: { '2026-11': { amount: 160_000 } } })]), today, none);
    assert.equal(after.length, 1);
    assert.equal(after[0].id, 'rent__202611');
    assert.equal(after[0].amount, 160_000);
    assert.equal(after[0].state, 'ready');
  });

  test('a confirmed payment is never shown again or changed', () => {
    const actions = new Map<string, OccurrenceAction>([['rent__202611', { id: 'rent__202611', status: 'confirmed' }]]);
    assert.deepEqual(deriveOccurrences(budget([rent({ amount: 160_000 })]), today, actions), []);
  });

  test('skipped and postponed occurrences stay hidden (postponed until its day)', () => {
    const skipped = new Map<string, OccurrenceAction>([['rent__202611', { id: 'rent__202611', status: 'skipped' }]]);
    assert.deepEqual(deriveOccurrences(budget([rent()]), today, skipped), []);
    const postponed = new Map<string, OccurrenceAction>([['rent__202611', { id: 'rent__202611', status: 'postponed', postponedUntil: '2026-11-10' }]]);
    assert.deepEqual(deriveOccurrences(budget([rent()]), today, postponed), []);
    assert.equal(deriveOccurrences(budget([rent()]), new Date(2026, 10, 10), postponed).length, 1);
  });

  test('deleting, archiving or excluding the item removes its unconfirmed occurrence', () => {
    assert.deepEqual(deriveOccurrences(budget([]), today, none), []);
    assert.deepEqual(deriveOccurrences(budget([rent({ excludedMonths: ['2026-11'] })]), today, none), []);
  });

  test('moving the due date to another month moves the occurrence with it', () => {
    const once = rent({ recurrence: null, dueDate: ts('2026-12-01') });
    assert.deepEqual(deriveOccurrences(budget([once]), today, none), []);
  });

  test('paid from a specific income not received yet: Waiting for income', () => {
    const fromBonus = rent({ automation: { mode: 'prepare', trigger: 'income', incomeItemId: 'bonus', amountMode: 'fixed' } });
    const [o] = deriveOccurrences(budget([fromBonus]), today, none, (id) => (id === 'bonus' ? 'Year-end bonus' : undefined));
    assert.equal(o.state, 'waiting');
    assert.equal(o.waitingFor, 'Year-end bonus');
    // From AIMS salary, which arrived: ready.
    const fromSalary = rent({ automation: { mode: 'prepare', trigger: 'income', incomeItemId: 'aims', amountMode: 'fixed' } });
    assert.equal(deriveOccurrences(budget([fromSalary]), today, none)[0].state, 'ready');
  });

  test('an amount typed before confirming is kept while the item stays the same, dropped with an Updated note when it changes', () => {
    const edit = new Map<string, OccurrenceAction>([['rent__202611', { id: 'rent__202611', status: 'ready', amountEdit: 140_000, amountEditBase: 150_000 }]]);
    const kept = deriveOccurrences(budget([rent()]), today, edit)[0];
    assert.equal(kept.amount, 140_000);
    assert.equal(kept.edited, true);
    assert.equal(kept.updated, null);
    const changed = deriveOccurrences(budget([rent({ amount: 160_000 })]), today, edit)[0];
    assert.equal(changed.amount, 160_000);
    assert.equal(changed.edited, false);
    assert.deepEqual(changed.updated, { from: 140_000, to: 160_000 });
  });

  test('a due-date trigger not reached yet is upcoming, not waiting', () => {
    const due = rent({ dueDate: ts('2026-01-20'), automation: { mode: 'prepare', trigger: 'due', amountMode: 'fixed' } });
    assert.deepEqual(deriveOccurrences(budget([due]), today, none), []);
    assert.equal(deriveOccurrences(budget([due]), new Date(2026, 10, 20), none)[0].state, 'ready');
  });

  test('a paid line has no occurrence', () => {
    const paid = { id: 'r', accountId: 'momo', amount: 150_000, direction: 'Outflow', type: 'Expense', categoryId: 'housing', month: '2026-11', date: ts('2026-11-03'), bucketItem: { bucketId: 'home', itemId: 'rent', month: '2026-11' } };
    assert.deepEqual(deriveOccurrences(budget([rent()], [salaryIn, paid]), today, none), []);
  });
});

describe('one-time repair', () => {
  test('counts stale copies and those of deleted items, once', () => {
    const live = deriveOccurrences(budget([rent({ amount: 160_000 })]), today, none);
    const plan = repairPlan(live, [
      { id: 'rent__202611', status: 'ready', amount: 150_000, accountId: 'momo' },
      { id: 'gym__202611', status: 'ready', amount: 20_000, accountId: 'momo' },
      { id: 'phone__202610', status: 'confirmed', amount: 5_000, accountId: 'momo' },
    ]);
    assert.deepEqual(plan.changed, ['rent__202611']);
    assert.deepEqual(plan.removed, ['gym__202611']);
    assert.equal(plan.report, '2 waiting payments were updated to match your baskets.');
  });

  test('nothing stale: no report', () => {
    const live = deriveOccurrences(budget([rent()]), today, none);
    assert.equal(repairPlan(live, [{ id: 'rent__202611', status: 'ready', amount: 150_000, accountId: 'momo' }]).report, null);
  });
});
