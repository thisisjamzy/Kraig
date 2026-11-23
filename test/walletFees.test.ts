// Fee schedules per wallet (app/src/viewmodels/walletFees.ts, brief 23 Nov 2026, 2.3).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bandFor, feeFor, hasFeesFor, parseBands, validateBands } from '../app/src/viewmodels/walletFees';
import type { FeeBand } from '../app/src/shared/firestore/types';

const bands: FeeBand[] = [
  { min: 0, max: 5000, fee: 100, kind: 'fixed' },
  { min: 5000, max: 50000, fee: 250, kind: 'fixed' },
  { min: 50000, max: null, fee: 1, kind: 'percent' },
];
const wallet = { feeSchedule: { appliesTo: ['transfer', 'withdrawal'] as const, bands } };
const w = wallet as unknown as Parameters<typeof feeFor>[0];

describe('feeFor', () => {
  test('band edges: min is inclusive, max is exclusive', () => {
    assert.equal(feeFor(w, 1, 'transfer'), 100);
    assert.equal(feeFor(w, 4999, 'transfer'), 100);
    assert.equal(feeFor(w, 5000, 'transfer'), 250);
    assert.equal(feeFor(w, 49999, 'transfer'), 250);
  });

  test('"and above" band catches everything past the last max', () => {
    assert.equal(bandFor(bands, 50000)?.kind, 'percent');
    assert.equal(bandFor(bands, 10_000_000)?.kind, 'percent');
  });

  test('percent fees are a share of the amount, rounded', () => {
    assert.equal(feeFor(w, 50000, 'transfer'), 500);
    assert.equal(feeFor(w, 123456, 'withdrawal'), 1235);
  });

  test('fixed fees do not depend on the amount inside their band', () => {
    assert.equal(feeFor(w, 10, 'withdrawal'), 100);
    assert.equal(feeFor(w, 4000, 'withdrawal'), 100);
  });

  test('a kind the schedule does not cover costs nothing', () => {
    assert.equal(feeFor(w, 10000, 'payment'), 0);
    assert.equal(hasFeesFor(w, 'payment'), false);
    assert.equal(hasFeesFor(w, 'transfer'), true);
  });

  test('no schedule, no amount or no band: no fee', () => {
    assert.equal(feeFor({}, 10000, 'transfer'), 0);
    assert.equal(feeFor(null, 10000, 'transfer'), 0);
    assert.equal(feeFor(w, 0, 'transfer'), 0);
    const gappy = { feeSchedule: { appliesTo: ['transfer'], bands: [{ min: 100, max: 200, fee: 5, kind: 'fixed' }] } } as unknown as Parameters<typeof feeFor>[0];
    assert.equal(feeFor(gappy, 50, 'transfer'), 0);
  });

  test('an empty appliesTo falls back to transfers and withdrawals', () => {
    const v = { feeSchedule: { appliesTo: [], bands } } as unknown as Parameters<typeof feeFor>[0];
    assert.equal(feeFor(v, 1000, 'transfer'), 100);
    assert.equal(feeFor(v, 1000, 'payment'), 0);
  });
});

describe('validateBands', () => {
  test('a sorted, gapless schedule is valid', () => {
    assert.equal(validateBands(bands), null);
  });
  test('overlaps, gaps, negatives and a misplaced "and above" are caught', () => {
    assert.match(validateBands([{ min: 0, max: 100, fee: 1, kind: 'fixed' }, { min: 50, max: null, fee: 2, kind: 'fixed' }])!, /overlap/);
    assert.match(validateBands([{ min: 0, max: 100, fee: 1, kind: 'fixed' }, { min: 150, max: null, fee: 2, kind: 'fixed' }])!, /gap/);
    assert.match(validateBands([{ min: 0, max: null, fee: -1, kind: 'fixed' }])!, /negative/);
    assert.match(validateBands([{ min: 0, max: null, fee: 1, kind: 'fixed' }, { min: 10, max: null, fee: 1, kind: 'fixed' }])!, /only the last/);
    assert.match(validateBands([{ min: 10, max: null, fee: 1, kind: 'fixed' }])!, /start at 0/);
    assert.match(validateBands([])!, /at least one/);
  });
  test('parseBands reads blank "To" as "and above"', () => {
    assert.deepEqual(parseBands([{ min: '0', max: '', fee: '1.5', kind: 'percent' }]), [{ min: 0, max: null, fee: 1.5, kind: 'percent' }]);
  });
});
