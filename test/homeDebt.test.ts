// Money Home, Debt and Areas: the words and groupings behind the redesign.
// Run: npx tsx --test test/homeDebt.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaFigures, categoryInsight, commitmentsOf, dueText, flowScale, greetingFor, monthBuckets, monthChange, niceScale, unaccountedChange, unexplainedText, upcomingLines, weekBuckets } from '../app/src/viewmodels/home';
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

test('cash flow: the last 12 weeks, Monday to Sunday, net per week (owner, 24 Nov 2026)', () => {
  const wed = new Date(2026, 9, 14); // Wednesday 14 Oct 2026
  const bars = weekBuckets(
    [
      { date: new Date(2026, 9, 12), income: 500_000, expense: 200_000 }, // Monday of this week
      { date: new Date(2026, 9, 11), income: 1_000, expense: 0 }, // Sunday: last week
      { date: new Date(2026, 6, 1), income: 999, expense: 0 }, // before the 12 weeks
    ],
    'week',
    wed
  );
  assert.equal(bars.length, 12);
  assert.equal(bars[11].label, '12 Oct');
  assert.equal(bars[11].income, 500_000);
  assert.equal(bars[11].net, 300_000);
  assert.equal(bars[10].income, 1_000);
  assert.equal(bars.reduce((s, b) => s + b.income, 0), 501_000);
});

test('cash flow: the last 12 months, a refund lowering expenses', () => {
  const bars = monthBuckets(
    [
      { date: new Date(2026, 9, 3), income: 0, expense: 50_000 },
      { date: new Date(2026, 9, 9), income: 0, expense: -10_000 },
      { date: new Date(2025, 10, 30), income: 7, expense: 0 }, // November 2025: the first of the 12
      { date: new Date(2025, 9, 30), income: 9, expense: 0 }, // too old
    ],
    new Date(2026, 9, 14)
  );
  assert.equal(bars.length, 12);
  assert.equal(bars[0].label, 'Nov');
  assert.equal(bars[0].income, 7);
  assert.equal(bars[11].expense, 40_000);
});

test('month on month: share and amount, or nothing to compare with', () => {
  assert.deepEqual(monthChange(120_000, 100_000), { change: 0.2, changeAmount: 20_000 });
  assert.deepEqual(monthChange(80_000, 0), { change: null, changeAmount: null });
});

test('commitments: planned, paid, still to pay and overdue', () => {
  const today = new Date(2026, 10, 20);
  const line = (o: Partial<{ type: string; archived: boolean; closed: boolean; due: Date | null; available: number; actual: number }>) => ({ type: 'Expense', archived: false, closed: false, due: null, available: 0, actual: 0, ...o });
  const c = commitmentsOf(
    [
      line({ available: 150_000, actual: 0, due: new Date(2026, 10, 5) }), // overdue
      line({ available: 50_000, actual: 50_000, due: new Date(2026, 10, 2) }), // paid
      line({ type: 'Savings', available: 40_000, actual: 10_000, due: new Date(2026, 10, 28) }), // still to pay, not late
      line({ available: 30_000, actual: 5_000, closed: true }), // closed: nothing left
      line({ type: 'Income', available: 400_000 }), // never counted
      line({ available: 9_000, archived: true }), // archived
    ],
    today
  );
  assert.deepEqual(c, { planned: 270_000, paid: 90_000, left: 180_000, overdue: 150_000 });
});

test('the unexplained balance reads as a sentence, not "Unaccounted for"', () => {
  assert.equal(unexplainedText(1_947_623, fmt), '1,947,623 is unaccounted for: your account balances are lower than your recorded transactions explain.');
  // More money than expected reads as a surplus, never a negative amount.
  assert.equal(unexplainedText(-20_000, fmt), 'You have a 20,000 surplus: your account balances are higher than your recorded transactions explain.');
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

test('niceScale: a round top in a few steps, 0 first', () => {
  assert.deepEqual(niceScale(180_000, 2), { max: 200_000, ticks: [0, 100_000, 200_000] });
  assert.deepEqual(niceScale(45, 2), { max: 50, ticks: [0, 25, 50] });
  assert.deepEqual(niceScale(0, 2).ticks[0], 0);
});

test('flowScale: one step both sides, fixed from every period, three to five ticks', () => {
  const s = flowScale([
    { income: 380_000, expense: 120_000 },
    { income: 0, expense: 150_000 },
  ]);
  assert.deepEqual(s, { domain: [-200_000, 400_000], ticks: [-200_000, 0, 200_000, 400_000] });
  assert.deepEqual(flowScale([{ income: 0, expense: 90_000 }]), { domain: [-100_000, 0], ticks: [-100_000, -50_000, 0] });
  const n = flowScale([{ income: 1_000_000, expense: 1_000_000 }]).ticks.length;
  assert.ok(n >= 3 && n <= 5);
});

test('unaccountedChange: amount from the rows, share only when last month had some', () => {
  assert.deepEqual(unaccountedChange(15_000, -5_000), { change: -0.25, changeAmount: -5_000 });
  assert.deepEqual(unaccountedChange(4_000, 4_000), { change: null, changeAmount: 4_000 });
  assert.deepEqual(unaccountedChange(4_000, null), { change: null, changeAmount: null });
});
