// The money and time plans' engines (Remix/Priorities/priorities-forecasting-
// brief.md, sections 7, 12 and 13) on the prototype's sample data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayFrom as D, dayLabel, dateOf } from '../app/src/viewmodels/planner/days';
import {
  applyFix,
  columnsFor,
  dateInColumn,
  emptyScenario,
  moneyPlan,
  moveTo,
  runPlan,
  setDate,
  toggleItem,
  toggleSkip,
  isLocked,
  type MoneyHorizon,
} from '../app/src/viewmodels/planner/money';
import { moneyFixture, timeFixture, PLAN_TODAY } from '../app/src/viewmodels/planner/fixtures';
import { addTheHours, autoPlan, capacityOn, emptyTimeScenario, freeOn, plannedFor, shortfalls, timePlan } from '../app/src/viewmodels/planner/time';
import { moneyInputFromRecords, scheduleOf, type RecordItem } from '../app/src/viewmodels/planner/fromRecords';

const input = moneyFixture();
const base = emptyScenario('3m', 30_000);
const concert = `concert@${D(2026, 10, 31)}`;

test('starting plan: lowest −79,000 on Sat 19 Dec, below the buffer from Sat 14 Nov, ends 126,000, 976,000 left to plan', () => {
  const r = runPlan(input, base);
  assert.equal(r.sim.min.value, -79_000);
  assert.equal(dayLabel(r.sim.min.day), 'Sat 19 Dec');
  assert.equal(dayLabel(r.sim.points.find((p) => p[1] < 30_000)![0]), 'Sat 14 Nov');
  assert.equal(r.sim.end, 126_000);
  assert.equal(r.waterfall.leftToPlan, 976_000);
});

test('moving the concert ticket to 28 Dec raises the lowest balance to −54,000', () => {
  const m = setDate(input, base, concert, D(2026, 12, 28));
  assert.ok(m.ok);
  if (m.ok) assert.equal(runPlan(input, m.scenario).sim.min.value, -54_000);
});

test('every period adds up, and the waterfall, forecast, last period and KPIs agree', () => {
  for (const h of ['1w', '4w', '3m', '6m'] as MoneyHorizon[]) {
    for (const s of [emptyScenario(h, 30_000), { ...emptyScenario(h, 30_000), goalMonthly: { gLaptop: 10_000 }, disabled: ['eatout'] }]) {
      const r = runPlan(input, s);
      for (const c of r.cols) {
        const x = r.periods[c.key];
        assert.ok(Math.abs(x.start + x.in - x.out - x.end) < 0.01, `${h} ${c.label}`);
      }
      const last = r.periods[r.cols[r.cols.length - 1].key];
      assert.ok(Math.abs(r.waterfall.end - r.sim.end) < 0.01, `waterfall ${h}`);
      assert.ok(Math.abs(last.end - r.sim.end) < 0.01, `last period ${h}`);
      assert.equal(r.sim.points[r.sim.points.length - 1][1], r.sim.end);
    }
  }
});

test('the locked layer can never be changed: income and fixed costs are refused everywhere', () => {
  const rent = `rent@${D(2026, 11, 1)}`;
  const salary = `salary@${D(2026, 10, 25)}`;
  for (const r of [setDate(input, base, rent, D(2026, 11, 20)), moveTo(input, base, rent, 'm2026-12'), moveTo(input, base, salary, 'park'), toggleSkip(input, base, rent), toggleItem(input, base, 'rent')]) {
    assert.equal(r.ok, false);
    assert.match(r.message, /locked/);
  }
  // Even a stored override can't move it.
  const sneaky = { ...base, overrides: { [rent]: { date: D(2026, 11, 20), skip: true } }, disabled: ['salary'] };
  assert.deepEqual(runPlan(input, sneaky).sim, runPlan(input, base).sim);
});

test('a goal-funded payment draws from the goal first: school fees on 10 Jan leave the balance as it was', () => {
  const s = emptyScenario('6m', 30_000);
  const r = runPlan(input, s);
  const jan9 = r.sim.points.find((p) => p[0] === D(2027, 1, 9))![1];
  const jan10 = r.sim.points.find((p) => p[0] === D(2027, 1, 10))![1];
  // Only the two loans (30,000) come out of the wallet that day.
  assert.equal(jan9 - jan10, 30_000);
  assert.equal(r.sim.drawnByGoal.gSchool, 200_000);
  assert.equal(r.totals.fromGoals, 200_000);
});

test('suggested fixes touch only flexible items, and applying one gives exactly the lowest balance promised', () => {
  const v = moneyPlan(input, base);
  assert.ok(v.fixes.length > 0);
  for (const f of v.fixes) {
    if (f.occId) {
      const o = v.run.occ.find((x) => x.id === f.occId)!;
      assert.equal(isLocked(o.item), false);
    }
    const r = applyFix(input, base, f);
    assert.ok(r.ok);
    if (r.ok) assert.equal(runPlan(input, r.scenario).sim.min.value, f.lowest);
  }
});

test('a date typed in the List view and a drop on the Board give the same plan', () => {
  for (const h of ['4w', '3m'] as MoneyHorizon[]) {
    const s = emptyScenario(h, 30_000);
    const run = runPlan(input, s);
    const o = run.occ.find((x) => x.id === concert)!;
    for (const col of columnsFor(h, PLAN_TODAY)) {
      const dropped = moveTo(input, s, concert, col.key);
      const typed = setDate(input, s, concert, dateInColumn(o, col));
      assert.ok(dropped.ok && typed.ok);
      if (dropped.ok && typed.ok) assert.deepEqual(dropped.scenario, typed.scenario);
    }
  }
});

test('confirmed income only leaves expected income out', () => {
  const r = runPlan(input, { ...base, confirmedOnly: true });
  assert.equal(r.totals.income, 350_000 * 3);
});

test('a 6-month plan and its starting plan recalculate in under 30 ms', () => {
  const s = { ...emptyScenario('6m', 30_000), overrides: { [concert]: { date: D(2026, 12, 28) } } };
  moneyPlan(input, s);
  const t0 = performance.now();
  moneyPlan(input, s);
  assert.ok(performance.now() - t0 < 30, `${performance.now() - t0} ms`);
});

// ---- From the records ----

test('records: what is left this month lands on its dates, anything overdue on today', () => {
  const today = D(2026, 10, 12);
  const item: RecordItem = {
    id: 'g',
    bucketId: 'food',
    name: 'Groceries',
    kind: 'variable',
    need: 'must',
    priority: 'Medium',
    confidence: 'Expected',
    fundedByGoalId: null,
    done: false,
    amount: 15_000,
    hasDueDate: true,
    months: {
      '2026-10': { dates: [5, 12, 19, 26].map((d) => dateOf(D(2026, 10, d))), planned: 60_000, frequency: 'Weekly' },
      '2026-11': { dates: [2, 9].map((d) => dateOf(D(2026, 11, d))), planned: 30_000, frequency: 'Weekly' },
    },
    paid: { '2026-10': 20_000 },
  };
  // 40,000 left: 15,000 on the 26th, 15,000 on the 19th, 10,000 on the 12th.
  assert.deepEqual(scheduleOf(item, today, '2026-10', []), [
    { day: D(2026, 10, 12), amount: 10_000 },
    { day: D(2026, 10, 19), amount: 15_000 },
    { day: D(2026, 10, 26), amount: 15_000 },
    { day: D(2026, 11, 2), amount: 15_000 },
    { day: D(2026, 11, 9), amount: 15_000 },
  ]);
  // Unpaid and past its only date this month: due today.
  const rent: RecordItem = { ...item, id: 'r', kind: 'fixed', months: { '2026-10': { dates: [dateOf(D(2026, 10, 1))], planned: 120_000, frequency: 'Monthly' } }, paid: {} };
  assert.deepEqual(scheduleOf(rent, today, '2026-10', []), [{ day: today, amount: 120_000 }]);
  const mapped = moneyInputFromRecords({
    today: dateOf(today),
    balance: 1000,
    baskets: [
      { id: 'food', name: 'Food', type: 'Expense', target: null, deadline: null, closedMonths: [] },
      { id: 'sav', name: 'Rainy day', type: 'Savings', target: 100_000, deadline: dateOf(D(2027, 3, 31)), closedMonths: [] },
    ],
    items: [item, { ...item, id: 'wish', name: 'Sofa', months: {}, hasDueDate: false, amount: 90_000, paid: {} }, { ...item, id: 's', bucketId: 'sav', name: 'Monthly', kind: 'savings', months: { '2026-11': { dates: [dateOf(D(2026, 11, 26))], planned: 20_000, frequency: 'Monthly' } }, paid: {} }],
    savedByBasket: { sav: 5_000 },
  });
  assert.equal(mapped.items.find((i) => i.id === 'wish')?.date, null);
  assert.deepEqual(mapped.goals.map((g) => [g.name, g.current, g.monthly, g.day]), [['Rainy day', 5_000, 20_000, 26]]);
});

// ---- Time ----

const time = timeFixture();

test('default week: meetings take 7.5 h and "Bookkeeping and inbox" is 1 h short before Fri 16 Oct', () => {
  const s = autoPlan(time, emptyTimeScenario(7));
  const v = timePlan(time, s);
  assert.equal(v.kpis.meetings, 7.5);
  const risks = shortfalls(time, s);
  assert.deepEqual(
    risks.map((r) => [r.task.name, r.short, dayLabel(r.task.due!)]),
    [['Bookkeeping and inbox', 1, 'Fri 16 Oct']]
  );
});

test('auto-plan never goes over a day’s free hours after meetings, nor past a deadline when earlier hours exist', () => {
  for (const horizon of [7, 14] as const) {
    const s = autoPlan(time, emptyTimeScenario(horizon));
    for (let d = PLAN_TODAY; d < PLAN_TODAY + horizon; d++) assert.ok(freeOn(time, s, d) >= -1e-9, `day ${d}`);
    for (const a of s.allocations) {
      const t = time.tasks.find((x) => x.id === a.taskId)!;
      if (t.due !== null) assert.ok(a.day <= t.due, `${t.name} after its deadline`);
    }
  }
});

test('Add the hours raises that day by the shortfall and the task is on track', () => {
  const s = autoPlan(time, emptyTimeScenario(7));
  const [risk] = shortfalls(time, s);
  const before = capacityOn(time, s, risk.day!);
  const next = addTheHours(time, s, risk);
  assert.equal(capacityOn(time, next, risk.day!), before + risk.short);
  assert.equal(shortfalls(time, next).length, 0);
  assert.ok(plannedFor(next, risk.task.id, risk.task.due) >= risk.task.estimate);
});
