// Plan and forecast: the plan draft, month columns and running balance;
// the daily spending guide; coverage (Priorities and Budget); and the
// staggered grid's placement. Numbered tests follow the web rebuild's list.
// Run: npx tsx --test test/planForecast.test.ts

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDraft, addChange, moveBlocked, monthColumns, runningBalance, dueIn, type PlanLine, type IncomeLine } from '../app/src/viewmodels/plans/planDraft';
import { dailyGuide, dayKey } from '../app/src/shared/budget/dailyGuide';
import { coverageOf } from '../app/src/shared/budget/coverage';
import { placeBlocks, columnsFor } from '../app/src/widgets/Database/masonry';

const line = (key: string, extra: Partial<PlanLine> = {}): PlanLine => ({
  key,
  itemId: key,
  bucketId: 'b',
  bucketName: 'Home',
  name: key,
  kind: 'fixed',
  need: 'nice',
  priority: 'Medium',
  month: '2026-10',
  due: new Date(2026, 9, 31),
  amount: 50_000,
  accountId: null,
  recurring: false,
  incomeItemId: null,
  ...extra,
});

const income: IncomeLine[] = [
  { key: 'sal@2026-10', itemId: 'sal', name: 'AIMS salary', month: '2026-10', amount: 1_000_000 },
  { key: 'sal@2026-11', itemId: 'sal', name: 'AIMS salary', month: '2026-11', amount: 1_000_000 },
];

describe('plan draft', () => {
  test('11. moving a 50,000 line from October to November updates both columns; discarding restores it', () => {
    const today = new Date(2026, 9, 3);
    const lines = [line('phone', { amount: 50_000 }), line('rent', { amount: 150_000, due: new Date(2026, 9, 5) })];
    const before = monthColumns(['2026-10', '2026-11'], applyDraft(lines, []), income, today);
    assert.deepEqual(before.map((c) => c.plannedOut), [200_000, 0]);

    const draft = addChange([], { type: 'move', key: 'phone', toMonth: '2026-11' });
    const after = monthColumns(['2026-10', '2026-11'], applyDraft(lines, draft), income, today);
    assert.deepEqual(after.map((c) => c.plannedOut), [150_000, 50_000]);
    assert.deepEqual(after.map((c) => c.left), [850_000, 950_000]);
    const moved = applyDraft(lines, draft).find((l) => l.key === 'phone')!;
    assert.equal(moved.changed, true);
    assert.equal(moved.due!.getMonth(), 10); // the same day in November (Oct 31 → Nov 30)
    assert.equal(moved.due!.getDate(), 30);

    // Discard: no changes, the original figures.
    assert.deepEqual(monthColumns(['2026-10', '2026-11'], applyDraft(lines, []), income, today).map((c) => c.plannedOut), [200_000, 0]);
  });

  test('moving a must have is allowed with a warning; a line tied to an income cannot move before it', () => {
    const must = line('rent', { need: 'must' });
    assert.deepEqual(applyDraft([must], [{ type: 'move', key: 'rent', toMonth: '2026-11' }])[0].warnings, ['must have moved']);
    const tied = line('savings', { incomeItemId: 'sal', month: '2026-11' });
    assert.match(moveBlocked(tied, '2026-09', income) ?? '', /AIMS salary/);
    assert.equal(moveBlocked(tied, '2026-10', income), null);
  });

  test('split, amount, drop and account changes', () => {
    const base = [line('laptop', { amount: 300_000 })];
    const split = applyDraft(base, [{ type: 'split', key: 'laptop', parts: [{ month: '2026-10', amount: 100_000 }, { month: '2026-11', amount: 200_000 }] }]);
    assert.deepEqual(split.map((l) => [l.month, l.amount]), [['2026-10', 100_000], ['2026-11', 200_000]]);
    assert.equal(applyDraft(base, [{ type: 'amount', key: 'laptop', amount: 250_000 }])[0].amount, 250_000);
    assert.equal(applyDraft(base, [{ type: 'drop', key: 'laptop' }]).length, 0);
    assert.equal(applyDraft(base, [{ type: 'account', key: 'laptop', accountId: 'uba' }])[0].accountId, 'uba');
    // A later change of the same kind replaces the earlier one.
    const twice = addChange(addChange([], { type: 'amount', key: 'laptop', amount: 1 }), { type: 'amount', key: 'laptop', amount: 2 });
    assert.equal(twice.length, 1);
  });

  test('the daily figure for future months comes from their variable lines', () => {
    const cols = monthColumns(['2026-11'], [line('food', { kind: 'variable', month: '2026-11', amount: 90_000 })], income, new Date(2026, 9, 3));
    assert.equal(cols[0].daily, 3_000); // 90,000 over November's 30 days
  });

  test('the running balance starts from cash in accounts', () => {
    const rows = runningBalance(100_000, [
      { month: '2026-10', expectedIncome: 500_000, plannedOut: 450_000 },
      { month: '2026-11', expectedIncome: 500_000, plannedOut: 600_000 },
    ]);
    assert.deepEqual(rows.map((r) => [r.left, r.balanceAfter]), [[50_000, 150_000], [-100_000, 50_000]]);
  });

  test('dueIn keeps the day where the month allows', () => {
    assert.equal(dueIn('2027-02', new Date(2026, 0, 31)).getDate(), 28);
  });
});

describe('daily spending guide', () => {
  test('12. 105,000 left with 25 days left is 4,200 a day; 6,000 a day for 7 days is off track', () => {
    const today = new Date(2026, 9, 7); // Oct 7: 25 days left including today
    const calm = dailyGuide({ today, variablePlanned: 105_000, variableLeft: 105_000, spentByDay: new Map(), availableNow: 500_000, expectedStill: 0, fixedStillDue: 0 });
    assert.equal(calm.daysLeft, 25);
    assert.equal(calm.allowance, 4_200);
    assert.equal(calm.status, 'on_track');
    assert.equal(calm.message, null);

    const spent = new Map<string, number>();
    for (let i = 0; i < 7; i++) spent.set(dayKey(new Date(2026, 9, 7 - i)), 6_000);
    const busy = dailyGuide({ today, variablePlanned: 147_000, variableLeft: 105_000, spentByDay: spent, availableNow: 500_000, expectedStill: 0, fixedStillDue: 0 });
    assert.ok(busy.status === 'off_track' || busy.status === 'watch');
    assert.equal(busy.status, 'off_track');
    assert.match(busy.message!, /^You've spent 6,000 a day this week against /);
    assert.doesNotMatch(busy.message!, /—/);
  });

  test('when cash is short, the lower cash figure is the one to follow', () => {
    const g = dailyGuide({ today: new Date(2026, 9, 7), variablePlanned: 105_000, variableLeft: 105_000, spentByDay: new Map(), availableNow: 50_000, expectedStill: 0, fixedStillDue: 0 });
    assert.equal(g.followReason, 'cash');
    assert.equal(g.follow, 2_000);
  });

  test('the allowance path is a straight line to the month’s variable budget', () => {
    const g = dailyGuide({ today: new Date(2026, 9, 7), variablePlanned: 31_000, variableLeft: 31_000, spentByDay: new Map(), availableNow: 0, expectedStill: 0, fixedStillDue: 0 });
    assert.equal(g.path.at(-1)!.allowance, 31_000);
    assert.equal(g.path[9].spent, null); // after today: nothing drawn yet
  });
});

describe('coverage', () => {
  test('8. lines group into can pay now, waiting for income (named), and not covered', () => {
    const lines = [{ k: 'rent', a: 150_000 }, { k: 'school', a: 400_000 }, { k: 'car', a: 2_000_000 }, { k: 'phone', a: 20_000 }];
    const r = coverageOf(lines, (l) => l.a, 200_000, [{ name: 'AIMS salary', amount: 1_013_381, due: new Date(2026, 9, 25) }]);
    assert.deepEqual(r.rows.map((x) => [x.line.k, x.coverage, x.waitsFor]), [
      ['rent', 'now', null],
      ['school', 'waiting', 'AIMS salary'],
      ['car', 'not', null],
      ['phone', 'waiting', 'AIMS salary'],
    ]);
    assert.equal(r.canPayNow, 150_000);
  });
});

describe('staggered grid', () => {
  test('10. columns by width; blocks go to the shortest column with no gaps larger than the gap', () => {
    assert.deepEqual([columnsFor(800), columnsFor(1000), columnsFor(1600)], [1, 2, 3]);
    const { places } = placeBlocks(
      [
        { id: 'a', span: 1, height: 300 },
        { id: 'b', span: 1, height: 100 },
        { id: 'c', span: 1, height: 100 },
        { id: 'd', span: 1, height: 100 },
      ],
      2,
      16
    );
    assert.deepEqual([...places.entries()].map(([id, p]) => [id, p.col, p.y]), [
      ['a', 0, 0],
      ['b', 1, 0],
      ['c', 1, 116],
      ['d', 1, 232],
    ]);
  });

  test('a wide block waits for short columns to be filled by the following blocks', () => {
    const { places } = placeBlocks(
      [
        { id: 'tall', span: 1, height: 300 },
        { id: 'wide', span: 2, height: 200 },
        { id: 'small', span: 1, height: 200 },
      ],
      2,
      16
    );
    // "small" fills column 1 beside "tall" instead of leaving a hole there.
    assert.deepEqual(places.get('small'), { col: 1, span: 1, y: 0 });
    assert.deepEqual(places.get('wide'), { col: 0, span: 2, y: 316 });
  });
});
