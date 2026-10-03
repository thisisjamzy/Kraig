// A month's totals, one set per flow type — the one calculation every
// screen reads (Budget, Buckets, Home, the Ready to pay queue), so they
// can't disagree. Pure; built on buildMonthBudget's output and unit tested
// in test/budgetFlow.test.ts.
//
//   Expected income       = planned income lines (all subtypes)
//   Received income       = income transactions (all subtypes)
//     of which borrowed   = the debt financing part of each
//   Left to plan          = expected income − planned expenses − planned savings
//                           (transfers excluded; transfer fees are expenses)
//   Available now         = received income − spent − saved (never expected income)
//   Available by month end = available now + expected income not received yet (an estimate)

import type { ItemMonth, MonthBudget } from './monthBudget';

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (list: ItemMonth[], pick: (entry: ItemMonth) => number) => r2(list.reduce((total, entry) => total + pick(entry), 0));

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface MonthTotals {
  income: {
    expected: number;
    received: number;
    /** Planned debt financing lines. */
    expectedBorrowed: number;
    /** Debt financing received (linked or not). */
    borrowed: number;
    /** Received minus borrowed — what savings rate and income consistency use. */
    earned: number;
    /** Expected lines not received yet (never negative per line). */
    notYetReceived: number;
    late: number;
  };
  expenses: { planned: number; spent: number; left: number; overdue: number; overPlan: number; fees: number };
  savings: { planned: number; saved: number; withdrawn: number; left: number; overdue: number };
  transfers: { planned: number; moved: number; left: number; overdue: number };
  leftToPlan: number;
  /** Received − spent − saved, floored at 0 for display. */
  availableNow: number;
  /** The same, unfloored: negative when money went out before any came in. */
  availableNowRaw: number;
  availableByMonthEnd: number;
}

export type LineStatus =
  | 'Expected'
  | 'Received'
  | 'Late'
  | 'Partly received'
  | 'Unpaid'
  | 'Paid'
  | 'Overdue'
  | 'Over plan'
  | 'Not saved'
  | 'Partly saved'
  | 'Saved'
  | 'Not moved'
  | 'Moved';

export type StatusTone = 'neutral' | 'good' | 'bad' | 'watch';

export const STATUS_TONE: Record<LineStatus, StatusTone> = {
  Expected: 'neutral',
  Received: 'good',
  Late: 'bad',
  'Partly received': 'watch',
  Unpaid: 'neutral',
  Paid: 'good',
  Overdue: 'bad',
  'Over plan': 'bad',
  'Not saved': 'neutral',
  'Partly saved': 'watch',
  Saved: 'good',
  'Not moved': 'neutral',
  Moved: 'good',
};

function isPastDue(entry: ItemMonth, today: Date) {
  return Boolean(entry.due && startOfDay(entry.due) < startOfDay(today));
}

/** Done with: fully paid/received, or closed for the month. */
function settled(entry: ItemMonth) {
  return entry.closed || (entry.available > 0 && entry.actual >= entry.available - 0.5);
}

/** One line's status in its own flow's words. */
export function lineStatus(entry: ItemMonth, today: Date): LineStatus {
  switch (entry.type) {
    case 'Income':
      if (entry.planned > 0 && entry.actual >= entry.planned - 0.5) return 'Received';
      if (entry.actual > 0) return 'Partly received';
      return isPastDue(entry, today) && !entry.closed ? 'Late' : 'Expected';
    case 'Savings':
      if (settled(entry)) return 'Saved';
      if (entry.actual > 0) return 'Partly saved';
      return isPastDue(entry, today) ? 'Overdue' : 'Not saved';
    case 'Transfer':
      if (settled(entry)) return 'Moved';
      return isPastDue(entry, today) ? 'Overdue' : 'Not moved';
    default:
      if (entry.actual > entry.available + 0.5) return 'Over plan';
      if (settled(entry)) return 'Paid';
      // A variable limit isn't "due" on a day; only fixed bills go overdue.
      return entry.expenseKind !== 'variable' && isPastDue(entry, today) ? 'Overdue' : 'Unpaid';
  }
}

export function monthTotals(budget: MonthBudget, today: Date): MonthTotals {
  const live = budget.items.filter((entry) => !entry.archived || entry.actual !== 0);
  const of = (type: ItemMonth['type']) => live.filter((entry) => entry.type === type);
  const income = of('Income');
  const expenses = of('Expense');
  const savings = of('Savings');
  const transfers = of('Transfer');
  const count = (list: ItemMonth[], status: LineStatus[]) => list.filter((entry) => status.includes(lineStatus(entry, today))).length;

  const expected = sum(income, (entry) => entry.planned);
  const received = r2(budget.actualIncome);
  const borrowed = r2(budget.flows.receivedBorrowed);
  const notYetReceived = sum(
    income.filter((entry) => !entry.closed),
    (entry) => Math.max(0, entry.planned - entry.actual)
  );

  const plannedExpenses = r2(sum(expenses, (entry) => entry.planned) + budget.flows.plannedTransferFees);
  const spent = r2(budget.flows.spent);
  const plannedSavings = sum(savings, (entry) => entry.planned);
  const saved = r2(budget.flows.saved);
  const withdrawn = r2(budget.flows.withdrawn);
  const plannedTransfers = sum(transfers, (entry) => entry.planned);
  const moved = r2(budget.flows.transferred);

  // Withdrawn savings come back into spendable money.
  const availableNowRaw = r2(received - spent - saved + withdrawn);

  return {
    income: {
      expected,
      received,
      expectedBorrowed: sum(
        income.filter((entry) => entry.incomeSubtype === 'debt_financing'),
        (entry) => entry.planned
      ),
      borrowed,
      earned: r2(received - borrowed),
      notYetReceived,
      late: count(income, ['Late']),
    },
    expenses: {
      planned: plannedExpenses,
      spent,
      left: r2(plannedExpenses - spent),
      overdue: count(expenses, ['Overdue']),
      overPlan: count(expenses, ['Over plan']),
      fees: r2(budget.flows.actualTransferFees),
    },
    savings: {
      planned: plannedSavings,
      saved,
      withdrawn,
      left: r2(Math.max(0, plannedSavings - saved)),
      overdue: count(savings, ['Overdue']),
    },
    transfers: {
      planned: plannedTransfers,
      moved,
      left: r2(Math.max(0, plannedTransfers - moved)),
      overdue: count(transfers, ['Overdue']),
    },
    leftToPlan: r2(expected - plannedExpenses - plannedSavings),
    availableNow: Math.max(0, availableNowRaw),
    availableNowRaw,
    availableByMonthEnd: r2(availableNowRaw + notYetReceived),
  };
}

/** Lines of one flow type, never mixed — what each type tab lists. */
export function linesOf(budget: MonthBudget, type: ItemMonth['type']): ItemMonth[] {
  return budget.items.filter((entry) => entry.type === type);
}
