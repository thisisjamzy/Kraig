// Money Home, Debt and Areas: the words and groupings behind the redesign.
// Run: npx tsx --test test/homeDebt.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaFigures, categoryInsight, dueText, greetingFor, unexplainedText, upcomingLines, weekBuckets } from '../app/src/viewmodels/home';
import { debtSentence } from '../app/src/viewmodels/debt';

const LONG_DASH = /[–—]/;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// Saturday 3 October 2026, 15:00.
const now = new Date(2026, 9, 3, 15, 0);
const today = new Date(2026, 9, 3);

test('the greeting follows the time of day', () => {
  assert.equal(greetingFor(now, 'James'), 'Good afternoon, James');
  assert.equal(greetingFor(new Date(2026, 9, 3, 8), 'James'), 'Good morning, James');
  assert.equal(greetingFor(new Date(2026, 9, 3, 20), ''), 'Good evening');
});

test('due text: today, soon, and late in red words', () => {
  assert.equal(dueText(today, today), 'Due today');
  assert.equal(dueText(new Date(2026, 9, 5), today), 'Due in 2 days');
  assert.equal(dueText(new Date(2026, 9, 4), today), 'Due tomorrow');
  assert.equal(dueText(new Date(2026, 8, 30), today), '3 days late');
  assert.doesNotMatch(dueText(today, today), /due Due/i);
});

test('upcoming payments never include income, and come soonest first', () => {
  const line = (name: string, type: string, day: number, extra = {}) => ({ name, type, archived: false, closed: false, due: new Date(2026, 9, day), available: 100, actual: 0, ...extra });
  const items = [
    line('Unpaid half of July salary', 'Income', 1),
    line('Rent', 'Expense', 5),
    line('Emergency fund', 'Savings', 2),
    line('Paid already', 'Expense', 1, { actual: 100 }),
    line('Move to savings', 'Transfer', 9),
  ];
  assert.deepEqual(
    upcomingLines(items).map((i) => i.name),
    ['Emergency fund', 'Rent', 'Move to savings']
  );
});

test('the spending insight names the category that moved most', () => {
  assert.equal(
    categoryInsight(
      [
        { name: 'Transport', now: 60_000, before: 50_000 },
        { name: 'Food', now: 100_000, before: 100_000 },
      ],
      160_000,
      150_000
    ),
    'Transport is up 20% on last month'
  );
  assert.equal(categoryInsight([{ name: 'Food', now: 100_000, before: 0 }], 100_000, 0), 'Most of it went to Food (100%)');
});

test('cash flow: the last 30 days in weeks, net per week', () => {
  const bars = weekBuckets(
    [
      { date: new Date(2026, 9, 2), income: 500_000, expense: 200_000 },
      { date: new Date(2026, 8, 5), income: 1_000, expense: 0 }, // 3 Sep is day 1 of the window, 5 Sep inside it
      { date: new Date(2026, 7, 1), income: 999, expense: 0 }, // outside
    ],
    'week',
    today
  );
  assert.equal(bars.length, 5);
  const last = bars[bars.length - 1];
  assert.equal(last.income, 500_000);
  assert.equal(last.net, 300_000);
  assert.equal(bars.reduce((s, b) => s + b.income, 0), 501_000);
});

test('the unexplained balance reads as a sentence, not "Unaccounted for"', () => {
  assert.equal(unexplainedText(1_947_623, fmt), 'Your account balances are 1,947,623 more than your recorded transactions explain.');
  assert.equal(unexplainedText(0.2, fmt), null);
});

test("the Debt page's sentence", () => {
  const text = debtSentence(3_971_122, { name: 'Momokash', amount: 50_000, date: new Date(2026, 8, 28) }, today, fmt);
  assert.equal(text, 'You owe 3,971,122. The next payment is 50,000 to Momokash on 28 Sept, now 5 days late.'.replace('Sept', new Date(2026, 8, 28).toLocaleDateString('en-GB', { month: 'short' })));
  assert.doesNotMatch(text, LONG_DASH);
  assert.equal(debtSentence(0, null, today, fmt), 'You have no debt.');
});

test('area figures are in sentence case', () => {
  assert.equal(areaFigures({ projects: 15, openTasks: 42, atRisk: 3 }), '15 projects · 42 open tasks · 3 at risk');
  assert.equal(areaFigures({ projects: 1, openTasks: 1, atRisk: 0 }), '1 project · 1 open task');
});
