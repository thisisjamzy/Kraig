// One budget line (an item in one month) as the Budget, Buckets and Bucket
// pages list it: the month's figures plus its status, what's left, and its
// account names. Each flow type is listed on its own, never mixed. Pure.

import { automationLabel, FLOW_TYPES, type FlowType } from '@/src/shared/budget/flow';
import { lineStatus, STATUS_TONE, type LineStatus, type StatusTone } from '@/src/shared/budget/monthTotals';
import type { ItemMonth, MonthBudget } from '@/src/shared/budget/monthBudget';
import type { MonthTotals } from '@/src/shared/budget/monthTotals';
import { coverageOf, type Coverage } from '@/src/shared/budget/coverage';
import { monthTitle } from '@/src/viewmodels/planning';

export interface LineRow extends ItemMonth {
  /** In the line's own flow's words (Received, Paid, Overdue, Saved...). */
  state: LineStatus;
  stateTone: StatusTone;
  /** Planned (with moves) minus actual; never negative for income. */
  left: number;
  accountName: string | null;
  toAccountName: string | null;
  automationText: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lineRows(budget: MonthBudget, today: Date, accountName: (id: string | null) => string | null): Record<FlowType, LineRow[]> {
  const incomeName = (itemId: string) => budget.items.find((i) => i.itemId === itemId)?.name;
  const out = Object.fromEntries(FLOW_TYPES.map((t) => [t, [] as LineRow[]])) as Record<FlowType, LineRow[]>;
  for (const entry of budget.items) {
    const status = lineStatus(entry, today);
    out[entry.type].push({
      ...entry,
      state: status,
      stateTone: STATUS_TONE[status],
      left: entry.type === 'Income' ? r2(Math.max(0, entry.available - entry.actual)) : r2(entry.available - entry.actual),
      accountName: accountName(entry.accountId),
      toAccountName: accountName(entry.toAccountId),
      automationText: automationLabel(entry.automation, incomeName),
    });
  }
  // Soonest first, undated last, then by name.
  for (const type of FLOW_TYPES) {
    out[type].sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) || a.name.localeCompare(b.name));
  }
  return out;
}

/** Must-haves still to pay this month against money actually available. */
export function mustHaves(rows: LineRow[], availableNow: number, availableByMonthEnd: number) {
  const open = rows.filter((r) => r.necessity === 'MustHave' && !r.closed && r.left > 0);
  const due = r2(open.reduce((s, r) => s + r.left, 0));
  return {
    count: open.length,
    due,
    availableNow,
    spareNow: r2(availableNow - due),
    spareByMonthEnd: r2(availableByMonthEnd - due),
    status: availableNow >= due ? ('covered' as const) : availableByMonthEnd >= due ? ('waiting' as const) : ('short' as const),
  };
}

/** Recommended order for paying: overdue, must have / absolute, due date, priority, smaller amount. */
const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
export function compareRecommended(a: LineRow, b: LineRow): number {
  const overdue = (r: LineRow) => r.state === 'Overdue';
  const first = (r: LineRow) => r.necessity === 'MustHave' || r.savingsMode === 'absolute';
  if (overdue(a) !== overdue(b)) return overdue(a) ? -1 : 1;
  if (first(a) !== first(b)) return first(a) ? -1 : 1;
  const due = (r: LineRow) => r.due?.getTime() ?? Infinity;
  if (due(a) !== due(b)) return due(a) - due(b);
  const pa = PRIORITY_RANK[a.priority ?? 'Medium'] ?? 2;
  const pb = PRIORITY_RANK[b.priority ?? 'Medium'] ?? 2;
  if (pa !== pb) return pa - pb;
  return a.left - b.left;
}

/** Open expense and savings lines in recommended order, against money received then income expected. */
export function openCoverage(rows: Record<'Income' | 'Expense' | 'Savings' | 'Transfer', LineRow[]>, availableNowRaw: number) {
  const open = [...rows.Expense, ...rows.Savings].filter((r) => r.left > 0 && !r.closed).sort(compareRecommended);
  const expected = rows.Income.filter((r) => !r.closed && r.available - r.actual > 0).map((r) => ({ name: r.name, amount: r.available - r.actual, due: r.due }));
  const result = coverageOf(open, (r) => r.left, availableNowRaw, expected);
  const byKey = new Map<string, { coverage: Coverage; waitsFor: string | null }>(result.rows.map((c) => [c.line.key, { coverage: c.coverage, waitsFor: c.waitsFor }]));
  return { ...result, byKey };
}

/** Overdue, over plan, or waiting for income. */
export function needsAttention(row: LineRow, coverage?: Map<string, { coverage: Coverage }>): boolean {
  return row.state === 'Overdue' || row.state === 'Late' || row.state === 'Over plan' || coverage?.get(row.key)?.coverage === 'waiting';
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** The Budget page's callout: one or two sentences, no long dashes. */
export function monthSummary(
  month: string,
  totals: MonthTotals,
  coverage: { canPayNow: number; waiting: number; notCovered: number },
  phase: 'past' | 'current' | 'future'
): string {
  const name = monthTitle(month).split(' ')[0];
  const income = `${name} expects ${fmt(totals.income.expected)} in income and has received ${fmt(totals.income.received)}${totals.income.borrowed ? `, of which ${fmt(totals.income.borrowed)} borrowed` : ''}.`;
  const plan =
    totals.leftToPlan >= 0
      ? `${fmt(totals.expenses.planned)} is planned for expenses and ${fmt(totals.savings.planned)} for savings, leaving ${fmt(totals.leftToPlan)} to plan.`
      : `The plan spends ${fmt(-totals.leftToPlan)} more than the income expected.`;
  const waiting =
    phase === 'current' && coverage.waiting + coverage.notCovered > 0
      ? ` ${fmt(coverage.canPayNow)} of what's still due can be paid now; ${fmt(coverage.waiting)} waits for income${coverage.notCovered ? ` and ${fmt(coverage.notCovered)} isn't covered` : ''}.`
      : '';
  return `${income} ${plan}${waiting}`;
}
