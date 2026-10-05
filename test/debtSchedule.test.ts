// Scheduled one-off repayments and "Everything left"
// (app/src/viewmodels/debtSchedule.ts).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceBefore, repaymentSchedule, scheduledImpact, type ScheduledLike } from '../app/src/viewmodels/debtSchedule';
import type { PlanLike } from '../app/src/viewmodels/debt';

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const monthly = (next: string, amount = 50_000): PlanLike => ({ amount, interval: 'monthly', nextPaymentDate: d(next), isActive: true, nextOverride: null });
const everything = (date: string, id = 'dec'): ScheduledLike => ({ id, date: d(date), amountMode: 'everything', amount: null, recorded: false });

describe('scheduled repayments', () => {
  test('"Everything left" on 15 Dec pays what is left after the earlier monthly payments', () => {
    const s = repaymentSchedule(400_000, monthly('2026-11-01'), [everything('2026-12-15')]);
    // 1 Nov 50,000 (350,000 left), 1 Dec 50,000 (300,000 left), 15 Dec everything: 300,000.
    assert.equal(s.amountOf.get('dec'), 300_000);
    assert.equal(s.events.at(-1)!.balanceAfter, 0);
    // The plan stops once nothing is owed.
    assert.equal(s.events.filter((e) => e.kind === 'repeating').length, 2);
  });

  test('it updates when another repayment is recorded first', () => {
    // 50,000 recorded early: 350,000 owed, the plan's next payment still 1 Nov.
    const s = repaymentSchedule(350_000, monthly('2026-11-01'), [everything('2026-12-15')]);
    assert.equal(s.amountOf.get('dec'), 250_000);
  });

  test('a monthly plan and a one-off December repayment both show in December', () => {
    const s = repaymentSchedule(1_000_000, monthly('2026-11-01'), [{ id: 'xmas', date: d('2026-12-20'), amountMode: 'set', amount: 300_000, recorded: false }]);
    const december = s.events.filter((e) => e.date.getMonth() === 11 && e.date.getFullYear() === 2026);
    assert.deepEqual(
      december.map((e) => [e.kind, e.amount]),
      [
        ['repeating', 50_000],
        ['scheduled', 300_000],
      ]
    );
  });

  test('set amounts past the balance are reported, with by how much', () => {
    const s = repaymentSchedule(200_000, null, [
      { id: 'a', date: d('2026-11-10'), amountMode: 'set', amount: 150_000, recorded: false },
      { id: 'b', date: d('2026-12-10'), amountMode: 'set', amount: 100_000, recorded: false },
    ]);
    assert.equal(s.overBy, 50_000);
  });

  test('recorded scheduled repayments are out of the schedule', () => {
    const s = repaymentSchedule(200_000, null, [{ id: 'a', date: d('2026-11-10'), amountMode: 'set', amount: 150_000, recorded: true }, everything('2026-12-15')]);
    assert.equal(s.amountOf.has('a'), false);
    assert.equal(s.amountOf.get('dec'), 200_000);
  });

  test('the balance expected on a date leaves out the repayment being edited', () => {
    const plan = monthly('2026-11-01');
    const scheduled = [everything('2026-12-15')];
    assert.equal(balanceBefore(400_000, plan, scheduled, d('2026-12-15'), 'dec'), 300_000);
    assert.equal(balanceBefore(400_000, plan, scheduled, d('2026-11-15'), 'dec'), 350_000);
  });

  test('the Impact card and the validation', () => {
    const ok = scheduledImpact({ amount: 250_000, date: d('2026-12-15'), from: 'UBA', expected: 250_000, overBy: 0, everything: true }, fmt);
    assert.deepEqual(ok.lines, ['Plans a 250,000 repayment on 15 Dec from UBA.', 'Your debt would be fully repaid.']);
    assert.equal(ok.tooMuch, false);
    const over = scheduledImpact({ amount: 300_000, date: d('2026-12-15'), from: null, expected: 250_000, overBy: 50_000, everything: false }, fmt);
    assert.equal(over.tooMuch, true);
    assert.deepEqual(over.warnings, [
      "That's more than the 250,000 expected to be owed on 15 Dec.",
      'Your scheduled repayments add up to 50,000 more than what you owe.',
    ]);
  });
});
