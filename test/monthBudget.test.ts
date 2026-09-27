// PRD-BUDGETS-V2.md section 5 — buildMonthBudget's derivation rules.
// Run: npx tsx --test test/monthBudget.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthBudget, itemOccurrence, addMonths, type MonthBudgetInput } from '../app/src/shared/budget/monthBudget';
import type { FirestoreAllocation } from '../app/src/shared/firestore/types';
import { buildItemSpend, bucketProgress, isItemClosed } from '../app/src/shared/budget/bucketProgress';

// Just enough of a Firestore Timestamp for goalLineItemAppliesToMonth.
const ts = (iso: string) => ({ toDate: () => new Date(`${iso}T00:00:00`) }) as never;

const categories: MonthBudgetInput['categories'] = new Map([
  ['housing', { name: 'Housing', transactionType: 'Expense' }],
  ['food', { name: 'Food', transactionType: 'Expense' }],
  ['salary', { name: 'Salary', transactionType: 'Income' }],
]);

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    goalId: 'b1',
    name: id,
    amount: 100,
    categoryId: 'food',
    dueDate: ts('2026-01-01'),
    recurrence: { frequency: 'Monthly' as const, interval: 1 },
    completed: false,
    charges: null,
    ...overrides,
  };
}

function base(overrides: Partial<MonthBudgetInput> = {}): MonthBudgetInput {
  return {
    month: '2026-09',
    buckets: [
      { id: 'b1', name: 'Monthly', currency: 'USD', type: 'Expense', kind: 'Fixed' },
      { id: 'inc', name: 'Income', currency: 'USD', type: 'Income', kind: 'Fixed' },
    ],
    itemsByBucket: {},
    transactions: [],
    transfers: [],
    allocations: [],
    accountCurrency: new Map([['acc', 'USD']]),
    categories,
    baseCurrency: 'USD',
    toDisplay: (amount) => amount,
    ...overrides,
  };
}

function tx(id: string, amount: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    accountId: 'acc',
    amount,
    direction: 'Outflow' as const,
    type: 'Expense',
    categoryId: 'food',
    month: '2026-09',
    bucketItem: null,
    ...extra,
  };
}

function allocation(id: string, from: FirestoreAllocation['from'], to: FirestoreAllocation['to'], amount: number): FirestoreAllocation {
  return { id, month: '2026-09', months: ['2026-09'], from, to, amount, currency: 'USD', reason: 'cover_overspend', transferId: null, note: '', createdBy: 'u' };
}

test('addMonths crosses year boundaries', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
});

test('itemOccurrence applies skips, overrides, and unscheduled items', () => {
  assert.deepEqual(itemOccurrence(item('rent'), '2026-09'), { planned: 100, isOverride: false });
  assert.equal(itemOccurrence(item('rent', { excludedMonths: ['2026-09'] }), '2026-09'), null);
  assert.deepEqual(itemOccurrence(item('rent', { monthOverrides: { '2026-09': { amount: 140 } } }), '2026-09'), {
    planned: 140,
    isOverride: true,
  });
  assert.equal(itemOccurrence(item('wish', { dueDate: null, recurrence: null }), '2026-09'), null);
  // A one-off (Planned) item applies only to its own due month.
  const once = item('laptop', { dueDate: ts('2026-10-15'), recurrence: null });
  assert.equal(itemOccurrence(once, '2026-09'), null);
  assert.ok(itemOccurrence(once, '2026-10'));
});

test('a recurrence endDate stops the item after that month', () => {
  const limited = item('gym', { recurrence: { frequency: 'Monthly', interval: 1, endDate: ts('2026-09-30') } });
  assert.ok(itemOccurrence(limited, '2026-09'));
  assert.equal(itemOccurrence(limited, '2026-10'), null);
});

test('linked spend is per item-month; unlinked spend is unplanned by category', () => {
  const budget = buildMonthBudget(
    base({
      itemsByBucket: { b1: [item('groceries')] },
      transactions: [
        tx('t1', 60, { bucketItem: { bucketId: 'b1', itemId: 'groceries', month: '2026-09' } }),
        tx('t2', 25),
      ],
    })
  );
  const groceries = budget.itemsByKey.get('groceries@2026-09')!;
  assert.equal(groceries.actual, 60);
  assert.equal(groceries.remaining, 40);
  assert.equal(groceries.status, 'under');
  const food = budget.categories.find((group) => group.categoryId === 'food')!;
  assert.equal(food.unplanned, 25);
  assert.equal(food.actual, 85);
  assert.equal(budget.unplannedTotal, 25);
});

test('an early payment counts toward the occurrence month, not the payment month', () => {
  const early = tx('t1', 100, { month: '2026-08', bucketItem: { bucketId: 'b1', itemId: 'rent', month: '2026-09' } });
  const sep = buildMonthBudget(base({ itemsByBucket: { b1: [item('rent')] }, transactions: [early] }));
  assert.equal(sep.itemsByKey.get('rent@2026-09')!.actual, 100);
  const aug = buildMonthBudget(base({ month: '2026-08', itemsByBucket: { b1: [item('rent')] }, transactions: [early] }));
  assert.equal(aug.itemsByKey.get('rent@2026-08')!.actual, 0);
  assert.equal(aug.unplannedTotal, 0);
});

test('spend linked to a skipped occurrence falls back to unplanned', () => {
  const budget = buildMonthBudget(
    base({
      itemsByBucket: { b1: [item('rent', { excludedMonths: ['2026-09'] })] },
      transactions: [tx('t1', 100, { bucketItem: { bucketId: 'b1', itemId: 'rent', month: '2026-09' } })],
    })
  );
  assert.equal(budget.items.length, 0);
  assert.equal(budget.unplannedTotal, 100);
});

// Groceries lives in its own bucket here: within one bucket, a sibling's
// leftover already offsets the overspend (see the netting tests below).
const twoBuckets = [
  { id: 'b1', name: 'Monthly', currency: 'USD', type: 'Expense' as const, kind: 'Fixed' as const },
  { id: 'b2', name: 'Food', currency: 'USD', type: 'Expense' as const, kind: 'Fixed' as const },
];

test('an overspend is unfunded until an allocation covers it', () => {
  const items = { b1: [item('rent')], b2: [item('groceries', { goalId: 'b2' })] };
  const transactions = [tx('t1', 130, { bucketItem: { bucketId: 'b1', itemId: 'rent', month: '2026-09' } })];
  const before = buildMonthBudget(base({ buckets: twoBuckets, itemsByBucket: items, transactions }));
  assert.equal(before.itemsByKey.get('rent@2026-09')!.unfunded, 30);
  assert.equal(before.unfundedTotal, 30);

  const covered = buildMonthBudget(
    base({
      buckets: twoBuckets,
      itemsByBucket: items,
      transactions,
      allocations: [
        allocation(
          'a1',
          { kind: 'item', bucketId: 'b2', itemId: 'groceries', month: '2026-09' },
          { kind: 'item', bucketId: 'b1', itemId: 'rent', month: '2026-09' },
          30
        ),
      ],
    })
  );
  const rent = covered.itemsByKey.get('rent@2026-09')!;
  const groceries = covered.itemsByKey.get('groceries@2026-09')!;
  assert.equal(rent.available, 130);
  assert.equal(rent.unfunded, 0);
  assert.equal(rent.status, 'on');
  assert.equal(groceries.available, 70);
  assert.deepEqual(rent.allocationIds, ['a1']);
  assert.deepEqual(groceries.allocationIds, ['a1']);
});

test('a bucket is only over when its items together spend more than planned', () => {
  // Hotel 30 over its own estimate, transport 50 under: the bucket is fine.
  const items = { b1: [item('hotel'), item('transport')] };
  const link = (itemId: string) => ({ bucketItem: { bucketId: 'b1', itemId, month: '2026-09' } });
  const within = buildMonthBudget(base({ itemsByBucket: items, transactions: [tx('t1', 130, link('hotel')), tx('t2', 50, link('transport'))] }));
  const hotel = within.itemsByKey.get('hotel@2026-09')!;
  assert.equal(hotel.remaining, -30); // above its estimate…
  assert.equal(hotel.unfunded, 0); // …but not an overspend
  assert.equal(within.unfundedTotal, 0);

  // Transport spends 90 too: the bucket is 20 over (230 of 200), all hotel's.
  const over = buildMonthBudget(base({ itemsByBucket: items, transactions: [tx('t1', 130, link('hotel')), tx('t2', 90, link('transport'))] }));
  assert.equal(over.itemsByKey.get('hotel@2026-09')!.unfunded, 20);
  assert.equal(over.itemsByKey.get('transport@2026-09')!.unfunded, 0);
  assert.equal(over.unfundedTotal, 20);
});

test("a bucket's net overspend is shared by the items that went over", () => {
  const items = { b1: [item('a'), item('b'), item('c')] };
  const link = (itemId: string) => ({ bucketItem: { bucketId: 'b1', itemId, month: '2026-09' } });
  // a +30 over, b +10 over, c 20 under → the bucket is 20 over.
  const budget = buildMonthBudget(base({ itemsByBucket: items, transactions: [tx('t1', 130, link('a')), tx('t2', 110, link('b')), tx('t3', 80, link('c'))] }));
  assert.equal(budget.itemsByKey.get('a@2026-09')!.unfunded, 15);
  assert.equal(budget.itemsByKey.get('b@2026-09')!.unfunded, 5);
  assert.equal(budget.unfundedTotal, 20);
});

test("an archived bucket keeps only what was recorded against it", () => {
  const buckets = [{ id: 'b1', name: 'Old trip', currency: 'USD', type: 'Expense' as const, kind: 'Fixed' as const, archived: true }];
  const items = { b1: [item('hotel'), item('taxi')] };
  const transactions = [tx('t1', 130, { bucketItem: { bucketId: 'b1', itemId: 'hotel', month: '2026-09' } })];
  const budget = buildMonthBudget(base({ buckets, itemsByBucket: items, transactions }));
  const hotel = budget.itemsByKey.get('hotel@2026-09')!;
  assert.equal(hotel.actual, 130); // the payment still counts…
  assert.equal(hotel.archived, true);
  assert.equal(hotel.unfunded, 0); // …but it's history, not an overspend to act on
  assert.equal(budget.itemsByKey.has('taxi@2026-09'), false); // nothing recorded: gone
  assert.equal(budget.buckets[0].archived, true);
  assert.equal(budget.unplannedTotal, 0); // not re-counted as unplanned spend
});

test('before Budgets v2, an unlinked payment of a recurring item counts against it', () => {
  // Rent (Fixed bucket b1, category food in these fixtures) in August 2026.
  const items = { b1: [item('rent', { amount: 500 }), item('snacks', { amount: 40 })] };
  const august = buildMonthBudget(base({ month: '2026-08', itemsByBucket: items, transactions: [tx('t1', 480, { month: '2026-08' })] }));
  assert.deepEqual(august.itemsByKey.get('rent@2026-08')!.transactionIds, ['t1']); // closest planned amount
  assert.equal(august.unplannedTotal, 0);

  // From September on, unlinked stays unplanned until it's assigned.
  const september = buildMonthBudget(base({ month: '2026-09', itemsByBucket: items, transactions: [tx('t1', 480, { month: '2026-09' })] }));
  assert.deepEqual(september.itemsByKey.get('rent@2026-09')!.transactionIds, []);
  assert.equal(september.unplannedTotal, 480);
});

test('closing a bucket for a month closes its items', () => {
  const buckets = [{ id: 'b1', name: 'Trip', currency: 'USD', type: 'Expense' as const, kind: 'Fixed' as const, closedMonths: { '2026-09': { at: null, note: 'Done' } } }];
  const budget = buildMonthBudget(base({ buckets, itemsByBucket: { b1: [item('hotel')] } }));
  assert.equal(budget.itemsByKey.get('hotel@2026-09')!.closed, true);
  assert.deepEqual(budget.buckets[0].closed, { at: null, note: 'Done' });
  const other = buildMonthBudget(base({ buckets, month: '2026-10', itemsByBucket: { b1: [item('hotel')] } }));
  assert.equal(other.itemsByKey.get('hotel@2026-10')!.closed, false);
});

test('pool = planned income − planned outflow, moved by pool allocations only', () => {
  const itemsByBucket = {
    b1: [item('rent', { amount: 1000 })],
    inc: [item('pay', { goalId: 'inc', amount: 3000, categoryId: 'salary' })],
  };
  const plain = buildMonthBudget(base({ itemsByBucket }));
  assert.equal(plain.plannedIncome, 3000);
  assert.equal(plain.plannedOutflow, 1000);
  assert.equal(plain.pool, 2000);

  const withMoves = buildMonthBudget(
    base({
      itemsByBucket,
      allocations: [
        allocation('fromPool', { kind: 'pool' }, { kind: 'item', bucketId: 'b1', itemId: 'rent', month: '2026-09' }, 200),
        allocation('fromSavings', { kind: 'savings', accountId: 'sav' }, { kind: 'item', bucketId: 'b1', itemId: 'rent', month: '2026-09' }, 50),
      ],
    })
  );
  assert.equal(withMoves.pool, 1800); // savings money came from outside the plan
  assert.equal(withMoves.itemsByKey.get('rent@2026-09')!.available, 1250);
});

test('borrowing from next month moves budget between two months of one item', () => {
  const borrow: FirestoreAllocation = {
    ...allocation(
      'b',
      { kind: 'item', bucketId: 'b1', itemId: 'rent', month: '2026-10' },
      { kind: 'item', bucketId: 'b1', itemId: 'rent', month: '2026-09' },
      40
    ),
    months: ['2026-09', '2026-10'],
    reason: 'borrow_next_month',
  };
  const items = { b1: [item('rent')] };
  const sep = buildMonthBudget(base({ itemsByBucket: items, allocations: [borrow] }));
  const oct = buildMonthBudget(base({ month: '2026-10', itemsByBucket: items, allocations: [borrow] }));
  assert.equal(sep.itemsByKey.get('rent@2026-09')!.available, 140);
  assert.equal(oct.itemsByKey.get('rent@2026-10')!.available, 60);
  assert.equal(oct.pool, sep.pool); // pool untouched in both months
});

test('income items never report an unfunded overspend', () => {
  const budget = buildMonthBudget(
    base({
      itemsByBucket: { inc: [item('pay', { goalId: 'inc', amount: 3000, categoryId: 'salary' })] },
      transactions: [
        tx('t1', 3200, {
          type: 'Income',
          direction: 'Inflow',
          categoryId: 'salary',
          bucketItem: { bucketId: 'inc', itemId: 'pay', month: '2026-09' },
        }),
      ],
    })
  );
  const pay = budget.itemsByKey.get('pay@2026-09')!;
  assert.equal(pay.actual, 3200);
  assert.equal(pay.status, 'over');
  assert.equal(pay.unfunded, 0);
  assert.equal(budget.actualIncome, 3200);
});

test('currency conversion goes through toDisplay per source currency', () => {
  const budget = buildMonthBudget(
    base({
      buckets: [{ id: 'b1', name: 'Monthly', currency: 'EUR', type: 'Expense', kind: 'Fixed' }],
      itemsByBucket: { b1: [item('rent')] },
      accountCurrency: new Map([['acc', 'USD']]),
      transactions: [tx('t1', 50, { bucketItem: { bucketId: 'b1', itemId: 'rent', month: '2026-09' } })],
      toDisplay: (amount, currency) => (currency === 'EUR' ? amount * 2 : amount),
    })
  );
  const rent = budget.itemsByKey.get('rent@2026-09')!;
  assert.equal(rent.planned, 200);
  assert.equal(rent.actual, 50);
});

test('transfer items track amount moved; only charges count as outflow', () => {
  const budget = buildMonthBudget(
    base({
      buckets: [{ id: 'tr', name: 'Moves', currency: 'USD', type: 'Transfer', kind: 'Fixed' }],
      itemsByBucket: { tr: [item('sweep', { goalId: 'tr', amount: 500, categoryId: 'Wallet to savings', charges: 5 })] },
      transfers: [
        {
          id: 'x1',
          fromAccountId: 'acc',
          amount: 500,
          charges: 4,
          kind: 'Wallet to savings',
          month: '2026-09',
          bucketItem: { bucketId: 'tr', itemId: 'sweep', month: '2026-09' },
        },
      ],
    })
  );
  const sweep = budget.itemsByKey.get('sweep@2026-09')!;
  assert.equal(sweep.type, 'Transfer');
  assert.equal(sweep.actual, 500);
  assert.equal(budget.plannedOutflow, 5);
  assert.equal(budget.actualOutflow, 4);
});

// ---- One attribution rule for every spend figure (bucketProgress.ts) ----
// Regression for "the spent card shows 0, the item below shows spend, and
// the bucket says everything planned is spent": the three figures came
// from three different sources (stored amountCompleted, cumulative
// payments[], and explicit links only).


const payment = (id: string, amount: number, iso: string) => ({ id, kind: 'expense' as const, amount, date: ts(iso) });

test('a legacy payment (no explicit link, only in payments[]) counts in its month', () => {
  const rent = item('rent', { payments: [payment('old1', 100, '2026-09-03')] });
  const budget = buildMonthBudget(
    base({ itemsByBucket: { b1: [rent] }, transactions: [tx('old1', 100)] })
  );
  const entry = budget.itemsByKey.get('rent@2026-09')!;
  assert.equal(entry.actual, 100);
  assert.deepEqual(entry.transactionIds, ['old1']);
  assert.equal(budget.unplannedTotal, 0); // not double-counted as unplanned
});

const linkedTx = (id: string, amount: number, itemId: string, iso: string, bucketId = 'b1') => ({
  id,
  accountId: 'acc',
  amount,
  direction: 'Outflow' as const,
  type: 'Expense',
  date: ts(iso),
  bucketItem: { bucketId, itemId, month: iso.slice(0, 7) },
});

const spendInput = (itemsByBucket: Record<string, ReturnType<typeof item>[]>, transactions: ReturnType<typeof linkedTx>[] = []) => ({
  buckets: [{ id: 'b1', currency: 'USD' }],
  itemsByBucket,
  transactions,
  transfers: [],
  accountCurrency: new Map([['acc', 'USD']]),
  baseCurrency: 'USD',
  toDisplay: (amount: number) => amount,
});

test('item spend: explicit links and legacy payments, never double-counted', () => {
  // p1 was synced into payments[] AND is explicitly linked — counts once.
  const laptop = item('laptop', {
    recurrence: null,
    dueDate: ts('2026-09-01'),
    payments: [payment('p1', 300, '2026-09-02'), payment('legacy', 200, '2026-08-20')],
  });
  const spend = buildItemSpend(spendInput({ b1: [laptop] }, [linkedTx('p1', 300, 'laptop', '2026-09-02')]));
  const entry = spend.get('laptop')!;
  assert.equal(entry.total, 500);
  assert.equal(entry.byMonth.get('2026-09'), 300);
  assert.equal(entry.byMonth.get('2026-08'), 200);
});

test('a Planned bucket counts partial payments (the old amountCompleted showed 0)', () => {
  const laptop = item('laptop', { amount: 1000, recurrence: null, dueDate: ts('2026-09-01'), completed: false });
  const spend = buildItemSpend(spendInput({ b1: [laptop] }, [linkedTx('p1', 400, 'laptop', '2026-09-02')]));
  const progress = bucketProgress(
    { id: 'b1', kind: 'Variable', currency: 'USD' },
    [laptop],
    spend,
    buildMonthBudget(base()),
    (amount) => amount
  );
  assert.equal(progress.scope, 'total');
  assert.equal(progress.spent, 400);
  assert.equal(progress.remaining, 600);
  assert.equal(progress.percent, 40);
  assert.equal(progress.doneCount, 0);
});

test('a Fixed bucket is judged on this month — a stale completed flag never makes it "all spent"', () => {
  const rent = item('rent', { completed: true }); // set by pre-v2 code
  assert.equal(isItemClosed(rent, 'Fixed'), false);
  const monthBudget = buildMonthBudget(base({ itemsByBucket: { b1: [rent] } }));
  const progress = bucketProgress({ id: 'b1', kind: 'Fixed', currency: 'USD' }, [rent], new Map(), monthBudget, (a) => a);
  assert.equal(progress.scope, 'month');
  assert.equal(progress.planned, 100);
  assert.equal(progress.spent, 0);
  assert.equal(progress.doneCount, 0);
});

test('a Fixed bucket\'s month figures match the Budget screen exactly (allocations included)', () => {
  const rent = item('rent');
  const monthBudget = buildMonthBudget(
    base({
      itemsByBucket: { b1: [rent] },
      transactions: [tx('t1', 120, { bucketItem: { bucketId: 'b1', itemId: 'rent', month: '2026-09' } })],
      allocations: [allocation('a1', { kind: 'pool' }, { kind: 'item', bucketId: 'b1', itemId: 'rent', month: '2026-09' }, 20)],
    })
  );
  const progress = bucketProgress({ id: 'b1', kind: 'Fixed', currency: 'USD' }, [rent], new Map(), monthBudget, (a) => a);
  const entry = monthBudget.itemsByKey.get('rent@2026-09')!;
  assert.equal(progress.planned, entry.available);
  assert.equal(progress.spent, entry.actual);
  assert.equal(progress.doneCount, 1);
});

test('a bucket with the salary and the bills totals only the bills', () => {
  const budget = buildMonthBudget(
    base({
      itemsByBucket: {
        b1: [item('rent', { amount: 400, categoryId: 'housing' }), item('pay', { amount: 2000, categoryId: 'salary' })],
      },
      transactions: [
        tx('t1', 400, { categoryId: 'housing', bucketItem: { bucketId: 'b1', itemId: 'rent', month: '2026-09' } }),
        tx('t2', 2000, { type: 'Income', direction: 'Inflow', categoryId: 'salary', bucketItem: { bucketId: 'b1', itemId: 'pay', month: '2026-09' } }),
      ],
    })
  );
  const group = budget.buckets.find((g) => g.bucketId === 'b1')!;
  assert.equal(group.planned, 400);
  assert.equal(group.actual, 400);
  assert.equal(group.remaining, 0);
  assert.equal(budget.plannedIncome, 2000);
});
