import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Occurrence } from '../app/src/viewmodels/plans/model';
import { affordabilityWalk, itemsFor, sortItems } from '../app/src/viewmodels/plans/priorities';
import { applyWhatIf, capacityAfterCurrent, planSchedule, plansForecast, type ForecastInput } from '../app/src/viewmodels/plans/forecast';
import { bucketSummaries, mustCoverage } from '../app/src/viewmodels/plans/overview';

const TODAY = new Date(2026, 8, 27, 12); // 27 Sep 2026

let n = 0;
function occ(o: Partial<Occurrence> & { name: string; planned: number; due: Date | null }): Occurrence {
  const month = o.due ? `${o.due.getFullYear()}-${String(o.due.getMonth() + 1).padStart(2, '0')}` : '2026-09';
  return {
    key: `i${n}@${month}`, itemId: `i${n++}`, bucketId: 'home', bucketName: 'Douala House Furnishing', month, kind: 'fixed',
    need: 'must', priority: 'Medium', tag: 'Furniture', paid: 0, recurring: false, inPlan: true, consequence: false,
    manualRank: 0, postponed: false, dropped: false, closed: false, ...o,
  };
}

const d = (y: number, m0: number, day: number) => new Date(y, m0, day);

describe('recommended order', () => {
  it('2. overdue first, then must have, urgency, priority, smaller amount', () => {
    const overdueNice = occ({ name: 'overdue nice', planned: 50000, due: d(2026, 8, 20), need: 'nice' });
    const mustNextWeek = occ({ name: 'must next week', planned: 50000, due: d(2026, 9, 3) });
    const mustHigh = occ({ name: 'must high', planned: 90000, due: d(2026, 8, 30), priority: 'High' });
    const mustMedium = occ({ name: 'must medium', planned: 10000, due: d(2026, 8, 30), priority: 'Medium' });
    const smallA = occ({ name: 'small', planned: 5000, due: d(2026, 8, 29) });
    const bigA = occ({ name: 'big', planned: 8000, due: d(2026, 8, 29) });
    const order = sortItems([mustNextWeek, mustMedium, bigA, overdueNice, mustHigh, smallA], 'recommended', TODAY).map((o) => o.name);
    assert.equal(order[0], 'overdue nice');
    assert.ok(order.indexOf('must high') < order.indexOf('must medium'));
    assert.ok(order.indexOf('small') < order.indexOf('big'));
  });
});

describe('affordability', () => {
  const items = [
    occ({ name: 'A 200k must Oct 10', planned: 200000, due: d(2026, 9, 10) }),
    occ({ name: 'B 300k must Oct 31', planned: 300000, due: d(2026, 9, 31) }),
    occ({ name: 'C 50k nice Oct 15', planned: 50000, due: d(2026, 9, 15), need: 'nice' }),
    occ({ name: 'D 50k nice Dec 30', planned: 50000, due: d(2026, 11, 30), need: 'nice' }),
    occ({ name: 'E 200k must Jan 31', planned: 200000, due: d(2027, 0, 31) }),
  ];

  it('3. the divider sits after the items that fit, with the spare amount', () => {
    const open = sortItems(itemsFor('open', items, TODAY), 'recommended', TODAY);
    const walk = affordabilityWalk(open, 803000);
    // 200 + 300 + 50 + 200 fit (750k), the last nice-to-have doesn't fit? 803 − 750 = 53 ≥ 50: all fit.
    assert.equal(walk.divider, -1);
    assert.equal(walk.spare, 3000);
    const tight = affordabilityWalk(open, 520000);
    assert.equal(tight.coveredCount, 2);
    assert.equal(tight.divider, 2);
    assert.equal(tight.spare, 20000);
  });

  it('4. Smallest first moves the divider and the covered checks', () => {
    const open = itemsFor('open', items, TODAY);
    const rec = affordabilityWalk(sortItems(open, 'recommended', TODAY), 520000);
    const small = affordabilityWalk(sortItems(open, 'smallest', TODAY), 520000);
    assert.notEqual(rec.divider, small.divider);
    assert.deepEqual(small.rows.filter((r) => r.covered).map((r) => r.item.name).slice(0, 2), ['C 50k nice Oct 15', 'D 50k nice Dec 30']);
  });

  it('6. must-haves short shows as Short', () => {
    const due = [occ({ name: 'Rent', planned: 245000, due: d(2026, 8, 30) })];
    const cover = mustCoverage(due, 200000, TODAY);
    assert.equal(cover.status, 'short');
    assert.equal(cover.spare, -45000);
  });
});

function input(occurrences: Occurrence[], over: Partial<ForecastInput> = {}): ForecastInput {
  return {
    today: TODAY, occurrences, availableNow: 0, irregularIncome: 0,
    incomeHistory: [], variableHistory: [], variablePlan: () => 0, variableSpentThisMonth: 0, historyMonths: 6, ...over,
  };
}
const salary = (month0: number, year = 2026) => occ({ name: 'Salary', planned: 1000000, due: d(year, month0, 25), kind: 'income', inPlan: false, recurring: true });

describe('plans forecast', () => {
  it('5. postponing the TV stand to January moves 50,000 to January', () => {
    const tv = occ({ name: 'TV Stand', planned: 50000, due: d(2026, 8, 30), need: 'nice' });
    const moved = applyWhatIf([tv], { moves: { [tv.key]: d(2027, 0, 15) }, drops: [], extras: [] });
    assert.equal(itemsFor('month', moved, TODAY).length, 0);
    assert.equal(itemsFor('open', moved, TODAY).length, 1);
    const before = plansForecast(input([tv]), 6, 'expected');
    const after = plansForecast(input(moved), 6, 'expected');
    const jan = (f: typeof before) => f.months.find((m) => m.month === '2027-01')!.planPayments;
    assert.equal(jan(after) - jan(before), 50000);
  });

  it('7. a plan that outruns free money finishes later than its target, and 8. set-aside totals add up', () => {
    const occurrences = [
      salary(9), salary(10), salary(11),
      occ({ name: 'Window 1', planned: 900000, due: d(2026, 9, 5), bucketId: 'lendi', bucketName: 'Lendi windows' }),
      occ({ name: 'Window 2', planned: 900000, due: d(2026, 10, 5), bucketId: 'lendi', bucketName: 'Lendi windows' }),
      occ({ name: 'Sofa', planned: 300000, due: d(2026, 11, 5) }),
    ];
    const rows = planSchedule(input(occurrences, { variableHistory: [300000, 300000, 300000], historyMonths: 6 }), 'expected');
    const lendi = rows.find((r) => r.bucketId === 'lendi')!;
    assert.equal(lendi.targetEnd, '2026-11');
    assert.ok(lendi.forecastEnd === null || lendi.forecastEnd > '2026-11');
    const total = rows.reduce((s, r) => s + r.setAside, 0);
    const expected = rows.reduce((s, r) => s + r.remaining / r.monthsLeft, 0);
    assert.ok(Math.abs(total - expected) < 0.05);
  });

  it('9. a what-if drop updates the forecast, and dropping nothing restores it', () => {
    const big = occ({ name: 'Bed', planned: 200000, due: d(2026, 9, 10) });
    const base = plansForecast(input([salary(9), big]), 3, 'expected');
    const dropped = plansForecast(input([salary(9), big]), 3, 'expected', { moves: {}, drops: [big.key], extras: [] });
    const oct = (f: typeof base) => f.months.find((m) => m.month === '2026-10')!;
    assert.equal(oct(base).planPayments - oct(dropped).planPayments, 200000);
    assert.deepEqual(plansForecast(input([salary(9), big]), 3, 'expected'), base);
    assert.ok(capacityAfterCurrent(base).length === 2);
  });

  it('10. under 3 months of history is low confidence', () => {
    assert.equal(plansForecast(input([], { historyMonths: 2 }), 3, 'expected').lowConfidence, true);
  });
});

describe('buckets', () => {
  it('a recurring bucket with the salary and the bills is fixed, and totals only the bills', () => {
    const list = [
      occ({ name: 'Salary', planned: 2000000, due: d(2026, 8, 25), bucketId: 'monthly', kind: 'income', paid: 2000000, recurring: true, inPlan: false }),
      occ({ name: 'Rent', planned: 300000, due: d(2026, 8, 5), bucketId: 'monthly', kind: 'fixed', paid: 300000, recurring: true, inPlan: false }),
      occ({ name: 'Power', planned: 50000, due: d(2026, 8, 28), bucketId: 'monthly', kind: 'fixed', recurring: true, inPlan: false }),
      occ({ name: 'Bonus', planned: 100000, due: d(2026, 8, 30), bucketId: 'pay', kind: 'income', recurring: true, inPlan: false }),
    ];
    const byId = new Map(bucketSummaries(list, '2026-09', TODAY).map((s) => [s.bucketId, s]));
    assert.equal(byId.get('monthly')!.section, 'fixed');
    assert.equal(byId.get('monthly')!.planned, 350000);
    assert.equal(byId.get('monthly')!.spent, 300000);
    assert.equal(byId.get('monthly')!.itemCount, 2);
    assert.equal(byId.get('pay')!.section, 'income');
  });
});
