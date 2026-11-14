import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardWrite } from '../app/src/shared/firestore/writeGuard';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a double submit while the first is in flight writes once', async () => {
  let writes = 0;
  const create = guardWrite('t1', async (uid: string, input: { name: string; due: Date }) => {
    writes++;
    await tick(20);
    return `${uid}-${input.name}-${writes}`;
  });
  const due = new Date('2026-11-14');
  const [a, b] = await Promise.all([create('u', { name: 'Rent', due }), create('u', { name: 'Rent', due: new Date(due) })]);
  assert.equal(writes, 1);
  assert.equal(a, b);
});

test('a repeat right after success returns the same id', async () => {
  let writes = 0;
  const create = guardWrite('t2', async (name: string) => `${name}-${++writes}`);
  const first = await create('Food');
  const again = await create('Food');
  assert.equal(writes, 1);
  assert.equal(first, again);
});

test('different arguments are never merged', async () => {
  let writes = 0;
  const create = guardWrite('t3', async (input: { amount: number }) => ++writes + input.amount);
  await Promise.all([create({ amount: 1 }), create({ amount: 2 })]);
  assert.equal(writes, 2);
});

test('a failed write can be retried at once', async () => {
  let calls = 0;
  const create = guardWrite('t4', async () => {
    if (++calls === 1) throw new Error('offline');
    return 'ok';
  });
  await assert.rejects(create());
  assert.equal(await create(), 'ok');
  assert.equal(calls, 2);
});

test('key order does not matter', async () => {
  let writes = 0;
  const create = guardWrite('t5', async (_input: Record<string, number>) => ++writes);
  await create({ a: 1, b: 2 });
  await create({ b: 2, a: 1 });
  assert.equal(writes, 1);
});
