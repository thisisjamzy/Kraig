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
    ['/projects/p1', '/work'],
    ['/projects/p1/edit', '/work'],
    ['/sections/s1', '/work'],
    ['/projects/insights/p1', '/projects/insights'],
    ['/projects/calendar/events/e1', '/projects/calendar'],
    ['/areas/a1', '/work'],
    ['/projects/all', '/work'],
    ['/people/x1', '/people'],
    ['/tasks/t1/edit', '/projects'],
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
  // Work holds Areas and Projects (Design-System HANDOFF section 21).
  assert.equal(backTargetFor('/work', null), '/projects');
  assert.equal(backTargetFor('/people', null), '/projects');
  assert.equal(backTargetFor('/library', null), '/projects');
  // The home itself: nowhere better, the caller's fallback.
  assert.equal(backTargetFor('/projects', null), null);
});

test('a form outside any feature goes to the main page of where it was opened', () => {
  assert.equal(backTargetFor('/add-transaction', '/budget/basket/b1'), '/baskets');
  assert.equal(backTargetFor('/add-transaction?bucketItem=x', '/budget?tab=payments'), '/budget');
  assert.equal(backTargetFor('/add-transaction', '/home'), '/home');
  assert.equal(backTargetFor('/add-transaction', null), null);
  assert.equal(featurePageOf('/home'), null);
});
