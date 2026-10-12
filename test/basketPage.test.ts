// The basket page's figures (app/src/logic/planningBucket/basketPage.ts).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { basketAllTime, itemStatus, itemsMix, highestPriority, nextAutomated, paymentsDue, summaryStatus, upcomingPayments } from '../app/src/logic/planningBucket/basketPage';
import type { LineRow } from '../app/src/logic/budgetMonth/lines';

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const ts = (iso: string) => ({ toDate: () => d(iso) }) as never;

function line(name: string, extra: Partial<LineRow> = {}): LineRow {
  return {
    key: `${name}@2026-10`,
    itemId: name,
    bucketId: 'home',
    bucketName: 'Home',
    name,
    type: 'Expense',
    month: '2026-10',
    available: 100,
    actual: 0,
    left: 100,
    due: d('2026-10-05'),
    necessity: 'MustHave',
    priority: 'High',
    automation: { mode: 'off' },
    accountName: 'MoMo',
    state: 'Unpaid',
    closed: false,
    archived: false,
    ...extra,
  } as LineRow;
}

const today = d('2026-10-03');

describe('basket page', () => {
  test('statuses: Unpaid, Paid, Overdue, Over plan, Waiting for income', () => {
    assert.equal(itemStatus(line('rent')), 'Unpaid');
    assert.equal(itemStatus(line('rent', { state: 'Paid' })), 'Paid');
    assert.equal(itemStatus(line('rent', { state: 'Overdue' })), 'Overdue');
    assert.equal(itemStatus(line('rent', { state: 'Over plan' })), 'Over plan');
    assert.equal(itemStatus(line('rent'), { coverage: 'waiting', waitsFor: 'AIMS salary' }), 'Waiting for income');
    assert.equal(itemStatus(line('rent'), undefined, { itemId: 'rent', state: 'waiting', waitingFor: 'AIMS salary' }), 'Waiting for income');
  });

  test('upcoming payments: to pay first by date, with their Ready to pay state, then paid', () => {
    const rows = upcomingPayments(
      [line('gym', { due: d('2026-10-20') }), line('rent', { due: d('2026-10-05') }), line('phone', { actual: 100, left: 0, state: 'Paid', due: d('2026-10-01') }), line('school', { due: d('2026-10-10') })],
      [
        { itemId: 'rent', state: 'ready', waitingFor: null },
        { itemId: 'school', state: 'waiting', waitingFor: 'AIMS salary' },
      ],
      today
    );
    assert.deepEqual(
      rows.map((r) => [r.name, r.state]),
      [
        ['rent', 'Ready'],
        ['school', 'Waiting for AIMS salary'],
        ['gym', 'Upcoming'],
        ['phone', 'Paid'],
      ]
    );
  });

  test('next automated: this month first, else next month from the items', () => {
    const auto = { mode: 'prepare', trigger: 'due', amountMode: 'fixed' } as LineRow['automation'];
    assert.deepEqual(nextAutomated([line('rent', { automation: auto, due: d('2026-10-05') })], [], '2026-10', today), { name: 'rent', amount: 100, date: d('2026-10-05') });
    const items = [{ id: 'rent', goalId: 'home', name: 'Rents', amount: 160_000, categoryId: 'housing', dueDate: ts('2026-01-01'), recurrence: { frequency: 'Monthly' as const, interval: 1 }, completed: false, charges: null, automation: { mode: 'prepare' } }];
    const next = nextAutomated([line('rent', { automation: auto, actual: 100, left: 0 })], items as never, '2026-10', today);
    assert.equal(next?.name, 'Rents');
    assert.equal(next?.amount, 160_000);
    assert.equal(next?.date?.getMonth(), 10);
    assert.equal(next?.date?.getDate(), 1);
  });

  test('items mix, highest priority, payments due and the summary chip', () => {
    const lines = [line('a'), line('b'), line('c'), line('d', { necessity: 'NiceToHave', priority: 'Low' }), line('e', { necessity: 'NiceToHave', priority: 'Urgent', left: 0, actual: 100 })];
    assert.equal(itemsMix(lines), '3 must have, 2 nice to have');
    assert.equal(highestPriority(lines), 'Urgent');
    assert.deepEqual(paymentsDue(lines), { count: 4, total: 400 });
    assert.deepEqual(summaryStatus(500, 0, 'Expense'), { text: 'Unused', tone: 'neutral' });
    assert.deepEqual(summaryStatus(500, 200, 'Expense'), { text: 'On track', tone: 'good' });
    assert.deepEqual(summaryStatus(500, 600, 'Expense'), { text: 'Over plan', tone: 'bad' });
  });
});

test('All time: every item whatever its months, with all it was paid, open ones first', () => {
  const ts = (y: number, m: number, d: number) => ({ toDate: () => new Date(y, m - 1, d) });
  const today = new Date(2026, 9, 12);
  const items = [
    { id: 'rent', name: 'Rent', amount: 120_000, dueDate: ts(2026, 1, 1), recurrence: { frequency: 'Monthly' as const, interval: 1 }, completed: false },
    { id: 'sofa', name: 'Sofa', amount: 90_000, dueDate: ts(2026, 3, 4), recurrence: null, completed: true },
    { id: 'wish', name: 'Camera', amount: 200_000, dueDate: null, recurrence: null, completed: false },
    { id: 'old', name: 'Gym', amount: 15_000, dueDate: ts(2025, 1, 5), recurrence: { frequency: 'Monthly' as const, interval: 1, endDate: ts(2025, 6, 30) }, completed: false },
  ] as never[];
  const txs = [
    { itemId: 'rent', amount: 120_000, date: new Date(2026, 8, 1) },
    { itemId: 'rent', amount: 120_000, date: new Date(2026, 9, 1) },
    { itemId: 'sofa', amount: 85_000, date: new Date(2026, 2, 4) },
  ];
  const v = basketAllTime(items, txs, null, today, (_i, n) => n);
  assert.deepEqual(
    v.items.map((i) => [i.name, i.status, i.paid]),
    [
      ['Rent', 'Open', 240_000],
      ['Camera', 'Not scheduled', 0],
      ['Gym', 'Ended', 0],
      ['Sofa', 'Done', 85_000],
    ]
  );
  assert.equal(v.items[0].next?.getTime(), new Date(2026, 10, 1).getTime());
  assert.equal(v.paid, 325_000);
  assert.equal(v.payments, 3);
  assert.equal(v.open, 2);
  assert.equal(v.firstPaid?.getTime(), new Date(2026, 2, 4).getTime());
});
