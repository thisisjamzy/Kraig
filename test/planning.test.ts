// Planning (Budget section) rules — app/src/viewmodels/planning.ts: bucket
// card prompts and sort order, month captions, and how covers and
// reallocations split across items.
// Run: npx tsx --test test/planning.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BucketGroup, ItemMonth } from '../app/src/shared/budget/monthBudget';
import {
  bucketCard,
  bucketCards,
  monthCaption,
  money,
  pairUp,
  promptFor,
  shiftMonth,
  takeFrom,
  uncovered,
} from '../app/src/viewmodels/planning';

const month = '2026-09';
const mid = new Date(2026, 8, 10); // 20 days left
const late = new Date(2026, 8, 27); // 3 days left

function item(key: string, planned: number, actual: number, extra: Partial<ItemMonth> = {}): ItemMonth {
  const remaining = planned - actual;
  return {
    key,
    bucketId: 'b',
    bucketName: 'Bucket',
    itemId: key,
    name: key,
    categoryId: null,
    categoryName: 'Travel',
    type: 'Expense',
    kind: 'Planned',
    month,
    planned,
    isOverride: false,
    allocatedIn: 0,
    allocatedOut: 0,
    available: planned,
    actual,
    remaining,
    status: remaining > 0 ? 'under' : remaining === 0 ? 'on' : 'over',
    unfunded: Math.max(0, -remaining),
    justified: null,
    closed: false,
    transactionIds: [],
    transferIds: [],
    allocationIds: [],
    ...extra,
  };
}

function group(id: string, items: ItemMonth[]): BucketGroup {
  const planned = items.reduce((s, i) => s + i.available, 0);
  const actual = items.reduce((s, i) => s + i.actual, 0);
  return { bucketId: id, name: id, planned, available: planned, actual, remaining: planned - actual, items };
}

test('formatting and months', () => {
  assert.equal(money(1020281), '1,020,281');
  assert.equal(money(16000.5), '16,000.5');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(monthCaption(month, late), '3 days left in September');
  assert.equal(monthCaption(month, new Date(2026, 8, 30)), 'Last day of September');
  assert.equal(monthCaption('2026-08', mid), 'August has ended');
});

test('an overspent bucket asks to cover or justify, even when another item is under', () => {
  const card = bucketCard(group('Trip', [item('Transport', 10000, 14000), item('Food', 20000, 5000)]), { month, today: mid });
  assert.deepEqual(card.prompt, { kind: 'over', amount: 4000 });
  assert.equal(card.spent, 19000);
  assert.equal(card.planned, 30000);
  assert.equal(card.available, 11000);
});

test('a justified overspend becomes a tag; a partly justified one still asks for the rest', () => {
  const full = item('Transport', 10000, 14000, { justified: { reason: 'emergency', note: '', amount: 4000 } });
  assert.deepEqual(promptFor([full], { month, today: mid }), { kind: 'justified', amount: 4000, reason: 'emergency' });
  const part = item('Transport', 10000, 14000, { justified: { reason: 'emergency', note: '', amount: 1500 } });
  assert.deepEqual(promptFor([part], { month, today: mid }), { kind: 'over', amount: 2500 });
});

test('leftovers are offered only late in the month, after it, or when closed', () => {
  const items = [item('Funeral contribution', 50000, 20144)];
  assert.equal(promptFor(items, { month, today: mid }), null);
  assert.deepEqual(promptFor(items, { month, today: late }), { kind: 'leftover', amount: 29856 });
  assert.deepEqual(promptFor(items, { month, today: new Date(2026, 9, 3) }), { kind: 'leftover', amount: 29856 });
  assert.deepEqual(promptFor([item('Gift', 10000, 4000, { closed: true })], { month, today: mid }), { kind: 'leftover', amount: 6000 });
});

test('buckets needing action sort first, then by amount left', () => {
  const cards = bucketCards(
    [
      group('Calm', [item('a', 50000, 10000)]),
      group('Leftover', [item('b', 30000, 1000)]),
      group('Over', [item('c', 10000, 20000)]),
      group('Big', [item('d', 90000, 0)]),
    ],
    { month, today: late }
  );
  // Every non-over bucket is late-month leftover here, so: over first, then leftovers by size.
  assert.deepEqual(
    cards.map((c) => c.id),
    ['Over', 'Big', 'Calm', 'Leftover']
  );
  const early = bucketCards([group('Calm', [item('a', 50000, 10000)]), group('Big', [item('d', 90000, 0)])], { month, today: mid });
  assert.deepEqual(
    early.map((c) => c.id),
    ['Big', 'Calm']
  );
});

test('covering: sources matched to overspent items in order, the rest left to justify', () => {
  const needs = [
    { key: 'transport', amount: 4000 },
    { key: 'lodging', amount: 3000 },
  ];
  const gives = [...takeFrom([{ key: 'food', amount: 2500 }, { key: 'misc', amount: 10000 }], 5000)];
  assert.deepEqual(gives, [
    { key: 'food', amount: 2500 },
    { key: 'misc', amount: 2500 },
  ]);
  const pairs = pairUp(gives, needs);
  assert.deepEqual(pairs, [
    { fromKey: 'food', toKey: 'transport', amount: 2500 },
    { fromKey: 'misc', toKey: 'transport', amount: 1500 },
    { fromKey: 'misc', toKey: 'lodging', amount: 1000 },
  ]);
  assert.deepEqual(uncovered(needs, pairs), [{ key: 'lodging', amount: 2000 }]);
});
