import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryGroups } from '../app/src/logic/categoryPicker/useCategoryPicker';

const cats = [
  { id: 'g', name: 'Groceries' },
  { id: 'f', name: 'Fuel' },
  { id: 'r', name: 'Rent' },
];

test('the category picker lists planned categories first, then every other one', () => {
  const groups = categoryGroups(cats, new Set(['r']), '');
  assert.deepEqual(groups.map((g) => [g.label, g.options.map((o) => o.id)]), [
    ['Planned this month', ['r']],
    ['Other categories', ['f', 'g']],
  ]);
});

test('the search narrows every group; nothing planned is one plain list', () => {
  assert.deepEqual(categoryGroups(cats, new Set(['r']), 'gro').map((g) => g.options.map((o) => o.id)), [['g']]);
  assert.deepEqual(categoryGroups(cats, new Set(), '').map((g) => g.label), ['']);
  assert.deepEqual(categoryGroups(cats, null, 'zzz'), []);
});
