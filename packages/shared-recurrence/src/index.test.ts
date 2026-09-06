// Ported from sheets/test/budgetsUpcoming.test.js's coverage of the
// original Code.gs logic this module replaces — same cases, same expected
// dates, confirming the port is behavior-identical.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleAppliesToMonth, nextOccurrenceOnOrAfter, effectiveBudgetedAmount, type RecurrenceRule } from './index';

test('nextOccurrenceOnOrAfter finds the next monthly occurrence within the horizon', () => {
  const rule: RecurrenceRule = { frequency: 'Monthly', interval: 1, anchorDate: new Date(2026, 0, 15) };
  const from = new Date(2026, 7, 1);
  const until = new Date(from.getTime() + 60 * 24 * 3600 * 1000);
  const next = nextOccurrenceOnOrAfter(rule, from, until);
  assert.ok(next);
  assert.equal(next!.getFullYear(), 2026);
  assert.equal(next!.getMonth(), 7); // August
  assert.equal(next!.getDate(), 15);
});

test('nextOccurrenceOnOrAfter excludes a Once rule whose single occurrence already passed', () => {
  const rule: RecurrenceRule = { frequency: 'Once', anchorDate: new Date(2026, 0, 1) };
  const from = new Date(2026, 7, 1);
  const until = new Date(from.getTime() + 60 * 24 * 3600 * 1000);
  assert.equal(nextOccurrenceOnOrAfter(rule, from, until), null);
});

test('nextOccurrenceOnOrAfter finds a weekly occurrence on or after `from`', () => {
  const rule: RecurrenceRule = { frequency: 'Weekly', interval: 1, anchorDate: new Date(2026, 7, 3) };
  const from = new Date(2026, 7, 1);
  const until = new Date(from.getTime() + 14 * 24 * 3600 * 1000);
  const next = nextOccurrenceOnOrAfter(rule, from, until);
  assert.ok(next);
  assert.equal(next!.getDate(), 3);
});

test('nextOccurrenceOnOrAfter respects "After Occurrences" — excludes a rule that already ended', () => {
  const rule: RecurrenceRule = {
    frequency: 'Monthly',
    interval: 1,
    anchorDate: new Date(2026, 0, 15),
    endCondition: 'After Occurrences',
    endOccurrences: 1,
  };
  const from = new Date(2026, 7, 1);
  const until = new Date(from.getTime() + 60 * 24 * 3600 * 1000);
  assert.equal(nextOccurrenceOnOrAfter(rule, from, until), null);
});

test('nextOccurrenceOnOrAfter sorts multiple rules soonest-first (by comparing dates)', () => {
  const sooner: RecurrenceRule = { frequency: 'Monthly', interval: 1, anchorDate: new Date(2026, 0, 5) };
  const later: RecurrenceRule = { frequency: 'Monthly', interval: 1, anchorDate: new Date(2026, 0, 25) };
  const from = new Date(2026, 7, 1);
  const until = new Date(from.getTime() + 30 * 24 * 3600 * 1000);
  const a = nextOccurrenceOnOrAfter(sooner, from, until)!;
  const b = nextOccurrenceOnOrAfter(later, from, until)!;
  assert.ok(a < b);
});

test('ruleAppliesToMonth: a Monthly rule applies every month from its anchor onward', () => {
  const rule: RecurrenceRule = { frequency: 'Monthly', interval: 1, anchorDate: new Date(2026, 0, 15) };
  assert.equal(ruleAppliesToMonth(rule, 2025, 12), null); // before anchor
  const jan = ruleAppliesToMonth(rule, 2026, 1);
  assert.deepEqual(jan, { occurrenceIndex: 1, multiplier: 1 });
  const aug = ruleAppliesToMonth(rule, 2026, 8);
  assert.deepEqual(aug, { occurrenceIndex: 8, multiplier: 1 });
});

test('ruleAppliesToMonth: interval 2 Monthly applies every other month', () => {
  const rule: RecurrenceRule = { frequency: 'Monthly', interval: 2, anchorDate: new Date(2026, 0, 15) };
  assert.ok(ruleAppliesToMonth(rule, 2026, 1)); // Jan: occurrence 1
  assert.equal(ruleAppliesToMonth(rule, 2026, 2), null); // Feb: skipped
  assert.ok(ruleAppliesToMonth(rule, 2026, 3)); // Mar: occurrence 2
});

test('nextOccurrenceOnOrAfter finds a daily occurrence on or after `from`', () => {
  const rule: RecurrenceRule = { frequency: 'Daily', interval: 1, anchorDate: new Date(2026, 7, 1) };
  const from = new Date(2026, 7, 5);
  const until = new Date(from.getTime() + 3 * 24 * 3600 * 1000);
  const next = nextOccurrenceOnOrAfter(rule, from, until);
  assert.ok(next);
  assert.equal(next!.getDate(), 5); // Daily always lands on `from` itself
});

test('nextOccurrenceOnOrAfter respects interval > 1 for a Daily rule (every 3rd day)', () => {
  const rule: RecurrenceRule = { frequency: 'Daily', interval: 3, anchorDate: new Date(2026, 7, 1) };
  const from = new Date(2026, 7, 2);
  const until = new Date(from.getTime() + 10 * 24 * 3600 * 1000);
  const next = nextOccurrenceOnOrAfter(rule, from, until);
  assert.ok(next);
  assert.equal(next!.getDate(), 4); // anchor Aug 1, next occurrence Aug 4
});

test('ruleAppliesToMonth: a Daily rule lands once for every day of the month it covers', () => {
  const rule: RecurrenceRule = { frequency: 'Daily', interval: 1, anchorDate: new Date(2026, 7, 1) };
  const aug = ruleAppliesToMonth(rule, 2026, 8);
  assert.ok(aug);
  assert.equal(aug!.multiplier, 31); // every day in August
});

test('ruleAppliesToMonth: a Weekly rule can land more than once in the same month', () => {
  const rule: RecurrenceRule = { frequency: 'Weekly', interval: 1, anchorDate: new Date(2026, 7, 3) };
  const aug = ruleAppliesToMonth(rule, 2026, 8);
  assert.ok(aug);
  assert.ok(aug!.multiplier >= 4); // ~4-5 Mondays in August 2026
});

test('ruleAppliesToMonth: "On Date" end condition stops future months', () => {
  const rule: RecurrenceRule = {
    frequency: 'Monthly',
    interval: 1,
    anchorDate: new Date(2026, 0, 15),
    endCondition: 'On Date',
    endDate: new Date(2026, 5, 30),
  };
  assert.ok(ruleAppliesToMonth(rule, 2026, 6)); // June: still within end date
  assert.equal(ruleAppliesToMonth(rule, 2026, 7), null); // July: past end date
});

test('effectiveBudgetedAmount: no override falls back to budgetedAmount * multiplier', () => {
  assert.equal(effectiveBudgetedAmount(200, 1, undefined, '2026-03'), 200);
  assert.equal(effectiveBudgetedAmount(200, 1, {}, '2026-03'), 200);
  assert.equal(effectiveBudgetedAmount(50, 4, undefined, '2026-03'), 200); // Weekly multiplier
});

test('effectiveBudgetedAmount: an override for that month wins outright, ignoring the multiplier', () => {
  const overrides = { '2026-03': { budgetedAmount: 75 } };
  assert.equal(effectiveBudgetedAmount(200, 1, overrides, '2026-03'), 75);
  // A different month on the same rule is untouched by the override.
  assert.equal(effectiveBudgetedAmount(200, 1, overrides, '2026-04'), 200);
});
