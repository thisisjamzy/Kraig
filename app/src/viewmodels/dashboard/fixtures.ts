// Sample data for the dashboards: about two years of money and time, the
// same every run (a seeded generator), for the unit tests
// (test/dashboard.test.ts) and the development preview page
// (app/dev/dashboards). Never used by the real dashboards.

import type { FinData, FinMonthPlan, FinTx } from '../finance/types';
import type { TxPlanSplit } from '../finance/classify';
import type { MoneyInput } from './money';
import { timeEntries, type TaskLike, type TimeInput } from './time';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** Wednesday 30 September 2026, 15:10 (the brief's mock "today"). */
export const FIXTURE_NOW = new Date(2026, 8, 30, 15, 10);

export function moneyFixture(now = FIXTURE_NOW): MoneyInput {
  const rand = seeded(42);
  const txs: FinTx[] = [];
  const splits = new Map<string, TxPlanSplit>();
  const start = new Date(now.getFullYear() - 2, now.getMonth(), 1);
  const categories = ['Groceries', 'Transport', 'Rent', 'Eating out', 'Phone and data', 'Electricity'];
  const baskets = [
    { id: 'house', name: 'House', plan: 160_000 },
    { id: 'food', name: 'Food', plan: 90_000 },
    { id: 'transport', name: 'Transport', plan: 45_000 },
    { id: 'fun', name: 'Leisure', plan: 30_000 },
  ];
  let id = 0;
  for (let d = new Date(start); d <= now; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (d.getDate() === 28) {
      txs.push(tx(`i${id++}`, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9), 'income', 380_000 + Math.round(rand() * 120_000), 'Salary', false));
      if (rand() < 0.15) txs.push(tx(`i${id++}`, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 11), 'income', 50_000, 'Loan', true));
    }
    if (d.getDate() === 12 && rand() < 0.6) txs.push(tx(`i${id++}`, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 14), 'income', Math.round(rand() * 80_000) + 20_000, 'Side work', false));
    const count = Math.floor(rand() * 3);
    for (let k = 0; k < count; k++) {
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 7 + Math.floor(rand() * 14), Math.floor(rand() * 60));
      if (at > now) continue;
      const cat = categories[Math.floor(rand() * categories.length)];
      const amount = Math.round(rand() * 9000 + 500);
      const basket = baskets[Math.floor(rand() * baskets.length)];
      const t = tx(`e${id++}`, at, 'expense', amount, cat, false, rand() < 0.75 ? basket.id : null);
      txs.push(t);
      const unplanned = t.link ? (rand() < 0.15 ? amount : 0) : amount;
      splits.set(t.id, { planned: amount - unplanned, noBudget: t.link ? 0 : unplanned, addedAfter: 0, overPlan: t.link ? unplanned : 0, unplanned, kind: unplanned ? (t.link ? 'over_plan' : 'no_budget') : null });
    }
  }
  const plan = (month: string): FinMonthPlan => ({
    month,
    items: baskets.map((b) => {
      const actual = txs.filter((t) => t.kind === 'expense' && t.month === month && t.link?.bucketId === b.id).reduce((s, t) => s + t.amount, 0);
      return { key: `${b.id}@${month}`, bucketId: b.id, bucketName: b.name, itemId: b.id, name: b.name, type: 'Expense' as const, fixed: b.id === 'house', planned: b.plan, available: b.plan, actual, unexplained: 0, createdAt: null };
    }),
    plannedIncome: 450_000,
    plannedExpense: baskets.reduce((s, b) => s + b.plan, 0),
    plannedSavings: 40_000,
  });
  const data: FinData = {
    today: now,
    txs,
    transfers: [{ id: 'tr1', date: new Date(now.getFullYear(), now.getMonth(), 5), month: monthKey(now), amount: 50_000, charges: 1500, savingsFlow: 0 }],
    plan,
    allocations: [],
    justifications: [],
    payments: [{ itemId: 'house', bucketId: 'house', name: 'Rent', amount: 20_000, due: new Date(now.getFullYear(), now.getMonth(), 30), kind: 'expense', status: 'upcoming' }],
    balance: { spending: 297_000, savings: 120_000 },
    savingsTarget: 0.2,
    forecastItems: [],
    firstMonth: monthKey(start),
  };
  const checks = Array.from({ length: 14 }, (_, i) => {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * i - 2, 18);
    return {
      at,
      wallets: [
        { id: 'cash', recorded: 42_000 + i * 500, counted: 42_000 + i * 500 - Math.round(rand() * 4000) },
        { id: 'momo', recorded: 75_000, counted: 75_000 - (rand() < 0.4 ? Math.round(rand() * 3000) : 0) + (rand() < 0.1 ? 2000 : 0) },
        { id: 'bank', recorded: 180_000, counted: 180_000 },
      ],
    };
  });
  return {
    data,
    splits,
    currency: 'XAF',
    wallets: [
      { id: 'bank', name: 'Societe General', type: 'Current Account', balance: 180_000 },
      { id: 'momo', name: 'Orange Money', type: 'Mobile Money', balance: 75_000 },
      { id: 'cash', name: 'Leaderbag', type: 'Cash', balance: 42_000 },
      { id: 'save', name: 'Savings', type: 'Savings Account', balance: 120_000 },
    ],
    debts: [
      { id: 'd1', name: 'Momokash', principal: 200_000, outstanding: 80_000, monthly: 20_000 },
      { id: 'd2', name: 'Uncle loan', principal: 150_000, outstanding: 0, monthly: null },
    ],
    checks,
    savingsGoal: 600_000,
    untrackedTarget: 0.02,
  };
}

function tx(id: string, date: Date, kind: 'income' | 'expense', amount: number, category: string, borrowed: boolean, bucketId: string | null = null): FinTx {
  return {
    id,
    date,
    month: monthKey(date),
    kind,
    amount,
    categoryId: category,
    categoryName: category,
    accountId: 'cash',
    accountName: 'Leaderbag',
    payee: category,
    link: bucketId ? { bucketId, itemId: bucketId, month: monthKey(date) } : null,
    fixed: false,
    savingsFlow: 0,
    debtRepayment: false,
    borrowed,
  };
}

export function timeFixture(now = FIXTURE_NOW): TimeInput {
  const rand = seeded(7);
  const tasks: TaskLike[] = [];
  const start = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const projects = ['p1', 'p2', 'p3', 'p4'];
  let id = 0;
  for (let d = new Date(start); d < new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (d.getDay() === 0) continue;
    const blocks = d.getDay() === 6 ? 1 : 3 + Math.floor(rand() * 2);
    let hour = 9;
    for (let b = 0; b < blocks; b++) {
      const minutes = [30, 45, 60, 90, 120, 150][Math.floor(rand() * 6)];
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, rand() < 0.5 ? 0 : 30);
      const e = new Date(s.getTime() + minutes * 60000);
      const kind = rand();
      tasks.push({
        id: `t${id++}`,
        title: kind < 0.45 ? 'Focus block' : kind < 0.7 ? 'Client call' : kind < 0.9 ? 'Inbox and admin' : 'Errand',
        type: kind < 0.45 ? 'ToDo' : kind < 0.7 ? 'Meeting' : kind < 0.9 ? 'ToDo' : 'Errand',
        mode: kind < 0.45 ? 'blocked' : kind < 0.7 ? 'blocked' : 'free',
        start: s,
        end: e,
        allDay: false,
        done: e <= now,
        cancelled: false,
        completedAt: e <= now ? e : null,
        actualMinutes: null,
        projectId: projects[Math.floor(rand() * projects.length)],
        areaId: rand() < 0.5 ? 'work' : rand() < 0.5 ? 'health' : 'family',
      });
      hour = e.getHours() + 1;
    }
  }
  return {
    entries: timeEntries(tasks, [], now),
    projects: [
      { id: 'p1', name: 'Client A website', start: new Date(2026, 7, 1), end: new Date(2026, 9, 31), done: 12, total: 20 },
      { id: 'p2', name: 'Bakery app', start: new Date(2026, 8, 1), end: new Date(2026, 10, 15), done: 3, total: 14 },
      { id: 'p3', name: 'Tax return', start: new Date(2026, 8, 10), end: new Date(2026, 8, 25), done: 4, total: 6 },
      { id: 'p4', name: 'Garden', start: null, end: null, done: 0, total: 3 },
    ],
    areas: [
      { id: 'work', name: 'Work', weeklyTargetHours: 30 },
      { id: 'health', name: 'Health', weeklyTargetHours: 5 },
      { id: 'family', name: 'Family', weeklyTargetHours: 8 },
      { id: 'learning', name: 'Learning', weeklyTargetHours: 3 },
    ],
    dailyTarget: 8 * 60,
    workStart: 8,
    workEnd: 18,
  };
}
