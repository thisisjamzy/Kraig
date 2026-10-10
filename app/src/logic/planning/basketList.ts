// The month's baskets as one grouped list (Income, Expenses, Savings,
// Transfers; empty groups left out), each row with the one line its kind
// calls for ("8 of 9 paid", "61,560 left", "Saved 27,000 of 120,000") and
// used / planned. Shared by the phone Budget tab and Baskets screen so the
// two lists can't differ. Also the month summary and the "Needs you" line.
// Every figure comes from the shared calculation (monthBudget.ts,
// monthTotals.ts, itemKinds.ts).

import { FLOW_LABEL, FLOW_TYPES, type FlowType } from '@/src/shared/budget/flow';
import { basketMonthView } from '@/src/shared/budget/itemKinds';
import type { MonthBudget } from '@/src/shared/budget/monthBudget';
import type { MonthTotals } from '@/src/shared/budget/monthTotals';
import type { FirestoreBucket } from '@/src/shared/firestore/types';
import type { MonthPayment } from './usePaymentsTab';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface BasketListRow {
  id: string;
  name: string;
  type: FlowType;
  line: string;
  used: number;
  planned: number;
  /** A real problem: overdue payments or over plan. */
  problem: boolean;
  /** 0 to 1, for the thin line under the row. */
  progress: number;
  archived: boolean;
  /** Nothing planned in it this month. */
  empty: boolean;
  /** A Fixed basket (set bills), or Variable (spent through the month). */
  fixed: boolean;
}

export type BasketKindFilter = 'all' | 'fixed' | 'variable';

/** Only the Fixed or Variable baskets, with each group's totals redone. */
export function filterBaskets(groups: BasketListGroup[], filter: BasketKindFilter): BasketListGroup[] {
  if (filter === 'all') return groups;
  return groups
    .map((g) => {
      const rows = g.rows.filter((r) => r.fixed === (filter === 'fixed'));
      return { ...g, rows, planned: r2(rows.reduce((s, r) => s + r.planned, 0)), used: r2(rows.reduce((s, r) => s + r.used, 0)) };
    })
    .filter((g) => g.rows.length > 0);
}

/** The Baskets card: what's planned, used and left across the listed baskets. */
export function basketsSummary(groups: BasketListGroup[]) {
  const rows = groups.flatMap((g) => g.rows);
  const planned = r2(rows.reduce((s, r) => s + r.planned, 0));
  const used = r2(rows.reduce((s, r) => s + r.used, 0));
  return { planned, used, left: r2(planned - used), count: rows.length, problems: rows.filter((r) => r.problem).length };
}

export interface BasketListGroup {
  type: FlowType;
  label: string;
  planned: number;
  used: number;
  rows: BasketListRow[];
}

/**
 * `includeEmpty`: also list baskets with nothing this month (the Baskets
 * screen); the Budget tab lists only what's in the month.
 */
export function basketList(
  budget: MonthBudget,
  buckets: (Pick<FirestoreBucket, 'id' | 'name' | 'type' | 'archived'> & Partial<Pick<FirestoreBucket, 'kind'>>)[],
  today: Date,
  includeEmpty = false
): BasketListGroup[] {
  const groups = new Map(budget.buckets.map((g) => [g.bucketId, g]));
  const rows: BasketListRow[] = [];
  for (const bucket of buckets) {
    const group = groups.get(bucket.id);
    if (!group && (bucket.archived || !includeEmpty)) continue;
    const type = (bucket.type ?? 'Expense') as FlowType;
    if (!group) {
      rows.push({ id: bucket.id, name: bucket.name, type, line: 'Nothing planned this month', used: 0, planned: 0, problem: false, progress: 0, archived: Boolean(bucket.archived), empty: true, fixed: bucket.kind === 'Fixed' });
      continue;
    }
    const view = basketMonthView(group, today);
    rows.push({
      id: bucket.id,
      name: bucket.name,
      type,
      line: view.line,
      used: view.used,
      planned: view.planned,
      problem: view.problem,
      progress: view.planned > 0 ? Math.max(0, Math.min(1, view.used / view.planned)) : view.used > 0 ? 1 : 0,
      archived: group.archived,
      empty: false,
      fixed: bucket.kind === 'Fixed',
    });
  }
  return FLOW_TYPES.map((type) => {
    const list = rows.filter((r) => r.type === type).sort((a, b) => Number(a.empty) - Number(b.empty) || b.planned - a.planned || a.name.localeCompare(b.name));
    return {
      type,
      label: FLOW_LABEL[type],
      planned: r2(list.reduce((s, r) => s + r.planned, 0)),
      used: r2(list.reduce((s, r) => s + r.used, 0)),
      rows: list,
    };
  }).filter((g) => g.rows.length > 0);
}

export interface MonthSummary {
  comingIn: number;
  plannedOut: number;
  /** Positive: income not yet planned. Negative: planned beyond income. */
  unplanned: number;
  overPlanned: boolean;
  /** Planned out against income, 0 to 1 (1 when over). */
  fill: number;
}

/** Coming in against planned out (expenses and savings; transfers move money, they don't spend it). */
export function monthSummary(totals: MonthTotals): MonthSummary {
  const comingIn = totals.income.expected;
  const plannedOut = r2(totals.expenses.planned + totals.savings.planned);
  const unplanned = r2(totals.leftToPlan);
  return {
    comingIn,
    plannedOut,
    unplanned,
    overPlanned: unplanned < -0.5,
    fill: comingIn > 0 ? Math.min(1, plannedOut / comingIn) : plannedOut > 0 ? 1 : 0,
  };
}

/** The one "Needs you" line, or null when nothing does. */
export function needsYou(payments: MonthPayment[], groups: BasketListGroup[]): { text: string; amount: number | null; target: 'payments' | 'baskets' } | null {
  const overdue = payments.filter((p) => p.status === 'overdue');
  if (overdue.length) {
    return {
      text: `${overdue.length} ${overdue.length === 1 ? 'payment' : 'payments'} overdue`,
      amount: r2(overdue.reduce((s, p) => s + (p.remaining || p.amount), 0)),
      target: 'payments',
    };
  }
  const over = groups.flatMap((g) => g.rows).filter((r) => r.problem);
  if (over.length) return { text: `${over.length} ${over.length === 1 ? 'basket needs' : 'baskets need'} a look`, amount: null, target: 'baskets' };
  return null;
}
