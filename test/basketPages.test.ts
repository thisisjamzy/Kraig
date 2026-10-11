// The basket page and its forms: one basket page, its own transactions,
// menus above every card, the item form's layout, and closing a payment
// at what was paid.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(__dirname, '../app/src', path), 'utf8');

test('the item form, saving and creating a basket go to the basket page, never the older /baskets/<id>', () => {
  assert.match(read('forms/BasketItemForm/BasketItemForm.tsx'), /const basketHref = `\/budget\/basket\/\$\{goalId\}`/);
  assert.doesNotMatch(read('logic/bucketDetail/useLogic.ts'), /router\.replace\(`\/baskets\/\$\{goalId\}`\)/);
  assert.doesNotMatch(read('logic/createBucket/useLogic.ts'), /`\/baskets\/\$\{id\}`/);
  assert.match(read('phone/screens/PlanningBucket/PlanningBucketScreen.tsx'), /router\.push\(`\/baskets\/\$\{bucketId\}\/edit`\)/);
});

test("a basket's See all lists only that basket's transactions", () => {
  assert.match(read('logic/planning/useHistoryTab.ts'), /bucket \? all\.filter\(\(r\) => r\.bucketId === bucket\) : all/);
});

test("a basket's transactions show their type in a round icon", () => {
  assert.match(read('phone/screens/PlanningBucket/PlanningBucketScreen.tsx'), /<IconCircle type=\{row\.type\} \/>/);
});

test('action menus open above every card: drawn at the end of the page, fixed', () => {
  assert.match(read('widgets/ActionMenu/ActionMenu.tsx'), /createPortal\(/);
  assert.match(read('widgets/ActionMenu/ActionMenu.module.css'), /position: fixed;/);
});

test('the item form: the title sits behind the cards; Category and Need on rows of their own; no Splittable for trickle income', () => {
  assert.match(read('widgets/FormFrame/FormFrame.module.css'), /\.cards \{\s*position: relative;\s*z-index: 1;/);
  const form = read('forms/BasketItemForm/BasketItemForm.tsx');
  assert.doesNotMatch(form, /<FieldRow>\s*<SelectField\s*label="Category"/);
  assert.match(form, /!trickle && <SwitchField label="Splittable"/);
});

test('a part-paid payment can be closed for the month at what was paid', () => {
  const logic = read('logic/planning/usePaymentsTab.ts');
  assert.match(logic, /async function closeAtPaid/);
  assert.match(logic, /setItemMonthOverride\(uid, payment\.bucketId, payment\.itemId, month, native\)/);
  assert.match(read('phone/screens/Planning/PaymentsTab.tsx'), /payment\.paid > 0 &&/);
});
