import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isFormPage, recordVisit, resetNavHistory, takeBackTarget } from '../app/src/shared/navigation/navHistory';

describe('back buttons', () => {
  beforeEach(() => resetNavHistory());

  it('skips an edit page after saving it and returning to the detail page', () => {
    recordVisit('/buckets');
    recordVisit('/budget/bucket/b1');
    recordVisit('/edit-bucket-item/b1/i1');
    recordVisit('/budget/bucket/b1'); // saved: pushed back to the details page
    // The browser still has the form behind this page, so no browser back.
    assert.deepEqual(takeBackTarget('/budget/bucket/b1'), { url: '/buckets', isImmediate: false });
  });

  it('uses a real browser back when the previous page is the one to return to', () => {
    recordVisit('/buckets');
    recordVisit('/budget/bucket/b1');
    assert.deepEqual(takeBackTarget('/budget/bucket/b1'), { url: '/buckets', isImmediate: true });
  });

  it('pops only on a browser back', () => {
    recordVisit('/home');
    recordVisit('/tasks');
    recordVisit('/tasks/t1/edit');
    recordVisit('/tasks', true); // router.back() after saving
    assert.deepEqual(takeBackTarget('/tasks'), { url: '/home', isImmediate: true });
  });

  it('treats action forms as forms', () => {
    for (const url of ['/budget/cover?month=2026-09', '/budget/reallocate', '/debts/d1/plan', '/debts/d1/repay', '/projects/p1/edit', '/add-bucket-item/b1']) {
      assert.equal(isFormPage(url), true, url);
    }
    for (const url of ['/budget', '/budget/bucket/b1', '/budget/item/b1/i1', '/debts/d1', '/buckets/items']) {
      assert.equal(isFormPage(url), false, url);
    }
  });
});
