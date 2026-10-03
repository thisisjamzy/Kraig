// Finance Insights — figures for a period: totals and the snapshot tiles,
// safe to spend, cash flow over time, plan vs actual (pace, buckets,
// accuracy, overspend log), income, savings and daily habits. Pure.
// Transfers and budget moves never count as income or expense.

import type { TxPlanSplit } from './classify';
import type { FinData, FinTx } from './types';
import {
  DAY_MS,
  daysInMonth,
  endOfDay,
  inPeriod,
  intervalsFor,
  monthEnd,
  monthKey,
  monthShare,
  monthStart,
  monthsIn,
  shiftMonthKey,
  startOfDay,
  type Granularity,
  type Period,
} from './ranges';

export const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T>(list: T[], pick: (x: T) => number) => list.reduce((s, x) => s + pick(x), 0);

export function txsIn(data: Pick<FinData, 'txs'>, p: { start: Date; end: Date }) {
  return data.txs.filter((t) => inPeriod(t.date, p));
}

// ---------------------------------------------------------------------------
// Totals and snapshot

export interface RangeTotals {
  income: number;
  expense: number;
  savings: number;
  net: number;
  savingsRate: number | null;
  unplanned: number;
  unplannedShare: number | null;
  unplannedByKind: { no_budget: number; added_after: number; over_plan: number };
  projectedIncome: number;
  plannedExpense: number;
  /** Share of budget items that stayed within plan. */
  adherence: number | null;
  itemsWithin: number;
  itemsTotal: number;
}

export function rangeTotals(data: FinData, p: Period, splits: Map<string, TxPlanSplit>): RangeTotals {
  const txs = txsIn(data, p);
  const income = r2(sum(txs.filter((t) => t.kind === 'income'), (t) => t.amount));
  // Savings rate is out of earned income: borrowed money isn't earnings.
  const earned = r2(sum(txs.filter((t) => t.kind === 'income' && !t.borrowed), (t) => t.amount));
  const expense = r2(sum(txs.filter((t) => t.kind === 'expense'), (t) => t.amount));
  const savingsEntries = r2(sum(txs.filter((t) => t.kind === 'savings'), (t) => t.amount));
  // Savings tracked as its own entries; otherwise what moved into savings accounts.
  const savings = savingsEntries > 0 ? savingsEntries : r2(Math.max(0, sum(data.transfers.filter((t) => inPeriod(t.date, p)), (t) => t.savingsFlow)));
  const byKind = { no_budget: 0, added_after: 0, over_plan: 0 };
  for (const t of txs) {
    const s = splits.get(t.id);
    if (!s) continue;
    byKind.no_budget += s.noBudget;
    byKind.added_after += s.addedAfter;
    byKind.over_plan += s.overPlan;
  }
  const unplanned = r2(byKind.no_budget + byKind.added_after + byKind.over_plan);
  let projectedIncome = 0;
  let plannedExpense = 0;
  let itemsWithin = 0;
  let itemsTotal = 0;
  for (const m of monthsIn(p)) {
    const share = monthShare(m, p);
    const plan = data.plan(m);
    projectedIncome += plan.plannedIncome * share;
    plannedExpense += plan.plannedExpense * share;
    if (monthStart(m) > data.today) continue;
    for (const i of plan.items) {
      if (i.type !== 'Expense' || (i.available <= 0 && i.actual <= 0)) continue;
      itemsTotal += 1;
      if (i.actual <= i.available + 0.5) itemsWithin += 1;
    }
  }
  return {
    income,
    expense,
    savings,
    net: r2(income - expense),
    savingsRate: earned > 0 ? (savings > 0 ? savings / earned : (earned - expense) / earned) : null,
    unplanned,
    unplannedShare: expense > 0 ? unplanned / expense : null,
    unplannedByKind: { no_budget: r2(byKind.no_budget), added_after: r2(byKind.added_after), over_plan: r2(byKind.over_plan) },
    projectedIncome: r2(projectedIncome),
    plannedExpense: r2(plannedExpense),
    adherence: itemsTotal ? itemsWithin / itemsTotal : null,
    itemsWithin,
    itemsTotal,
  };
}

/** Relative change, or null with nothing to compare against. */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

export interface SafeToSpend {
  amount: number;
  perDay: number;
  daysLeft: number;
  remainingBudget: number;
  upcoming: number;
}

/** Rest of the current month: remaining planned budget minus planned
 * payments still to come (those are already spoken for). */
export function safeToSpend(data: FinData): SafeToSpend {
  const month = monthKey(data.today);
  const plan = data.plan(month);
  const remainingBudget = sum(plan.items.filter((i) => i.type === 'Expense'), (i) => Math.max(0, i.available - i.actual));
  const upcoming = sum(
    data.payments.filter((p) => p.kind === 'expense' && p.status !== 'paid' && monthKey(p.due) === month),
    (p) => p.amount
  );
  const daysLeft = daysInMonth(month) - data.today.getDate() + 1;
  const amount = Math.max(0, remainingBudget - upcoming);
  return { amount: r2(amount), perDay: r2(amount / daysLeft), daysLeft, remainingBudget: r2(remainingBudget), upcoming: r2(upcoming) };
}

// ---------------------------------------------------------------------------
// Cash flow over time

export interface CashFlowPoint {
  key: string;
  label: string;
  start: Date;
  end: Date;
  income: number;
  expense: number;
  net: number;
  projectedIncome: number;
  plannedExpense: number;
  running: number;
  planned: number;
  unplanned: number;
}

export function cashFlow(data: FinData, p: Period, splits: Map<string, TxPlanSplit>, g?: Granularity): CashFlowPoint[] {
  const intervals = intervalsFor(p, g);
  let running = 0;
  return intervals.map((iv) => {
    const txs = txsIn(data, iv);
    const income = r2(sum(txs.filter((t) => t.kind === 'income'), (t) => t.amount));
    const expense = r2(sum(txs.filter((t) => t.kind === 'expense'), (t) => t.amount));
    const unplanned = r2(sum(txs, (t) => splits.get(t.id)?.unplanned ?? 0));
    let projectedIncome = 0;
    let plannedExpense = 0;
    for (const m of monthsIn(iv)) {
      const share = monthShare(m, iv);
      projectedIncome += data.plan(m).plannedIncome * share;
      plannedExpense += data.plan(m).plannedExpense * share;
    }
    running = r2(running + income - expense);
    return {
      key: iv.key,
      label: iv.label,
      start: iv.start,
      end: iv.end,
      income,
      expense,
      net: r2(income - expense),
      projectedIncome: r2(projectedIncome),
      plannedExpense: r2(plannedExpense),
      running,
      planned: r2(Math.max(0, expense - unplanned)),
      unplanned,
    };
  });
}

// ---------------------------------------------------------------------------
// Plan vs actual

export interface PacePoint {
  day: number;
  actual: number | null;
  ideal: number;
  projected: number | null;
}

export interface Pace {
  month: string;
  planned: number;
  spent: number;
  points: PacePoint[];
  projectedEnd: number;
  /** Projected end minus the plan (> 0 = over). */
  overBy: number;
  /** Day of the month "today" is (the whole month when it's past). */
  today: number;
}

export function spendingPace(data: FinData, month: string): Pace {
  const n = daysInMonth(month);
  const planned = data.plan(month).plannedExpense;
  const spentByDay = new Array(n + 1).fill(0);
  for (const t of data.txs) {
    if (t.kind !== 'expense' || t.month !== month) continue;
    spentByDay[t.date.getDate()] += t.amount;
  }
  const current = monthKey(data.today);
  const todayDay = month < current ? n : month > current ? 0 : data.today.getDate();
  let cumulative = 0;
  const actual: number[] = [];
  for (let d = 1; d <= n; d++) {
    cumulative += spentByDay[d];
    actual[d] = r2(cumulative);
  }
  const spent = todayDay > 0 ? actual[todayDay] : 0;
  const daily = todayDay > 0 ? spent / todayDay : 0;
  const projectedEnd = r2(spent + daily * (n - todayDay));
  const points: PacePoint[] = [];
  for (let d = 1; d <= n; d++) {
    points.push({
      day: d,
      actual: d <= todayDay ? actual[d] : null,
      ideal: r2((planned * d) / n),
      projected: d >= todayDay && todayDay > 0 && todayDay < n ? r2(spent + daily * (d - todayDay)) : null,
    });
  }
  return { month, planned: r2(planned), spent: r2(spent), points, projectedEnd, overBy: r2(projectedEnd - planned), today: todayDay };
}

export interface BucketAdherence {
  bucketId: string;
  name: string;
  planned: number;
  actual: number;
  status: 'within' | 'over' | 'unused';
  used: number; // actual / planned
}

export function bucketAdherence(data: FinData, p: Period): BucketAdherence[] {
  const rows = new Map<string, BucketAdherence>();
  for (const m of monthsIn(p)) {
    const share = monthShare(m, p);
    for (const i of data.plan(m).items) {
      if (i.type !== 'Expense') continue;
      const row = rows.get(i.bucketId) ?? { bucketId: i.bucketId, name: i.bucketName, planned: 0, actual: 0, status: 'within', used: 0 };
      row.planned += i.available * share;
      rows.set(i.bucketId, row);
    }
  }
  for (const t of txsIn(data, p)) {
    if (t.kind !== 'expense' || !t.link) continue;
    const row = rows.get(t.link.bucketId);
    if (row) row.actual += t.amount;
  }
  return [...rows.values()]
    .map((row) => {
      const planned = r2(row.planned);
      const actual = r2(row.actual);
      return {
        ...row,
        planned,
        actual,
        used: planned > 0 ? actual / planned : actual > 0 ? Infinity : 0,
        status: (actual > planned + 0.5 ? 'over' : actual <= 0 && planned > 0 ? 'unused' : 'within') as BucketAdherence['status'],
      };
    })
    .filter((row) => row.planned > 0 || row.actual > 0)
    .sort((a, b) => b.actual - b.planned - (a.actual - a.planned) || b.used - a.used);
}

export interface AccuracyPoint {
  month: string;
  planned: number;
  actual: number;
  accuracy: number | null;
}

export function planAccuracy(data: FinData, p: Period): AccuracyPoint[] {
  const current = monthKey(data.today);
  return monthsIn(p)
    .filter((m) => m <= current)
    .map((m) => {
      const planned = data.plan(m).plannedExpense;
      const actual = sum(data.txs.filter((t) => t.kind === 'expense' && t.month === m), (t) => t.amount);
      return {
        month: m,
        planned: r2(planned),
        actual: r2(actual),
        accuracy: planned > 0 ? Math.max(0, 1 - Math.abs(actual - planned) / planned) : null,
      };
    });
}

export interface OverspendLog {
  count: number;
  total: number;
  conscious: { count: number; amount: number };
  later: { count: number; amount: number };
  reasons: { reason: string; count: number; amount: number }[];
  coveredBy: { source: string; amount: number }[];
  avoidable: number;
}

export function overspendLog(data: FinData, p: Period): OverspendLog {
  const months = new Set(monthsIn(p));
  const list = data.justifications.filter((j) => months.has(j.month));
  const reasons = new Map<string, { count: number; amount: number }>();
  const covered = new Map<string, number>([['other_budgets', 0]]);
  for (const j of list) {
    const r = reasons.get(j.reason) ?? { count: 0, amount: 0 };
    r.count += 1;
    r.amount += j.overspend;
    reasons.set(j.reason, r);
    covered.set('other_budgets', (covered.get('other_budgets') ?? 0) + j.covered);
    for (const e of j.external) covered.set(e.source === 'not_covered' ? 'uncovered' : e.source, (covered.get(e.source === 'not_covered' ? 'uncovered' : e.source) ?? 0) + e.amount);
  }
  const part = (later: boolean) => {
    const xs = list.filter((j) => (j.awareness === 'discovered_later') === later);
    return { count: xs.length, amount: r2(sum(xs, (j) => j.overspend)) };
  };
  return {
    count: list.length,
    total: r2(sum(list, (j) => j.overspend)),
    conscious: part(false),
    later: part(true),
    reasons: [...reasons.entries()].map(([reason, v]) => ({ reason, count: v.count, amount: r2(v.amount) })).sort((a, b) => b.count - a.count || b.amount - a.amount),
    coveredBy: [...covered.entries()].filter(([, a]) => a > 0).map(([source, amount]) => ({ source, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
    avoidable: r2(sum(list.filter((j) => j.avoidability !== 'unavoidable'), (j) => j.overspend)),
  };
}

// ---------------------------------------------------------------------------
// Monthly history (used by income, savings and the forecast)

/** The `count` whole months before `month` (oldest first). */
export function previousMonths(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonthKey(month, i - count));
}

export function monthTotal(data: Pick<FinData, 'txs'>, month: string, kind: FinTx['kind'], pick?: (t: FinTx) => boolean) {
  return r2(sum(data.txs.filter((t) => t.kind === kind && t.month === month && (!pick || pick(t))), (t) => t.amount));
}

/** Months with any transaction in the last `count` whole months. */
export function historyMonths(data: FinData, count = 6): string[] {
  const months = previousMonths(monthKey(data.today), count);
  return months.filter((m) => data.firstMonth !== null && m >= data.firstMonth);
}

// ---------------------------------------------------------------------------
// Income by source (the trend and consistency live in the Key charts)

export interface IncomeSource {
  key: string;
  label: string;
  received: number;
  share: number;
  count: number;
}

export interface IncomeBySource {
  sources: IncomeSource[];
  total: number;
  projected: number;
}

export function incomeBySource(data: FinData, p: Period): IncomeBySource {
  const txs = txsIn(data, p).filter((t) => t.kind === 'income' && t.amount > 0);
  const rows = new Map<string, IncomeSource>();
  for (const t of txs) {
    const key = t.categoryId ?? 'none';
    const row = rows.get(key) ?? { key, label: t.categoryName, received: 0, share: 0, count: 0 };
    row.received += t.amount;
    row.count += 1;
    rows.set(key, row);
  }
  const total = sum(txs, (t) => t.amount);
  let projected = 0;
  for (const m of monthsIn(p)) projected += data.plan(m).plannedIncome * monthShare(m, p);
  return {
    sources: [...rows.values()].map((r) => ({ ...r, received: r2(r.received), share: total ? r.received / total : 0 })).sort((a, b) => b.received - a.received),
    total: r2(total),
    projected: r2(projected),
  };
}

// ---------------------------------------------------------------------------
// Daily habits (Week and Month)

export interface DailyHabits {
  days: { date: Date; amount: number; unplannedHeavy: boolean; future: boolean }[];
  average: number;
  highest: { date: Date; amount: number } | null;
  byWeekday: { day: string; amount: number }[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function dailyHabits(data: FinData, p: Period, splits: Map<string, TxPlanSplit>): DailyHabits {
  const days: DailyHabits['days'] = [];
  const weekday = new Array(7).fill(0);
  const todayEnd = endOfDay(data.today);
  for (let d = startOfDay(p.start); d <= p.end; d = new Date(d.getTime() + DAY_MS)) {
    const day = { start: d, end: endOfDay(d) };
    const txs = txsIn(data, day).filter((t) => t.kind === 'expense');
    const amount = r2(sum(txs, (t) => t.amount));
    const unplanned = sum(txs, (t) => splits.get(t.id)?.unplanned ?? 0);
    days.push({ date: d, amount, unplannedHeavy: amount > 0 && unplanned / amount > 0.5, future: d > todayEnd });
    weekday[(d.getDay() + 6) % 7] += amount;
  }
  const elapsed = days.filter((d) => !d.future);
  const highest = elapsed.reduce<DailyHabits['highest']>((best, d) => (d.amount > (best?.amount ?? 0) ? { date: d.date, amount: d.amount } : best), null);
  return {
    days,
    average: elapsed.length ? r2(sum(elapsed, (d) => d.amount) / elapsed.length) : 0,
    highest,
    byWeekday: WEEKDAYS.map((day, i) => ({ day, amount: r2(weekday[i]) })),
  };
}

export { monthEnd, monthStart };
