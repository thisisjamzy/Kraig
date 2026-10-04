// Finance Insights: each section's one-line takeaway, generated from the
// figures in metrics/breakdowns/forecast. (Its alerts are notifications
// now: src/shared/notifications/rules.ts.) Pure.

import type { UnplannedInsights, MoneyFlow } from './breakdowns';
import type { Forecast } from './forecast';
import type {
  BucketAdherence,
  AccuracyPoint,
  CashFlowPoint,
  DailyHabits,
  IncomeBySource,
  OverspendLog,
  Pace,
  RangeTotals,
} from './metrics';
import type { FinData } from './types';
import { daysInMonth, monthKey, monthName } from './ranges';

export function money(n: number, currency?: string) {
  const v = Math.round(n).toLocaleString('en-US');
  return currency ? `${v} ${currency}` : v;
}

export function pct(x: number, digits = 0) {
  return `${(x * 100).toFixed(digits)}%`;
}

/** This month's category furthest above its 3-month average (> 30%). */
export function growingCategory(data: FinData): { name: string; growth: number; average: number } | null {
  const month = monthKey(data.today);
  const prev = [1, 2, 3].map((i) => {
    const d = new Date(data.today.getFullYear(), data.today.getMonth() - i, 1);
    return monthKey(d);
  });
  const spend = (m: string) => {
    const map = new Map<string, { name: string; amount: number }>();
    for (const t of data.txs) {
      if (t.kind !== 'expense' || t.month !== m) continue;
      const k = t.categoryId ?? 'none';
      const row = map.get(k) ?? { name: t.categoryName, amount: 0 };
      row.amount += t.amount;
      map.set(k, row);
    }
    return map;
  };
  const now = spend(month);
  const before = prev.map(spend);
  let best: { name: string; growth: number; average: number } | null = null;
  for (const [k, row] of now) {
    const average = before.reduce((s, m) => s + (m.get(k)?.amount ?? 0), 0) / 3;
    if (average <= 0) continue;
    const growth = (row.amount - average) / average;
    if (growth > 0.3 && (!best || growth > best.growth)) best = { name: row.name, growth, average };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Takeaways — one plain sentence per section

export function snapshotTakeaway(t: RangeTotals, currency: string): string {
  if (t.expense === 0 && t.income === 0) return 'No money in or out in this period yet.';
  const parts: string[] = [];
  if (t.plannedExpense > 0) {
    const diff = (t.expense - t.plannedExpense) / t.plannedExpense;
    parts.push(Math.abs(diff) < 0.02 ? 'You spent right on plan' : `You spent ${pct(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'} than planned`);
  } else {
    parts.push(`You spent ${money(t.expense, currency)}`);
  }
  if (t.unplanned > 0) parts.push(`${t.plannedExpense > 0 && t.expense < t.plannedExpense ? 'but' : 'and'} ${money(t.unplanned, currency)} of it was unplanned`);
  return `${parts.join(', ')}.`;
}

export function cashFlowTakeaway(points: CashFlowPoint[], currency: string): string {
  const income = points.reduce((s, p) => s + p.income, 0);
  const expense = points.reduce((s, p) => s + p.expense, 0);
  if (!income && !expense) return 'Add a few transactions to see your cash flow.';
  const net = income - expense;
  return net >= 0 ? `You kept ${money(net, currency)} more than you spent.` : `You spent ${money(-net, currency)} more than came in.`;
}

export function paceTakeaway(p: Pace, currency: string): string {
  if (p.planned <= 0) return 'No plan for this month yet, so there’s no pace to compare.';
  if (p.today === 0) return 'This month hasn’t started yet.';
  if (p.overBy > 0) return `At this pace you'll end the month ${money(p.overBy, currency)} over plan.`;
  return `On track: about ${money(-p.overBy, currency)} under plan at month end.`;
}

export function bucketsTakeaway(rows: BucketAdherence[], currency: string): string {
  if (!rows.length) return 'No buckets planned for this period.';
  const over = rows.filter((r) => r.status === 'over');
  if (!over.length) return `All ${rows.length} buckets stayed within plan.`;
  return `${rows.length - over.length} of ${rows.length} buckets within plan; ${over[0].name} is ${money(over[0].actual - over[0].planned, currency)} over.`;
}

export function accuracyTakeaway(points: AccuracyPoint[]): string {
  const judged = points.filter((p) => p.accuracy !== null);
  if (judged.length < 2) return 'Plan a few months to see how accurate your plans are.';
  const avg = judged.reduce((s, p) => s + p.accuracy!, 0) / judged.length;
  const trend = judged[judged.length - 1].accuracy! - judged[0].accuracy!;
  return `Your plans were ${pct(avg)} accurate on average${Math.abs(trend) < 0.03 ? '' : trend > 0 ? ', and getting better' : ', but slipping lately'}.`;
}

export function overspendTakeaway(log: OverspendLog, currency: string): string {
  if (!log.count) return 'No overspends recorded in this period.';
  return `${log.count} ${log.count === 1 ? 'overspend' : 'overspends'} totalling ${money(log.total, currency)}; ${pct(log.later.count / log.count)} found later.`;
}

export function unplannedTakeaway(u: UnplannedInsights, currency: string): string {
  if (u.total <= 0) return 'Everything you spent was in the plan.';
  const kinds = Object.entries(u.byKind).sort((a, b) => b[1] - a[1]);
  const labels: Record<string, string> = { no_budget: 'with no budget at all', added_after: 'budgeted only afterwards', over_plan: 'over an item’s plan' };
  return `${money(u.total, currency)} unplanned (${pct(u.share ?? 0)} of spending), mostly ${labels[kinds[0][0]]}.`;
}

export function forecastTakeaway(f: Forecast, currency: string): string {
  const short = f.months.find((m) => m.gap < 0);
  if (short) return `${monthName(short.month)} looks short by ${money(-short.gap, currency)}.`;
  const free = f.months.reduce((s, m) => s + Math.max(0, m.gap), 0);
  return `About ${money(free, currency)} free over the next ${f.months.length} months${f.lowConfidence ? ' (low confidence)' : ''}.`;
}

export function moneyTakeaway(m: MoneyFlow): string {
  const top = m.byCategory[0];
  if (!top) return 'Add a few transactions to see where your money goes.';
  return `${top.label} took the most: ${pct(top.share)} of spending.`;
}

export function incomeTakeaway(i: IncomeBySource, currency: string): string {
  if (!i.sources.length) return 'No income recorded in this period.';
  const top = i.sources[0];
  const vs = i.projected > 0 ? ` (${Math.round((i.total / i.projected) * 100)}% of the ${money(i.projected, currency)} projected)` : '';
  return `${money(i.total, currency)} received${vs}; ${top.label} brought in the most.`;
}

export function habitsTakeaway(h: DailyHabits, currency: string): string {
  if (!h.highest) return 'No spending in this period yet.';
  return `About ${money(h.average, currency)} a day; the most on ${h.highest.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}.`;
}

// ---- "Needs attention" alerts (the phone Insights screen) ----

export type Severity = 'red' | 'amber' | 'blue';

export interface Alert {
  id: string;
  severity: Severity;
  icon: 'shortfall' | 'pace' | 'unplanned' | 'overspend' | 'overdue' | 'income' | 'savings' | 'later' | 'unassigned' | 'growth' | 'clear';
  headline: string;
  detail: string;
  href: string;
}

export interface AlertInputs {
  data: FinData;
  currency: string;
  totals: RangeTotals;
  forecast: Forecast;
  pace: Pace;
  log: OverspendLog;
  /** Unassigned (no budget) expense transactions this month. */
  unassignedCount: number;
}

export function alerts({ data, currency, totals, forecast, pace, log, unassignedCount }: AlertInputs): Alert[] {
  const out: Alert[] = [];
  const month = monthKey(data.today);
  const history = `/budget?tab=history&month=${month}`;

  // ---- Red ----
  const short = forecast.months.find((m) => m.gap < 0);
  if (short) {
    out.push({
      id: 'shortfall',
      severity: 'red',
      icon: 'shortfall',
      headline: `${monthName(short.month)} looks short by ${money(-short.gap, currency)}`,
      detail: 'Projected expenses and savings are more than projected income.',
      href: '#forecast',
    });
  }
  if (pace.today > 0 && pace.today < daysInMonth(month) && pace.planned > 0 && pace.overBy > 0) {
    out.push({
      id: 'pace',
      severity: 'red',
      icon: 'pace',
      headline: `On pace to overspend by ${money(pace.overBy, currency)}`,
      detail: `At this rate you'll pass this month's plan before ${monthName(month)} ends.`,
      href: '#plan',
    });
  }
  if (totals.unplannedShare !== null && totals.unplannedShare > 0.2) {
    out.push({
      id: 'unplanned',
      severity: 'red',
      icon: 'unplanned',
      headline: `${pct(totals.unplannedShare)} of spending was unplanned`,
      detail: `${money(totals.unplanned, currency)} spent outside the plan this period.`,
      href: '#unplanned',
    });
  }
  const open = data.plan(month).items.filter((i) => i.unexplained > 0);
  if (open.length) {
    const amount = open.reduce((s, i) => s + i.unexplained, 0);
    out.push({
      id: 'overspend',
      severity: 'red',
      icon: 'overspend',
      headline: `${open.length} ${open.length === 1 ? 'overspend needs' : 'overspends need'} covering`,
      detail: `${money(amount, currency)} over plan, not yet covered or justified.`,
      href: `/budget/bucket/${open[0].bucketId}?month=${month}`,
    });
  }
  const overdue = data.payments.filter((p) => p.kind === 'expense' && p.status === 'overdue');
  if (overdue.length) {
    out.push({
      id: 'overdue',
      severity: 'red',
      icon: 'overdue',
      headline: `${overdue.length} planned ${overdue.length === 1 ? 'payment is' : 'payments are'} overdue`,
      detail: `${money(overdue.reduce((s, p) => s + p.amount, 0), currency)} still to pay.`,
      href: `/budget?tab=payments&month=${month}`,
    });
  }

  // ---- Amber ----
  const expectedSoFar = data.payments.filter((p) => p.kind === 'income' && monthKey(p.due) === month && p.due <= data.today).reduce((s, p) => s + p.amount, 0);
  const receivedSoFar = data.txs.filter((t) => t.kind === 'income' && t.month === month).reduce((s, t) => s + t.amount, 0);
  if (expectedSoFar > 0 && receivedSoFar < expectedSoFar * 0.9) {
    out.push({
      id: 'income',
      severity: 'amber',
      icon: 'income',
      headline: `Income is ${pct(1 - receivedSoFar / expectedSoFar)} below what was expected`,
      detail: `${money(receivedSoFar, currency)} received of ${money(expectedSoFar, currency)} due so far.`,
      href: `${history}`,
    });
  }
  if (totals.savingsRate !== null && totals.savingsRate < data.savingsTarget) {
    out.push({
      id: 'savings',
      severity: 'amber',
      icon: 'savings',
      headline: `Saving ${pct(Math.max(0, totals.savingsRate))} of income`,
      detail: `Below your ${pct(data.savingsTarget)} target.`,
      href: '#keycharts',
    });
  }
  if (log.count >= 2 && log.later.count / log.count > 0.5) {
    out.push({
      id: 'later',
      severity: 'amber',
      icon: 'later',
      headline: `${pct(log.later.count / log.count)} of overspends were found late`,
      detail: 'Most were only noticed when reviewing. A quick weekly check helps.',
      href: '#plan',
    });
  }
  if (unassignedCount > 0) {
    out.push({
      id: 'unassigned',
      severity: 'amber',
      icon: 'unassigned',
      headline: `${unassignedCount} ${unassignedCount === 1 ? 'transaction is' : 'transactions are'} waiting for a budget`,
      detail: 'Assign them so this month’s plan is complete.',
      href: `${history}`,
    });
  }
  const growing = growingCategory(data);
  if (growing) {
    out.push({
      id: 'growth',
      severity: 'amber',
      icon: 'growth',
      headline: `${growing.name} is up ${pct(growing.growth)}`,
      detail: `Compared with its 3-month average of ${money(growing.average, currency)}.`,
      href: `${history}`,
    });
  }

  if (!out.length) {
    out.push({ id: 'clear', severity: 'blue', icon: 'clear', headline: 'All clear. You’re within plan.', detail: 'Nothing needs your attention right now.', href: '#snapshot' });
  }
  return out;
}
