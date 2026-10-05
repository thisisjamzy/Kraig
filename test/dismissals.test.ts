// Dismissed action cards (app/src/shared/settings/dismissals.ts).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { dismissalOf, isCardHidden } from '../app/src/shared/settings/dismissals';

describe('dismissed cards', () => {
  test('a dismissed review card stays hidden for its month and comes back for the next', () => {
    const stored = { review: dismissalOf({ key: 'review:2026-10' }) };
    assert.equal(isCardHidden(stored, 'review', { key: 'review:2026-10' }), true);
    assert.equal(isCardHidden(stored, 'review', { key: 'review:2026-11' }), false);
  });

  test('Ready to pay comes back only when a new payment joins', () => {
    const stored = { readyToPay: dismissalOf({ key: 'readyToPay', ids: ['rent__202610', 'gym__202610'] }) };
    // Same set, other order: hidden.
    assert.equal(isCardHidden(stored, 'readyToPay', { key: 'readyToPay', ids: ['gym__202610', 'rent__202610'] }), true);
    // One confirmed since: still hidden.
    assert.equal(isCardHidden(stored, 'readyToPay', { key: 'readyToPay', ids: ['gym__202610'] }), true);
    // A new one: back.
    assert.equal(isCardHidden(stored, 'readyToPay', { key: 'readyToPay', ids: ['gym__202610', 'phone__202610'] }), false);
  });

  test('never dismissed, or another card: shown', () => {
    assert.equal(isCardHidden(undefined, 'review', { key: 'review:2026-10' }), false);
    assert.equal(isCardHidden({ readyToPay: { key: 'readyToPay', ids: [] } }, 'review', { key: 'review:2026-10' }), false);
  });

  test('time passing alone never brings a card back (no date in the rule)', () => {
    const stored = { 'basket:home': dismissalOf({ key: 'over:2026-10:20000' }) };
    assert.equal(isCardHidden(stored, 'basket:home', { key: 'over:2026-10:20000' }), true);
    assert.equal(isCardHidden(stored, 'basket:home', { key: 'over:2026-10:35000' }), false);
  });
});
