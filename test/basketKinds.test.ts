// Baskets: cadence, item kinds (Payment, Allowance, Set aside), income
// lump sum and trickle, the expense form's no-prefill rule, the migration,
// and the minimal phone budget screens.
// Run: npm run test:baskets

// A zone with a daylight-saving change in October, so day counting is
// checked across it.
process.env.TZ = 'Europe/London';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMonthBudget, itemOccurrenceDetail, setAsideHistory, type MonthBudgetInput } from '../app/src/shared/budget/monthBudget';
import { occurrenceDates, occurrenceBuild, parseRRule, itemSchedule } from '../app/src/shared/budget/cadence';
import {
  allowancePace,
  basketItemFormFields,
  basketMonthView,
  incomePace,
  inferItemKind,
  itemRowView,
  paymentProgress,
  recordHint,
  setAsideProgress,
} from '../app/src/shared/budget/itemKinds';
import { lineStatus, monthTotals } from '../app/src/shared/budget/monthTotals';
import { deriveOccurrences } from '../app/src/shared/budget/occurrences';
import { preparePayments } from '../app/src/shared/budget/automation';
import { planBasketsMigration } from '../app/src/shared/budget/basketsMigration';
import { planClaudeUsdFix } from '../app/src/shared/budget/claudeUsdFix';
import { convert, itemCurrencyOf } from '../app/src/shared/firestore/currency';
import { monthPayments } from '../app/src/logic/planning/usePaymentsTab';
import { basketList, monthSummary } from '../app/src/logic/planning/basketList';

const ts = (iso: string) => ({ toDate: () => new Date(`${iso}T00:00:00`) }) as never;
const day = (iso: string) => new Date(`${iso}T09:00:00`);

const categories: MonthBudgetInput['categories'] = new Map([
  ['fun', { name: 'Hangouts', transactionType: 'Expense' }],
  ['rent', { name: 'Rent', transactionType: 'Expense' }],
  ['save', { name: 'Emergency fund', transactionType: 'Savings' }],
  ['biz', { name: 'Business', transactionType: 'Income' }],
]);

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    goalId: 'leisure',
    name: id,
    amount: 30_000,
    categoryId: 'fun',
    dueDate: ts('2026-10-01'),
    recurrence: { frequency: 'Monthly' as const, interval: 1 },
    completed: false,
    charges: null,
    ...overrides,
  };
}

function tx(id: string, amount: number, extra: Record<string, unknown> = {}) {
  return { id, accountId: 'acc', amount, direction: 'Outflow' as const, type: 'Expense', categoryId: 'fun', month: '2026-10', bucketItem: null, ...extra };
}

function budgetOf(overrides: Partial<MonthBudgetInput> = {}) {
  return buildMonthBudget({
    month: '2026-10',
    buckets: [
      { id: 'leisure', name: 'Leisure', currency: 'XAF', type: 'Expense', kind: 'Variable', cadence: 'Monthly', startMonth: '2026-01' },
      { id: 'house', name: 'House', currency: 'XAF', type: 'Expense', kind: 'Fixed' },
      { id: 'savings', name: 'Savings', currency: 'XAF', type: 'Savings', kind: 'Fixed' },
      { id: 'income', name: 'Running Limbe', currency: 'XAF', type: 'Income', kind: 'Fixed' },
    ],
    itemsByBucket: {},
    transactions: [],
    transfers: [],
    allocations: [],
    accountCurrency: new Map([['acc', 'XAF']]),
    accountType: new Map([['acc', 'Checking'], ['sav', 'Savings Account']]),
    categories,
    baseCurrency: 'XAF',
    toDisplay: (amount) => amount,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Cadence: occurrence counting

test('3. a weekly 10,000 item is 40,000 in a month with four occurrences and 50,000 with five', () => {
  // Mondays: October 2026 has 5, 12, 19, 26; November has 2, 9, 16, 23, 30.
  const weekly = item('fuel', { amount: 10_000, dueDate: ts('2026-09-07'), recurrence: { frequency: 'Weekly', interval: 1 } });
  const oct = itemOccurrenceDetail(weekly, '2026-10')!;
  const nov = itemOccurrenceDetail(weekly, '2026-11')!;
  assert.equal(oct.dates.length, 4);
  assert.equal(oct.planned, 40_000);
  assert.equal(nov.dates.length, 5);
  assert.equal(nov.planned, 50_000);
  assert.equal(occurrenceBuild(oct.dates.length, oct.frequency, oct.unitAmount), '4 weeks × 10,000');
  assert.deepEqual(oct.dates.map((d) => d.getDate()), [5, 12, 19, 26]);
});

test('3. a quarterly item appears only in its months; a yearly one only in its month', () => {
  const quarterly = item('insurance', { dueDate: ts('2026-01-15'), recurrence: { frequency: 'Quarterly', interval: 1 } });
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
  assert.deepEqual(months.filter((m) => itemOccurrenceDetail(quarterly, m)), ['2026-01', '2026-04', '2026-07', '2026-10']);
  const yearly = item('fees', { dueDate: ts('2026-09-05'), recurrence: { frequency: 'Yearly', interval: 1 } });
  assert.deepEqual(months.filter((m) => itemOccurrenceDetail(yearly, m)), ['2026-09']);
});

test('a daily 1,000 item is 1,000 times the days in the month, across a clock change', () => {
  const daily = item('lunch', { amount: 1_000, dueDate: ts('2026-08-01'), recurrence: { frequency: 'Daily', interval: 1 } });
  // October 2026 has 31 days; clocks go back on 25 October in London.
  assert.equal(itemOccurrenceDetail(daily, '2026-10')!.planned, 31_000);
  assert.equal(itemOccurrenceDetail(daily, '2026-02')!, null); // before it starts
  assert.equal(itemOccurrenceDetail(daily, '2026-11')!.planned, 30_000);
  assert.equal(occurrenceBuild(31, 'Daily', 1_000), '31 days × 1,000');
});

test('monthly items clamp a late day and keep their override', () => {
  const rent = item('rent', { dueDate: ts('2026-01-31') });
  assert.equal(itemOccurrenceDetail(rent, '2026-02')!.due!.getDate(), 28);
  const edited = item('rent', { monthOverrides: { '2026-10': { amount: 45_000 } } });
  assert.equal(itemOccurrenceDetail(edited, '2026-10')!.planned, 45_000);
});

test('a custom RRULE: the first Monday, every other week, and a count', () => {
  assert.equal(parseRRule('nonsense'), null);
  const first = occurrenceDates({ frequency: 'Monthly', interval: 1, anchor: new Date(2026, 0, 1), rule: 'FREQ=MONTHLY;BYDAY=1MO' }, 2026, 10);
  assert.deepEqual(first.map((d) => d.getDate()), [5]);
  const fortnight = occurrenceDates({ frequency: 'Weekly', interval: 2, anchor: new Date(2026, 9, 5), rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO' }, 2026, 10);
  assert.deepEqual(fortnight.map((d) => d.getDate()), [5, 19]);
  const counted = occurrenceDates({ frequency: 'Weekly', interval: 1, anchor: new Date(2026, 9, 5), rule: 'FREQ=WEEKLY;COUNT=2' }, 2026, 10);
  assert.deepEqual(counted.map((d) => d.getDate()), [5, 12]);
  const lastFriday = occurrenceDates({ frequency: 'Monthly', interval: 1, anchor: new Date(2026, 0, 1), rule: 'FREQ=MONTHLY;BYDAY=-1FR' }, 2026, 10);
  assert.deepEqual(lastFriday.map((d) => d.getDate()), [30]);
});

test('an item without its own recurrence inherits the basket cadence; older baskets keep the one-off rule', () => {
  const allowance = item('hangouts', { dueDate: null, recurrence: null });
  // The basket is weekly from January: the item runs every week, anchored on the basket's first month.
  const spec = itemSchedule(allowance, { cadence: 'Weekly', startMonth: '2026-01' })!;
  assert.equal(spec.frequency, 'Weekly');
  assert.ok(itemOccurrenceDetail(allowance, '2026-10', { cadence: 'Weekly', startMonth: '2026-01' })!.dates.length >= 4);
  // No stored cadence: an undated item is unscheduled, a dated one a one-off.
  assert.equal(itemOccurrenceDetail(allowance, '2026-10', {}), null);
  const oneOff = item('bunk bed', { recurrence: null, dueDate: ts('2026-10-10') });
  assert.equal(itemOccurrenceDetail(oneOff, '2026-10', {})!.planned, 30_000);
  assert.equal(itemOccurrenceDetail(oneOff, '2026-11', {}), null);
});

// ---------------------------------------------------------------------------
// Kinds

test('kinds are inferred: dated set amounts are payments, day-to-day spending allowances, savings set asides', () => {
  assert.equal(inferItemKind({ flow: 'Expense', expenseKind: 'fixed', hasDueDate: true }), 'payment');
  assert.equal(inferItemKind({ flow: 'Expense', expenseKind: 'variable', hasDueDate: true }), 'allowance');
  assert.equal(inferItemKind({ flow: 'Expense', expenseKind: 'fixed', hasDueDate: false }), 'allowance');
  assert.equal(inferItemKind({ flow: 'Expense', expenseKind: 'fixed', hasDueDate: true, transactionCount: 5 }), 'allowance');
  assert.equal(inferItemKind({ flow: 'Savings', hasDueDate: true }), 'set_aside');
  assert.equal(inferItemKind({ flow: 'Transfer', hasDueDate: true }), 'payment');
});

test('1. recording 10,000 against Hangouts leaves 20,000 of 30,000 left', () => {
  const linked = { bucketId: 'leisure', itemId: 'hangouts', month: '2026-10' };
  const before = budgetOf({ itemsByBucket: { leisure: [item('hangouts', { name: 'Hangouts', itemKind: 'allowance' })] } });
  const entryBefore = before.itemsByKey.get('hangouts@2026-10')!;
  assert.equal(recordHint(entryBefore, 'Leisure').helper, 'Leisure · Hangouts: 30,000 left of 30,000');
  assert.equal(recordHint(entryBefore, 'Leisure').payFull, null, 'an allowance offers no "pay the full amount" chip');
  assert.equal(recordHint(entryBefore, 'Leisure').impact(18_000), 'Hangouts will have 12,000 left.');

  const after = budgetOf({
    itemsByBucket: { leisure: [item('hangouts', { name: 'Hangouts', itemKind: 'allowance' })] },
    transactions: [tx('t1', 10_000, { bucketItem: linked })],
  });
  const entry = after.itemsByKey.get('hangouts@2026-10')!;
  assert.equal(entry.remaining, 20_000);
  assert.equal(recordHint(entry, 'Leisure').helper, 'Leisure · Hangouts: 20,000 left of 30,000');
});

test('1. choosing a basket item never fills in the amount', () => {
  const fields = basketItemFormFields({ bucketName: 'Leisure', name: 'Hangouts', categoryId: 'fun', accountId: 'acc', toAccountId: null, charges: null, isTransfer: false });
  assert.deepEqual(Object.keys(fields).sort(), ['category', 'description', 'fromAccountId']);
  assert.equal('amount' in fields, false);
  // The form's source no longer writes the item's planned amount into the Amount field.
  const form = readFileSync(join(__dirname, '../app/src/logic/addTransaction/useLogic.ts'), 'utf8');
  assert.equal(/setAmountString\(String\(item\.amount\)\)/.test(form), false);
});

test('only a payment offers "Pay the full 12,000 due"', () => {
  const budget = budgetOf({ itemsByBucket: { house: [item('netflix', { goalId: 'house', name: 'Subscription', amount: 12_000, categoryId: 'rent', itemKind: 'payment' })] } });
  const hint = recordHint(budget.itemsByKey.get('netflix@2026-10')!, 'House');
  assert.equal(hint.payFull, 12_000);
});

test('2. a payment of 160,000 paid 40,000 shows "40,000 of 160,000 paid" and stays Due', () => {
  const budget = budgetOf({
    itemsByBucket: { house: [item('rent', { goalId: 'house', name: 'Rent', amount: 160_000, categoryId: 'rent', dueDate: ts('2026-10-30'), itemKind: 'payment' })] },
    transactions: [tx('t1', 40_000, { categoryId: 'rent', bucketItem: { bucketId: 'house', itemId: 'rent', month: '2026-10' } })],
  });
  const entry = budget.itemsByKey.get('rent@2026-10')!;
  const progress = paymentProgress(entry, day('2026-10-10'));
  assert.equal(progress.partLine, '40,000 of 160,000 paid');
  assert.equal(progress.state, 'Due');
  assert.equal(progress.remaining, 120_000);
  assert.equal(itemRowView(entry, day('2026-10-10')).line, '30 Oct · 40,000 of 160,000 paid');
  // Once the date passes without the rest, it's overdue; paying the rest settles it.
  assert.equal(paymentProgress(entry, day('2026-10-31')).state, 'Overdue');
});

test('a weekly payment is overdue only for the weeks already due', () => {
  const budget = budgetOf({
    itemsByBucket: { house: [item('cleaner', { goalId: 'house', amount: 10_000, categoryId: 'rent', dueDate: ts('2026-10-05'), recurrence: { frequency: 'Weekly', interval: 1 }, itemKind: 'payment' })] },
    transactions: [tx('t1', 10_000, { categoryId: 'rent', bucketItem: { bucketId: 'house', itemId: 'cleaner', month: '2026-10' } })],
  });
  const entry = budget.itemsByKey.get('cleaner@2026-10')!;
  assert.equal(entry.dueDates.length, 4);
  assert.equal(paymentProgress(entry, day('2026-10-10')).state, 'Due'); // 5 Oct paid
  assert.equal(paymentProgress(entry, day('2026-10-14')).state, 'Overdue'); // 12 Oct not
});

test('5. allowances never appear as overdue, in Ready to pay, or in Upcoming payments', () => {
  const hangouts = item('hangouts', {
    name: 'Hangouts',
    itemKind: 'allowance',
    dueDate: ts('2026-10-01'),
    automation: { mode: 'prepare', trigger: 'due', amountMode: 'fixed' },
  });
  const budget = budgetOf({ itemsByBucket: { leisure: [hangouts] } });
  const entry = budget.itemsByKey.get('hangouts@2026-10')!;
  assert.equal(entry.due, null);
  assert.deepEqual(entry.dueDates, []);
  assert.notEqual(lineStatus(entry, day('2026-10-28')), 'Overdue');
  assert.equal(monthTotals(budget, day('2026-10-28')).expenses.overdue, 0);
  assert.deepEqual(preparePayments(budget, day('2026-10-28'), new Set()), []);
  assert.deepEqual(deriveOccurrences(budget, day('2026-10-28'), new Map()), []);
  const payments = monthPayments('2026-10', { budget, buckets: [], itemsByBucket: {}, accounts: [], ctx: {} as never }, []);
  assert.deepEqual(payments, []);
  // Set asides don't either.
  const saving = budgetOf({ itemsByBucket: { savings: [item('fund', { goalId: 'savings', categoryId: 'save' })] } });
  assert.equal(saving.itemsByKey.get('fund@2026-10')!.itemKind, 'set_aside');
  assert.notEqual(lineStatus(saving.itemsByKey.get('fund@2026-10')!, day('2026-10-28')), 'Overdue');
  assert.deepEqual(monthPayments('2026-10', { budget: saving, buckets: [], itemsByBucket: {}, accounts: [], ctx: {} as never }, []), []);
});

test('Upcoming payments list each occurrence of a payment, paid in date order', () => {
  const budget = budgetOf({
    itemsByBucket: { house: [item('cleaner', { goalId: 'house', name: 'Cleaner', amount: 10_000, categoryId: 'rent', dueDate: ts('2026-10-05'), recurrence: { frequency: 'Weekly', interval: 1 }, itemKind: 'payment' })] },
    transactions: [tx('t1', 15_000, { categoryId: 'rent', bucketItem: { bucketId: 'house', itemId: 'cleaner', month: '2026-10' } })],
  });
  const rows = monthPayments('2026-10', { budget, buckets: [], itemsByBucket: {}, accounts: [], ctx: {} as never }, []);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].status, 'paid');
  assert.equal(rows[1].paid, 5_000);
  assert.equal(rows[1].remaining, 5_000);
  assert.notEqual(rows[1].status, 'paid');
});

test('allowance pace: "6,000 a day left for 21 days", and a release day', () => {
  const budget = budgetOf({
    itemsByBucket: { leisure: [item('food', { amount: 140_000, itemKind: 'allowance', availableFrom: { day: 15 } })] },
    transactions: [tx('t1', 14_000, { bucketItem: { bucketId: 'leisure', itemId: 'food', month: '2026-10' } })],
  });
  const entry = budget.itemsByKey.get('food@2026-10')!;
  // 11 October: 21 days left including today; 126,000 left.
  assert.equal(allowancePace(entry, day('2026-10-16')).paceLine, '7,875 a day left for 16 days');
  assert.equal(allowancePace(entry, day('2026-10-11')).paceLine, 'Available from 15 Oct');
  const open = budgetOf({
    itemsByBucket: { leisure: [item('food', { amount: 140_000, itemKind: 'allowance' })] },
    transactions: [tx('t1', 14_000, { bucketItem: { bucketId: 'leisure', itemId: 'food', month: '2026-10' } })],
  });
  assert.equal(allowancePace(open.itemsByKey.get('food@2026-10')!, day('2026-10-11')).paceLine, '6,000 a day left for 21 days');
});

test('4. a trickle income of 100,000 takes five receipts of 5,000: 25,000 received, with the pace line', () => {
  const biz = item('biz', { goalId: 'income', name: 'Shop takings', amount: 100_000, categoryId: 'biz', incomeMode: 'trickle' });
  const link = { bucketId: 'income', itemId: 'biz', month: '2026-10' };
  const receipts = Array.from({ length: 5 }, (_, i) => ({ ...tx(`r${i}`, 5_000, { type: 'Income', categoryId: 'biz', bucketItem: link }), direction: 'Inflow' as const }));
  const budget = budgetOf({ itemsByBucket: { income: [biz] }, transactions: receipts });
  const entry = budget.itemsByKey.get('biz@2026-10')!;
  assert.equal(entry.actual, 25_000);
  assert.equal(entry.due, null, 'a trickle is never late on a day');
  const pace = incomePace(entry, day('2026-10-10'));
  assert.equal(pace.received, 25_000);
  // 10 of 31 days: 32,258 expected by today.
  assert.equal(pace.paceLine, '25,000 received, 32,258 expected by today');
  assert.equal(pace.behind, true);
  assert.equal(itemRowView(entry, day('2026-10-10')).line, '25,000 received, 32,258 expected by today');
  // Received income is what makes money available.
  assert.equal(monthTotals(budget, day('2026-10-10')).availableNow, 25_000);
});

test('6. set aside contributions carry across months toward the target', () => {
  const fund = item('fund', { goalId: 'savings', name: 'Emergency fund', amount: 10_000, categoryId: 'save', targetAmount: 120_000, targetDate: ts('2026-12-31') });
  const link = (month: string) => ({ bucketId: 'savings', itemId: 'fund', month });
  const linked = [
    tx('s7', 7_000, { type: 'Savings', categoryId: 'save', bucketItem: link('2026-08') }),
    tx('s9', 20_000, { type: 'Savings', categoryId: 'save', bucketItem: link('2026-09') }),
    tx('s10', 10_000, { type: 'Savings', categoryId: 'save', bucketItem: link('2026-10') }),
  ];
  const history = setAsideHistory({ month: '2026-10', transactions: linked, accountCurrency: new Map([['acc', 'XAF']]), baseCurrency: 'XAF', toDisplay: (a) => a, accountType: new Map([['acc', 'Checking']]) });
  assert.deepEqual(history.get('fund'), { saved: 27_000, used: 0 });
  const budget = budgetOf({ itemsByBucket: { savings: [fund] }, transactions: [linked[2]], setAsideHistory: history });
  const progress = setAsideProgress(budget.itemsByKey.get('fund@2026-10')!);
  assert.equal(progress.saved, 37_000);
  assert.equal(progress.line, 'Saved 37,000 of 120,000 · by Dec');

  // Spending from it later is recorded against the same item.
  const spent = budgetOf({
    itemsByBucket: { savings: [fund] },
    transactions: [linked[2], tx('e1', 30_000, { categoryId: 'save', bucketItem: link('2026-10') })],
    setAsideHistory: history,
  });
  const used = setAsideProgress(spent.itemsByKey.get('fund@2026-10')!);
  assert.equal(used.saved, 7_000);
  assert.equal(used.usedLine, 'Used 30,000 of the 37,000 set aside');
  // Real spending, paid for by the savings: it doesn't come out of what's available twice.
  const totals = monthTotals(spent, day('2026-10-10'));
  assert.equal(totals.expenses.spent, 30_000);
  assert.equal(totals.savings.withdrawn, 30_000);
});

test('a basket row: "8 of 9 paid", "61,560 left" or "Saved 27,000 of 120,000"', () => {
  const house = Array.from({ length: 9 }, (_, i) => item(`bill${i}`, { goalId: 'house', amount: 10_000, categoryId: 'rent', dueDate: ts('2026-10-20'), itemKind: 'payment' }));
  const paid = house.slice(0, 8).map((b, i) => tx(`p${i}`, 10_000, { categoryId: 'rent', bucketItem: { bucketId: 'house', itemId: b.id, month: '2026-10' } }));
  const budget = budgetOf({ itemsByBucket: { house }, transactions: paid });
  const view = basketMonthView(budget.buckets.find((b) => b.bucketId === 'house')!, day('2026-10-10'));
  assert.equal(view.line, '8 of 9 paid');
  assert.deepEqual([view.planned, view.used, view.left], [90_000, 80_000, 10_000]);

  const leisure = budgetOf({
    itemsByBucket: { leisure: [item('hangouts', { amount: 80_000, itemKind: 'allowance' })] },
    transactions: [tx('t', 18_440, { bucketItem: { bucketId: 'leisure', itemId: 'hangouts', month: '2026-10' } })],
  });
  assert.equal(basketMonthView(leisure.buckets[0], day('2026-10-10')).line, '61,560 left');
});

test('the month summary', () => {
  const budget = budgetOf({
    itemsByBucket: {
      income: [item('salary', { goalId: 'income', amount: 100_000, categoryId: 'biz' })],
      house: [item('rent', { goalId: 'house', amount: 160_000, categoryId: 'rent', dueDate: ts('2026-10-01'), itemKind: 'payment' })],
    },
  });
  const summary = monthSummary(monthTotals(budget, day('2026-10-10')));
  assert.equal(summary.overPlanned, true);
  assert.equal(summary.unplanned, -60_000);
  const groups = basketList(budget, [{ id: 'house', name: 'House', type: 'Expense', archived: false }, { id: 'income', name: 'Running Limbe', type: 'Income', archived: false }], day('2026-10-10'));
  assert.deepEqual(groups.map((g) => g.label), ['Income', 'Expenses']);
  const payments = monthPayments('2026-10', { budget, buckets: [], itemsByBucket: {}, accounts: [], ctx: {} as never }, []);
  assert.equal(payments.filter((p) => p.status === 'overdue').length, 1);
});

test('alerts live in Notifications only: no "Needs you" rows or notice cards on phone pages', () => {
  for (const path of ['phone/screens/Planning/BudgetTab.tsx', 'phone/screens/PlanningBucket/PlanningBucketScreen.tsx', 'phone/screens/Plans/PrioritiesScreen.tsx', 'phone/screens/Home/HomeScreen.tsx']) {
    const file = read(path);
    assert.doesNotMatch(file, /NeedsYouRow|HomeActionCards/, path);
  }
});

test('a part payment leaves the rest due: the occurrence stays open, and a repeating item never closes', () => {
  // 3 weekly payments of 10,000 in a Variable basket; 15,000 paid.
  const weekly = item('gym', { amount: 10_000, dueDate: ts('2026-10-05'), recurrence: { frequency: 'Weekly' as const, interval: 1 }, itemKind: 'payment' });
  const budget = budgetOf({
    itemsByBucket: { leisure: [weekly] },
    transactions: [tx('t', 15_000, { bucketItem: { bucketId: 'leisure', itemId: 'gym', month: '2026-10' } })],
  });
  const payments = monthPayments('2026-10', { budget, buckets: [], itemsByBucket: {}, accounts: [], ctx: {} as never }, []);
  assert.equal(payments[0].status, 'paid');
  assert.equal(payments[1].remaining, 5_000, 'the second occurrence still has 5,000 due');
  assert.notEqual(payments[1].status, 'paid');
  // Marked complete by mistake: a repeating item is never closed for good.
  const marked = budgetOf({ itemsByBucket: { leisure: [{ ...weekly, completed: true }] } });
  assert.equal(marked.itemsByKey.get('gym@2026-10')?.closed, false);
});

test('the Budget card: planned spending is one money type, savings and income apart', () => {
  const budget = budgetOf({
    itemsByBucket: {
      income: [item('salary', { goalId: 'income', amount: 500_000, categoryId: 'biz' })],
      house: [item('rent', { goalId: 'house', amount: 160_000, categoryId: 'rent', dueDate: ts('2026-10-01'), itemKind: 'payment' })],
      savings: [item('fund', { goalId: 'savings', amount: 40_000, categoryId: 'save', itemKind: 'set_aside' })],
    },
  });
  const summary = monthSummary(monthTotals(budget, day('2026-10-10')));
  assert.equal(summary.plannedSpending, 160_000, 'expenses only: not savings, not income');
  assert.equal(summary.plannedSavings, 40_000);
  assert.equal(summary.comingIn, 500_000);
  assert.equal(summary.unplanned, 300_000, 'left to plan: income minus spending and savings');
});

test('a transfer moves money between wallets: never a payment or overdue, only its fee is spending', () => {
  const move = {
    ...item('momo', { goalId: 'moves', name: 'Salary to Momo', amount: 200_000, categoryId: 'Account to account', dueDate: ts('2026-10-01'), charges: 1_500 }),
    // An earlier version stored transfers as payments: ignored now.
    itemKind: 'payment' as const,
    automation: { mode: 'prepare' as const, trigger: 'due' as const, amountMode: 'fixed' as const },
    toAccountId: 'momo-wallet',
  };
  const buckets = [{ id: 'moves', name: 'Moves', currency: 'XAF', type: 'Transfer' as const, kind: 'Fixed' as const }];
  const planned = budgetOf({ buckets, itemsByBucket: { moves: [move] } });
  const entry = planned.itemsByKey.get('momo@2026-10')!;
  assert.equal(entry.type, 'Transfer');
  assert.equal(entry.itemKind, null);
  assert.equal(entry.due, null);
  assert.equal(lineStatus(entry, day('2026-10-28')), 'Not moved');
  assert.deepEqual(monthPayments('2026-10', { budget: planned, buckets: [], itemsByBucket: {}, accounts: [], ctx: {} as never }, []), []);
  assert.deepEqual(preparePayments(planned, day('2026-10-28'), new Set()), []);
  assert.equal(itemRowView(entry, day('2026-10-10')).line, 'Not moved yet · fee 1,500');
  assert.equal(recordHint(entry, 'Moves').payFull, null);
  const plannedTotals = monthTotals(planned, day('2026-10-10'));
  // Only the planned fee is planned spending.
  assert.equal(plannedTotals.expenses.planned, 1_500);
  assert.equal(plannedTotals.transfers.planned, 200_000);

  // Recorded: 200,000 moved, 1,500 fee. Spending is the fee alone, and what's available drops only by it.
  const recorded = budgetOf({
    buckets,
    itemsByBucket: { moves: [move] },
    transactions: [{ ...tx('sal', 500_000, { type: 'Income', categoryId: 'biz' }), direction: 'Inflow' as const }],
    transfers: [{ id: 't1', fromAccountId: 'acc', toAccountId: 'momo-wallet', amount: 200_000, charges: 1_500, kind: 'Account to account', bucketItem: { bucketId: 'moves', itemId: 'momo', month: '2026-10' }, month: '2026-10' }],
  });
  const totals = monthTotals(recorded, day('2026-10-10'));
  assert.equal(totals.expenses.spent, 1_500);
  assert.equal(totals.transfers.moved, 200_000);
  assert.equal(totals.availableNow, 498_500);
  assert.equal(lineStatus(recorded.itemsByKey.get('momo@2026-10')!, day('2026-10-28')), 'Moved');
  assert.equal(basketMonthView(recorded.buckets[0], day('2026-10-10')).line, '1 of 1 moved · fees 1,500');

  // An unplanned transfer between two spending wallets is the same: moved, not spent.
  const loose = budgetOf({ transfers: [{ id: 't2', fromAccountId: 'acc', toAccountId: 'momo-wallet', amount: 50_000, charges: 300, kind: 'Account to account', bucketItem: null, month: '2026-10' }] });
  const looseTotals = monthTotals(loose, day('2026-10-10'));
  assert.equal(looseTotals.expenses.spent, 300);
  assert.equal(looseTotals.transfers.moved, 50_000);
});

// ---------------------------------------------------------------------------
// Migration

test('the migration stores kinds and cadences without changing any month', () => {
  const plan = planBasketsMigration({
    buckets: [
      { id: 'house', name: 'House', type: 'Expense', kind: 'Fixed', repeats: 'monthly' },
      { id: 'wish', name: 'Wishlist', type: 'Expense', kind: 'Variable' },
      { id: 'savings', name: 'Savings', type: 'Savings', kind: 'Fixed' },
      { id: 'income', name: 'Salary', type: 'Income', kind: 'Fixed' },
    ],
    itemsByBucket: {
      house: [
        { id: 'rent', name: 'Rent', categoryId: 'rent', dueDate: ts('2026-01-05'), recurrence: { frequency: 'Monthly', interval: 1 } },
        { id: 'tv', name: 'New TV', categoryId: 'rent', dueDate: ts('2026-10-20'), recurrence: null },
        { id: 'food', name: 'Food', categoryId: 'rent', dueDate: ts('2026-01-01'), recurrence: { frequency: 'Monthly', interval: 1 } },
      ],
      wish: [{ id: 'bed', name: 'Bunk bed', categoryId: 'rent', dueDate: ts('2026-10-10'), recurrence: null }],
      savings: [{ id: 'fund', name: 'Fund', categoryId: 'save', dueDate: ts('2026-01-01'), recurrence: null }],
      income: [{ id: 'pay', name: 'Salary', categoryId: 'biz', dueDate: ts('2026-01-25'), recurrence: { frequency: 'Monthly', interval: 1 } }],
    },
    categories,
  });
  const patch = (id: string) => plan.itemPatches.find((p) => p.itemId === id)?.patch;
  assert.deepEqual(plan.bucketPatches.map((p) => [p.bucketId, p.patch.cadence]), [['house', 'Monthly'], ['wish', 'Once'], ['savings', 'Monthly'], ['income', 'Monthly']]);
  assert.equal(patch('rent')?.itemKind, 'payment');
  assert.equal(patch('food')?.itemKind, 'allowance');
  assert.equal(patch('fund')?.itemKind, 'set_aside');
  assert.equal(patch('pay')?.incomeMode, 'lump_sum');
  // A one-off in a repeating basket is pinned so it doesn't start repeating.
  assert.deepEqual(patch('tv')?.recurrence, { frequency: 'Once', interval: 1 });
  assert.equal(patch('bed')?.recurrence, undefined);
  assert.equal(plan.review.length, 5);
  assert.equal(plan.review.some((r) => r.why === 'Transfer'), false);
  assert.equal(plan.review.find((r) => r.itemId === 'food')?.why, 'Used through the month');
  // Run again on migrated data: nothing to do.
  const again = planBasketsMigration({
    buckets: [{ id: 'house', name: 'House', type: 'Expense', kind: 'Fixed', cadence: 'Monthly' }],
    itemsByBucket: { house: [{ id: 'rent', name: 'Rent', categoryId: 'rent', dueDate: ts('2026-01-05'), recurrence: { frequency: 'Monthly', interval: 1 }, itemKind: 'payment' }] },
    categories,
  });
  assert.deepEqual(again, { bucketPatches: [], itemPatches: [], review: [] });
});

// ---------------------------------------------------------------------------
// Phone screens (source checks: these screens need a signed-in Firestore to render)

const read = (path: string) => readFileSync(join(__dirname, '../app/src', path), 'utf8');
const jsx = (source: string) => source.slice(source.indexOf('return ('));

test('7. phone Budget tab: no paragraph, one summary card, one tab level, a grouped list without nested cards', () => {
  const tab = read('phone/screens/Planning/BudgetTab.tsx');
  const screen = read('phone/screens/Planning/PlanningScreen.tsx');
  const parts = read('phone/screens/Planning/MinimalParts.tsx');
  assert.equal(/<p className=\{styles\.neutral\}/.test(tab), false, 'the summary paragraph is gone');
  assert.equal((tab.match(/BudgetCard/g) ?? []).length, 2, 'one card (import + use)');
  // The month and the icon tabs share one row; the month opens as a dropdown, not a sheet.
  assert.match(screen, /className=\{m\.headerRow\}/);
  assert.match(parts, /role="menu" aria-label="Choose month"/);
  assert.equal(/Modal title="Choose month"/.test(screen), false);
  assert.equal(/typeTabs|role="tablist"/.test(tab), false, 'no second tab row');
  assert.equal((screen.match(/role="tablist"/g) ?? []).length, 1, 'Budget / Payments / History only');
  assert.equal(/BucketCardView|bucketCard\b/.test(tab), false, 'no basket cards');
  assert.match(parts, /Details/);
  assert.match(parts, /label: 'Details'/, 'Details opens the full breakdown');
  assert.match(parts, /createPortal\(/, 'sheets render outside the card, so their numbers keep their colour');
  // One money type as the main figure, said in its label, with an info button.
  assert.match(parts, /amount=\{summary\.plannedSpending\}/, 'the main figure is planned spending');
  assert.match(parts, /label=\{`Planned spending in \$\{monthName\}`\}/);
  assert.match(parts, /labelInfo="plannedSpending"/);
  for (const figure of ['Income expected', 'Savings planned', 'Left to plan']) assert.match(parts, new RegExp(`label: '${figure}'`));
  for (const label of ['Income', 'Expenses', 'Savings', 'Transfers', 'Borrowed', 'Available now', 'By month end']) assert.match(parts, new RegExp(label));
});

test('8. Baskets screen: no duplicated summary cards; names wrap instead of truncating', () => {
  const baskets = read('phone/screens/Buckets/BucketsScreen.tsx');
  for (const gone of ['MoneyPlanCard', 'PlanCards', 'MustCard', 'IncomeCard', 'Planned vs actual', 'Must-haves']) assert.equal(baskets.includes(gone), false, gone);
  assert.match(baskets, /Archived baskets/);
  assert.match(baskets, /'Import'/);
  assert.match(baskets, /'Print'/);
  const css = read('phone/screens/Planning/Minimal.module.css');
  const name = css.slice(css.indexOf('.name {'), css.indexOf('}', css.indexOf('.name {')));
  assert.equal(/text-overflow:\s*ellipsis|white-space:\s*nowrap/.test(name), false);
  assert.match(name, /-webkit-line-clamp: 2/);
  assert.equal(/Must have/.test(read('phone/screens/Planning/MinimalParts.tsx')), false, 'no Must have chip on basket rows');
});

test('9. Payments tab: a week strip by default, grouped list, blue "Pay"', () => {
  const tab = read('phone/screens/Planning/PaymentsTab.tsx');
  assert.match(tab, /label=\{`Spent in \$\{monthName\}`\}/, 'the main figure is what has been spent');
  assert.match(tab, /<IconCircle type=\{payment\.categoryType\} \/>/, 'each row has its type icon');
  assert.match(tab, /\[showMonth, setShowMonth\] = useState\(false\)/);
  for (const group of ["'Overdue'", "'This week'", "'Later this month'", "'Paid'"]) assert.ok(tab.includes(group), group);
  assert.match(jsx(tab), /className=\{m\.action\}[^>]*>\s*Pay\s*</);
  assert.equal(/data-tone="over">\s*Overdue/.test(tab), false, 'no Overdue chip on each row');
  const css = read('phone/screens/Planning/Minimal.module.css');
  const action = css.slice(css.indexOf('.action {'), css.indexOf('}', css.indexOf('.action {')));
  assert.match(action, /color: var\(--p-blue\)/);
});

test('the basket and item pickers open full screen on a phone, clear of the notch', () => {
  const form = read('screens/AddTransaction/AddTransactionScreen.tsx');
  assert.match(form, /<ListSelectField\s+label="Basket"/);
  assert.match(form, /<ListSelectField\s+label="Item"/);
  const css = read('widgets/FormFrame/FormFrame.module.css');
  const sheet = css.slice(css.indexOf('.listSheet {'), css.indexOf('}', css.indexOf('.listSheet {')));
  assert.match(sheet, /inset: 0/);
  assert.match(sheet, /var\(--safe-top\)/);
  assert.match(sheet, /var\(--safe-bottom\)/);
  const body = css.slice(css.indexOf('.listBody {'), css.indexOf('}', css.indexOf('.listBody {')));
  assert.match(body, /overflow-y: auto/);
});

test('progress bars stay short: under the amounts in rows, a meter on the card', () => {
  const parts = read('phone/screens/Planning/MinimalParts.tsx');
  const css = read('phone/screens/Planning/Minimal.module.css');
  assert.match(parts, /className=\{m\.side\}>[\s\S]*?className=\{m\.sideBar\}/, 'the row bar sits inside the amounts column');
  assert.equal(/\.progress \{/.test(css), false, 'no bar across the whole row');
  const track = css.slice(css.indexOf('.moneyTrack {'), css.indexOf('}', css.indexOf('.moneyTrack {')));
  assert.match(track, /width: 112px/);
});

test('Baskets: the shared month picker, a card in its own gradient, and All / Fixed / Variable', () => {
  const baskets = read('phone/screens/Buckets/BucketsScreen.tsx');
  assert.match(baskets, /<MonthPicker month=\{v\.month\}/);
  assert.match(baskets, /tone="teal"/);
  for (const f of ["'All'", "'Fixed'", "'Variable'"]) assert.ok(baskets.includes(f), f);
  // The filter sits above the card, not on it; the card totals one money type.
  assert.ok(baskets.indexOf('aria-label="Which baskets"') < baskets.indexOf('<MoneyCard'));
  assert.equal(/extra=\{/.test(baskets), false);
  assert.match(baskets, /const shown = groups\.filter\(\(g\) => g\.type === flow\);\s*const sum = basketsSummary\(shown\);/);
  assert.match(baskets, /<BasketGroups groups=\{shown\}/, 'the list follows the same filters as the card');
  // Both filters share the month picker's row.
  const row = baskets.slice(baskets.indexOf('<div className={m.headerRow}>'), baskets.indexOf('<ScreenState'));
  assert.match(row, /<MonthPicker/);
  assert.match(row, /label="Money type"/);
  assert.match(row, /label="Which baskets"/);
  assert.match(read('phone/screens/Planning/PlanningScreen.tsx'), /<MonthPicker month=\{month\}/);
});

test('Baskets filter: Fixed or Variable baskets only, with the totals redone', async () => {
  const { filterBaskets, basketsSummary } = await import('../app/src/logic/planning/basketList');
  const row = (id: string, fixed: boolean, planned: number) => ({ id, name: id, type: 'Expense' as const, line: '', used: planned / 2, planned, problem: false, progress: 0.5, archived: false, empty: false, fixed });
  const groups = [{ type: 'Expense' as const, label: 'Expenses', planned: 300, used: 150, rows: [row('rent', true, 200), row('food', false, 100)] }];
  assert.deepEqual(filterBaskets(groups, 'fixed')[0].rows.map((r) => r.id), ['rent']);
  assert.equal(filterBaskets(groups, 'variable')[0].planned, 100);
  assert.deepEqual(basketsSummary(filterBaskets(groups, 'all')), { planned: 300, used: 150, left: 150, count: 2, problems: 0 });
});

test('Priorities: one card, one row of controls, the order as a menu, a plain grouped list', () => {
  const pr = read('phone/screens/Plans/PrioritiesScreen.tsx');
  assert.equal((pr.match(/<MoneyCard/g) ?? []).length, 1);
  assert.match(pr, /className=\{m\.controlsRow\}/);
  assert.equal(/className=\{styles\.sortChips\}/.test(pr), false, 'no row of five sort chips');
  assert.equal(/className=\{styles\.infoBox\}/.test(pr), false, 'the explanation is behind the info icon');
  assert.equal(/rowChips/.test(pr), false, 'no chips on each row');
});

test('Unplanned: an expense or transfer with nothing planned can still be recorded', () => {
  const logic = read('logic/addTransaction/useLogic.ts');
  const screen = read('screens/AddTransaction/AddTransactionScreen.tsx');
  // Nothing of this type planned this month: every category is offered.
  assert.match(logic, /recordingUnplanned = [^;]*!hasBudgetedCategories/);
  assert.match(logic, /recordingUnplanned \? categoriesForType : budgetedCategoriesForType/);
  // "Record as unplanned" is offered for transfers too, not only expenses.
  assert.doesNotMatch(screen, /!v\.isTransferLike && \(\s*<SwitchField/);
  assert.match(screen, /label=\{t\.recordUnplannedCta\}/);
});

test('Item currency: a 24 USD item in an XAF basket converts at the rate, and follows it', () => {
  const rates = { XAF: 1, USD: 605, EUR: 655.957 };
  const usd = item('claude', { name: 'Claude', amount: 24, currency: 'USD' });
  const build = (display: string) =>
    budgetOf({ itemsByBucket: { leisure: [usd] }, toDisplay: (amount, currency) => Math.round(convert(amount, currency, display, rates) * 100) / 100 });
  assert.equal(itemCurrencyOf(usd, { currency: 'XAF' }), 'USD');
  assert.equal(itemCurrencyOf({}, { currency: 'XAF' }), 'XAF');
  assert.equal(build('XAF').itemsByKey.get('claude@2026-10')?.planned, 14_520);
  // Shown in USD it is 24 again, not 24 XAF converted.
  assert.equal(build('USD').itemsByKey.get('claude@2026-10')?.planned, 24);
  // Without its own currency the same 24 stays 24 XAF.
  const xaf = budgetOf({ itemsByBucket: { leisure: [item('claude', { name: 'Claude', amount: 24 })] }, toDisplay: (amount, currency) => convert(amount, currency, 'XAF', rates) });
  assert.equal(xaf.itemsByKey.get('claude@2026-10')?.planned, 24);
});

test('Claude USD fix: only Claude items of 24 not already in USD', () => {
  const plan = planClaudeUsdFix(
    [{ id: 'subs', currency: 'XAF' }, { id: 'usd', currency: 'USD' }],
    {
      subs: [
        { id: 'a', name: 'Claude Pro', amount: 24 },
        { id: 'b', name: 'claude', amount: 24, currency: 'XAF' },
        { id: 'c', name: 'Claude', amount: 24, currency: 'USD' },
        { id: 'd', name: 'Claude', amount: 14_520 },
        { id: 'e', name: 'Netflix', amount: 24 },
      ],
      usd: [{ id: 'f', name: 'Claude', amount: 24 }],
    }
  );
  assert.deepEqual(plan, [{ bucketId: 'subs', itemId: 'a' }, { bucketId: 'subs', itemId: 'b' }]);
});

test('UI copy uses no long dashes', () => {
  for (const file of [
    'phone/screens/Planning/BudgetTab.tsx',
    'phone/screens/Planning/MinimalParts.tsx',
    'phone/screens/Planning/PaymentsTab.tsx',
    'phone/screens/Buckets/BucketsScreen.tsx',
    'phone/screens/PlanningBucket/PlanningBucketScreen.tsx',
    'phone/screens/ItemKindReview/ItemKindReviewScreen.tsx',
    'screens/ItemKindReview/ItemKindReviewScreen.tsx',
    'shared/budget/itemKinds.ts',
    'shared/budget/cadence.ts',
    'forms/BasketItemForm/BasketItemForm.tsx',
    'forms/BasketForm/BasketForm.tsx',
    'screens/AddTransaction/AddTransactionScreen.tsx',
    'widgets/FormFrame/FormFrame.tsx',
    'phone/screens/Plans/PrioritiesScreen.tsx',
  ]) {
    const strings = read(file).match(/(['"`])(?:(?!\1).)*\1|>[^<{}]+</g) ?? [];
    for (const s of strings) assert.equal(/[—–]/.test(s), false, `${file}: ${s}`);
  }
});
