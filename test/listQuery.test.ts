// Notion-style filter and sort engine (app/src/shared/listQuery/engine.ts)
// — the brief's test cases 1 to 6 (7 is the sticky toolbar, a UI check).
// Run: npx tsx --test test/listQuery.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyQuery,
  countRules,
  deserialize,
  EMPTY_QUERY,
  evaluateRule,
  isMissing,
  serialize,
  sortItems,
  type FieldDef,
  type ListQuery,
} from '../app/src/shared/listQuery/engine';

const now = new Date(2026, 8, 16, 12); // Wed 16 Sep 2026

// ---- Tasks ----
interface Task {
  name: string;
  status: string;
  importance: string;
  date: Date | null;
  start: number | null; // minutes from midnight
}
const taskFields: FieldDef<Task>[] = [
  { id: 'name', label: 'Name', type: 'text', get: (t) => t.name, searchable: true },
  {
    id: 'status',
    label: 'Status',
    type: 'select',
    get: (t) => t.status,
    options: [
      { value: 'pending', label: 'Pending' },
      { value: 'done', label: 'Done' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
  },
  {
    id: 'importance',
    label: 'Importance',
    type: 'select',
    get: (t) => t.importance,
    options: [
      { value: 'do', label: 'Do first' },
      { value: 'schedule', label: 'Schedule' },
      { value: 'delegate', label: 'Delegate' },
      { value: 'eliminate', label: 'Eliminate' },
    ],
  },
  { id: 'date', label: 'Date', type: 'date', get: (t) => t.date },
  { id: 'start', label: 'Start time', type: 'time', get: (t) => t.start },
];
const d = (day: number) => new Date(2026, 8, day);
const tasks: Task[] = [
  { name: 'A', status: 'pending', importance: 'schedule', date: d(20), start: 9 * 60 },
  { name: 'B', status: 'pending', importance: 'do', date: d(18), start: 14 * 60 },
  { name: 'C', status: 'done', importance: 'do', date: d(17), start: 8 * 60 },
  { name: 'D', status: 'pending', importance: 'eliminate', date: d(15), start: 7 * 60 },
  { name: 'E', status: 'pending', importance: 'do', date: null, start: null },
  { name: 'F', status: 'pending', importance: 'schedule', date: d(19), start: 10 * 60 },
];

const case1: ListQuery = {
  ...EMPTY_QUERY,
  filters: [
    { id: 'f1', kind: 'rule', field: 'status', op: 'is', value: ['pending'] },
    { id: 'f2', kind: 'rule', field: 'importance', op: 'any_of', value: ['do', 'schedule'] },
  ],
  sorts: [{ id: 's1', field: 'date', dir: 'asc' }],
};

test('1. status pending AND importance any of (do first, schedule), date ascending', () => {
  const out = applyQuery(tasks, case1, taskFields, now).map((t) => t.name);
  // Earliest first; E has no date so it's last.
  assert.deepEqual(out, ['B', 'F', 'A', 'E']);
});

test('2. a second sort (start time) dragged above date re-sorts by start time first', () => {
  const q: ListQuery = { ...case1, sorts: [{ id: 's2', field: 'start', dir: 'asc' }, ...case1.sorts] };
  assert.deepEqual(
    applyQuery(tasks, q, taskFields, now).map((t) => t.name),
    ['A', 'F', 'B', 'E']
  );
});

test('importance sorts by quadrant rank, not alphabetically; empty values last both ways', () => {
  const byImportance = sortItems(tasks, [{ id: 's', field: 'importance', dir: 'asc' }], taskFields).map((t) => t.importance);
  assert.deepEqual(byImportance, ['schedule', 'do', 'do', 'do', 'schedule', 'eliminate'].sort((a, b) => ['do', 'schedule', 'delegate', 'eliminate'].indexOf(a) - ['do', 'schedule', 'delegate', 'eliminate'].indexOf(b)));
  const desc = sortItems(tasks, [{ id: 's', field: 'date', dir: 'desc' }], taskFields).map((t) => t.name);
  assert.equal(desc[desc.length - 1], 'E');
});

// ---- Projects ----
interface Project {
  name: string;
  deadline: Date | null;
  progress: number;
}
const projectFields: FieldDef<Project>[] = [
  { id: 'name', label: 'Name', type: 'text', get: (p) => p.name },
  { id: 'deadline', label: 'Deadline', type: 'date', get: (p) => p.deadline },
  { id: 'progress', label: 'Progress', type: 'number', get: (p) => p.progress },
];

test('3. projects: deadline within the next 7 days, progress low to high', () => {
  const projects: Project[] = [
    { name: 'Soon, far along', deadline: d(20), progress: 80 },
    { name: 'Later', deadline: d(30), progress: 10 },
    { name: 'Soon, barely started', deadline: d(22), progress: 5 },
    { name: 'Past', deadline: d(10), progress: 50 },
  ];
  const out = applyQuery(
    projects,
    {
      ...EMPTY_QUERY,
      filters: [{ id: 'f', kind: 'rule', field: 'deadline', op: 'within', value: { preset: 'next_7_days' } }],
      sorts: [{ id: 's', field: 'progress', dir: 'asc' }],
    },
    projectFields,
    now
  ).map((p) => p.name);
  assert.deepEqual(out, ['Soon, barely started', 'Soon, far along']);
});

// ---- Transactions ----
interface Tx {
  name: string;
  amount: number;
  direction: string;
  bucket: string | null;
  method: string;
}
const txFields: FieldDef<Tx>[] = [
  { id: 'amount', label: 'Amount', type: 'currency', get: (t) => t.amount },
  {
    id: 'direction',
    label: 'Direction',
    type: 'select',
    get: (t) => t.direction,
    options: ['income', 'expense', 'savings', 'transfer'].map((v) => ({ value: v, label: v })),
  },
  {
    id: 'bucket',
    label: 'Bucket',
    type: 'select',
    get: (t) => t.bucket,
    options: ['Transport', 'Meals', 'Rent'].map((v) => ({ value: v, label: v })),
  },
  {
    id: 'method',
    label: 'Payment method',
    type: 'select',
    get: (t) => t.method,
    options: ['Orange Money', 'MTN Mobile Money', 'Cash'].map((v) => ({ value: v, label: v })),
  },
];
const txs: Tx[] = [
  { name: 'Taxi', amount: 12000, direction: 'expense', bucket: 'Transport', method: 'MTN Mobile Money' },
  { name: 'Lunch', amount: 8000, direction: 'expense', bucket: 'Meals', method: 'MTN Mobile Money' },
  { name: 'Dinner', amount: 15000, direction: 'expense', bucket: 'Meals', method: 'Orange Money' },
  { name: 'Salary', amount: 900000, direction: 'income', bucket: null, method: 'MTN Mobile Money' },
  { name: 'Rent', amount: 120000, direction: 'expense', bucket: 'Rent', method: 'MTN Mobile Money' },
];

test('4. expense AND amount > 10,000, amount high to low', () => {
  const out = applyQuery(
    txs,
    {
      ...EMPTY_QUERY,
      filters: [
        { id: 'a', kind: 'rule', field: 'direction', op: 'is', value: ['expense'] },
        { id: 'b', kind: 'rule', field: 'amount', op: 'gt', value: 10000 },
      ],
      sorts: [{ id: 's', field: 'amount', dir: 'desc' }],
    },
    txFields,
    now
  ).map((t) => t.name);
  assert.deepEqual(out, ['Rent', 'Dinner', 'Taxi']);
});

test('5. advanced: (bucket is Transport OR bucket is Meals) AND method is MTN Mobile Money', () => {
  const q: ListQuery = {
    ...EMPTY_QUERY,
    advanced: {
      id: 'g',
      kind: 'group',
      conj: 'and',
      rules: [
        {
          id: 'g2',
          kind: 'group',
          conj: 'or',
          rules: [
            { id: 'r1', kind: 'rule', field: 'bucket', op: 'is', value: ['Transport'] },
            { id: 'r2', kind: 'rule', field: 'bucket', op: 'is', value: ['Meals'] },
          ],
        },
        { id: 'r3', kind: 'rule', field: 'method', op: 'is', value: ['MTN Mobile Money'] },
      ],
    },
  };
  assert.deepEqual(
    applyQuery(txs, q, txFields, now).map((t) => t.name),
    ['Taxi', 'Lunch']
  );
  assert.equal(countRules(q.advanced), 3);
});

test('6. a query survives saving and restoring', () => {
  const q: ListQuery = { ...case1, search: 'b', advanced: null };
  const back = deserialize(serialize(q));
  assert.deepEqual(back, q);
  assert.deepEqual(applyQuery(tasks, back!, taskFields, now), applyQuery(tasks, q, taskFields, now));
  assert.equal(deserialize('not json'), null);
});

test('empty and missing rules filter nothing; missing ones are flagged', () => {
  const empty = { id: 'x', kind: 'rule' as const, field: 'status', op: 'any_of' as const, value: [] };
  assert.equal(evaluateRule(tasks[2], empty, taskFields, now), true);
  const gone = { id: 'y', kind: 'rule' as const, field: 'status', op: 'is' as const, value: ['archived-project'] };
  assert.equal(isMissing(gone, taskFields), true);
  assert.equal(applyQuery(tasks, { ...EMPTY_QUERY, filters: [gone] }, taskFields, now).length, tasks.length);
});
