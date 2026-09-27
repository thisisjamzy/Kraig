// Buckets — "this month's money plan": expected in vs planned out by kind,
// planned vs actual so far, whether the must-haves are covered, what's
// coming in, and each bucket's section, card line and action. Pure.

import { payable } from './priorities';
import {
  isOpen,
  monthKey,
  r2,
  relevant,
  remaining,
  shiftMonth,
  startOfDay,
  urgency,
  type Kind,
  type Occurrence,
  type Priority,
} from './model';

const sum = (list: Occurrence[], pick: (o: Occurrence) => number) => r2(list.reduce((s, o) => s + pick(o), 0));

/** Available now: income received this month − money spent this month.
 * By month end: plus income still expected this month. */
export function available(occurrences: Occurrence[], receivedThisMonth: number, spentThisMonth: number, today: Date) {
  const month = monthKey(today);
  const now = r2(receivedThisMonth - spentThisMonth);
  const expected = sum(
    occurrences.filter((o) => o.kind === 'income' && o.month === month && isOpen(o)),
    remaining
  );
  return { now, expected, byMonthEnd: r2(now + expected) };
}

export interface MoneyPlan {
  expectedIn: number;
  receivedSoFar: number;
  fixed: number;
  variable: number;
  savings: number;
  plannedOut: number;
  unallocated: number;
  overplanned: boolean;
}

export function moneyPlan(occurrences: Occurrence[], month: string): MoneyPlan {
  const inMonth = occurrences.filter((o) => o.month === month && !o.dropped);
  const byKind = (k: Kind) => sum(inMonth.filter((o) => o.kind === k), (o) => o.planned);
  const expectedIn = byKind('income');
  const fixed = byKind('fixed');
  const variable = byKind('variable');
  const savings = byKind('savings');
  const plannedOut = r2(fixed + variable + savings);
  return {
    expectedIn,
    receivedSoFar: sum(inMonth.filter((o) => o.kind === 'income'), (o) => o.paid),
    fixed,
    variable,
    savings,
    plannedOut,
    unallocated: r2(expectedIn - plannedOut),
    overplanned: plannedOut > expectedIn + 0.5,
  };
}

export interface PlanRowFigures {
  key: 'income' | Exclude<Kind, 'income'> | 'unallocated';
  label: string;
  planned: number;
  soFar: number;
  left: number;
}

export function plannedVsActual(occurrences: Occurrence[], month: string): PlanRowFigures[] {
  const inMonth = occurrences.filter((o) => o.month === month && !o.dropped);
  const row = (key: PlanRowFigures['key'], label: string, kind: Kind): PlanRowFigures => {
    const list = inMonth.filter((o) => o.kind === kind);
    const planned = sum(list, (o) => o.planned);
    const soFar = sum(list, (o) => o.paid);
    return { key, label, planned, soFar, left: r2(planned - soFar) };
  };
  const income = row('income', 'Coming in', 'income');
  const fixed = row('fixed', 'Fixed & recurring', 'fixed');
  const variable = row('variable', 'Variable spending', 'variable');
  const savings = row('savings', 'Savings & goals', 'savings');
  const outPlanned = fixed.planned + variable.planned + savings.planned;
  const outSoFar = fixed.soFar + variable.soFar + savings.soFar;
  const unallocated = {
    key: 'unallocated' as const,
    label: 'Unallocated',
    planned: r2(income.planned - outPlanned),
    soFar: r2(income.soFar - outSoFar),
    left: 0,
  };
  unallocated.left = r2(unallocated.planned - unallocated.soFar);
  return [income, fixed, variable, savings, unallocated];
}

export type CoverStatus = 'covered' | 'tight' | 'short';

export interface MustCoverage {
  status: CoverStatus;
  available: number;
  mustDue: number;
  spare: number;
  rows: { label: string; total: number; paid: number; due: number }[];
}

/** Must-haves due this month (and overdue) against what's available by month end. */
export function mustCoverage(occurrences: Occurrence[], availableByMonthEnd: number, today: Date): MustCoverage {
  const month = monthKey(today);
  const items = occurrences.filter(
    (o) => payable(o) && !o.dropped && (o.month === month || (urgency(o, today) === 'overdue' && isOpen(o) && relevant(o, today)))
  );
  const mustDue = sum(items.filter((o) => o.need === 'must' && isOpen(o)), remaining);
  const spare = r2(availableByMonthEnd - mustDue);
  const status: CoverStatus = spare < 0 ? 'short' : mustDue > 0 && spare < availableByMonthEnd * 0.1 ? 'tight' : 'covered';
  const group = (need: 'must' | 'nice', priority?: Priority) => {
    const list = items.filter((o) => o.need === need && (!priority || o.priority === priority));
    return { total: sum(list, (o) => o.planned), paid: sum(list, (o) => Math.min(o.paid, o.planned)), due: sum(list.filter(isOpen), remaining) };
  };
  return {
    status,
    available: r2(availableByMonthEnd),
    mustDue,
    spare,
    rows: [
      { label: 'Must have · High', ...group('must', 'High') },
      { label: 'Must have · Medium', ...group('must', 'Medium') },
      { label: 'Must have · Low', ...group('must', 'Low') },
      { label: 'Nice to have', ...group('nice') },
    ],
  };
}

export interface IncomeSource {
  key: string;
  name: string;
  bucketName: string;
  due: Date | null;
  amount: number;
  received: number;
  status: 'received' | 'expected' | 'late';
}

export function incomeSources(occurrences: Occurrence[], today: Date): IncomeSource[] {
  const month = monthKey(today);
  return occurrences
    .filter((o) => o.kind === 'income' && o.month === month && !o.dropped)
    .map((o) => ({
      key: o.key,
      name: o.name,
      bucketName: o.bucketName,
      due: o.due,
      amount: o.planned,
      received: o.paid,
      status: (o.paid >= o.planned - 0.5 && o.planned > 0 ? 'received' : o.due && startOfDay(o.due) < startOfDay(today) ? 'late' : 'expected') as IncomeSource['status'],
    }))
    .sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));
}

// ---------------------------------------------------------------------------
// Bucket sections and cards

export type Section = 'fixed' | 'variable' | 'savings' | 'income';

export const SECTION_LABEL: Record<Section, string> = {
  fixed: 'Fixed & recurring',
  variable: 'Variable spending',
  savings: 'Savings & goals',
  income: 'Income',
};

export interface BucketSummary {
  bucketId: string;
  name: string;
  section: Section;
  itemCount: number;
  planned: number;
  spent: number;
  available: number;
  topNeed: 'must' | 'nice' | null;
  line: string;
  overdue: Occurrence[];
}

/**
 * Each bucket's section (by what most of its planned money is) and card
 * figures for a month. Income never decides the section of a bucket that
 * also holds expenses: a recurring bucket with the salary and the bills in
 * it is a fixed-and-recurring bucket, its figures are the bills, and the
 * salary counts only under "Coming in". Only an all-income bucket is Income.
 */
export function bucketSummaries(occurrences: Occurrence[], month: string, today: Date): BucketSummary[] {
  const byBucket = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    if (o.dropped || (o.month !== month && !(urgency(o, today) === 'overdue' && isOpen(o) && relevant(o, today) && o.month < month))) continue;
    byBucket.set(o.bucketId, [...(byBucket.get(o.bucketId) ?? []), o]);
  }
  const out: BucketSummary[] = [];
  for (const [bucketId, all] of byBucket) {
    const inMonth = all.filter((o) => o.month === month);
    const spending = inMonth.filter((o) => o.kind !== 'income');
    const list = spending.length ? spending : inMonth;
    const weight = new Map<Kind, number>();
    for (const o of list) weight.set(o.kind, (weight.get(o.kind) ?? 0) + Math.max(o.planned, 1));
    const kind = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (all.find((o) => o.kind !== 'income') ?? all[0]).kind;
    const planned = sum(list, (o) => o.planned);
    const spent = sum(list, (o) => o.paid);
    let line: string;
    if (kind === 'income') line = `received ${Math.round(spent).toLocaleString('en-US')} of ${Math.round(planned).toLocaleString('en-US')}`;
    else if (kind === 'savings') line = `${Math.round(spent).toLocaleString('en-US')} of ${Math.round(planned).toLocaleString('en-US')} contributed`;
    else if (kind === 'variable') {
      const [y, m] = month.split('-').map(Number);
      const daysLeft = month === monthKey(today) ? new Date(y, m, 0).getDate() - today.getDate() + 1 : 0;
      line = `${planned > 0 ? Math.round((spent / planned) * 100) : 0}% used${daysLeft ? ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : ''}`;
    } else {
      const paidCount = list.filter((o) => o.planned > 0 && o.paid >= o.planned - 0.5).length;
      const next = list.filter(isOpen).filter((o) => o.due).sort((a, b) => a.due!.getTime() - b.due!.getTime())[0];
      line = `${paidCount} of ${list.length} paid${next ? ` · next: ${next.name} on ${next.due!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`;
    }
    out.push({
      bucketId,
      name: all[0].bucketName,
      section: kind,
      itemCount: list.length,
      planned,
      spent,
      available: r2(Math.max(0, planned - spent)),
      topNeed: list.some((o) => o.need === 'must') ? 'must' : list.length ? 'nice' : null,
      line,
      overdue: all.filter((o) => urgency(o, today) === 'overdue' && isOpen(o) && relevant(o, today) && o.kind !== 'income'),
    });
  }
  return out.sort((a, b) => b.planned - a.planned);
}

// ---------------------------------------------------------------------------
// All time: monthly averages

export interface AllTime {
  months: string[];
  averagePlan: MoneyPlan;
  rows: (PlanRowFigures & { monthsOver: number })[];
  onTime: { month: string; share: number | null }[];
}

export function allTime(occurrences: Occurrence[], today: Date, count = 12): AllTime {
  const current = monthKey(today);
  const months = Array.from({ length: count }, (_, i) => shiftMonth(current, i - count + 1)).filter((m) =>
    occurrences.some((o) => o.month === m)
  );
  const plans = months.map((m) => moneyPlan(occurrences, m));
  const avg = (pick: (p: MoneyPlan) => number) => r2(plans.length ? plans.reduce((s, p) => s + pick(p), 0) / plans.length : 0);
  const averagePlan: MoneyPlan = {
    expectedIn: avg((p) => p.expectedIn),
    receivedSoFar: avg((p) => p.receivedSoFar),
    fixed: avg((p) => p.fixed),
    variable: avg((p) => p.variable),
    savings: avg((p) => p.savings),
    plannedOut: avg((p) => p.plannedOut),
    unallocated: avg((p) => p.unallocated),
    overplanned: false,
  };
  averagePlan.overplanned = averagePlan.plannedOut > averagePlan.expectedIn + 0.5;
  const tables = months.map((m) => plannedVsActual(occurrences, m));
  const rows = (tables[0] ?? plannedVsActual([], current)).map((r, i) => {
    const values = tables.map((t) => t[i]);
    const a = (pick: (x: PlanRowFigures) => number) => r2(values.length ? values.reduce((s, x) => s + pick(x), 0) / values.length : 0);
    const monthsOver = r.key === 'income' || r.key === 'unallocated' ? 0 : values.filter((x) => x.soFar > x.planned + 0.5).length;
    return { ...r, planned: a((x) => x.planned), soFar: a((x) => x.soFar), left: a((x) => x.left), monthsOver };
  });
  const onTime = months.map((m) => {
    const must = occurrences.filter((o) => o.month === m && payable(o) && o.need === 'must' && !o.dropped && o.planned > 0);
    if (!must.length || m === current) return { month: m, share: null };
    return { month: m, share: must.filter((o) => o.paid >= o.planned - 0.5).length / must.length };
  });
  return { months, averagePlan, rows, onTime };
}
