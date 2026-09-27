import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { densityFor, layoutDay } from '../app/src/viewmodels/dayLayout';

const at = (h: number, m = 0) => h * 60 + m;
const HOUR = 112;

describe('layoutDay', () => {
  it('puts two overlapping activities side by side in one group', () => {
    const { byId, groups } = layoutDay(
      [
        { id: 'a', startMin: at(9), endMin: at(10) },
        { id: 'b', startMin: at(9, 30), endMin: at(10, 30) },
      ],
      8,
      HOUR
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0].columnCount, 2);
    assert.equal(byId.get('a')!.column, 0);
    assert.equal(byId.get('b')!.column, 1);
    assert.equal(byId.get('a')!.top, HOUR);
    assert.equal(byId.get('a')!.height, HOUR);
  });

  it('does not treat touching times as overlapping', () => {
    const { groups } = layoutDay(
      [
        { id: 'a', startMin: at(9), endMin: at(10) },
        { id: 'b', startMin: at(10), endMin: at(11) },
      ],
      8,
      HOUR
    );
    assert.equal(groups.length, 2);
    assert.ok(groups.every((g) => g.columnCount === 1));
  });

  it('chains overlaps through a middle activity and reuses freed columns', () => {
    const { byId, groups } = layoutDay(
      [
        { id: 'a', startMin: at(9), endMin: at(10) },
        { id: 'b', startMin: at(9, 30), endMin: at(10, 30) },
        { id: 'c', startMin: at(10, 15), endMin: at(11) },
      ],
      8,
      HOUR
    );
    assert.equal(groups.length, 1);
    assert.deepEqual([groups[0].startMin, groups[0].endMin], [at(9), at(11)]);
    assert.equal(groups[0].columnCount, 2);
    assert.equal(byId.get('c')!.column, 0); // 'a' ended at 10:00
    assert.deepEqual(groups[0].itemIds, ['a', 'b', 'c']);
  });

  it('opens a column per activity when all overlap', () => {
    const { groups } = layoutDay(
      ['a', 'b', 'c', 'd'].map((id, i) => ({ id, startMin: at(9, i * 10), endMin: at(11) })),
      8,
      HOUR
    );
    assert.equal(groups[0].columnCount, 4);
  });
});

describe('densityFor', () => {
  it('fits content to the card height', () => {
    assert.equal(densityFor(20), 'line');
    assert.equal(densityFor(30), 'short');
    assert.equal(densityFor(59), 'short');
    assert.equal(densityFor(60), 'full');
  });
});
