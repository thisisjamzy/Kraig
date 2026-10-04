// Plan and forecast: the forecast engine. A running balance day by day from
// today to the end of the horizon: cash in spending accounts today (plus any
// savings wallet marked "Usable for the plan"), plus dated income, minus
// dated expenses, savings contributions and transfer fees, with flexible
// spending spread evenly over the days of its month. Transfers between the
// household's own accounts never appear: only their fees, as expenses.
//
// Out: the daily balance, monthly totals by type, each month's lowest point
// and its date, cushion breaches, free money per month and the daily
// flexible allowance. Pure and fast (12 months in well under 50ms), tested
// in test/planEngine.test.ts. Used by the page with the draft applied, and
// by the notification rules with the applied plan only.

import type { PlanLine } from './planDraft';

export type EngineScenario = 'cautious' | 'expected' | 'optimistic';

export interface EngineIncome {
  key: string;
  name: string;
  month: string;
  date: Date;
  /** Still expected (what's left of it in the current month). */
  amount: number;
  received: boolean;
  /** Irregular income: the lowest and highest of the last 6 months (Cautious and Optimistic use them). */
  range?: { low: number; high: number } | null;
}

export interface EngineInput {
  today: Date;
  /** yyyy-MM, first to last, the current month first. */
  months: string[];
  startBalance: number;
  income: EngineIncome[];
  /** Scheduled outflows: lines with a month. Unscheduled (backlog) lines are ignored. */
  lines: Pick<PlanLine, 'key' | 'name' | 'kind' | 'need' | 'month' | 'due' | 'amount'>[];
  /** Transfer fees, as expenses on their date. */
  fees: { date: Date; amount: number }[];
  scenario: EngineScenario;
  cushion: number;
}

export interface EngineDay {
  key: string;
  date: Date;
  balance: number;
  income: number;
  out: number;
  events: { name: string; amount: number }[];
}

export interface EngineMonth {
  month: string;
  income: number;
  fixed: number;
  /** Flexible (variable) spending and nice-to-have items. */
  flexible: number;
  savings: number;
  fees: number;
  /** income - everything scheduled. */
  free: number;
  /** income - must-have outflows. */
  freeAfterMustHaves: number;
  lowest: number;
  lowestDate: Date;
  endBalance: number;
  /** Flexible spending per day in that month. */
  dailyFlexible: number;
}

export interface EngineResult {
  days: EngineDay[];
  months: EngineMonth[];
  lowest: { balance: number; date: Date };
  breaches: { month: string; lowest: number; date: Date; belowZero: boolean }[];
}

/** Flexible spending under each scenario. */
export const FLEX_FACTOR: Record<EngineScenario, number> = { cautious: 1.1, expected: 1, optimistic: 0.95 };

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** The day a line lands: its due date, else the 15th, never before today. */
export function landingDay(line: { month: string | null; due: Date | null }, today: Date): Date | null {
  if (!line.month) return null;
  const [y, m] = line.month.split('-').map(Number);
  let d = line.due && monthOf(line.due) === line.month ? line.due : new Date(y, m - 1, Math.min(15, daysIn(line.month)));
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (d < t) d = t;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function incomeAmount(i: EngineIncome, scenario: EngineScenario): number {
  if (!i.range || i.received) return i.amount;
  if (scenario === 'cautious') return Math.min(i.amount, i.range.low);
  if (scenario === 'optimistic') return Math.max(i.amount, i.range.high);
  return i.amount;
}

export function runEngine(input: EngineInput): EngineResult {
  const { today, months, scenario, cushion } = input;
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const first = months[0];
  const last = months[months.length - 1];
  const [ly, lm] = last.split('-').map(Number);
  const end = new Date(ly, lm, 0);
  const inHorizon = new Set(months);

  // Point events by day.
  const byDay = new Map<string, { income: number; out: number; events: { name: string; amount: number }[] }>();
  const at = (d: Date) => {
    const k = dayKeyOf(d);
    let e = byDay.get(k);
    if (!e) {
      e = { income: 0, out: 0, events: [] };
      byDay.set(k, e);
    }
    return e;
  };
  const totals = new Map<string, { income: number; fixed: number; flexible: number; savings: number; fees: number; must: number; variable: number }>();
  const tot = (month: string) => {
    let x = totals.get(month);
    if (!x) {
      x = { income: 0, fixed: 0, flexible: 0, savings: 0, fees: 0, must: 0, variable: 0 };
      totals.set(month, x);
    }
    return x;
  };
  for (const m of months) tot(m);

  for (const i of input.income) {
    if (!inHorizon.has(i.month)) continue;
    const amount = incomeAmount(i, scenario);
    if (amount <= 0) continue;
    const d = i.date < t0 ? t0 : i.date;
    const e = at(d);
    e.income += amount;
    e.events.push({ name: i.name, amount });
    tot(i.month).income += amount;
  }
  const flexFactor = FLEX_FACTOR[scenario];
  for (const line of input.lines) {
    if (!line.month || !inHorizon.has(line.month) || line.amount <= 0) continue;
    const m = tot(line.month);
    if (line.need === 'must') m.must += line.kind === 'variable' ? line.amount * flexFactor : line.amount;
    if (line.kind === 'variable') {
      // Spread over its month's days (from today in the current month).
      m.variable += line.amount * flexFactor;
      m.flexible += line.amount * flexFactor;
      continue;
    }
    const d = landingDay(line, today)!;
    const e = at(d);
    e.out += line.amount;
    e.events.push({ name: line.name, amount: -line.amount });
    if (line.kind === 'savings') m.savings += line.amount;
    else if (line.need === 'nice') m.flexible += line.amount;
    else m.fixed += line.amount;
  }
  for (const f of input.fees) {
    const month = monthOf(f.date);
    if (!inHorizon.has(month) || f.amount <= 0) continue;
    const d = f.date < t0 ? t0 : f.date;
    const e = at(d);
    e.out += f.amount;
    e.events.push({ name: 'Transfer fee', amount: -f.amount });
    tot(month).fees += f.amount;
  }

  // Walk the days.
  const days: EngineDay[] = [];
  const monthLow = new Map<string, { lowest: number; date: Date; end: number }>();
  let balance = input.startBalance;
  for (let d = new Date(t0); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const month = monthOf(d);
    const m = tot(month);
    const spreadDays = month === first ? daysIn(month) - t0.getDate() + 1 : daysIn(month);
    const flexToday = m.variable / spreadDays;
    const e = byDay.get(dayKeyOf(d));
    const income = e?.income ?? 0;
    const out = (e?.out ?? 0) + flexToday;
    balance = balance + income - out;
    days.push({ key: dayKeyOf(d), date: d, balance: r2(balance), income: r2(income), out: r2(out), events: e?.events ?? [] });
    const low = monthLow.get(month);
    if (!low || balance < low.lowest) monthLow.set(month, { lowest: balance, date: d, end: balance });
    monthLow.get(month)!.end = balance;
  }

  const monthsOut: EngineMonth[] = months.map((month) => {
    const x = tot(month);
    const low = monthLow.get(month) ?? { lowest: balance, date: end, end: balance };
    const spreadDays = month === first ? daysIn(month) - t0.getDate() + 1 : daysIn(month);
    const scheduled = x.fixed + x.flexible + x.savings + x.fees;
    return {
      month,
      income: r2(x.income),
      fixed: r2(x.fixed),
      flexible: r2(x.flexible),
      savings: r2(x.savings),
      fees: r2(x.fees),
      free: r2(x.income - scheduled),
      freeAfterMustHaves: r2(x.income - x.must),
      lowest: r2(low.lowest),
      lowestDate: low.date,
      endBalance: r2(low.end),
      dailyFlexible: r2(spreadDays > 0 ? x.variable / spreadDays : 0),
    };
  });

  let lowest = { balance: Infinity, date: t0 };
  for (const d of days) if (d.balance < lowest.balance) lowest = { balance: d.balance, date: d.date };
  if (!days.length) lowest = { balance: r2(input.startBalance), date: t0 };

  const breaches = monthsOut.filter((m) => m.lowest < cushion).map((m) => ({ month: m.month, lowest: m.lowest, date: m.lowestDate, belowZero: m.lowest < 0 }));
  return { days, months: monthsOut, lowest, breaches };
}

/** Points for the chart: daily for the first 2 months, weekly after. */
export function chartPoints(days: EngineDay[]): EngineDay[] {
  if (!days.length) return [];
  const first = days[0].date;
  const cutoff = new Date(first.getFullYear(), first.getMonth() + 2, 1);
  return days.filter((d, i) => d.date < cutoff || d.date.getDay() === 0 || i === days.length - 1);
}

/** The state of a balance against the cushion: below, within 20% above it, or comfortable. */
export function cushionState(balance: number, cushion: number): 'below' | 'close' | 'comfortable' {
  if (balance < cushion) return 'below';
  if (balance < cushion * 1.2) return 'close';
  return 'comfortable';
}

/** The default cushion: one month of must-have expenses. */
export function defaultCushion(lines: Pick<PlanLine, 'need' | 'kind' | 'month' | 'amount'>[], month: string): number {
  return r2(lines.filter((l) => l.month === month && l.need === 'must' && l.kind !== 'savings').reduce((s, l) => s + l.amount, 0));
}

/**
 * Lowest actual balance in each past month, walking back from today's
 * balance through the money that moved (signed: + in, - out).
 */
export function pastMonthLows(currentBalance: number, flows: { date: Date; amount: number }[], today: Date, count: number): { month: string; lowest: number }[] {
  const sorted = [...flows].filter((f) => f.date <= today).sort((a, b) => b.date.getTime() - a.date.getTime());
  const out: { month: string; lowest: number }[] = [];
  let balance = currentBalance;
  let i = 0;
  for (let k = 0; k <= count; k++) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - k, 1);
    const month = monthOf(monthStart);
    let lowest = balance;
    // Walk back through this month: the balance before each flow.
    while (i < sorted.length && sorted[i].date >= monthStart) {
      balance -= sorted[i].amount;
      lowest = Math.min(lowest, balance);
      i++;
    }
    if (k > 0) out.push({ month, lowest: r2(lowest) });
  }
  return out;
}

/** Consecutive past months (most recent first) whose lowest balance stayed at or above the cushion. */
export function cushionStreak(lows: { month: string; lowest: number }[], cushion: number): number {
  let n = 0;
  for (const l of lows) {
    if (l.lowest < cushion) break;
    n++;
  }
  return n;
}
