// Back buttons go to the main page of the feature you're in
// (pageTree.ts's backTargetFor, used by useGoBack).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backTargetFor, featurePageOf } from '../app/src/shared/config/pageTree';

test('a page inside a feature goes back to that feature’s main page', () => {
  const cases: [string, string][] = [
    ['/budget/item/b1/i1?month=2026-10', '/budget'],
    ['/budget/category/c1', '/budget'],
    ['/budget/item-kinds', '/budget'],
    ['/budget/basket/b1', '/baskets'],
    ['/baskets/b1', '/baskets'],
    ['/baskets/b1/edit', '/baskets'],
    ['/edit-basket-item/b1/i1', '/baskets'],
    ['/wallets/w1', '/wallets'],
    ['/wallets/w1/edit', '/wallets'],
    ['/transactions/t1', '/transactions'],
    ['/edit-transaction/t1', '/transactions'],
    ['/debts/d1/repay', '/debts'],
    ['/projects/p1', '/projects/all'],
    ['/projects/p1/edit', '/projects/all'],
    ['/sections/s1', '/sections'],
    ['/projects/insights/p1', '/projects/insights'],
    ['/projects/calendar/events/e1', '/projects/calendar'],
    ['/areas/a1', '/areas'],
    ['/projects/all', '/projects/insights'],
    ['/work', '/projects/all'],
    ['/people/x1', '/people'],
    ['/tasks/t1/edit', '/tasks'],
    ['/settings/export', '/settings'],
    ['/notifications/n1', '/notifications'],
  ];
  for (const [url, expected] of cases) assert.equal(backTargetFor(url, '/somewhere'), expected, url);
});

test('a feature’s main page goes back to the mode’s home', () => {
  assert.equal(backTargetFor('/budget', null), '/home');
  assert.equal(backTargetFor('/baskets', '/budget/item/b1/i1'), '/home');
  assert.equal(backTargetFor('/payments', null), '/home');
  // Priorities lives on Payments now: its old address goes back there.
  assert.equal(backTargetFor('/baskets/items', null), '/payments');
  // Time v1.0: Time pages go back to Time's Home (the dashboard).
  assert.equal(backTargetFor('/areas', null), '/projects/insights');
  assert.equal(backTargetFor('/sections', null), '/projects/insights');
  assert.equal(backTargetFor('/tasks', null), '/projects/insights');
  assert.equal(backTargetFor('/people', null), '/projects/insights');
  assert.equal(backTargetFor('/library', null), '/projects/insights');
  assert.equal(backTargetFor('/projects', null), '/projects/insights');
  // The home itself: nowhere better, the caller's fallback.
  assert.equal(backTargetFor('/projects/insights', null), null);
  // Settings goes back to the module it was opened from.
  assert.equal(backTargetFor('/settings', '/settings/planning'), '/projects/insights');
  assert.equal(backTargetFor('/settings', '/areas'), '/projects/insights');
  assert.equal(backTargetFor('/settings', '/budget'), '/home');
  assert.equal(backTargetFor('/settings', null), '/home');
});

test('a form outside any feature goes to the main page of where it was opened', () => {
  assert.equal(backTargetFor('/add-transaction', '/budget/basket/b1'), '/baskets');
  assert.equal(backTargetFor('/add-transaction?bucketItem=x', '/budget?tab=payments'), '/budget');
  assert.equal(backTargetFor('/add-transaction', '/home'), '/home');
  assert.equal(backTargetFor('/add-transaction', null), null);
  assert.equal(featurePageOf('/home'), null);
});
