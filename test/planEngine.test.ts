// Plan and forecast: the engine (daily balance, months, cushion, scenario),
// Auto-allocate, splits, the drop effect behind the friction popover, the
// waiting gain and the cushion streak.
// Run: npx tsx --test test/planEngine.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartPoints, cushionState, cushionStreak, defaultCushion, pastMonthLows, runEngine, type EngineInput } from '../app/src/viewmodels/plans/engine';
import { autoAllocate, bestMonth, dropEffect, fewestSplit, splitName, splitParts, waitingGain, type Candidate } from '../app/src/viewmodels/plans/allocate';

const LONG_DASH = /[–—]/;
// Saturday 3 October 2026.
const today = new Date(2026, 9, 3);
const months = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];

type Line = EngineInput['lines'][number];
const line = (key: string, month: string, amount: number, extra: Partial<Line> = {}): Line => ({ key, name: key, kind: 'fixed', need: 'must', month, due: null, amount, ...extra });

function input(patch: Partial<EngineInput> = {}): EngineInput {
  return {
    today,
    months,
    startBalance: 400_000,
    income: months.map((m) => ({ key: `salary@${m}`, name: 'Salary', month: m, date: new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 25), amount: 600_000, received: false })),
    lines: months.flatMap((m) => [line(`rent@${m}`, m, 250_000, { due: new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 5) }), line(`food@${m}`, m, 150_000, { kind: 'variable' })]),
    fees: [],
    scenario: 'expected',
    cushion: 200_000,
    ...patch,
  };
}

test('the engine runs a daily balance with dated income, bills and flexible spending spread over the month', () => {
  const r = runEngine(input());
  assert.equal(r.days[0].key, '2026-10-03');
  assert.equal(r.days.at(-1)!.key, '2027-03-31');
  const oct = r.months[0];
  assert.equal(oct.income, 600_000);
  assert.equal(oct.fixed, 250_000, 'the rent lands today since its date passed');
  assert.equal(oct.flexible, 150_000);
  assert.equal(oct.dailyFlexible, Math.round((150_000 / 29) * 100) / 100);
  assert.equal(oct.free, 200_000);
  // Lowest in October: the day before salary.
  assert.equal(oct.lowestDate.getDate(), 24);
  const nov = r.months[1];
  assert.equal(nov.lowestDate.getDate(), 24);
  assert.ok(nov.lowest < nov.endBalance);
  // Balance at the end of the horizon: start + 6 x (600k - 400k).
  assert.ok(Math.abs(r.days.at(-1)!.balance - (400_000 + 6 * 200_000)) < 1);
});

test('savings are their own segment, fees count as expenses, transfers never appear', () => {
  const r = runEngine(input({ lines: [line('save@2026-11', '2026-11', 100_000, { kind: 'savings' })], fees: [{ date: new Date(2026, 10, 2), amount: 1500 }] }));
  const nov = r.months[1];
  assert.equal(nov.savings, 100_000);
  assert.equal(nov.fixed, 0);
  assert.equal(nov.fees, 1500);
  assert.equal(nov.free, 600_000 - 100_000 - 1500);
  assert.deepEqual(Object.keys(nov).filter((k) => /transfer/i.test(k)), []);
});

test('Cautious uses the lowest recent amount for irregular income and lowers the lowest balance', () => {
  const income = input().income.map((i) => ({ ...i, range: { low: 450_000, high: 700_000 } }));
  const expected = runEngine(input({ income }));
  const cautious = runEngine(input({ income, scenario: 'cautious' }));
  const optimistic = runEngine(input({ income, scenario: 'optimistic' }));
  assert.ok(cautious.lowest.balance < expected.lowest.balance);
  assert.ok(optimistic.months[5].endBalance > expected.months[5].endBalance);
  assert.equal(cautious.months[1].income, 450_000);
});

test('breaches: below the cushion and below zero, with the date', () => {
  const r = runEngine(input({ startBalance: 0, lines: [...input().lines, line('couch@2026-11', '2026-11', 500_000, { need: 'nice', due: new Date(2026, 10, 10) })] }));
  const nov = r.breaches.find((b) => b.month === '2026-11');
  assert.ok(nov);
  assert.equal(nov!.belowZero, true);
  assert.ok(r.breaches.every((b) => b.lowest < 200_000));
  assert.equal(cushionState(150_000, 200_000), 'below');
  assert.equal(cushionState(230_000, 200_000), 'close');
  assert.equal(cushionState(400_000, 200_000), 'comfortable');
});

test('12 months recompute within 50ms', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => `${2026 + Math.floor((9 + i) / 12)}-${String(((9 + i) % 12) + 1).padStart(2, '0')}`);
  const lines = twelve.flatMap((m) => Array.from({ length: 40 }, (_, i) => line(`l${i}@${m}`, m, 5000 + i, { kind: i % 3 === 0 ? 'variable' : 'fixed' })));
  const big = input({ months: twelve, lines, income: twelve.map((m) => ({ key: m, name: 'Pay', month: m, date: new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 25), amount: 900_000, received: false })) });
  runEngine(big);
  const start = performance.now();
  for (let i = 0; i < 10; i++) runEngine(big);
  const each = (performance.now() - start) / 10;
  assert.ok(each < 50, `${each.toFixed(1)}ms`);
  assert.ok(chartPoints(runEngine(big).days).length < 160, 'weekly after two months');
});

test('the default cushion is one month of must-have expenses', () => {
  assert.equal(defaultCushion([line('a', '2026-10', 100_000), line('b', '2026-10', 50_000, { need: 'nice' }), line('c', '2026-10', 20_000, { kind: 'savings' }), line('d', '2026-11', 999)], '2026-10'), 100_000);
});

test('Auto-allocate: the must-have school fee goes before the splittable nice-to-have laptop, each with a reason', () => {
  const tight = input();
  const candidates: Candidate[] = [
    { key: 'laptop', name: 'Laptop', kind: 'fixed', need: 'nice', priority: 'High', amount: 450_000, notBefore: null, neededBy: null, splittable: true, createdAt: null },
    { key: 'school', name: 'School fee', kind: 'fixed', need: 'must', priority: 'High', amount: 300_000, notBefore: null, neededBy: '2027-01', splittable: false, createdAt: null },
    { key: 'yacht', name: 'Yacht', kind: 'fixed', need: 'nice', priority: 'Low', amount: 50_000_000, notBefore: null, neededBy: null, splittable: false, createdAt: null },
  ];
  const r = autoAllocate(tight, candidates);
  assert.deepEqual(r.placements.map((p) => p.key), ['school', 'laptop']);
  const school = r.placements[0];
  assert.equal(school.parts.length, 1);
  assert.match(school.reason, /^Fits in [A-Z][a-z]+: [\d,]+ free after must-haves$/);
  const laptop = r.placements[1];
  assert.ok(laptop.parts.length >= 1);
  for (const p of r.placements) for (const t of [p.reason]) assert.doesNotMatch(t, LONG_DASH);
  assert.deepEqual(r.unplaced.map((u) => u.key), ['yacht']);
  assert.equal(r.unplaced[0].reason, "Doesn't fit in 6 months");
  assert.ok(r.unplaced[0].shortfall > 0);
  // From the first placement on, the balance stays at or above the cushion
  // (an earlier dip already in the plan isn't the placements' doing).
  const placedLines = r.placements.flatMap((p) => p.parts.map((x, i) => line(`${p.key}#${i}`, x.month, x.amount)));
  const firstPlaced = placedLines.map((l) => l.month!).sort()[0];
  assert.ok(runEngine({ ...tight, lines: [...tight.lines, ...placedLines] }).months.filter((m) => m.month >= firstPlaced).every((m) => m.lowest >= 200_000));
  assert.equal(school.parts[0].month, '2027-01', 'the earliest month that keeps the cushion, before Needed by');
});

test('Auto-allocate never places an item before its "Not before" month', () => {
  const r = autoAllocate(input(), [{ key: 'tv', name: 'TV', kind: 'fixed', need: 'nice', priority: 'Low', amount: 50_000, notBefore: '2026-12', neededBy: null, splittable: false, createdAt: null }]);
  assert.equal(r.placements[0].parts[0].month, '2026-12');
});

test('splits: equal payments that add up, named "Couch, 1 of 3"', () => {
  const parts = splitParts(100_000, 3, '2026-11');
  assert.deepEqual(parts.map((p) => p.month), ['2026-11', '2026-12', '2027-01']);
  assert.equal(Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100) / 100, 100_000);
  assert.equal(splitName('Couch', 0, 3), 'Couch, 1 of 3');
  assert.equal(splitParts(10, 1, '2026-11').length, 2, 'at least 2');
  assert.equal(splitParts(10, 20, '2026-11').length, 12, 'at most 12');
  const couch = line('couch', '2026-11', 600_000, { need: 'nice' });
  const fit = fewestSplit(input(), couch, '2026-12');
  assert.ok(fit && fit.length >= 2);
  assert.equal(fit!.length, 3, 'the fewest payments that keep the cushion');
});

test('the drop effect explains a dip below the cushion', () => {
  const couch = line('couch', '2026-10', 400_000, { need: 'nice', name: 'Couch' });
  const e = dropEffect(input({ startBalance: 250_000 }), couch, '2026-11');
  assert.equal(e.belowCushion, true);
  assert.ok(e.lowestAfter < e.lowestBefore);
  assert.match(e.message!, /^Placing the couch here takes your lowest balance in [A-Z][a-z]+ to -?[\d,]+, below (your 200,000 cushion|zero)\.$/);
  const fine = dropEffect(input({ startBalance: 2_000_000 }), couch, '2026-11');
  assert.equal(fine.message, null);
  assert.ok(bestMonth(input({ startBalance: 250_000 }), couch, '2026-10') >= '2026-10');
});

test('waiting shows its value: "Waiting until January keeps 120,000 more cushion in November"', () => {
  const tv = line('tv', '2026-11', 120_000, { need: 'nice', name: 'TV' });
  const base = input();
  const g = waitingGain({ ...base, lines: [...base.lines, tv] }, tv, '2027-01');
  assert.ok(g);
  assert.equal(g!.gain, 120_000);
  assert.equal(g!.text, `Waiting until January keeps 120,000 more cushion in ${g!.month === '2026-11' ? 'November' : 'December'}`);
});

test('cushion streak: consecutive past months whose lowest actual balance stayed above the cushion', () => {
  // Balance now 500k; walk back: each month +300k income on the 25th, -250k rent on the 5th.
  const flows = [];
  for (let k = 0; k < 8; k++) {
    flows.push({ date: new Date(2026, 9 - k, 25), amount: 300_000 });
    flows.push({ date: new Date(2026, 9 - k, 5), amount: -250_000 });
  }
  const lows = pastMonthLows(500_000, flows.filter((f) => f.date <= today), today, 6);
  assert.equal(lows.length, 6);
  assert.equal(lows[0].month, '2026-09');
  assert.ok(lows.every((l, i) => i === 0 || l.lowest <= lows[i - 1].lowest), 'older months were lower here');
  const cushion = lows[3].lowest + 1;
  assert.equal(cushionStreak(lows, cushion), 3);
  assert.equal(cushionStreak(lows, -100_000), 6);
  assert.equal(cushionStreak(lows, 0), 5);
});
