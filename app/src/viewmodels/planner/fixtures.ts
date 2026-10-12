// The prototype's sample plan (Remix/Priorities/plan-forecast-reference.html):
// the brief's test data and the development preview. Today is Mon 12 Oct
// 2026 with XAF 110,000.

import { dayFrom as D } from './days';
import type { MoneyInput, PlanItem } from './money';
import type { TimeInput } from './time';

export const PLAN_TODAY = D(2026, 10, 12);

const basket = (id: string): string =>
  ({ income: 'Income', housing: 'Housing and utilities', debt: 'Debt repayments', family: 'Family', food: 'Food', transport: 'Transport', lifestyle: 'Lifestyle and wishes' })[id] ?? id;

const item = (x: Omit<PlanItem, 'basketName'>): PlanItem => ({ ...x, basketName: basket(x.basketId) });

export function moneyFixture(): MoneyInput {
  return {
    today: PLAN_TODAY,
    balance: 110_000,
    items: [
      item({ id: 'salary', name: 'Salary', basketId: 'income', kind: 'income', amount: 350_000, freq: 'monthly', dayOfMonth: 25, confidence: 'Confirmed', priority: 'Must' }),
      item({ id: 'clientA', name: 'Client A milestone', basketId: 'income', kind: 'income', amount: 150_000, freq: 'once', date: D(2026, 10, 23), confidence: 'Expected', priority: 'Must' }),
      item({ id: 'bakery', name: 'Bakery app instalment', basketId: 'income', kind: 'income', amount: 120_000, freq: 'once', date: D(2026, 11, 20), confidence: 'Expected', priority: 'Must' }),
      item({ id: 'bonus', name: 'Year-end bonus', basketId: 'income', kind: 'income', amount: 130_000, freq: 'once', date: D(2026, 12, 20), confidence: 'Expected', priority: 'Must' }),
      item({ id: 'rent', name: 'Rent', basketId: 'housing', kind: 'fixed', amount: 120_000, freq: 'monthly', dayOfMonth: 1, priority: 'Must' }),
      item({ id: 'internet', name: 'Internet', basketId: 'housing', kind: 'fixed', amount: 15_000, freq: 'monthly', dayOfMonth: 5, priority: 'Must' }),
      item({ id: 'eneo', name: 'ENEO electricity', basketId: 'housing', kind: 'fixed', amount: 30_000, freq: 'monthly', dayOfMonth: 15, priority: 'Must' }),
      item({ id: 'water', name: 'Water', basketId: 'housing', kind: 'fixed', amount: 8_000, freq: 'monthly', dayOfMonth: 15, priority: 'Must' }),
      item({ id: 'bank', name: 'Bank loan', basketId: 'debt', kind: 'fixed', amount: 15_000, freq: 'monthly', dayOfMonth: 10, priority: 'Must' }),
      item({ id: 'famloan', name: 'Family loan', basketId: 'debt', kind: 'fixed', amount: 15_000, freq: 'monthly', dayOfMonth: 10, priority: 'Must' }),
      item({ id: 'phone', name: 'Phone instalment', basketId: 'debt', kind: 'fixed', amount: 10_000, freq: 'monthly', dayOfMonth: 10, until: D(2026, 12, 31), priority: 'Must' }),
      item({ id: 'famsup', name: 'Family support', basketId: 'family', kind: 'fixed', amount: 40_000, freq: 'monthly', dayOfMonth: 28, priority: 'Must' }),
      item({ id: 'school', name: 'School fees (sister)', basketId: 'family', kind: 'fixed', amount: 200_000, freq: 'once', date: D(2027, 1, 10), priority: 'Must', fundedByGoalId: 'gSchool' }),
      item({ id: 'groc', name: 'Groceries', basketId: 'food', kind: 'variable', amount: 15_000, freq: 'weekly', weekday: 5, priority: 'Must' }),
      item({ id: 'eatout', name: 'Eating out', basketId: 'food', kind: 'variable', amount: 6_000, freq: 'weekly', weekday: 4, priority: 'Could' }),
      item({ id: 'fuel', name: 'Fuel and taxis', basketId: 'transport', kind: 'variable', amount: 7_000, freq: 'weekly', weekday: 0, priority: 'Should' }),
      item({ id: 'concert', name: 'Concert ticket', basketId: 'lifestyle', kind: 'variable', amount: 25_000, freq: 'once', date: D(2026, 10, 31), priority: 'Could' }),
      item({ id: 'clothes', name: 'New clothes', basketId: 'lifestyle', kind: 'variable', amount: 30_000, freq: 'once', date: D(2026, 11, 14), priority: 'Could' }),
      item({ id: 'gifts', name: 'Christmas gifts', basketId: 'lifestyle', kind: 'variable', amount: 60_000, freq: 'once', date: D(2026, 12, 20), priority: 'Should' }),
      item({ id: 'newphone', name: 'New phone', basketId: 'lifestyle', kind: 'variable', amount: 180_000, freq: 'once', date: null, priority: 'Could' }),
    ],
    goals: [
      { id: 'gEmerg', name: 'Emergency fund', current: 300_000, target: 600_000, deadline: D(2026, 12, 31), monthly: 50_000, day: 26 },
      { id: 'gSchool', name: 'School fees fund', current: 50_000, target: 200_000, deadline: D(2027, 1, 10), monthly: 50_000, day: 26 },
      { id: 'gLaptop', name: 'Laptop', current: 60_000, target: 450_000, deadline: D(2027, 2, 28), monthly: 40_000, day: 26 },
    ],
  };
}

const PROJECT_COLOR: Record<string, string> = {
  'Client A': 'var(--c-primary)',
  'Bakery app': 'var(--c-primary-dark)',
  Proposals: 'var(--c-accent)',
  Admin: '#9ca3af',
  Tax: '#6b7280',
  Learning: 'var(--c-primary-mid)',
};

export function timeFixture(): TimeInput {
  const task = (id: string, name: string, project: string, estimate: number, due: number | null, priority: 'Must' | 'Should' | 'Could') => ({
    id,
    name,
    projectId: project,
    project,
    color: PROJECT_COLOR[project],
    estimate,
    due: due === null ? null : PLAN_TODAY + due,
    priority,
  });
  const meetings: TimeInput['meetings'] = [];
  const recurring = [
    { name: 'Team stand-up', wd: [0, 1, 2, 3], h: 0.5, time: '08:30' },
    { name: 'Weekly team meeting', wd: [0], h: 1, time: '10:00' },
    { name: 'Client A check-in', wd: [1], h: 1.5, time: '14:00' },
    { name: 'Partner calls', wd: [2], h: 1.5, time: '11:00' },
    { name: 'Bakery app sync', wd: [3], h: 1.5, time: '15:00' },
  ];
  for (let d = 0; d < 14; d++) for (const m of recurring) if (m.wd.includes(d % 7)) meetings.push({ id: `${m.name}-${d}`, name: m.name, day: PLAN_TODAY + d, time: m.time, hours: m.h });
  return {
    today: PLAN_TODAY,
    days: 14,
    defaultHours: [8, 8, 8, 8, 8, 0, 0],
    meetings,
    booked: [],
    tasks: [
      task('t1', 'September invoices', 'Admin', 1.5, 1, 'Must'),
      task('t2', 'MTN pitch deck', 'Proposals', 6, 2, 'Must'),
      task('t3', 'Homepage and booking flow', 'Client A', 16, 3, 'Must'),
      task('t4', 'Logistics proposal', 'Proposals', 8, 4, 'Must'),
      task('t5', 'Bookkeeping and inbox', 'Admin', 2, 4, 'Should'),
      task('t6', 'Checkout flow', 'Bakery app', 8, 9, 'Should'),
      task('t7', 'Tax filing prep', 'Tax', 4, 11, 'Should'),
      task('t8', 'React course, module 4', 'Learning', 3, null, 'Could'),
    ],
  };
}
