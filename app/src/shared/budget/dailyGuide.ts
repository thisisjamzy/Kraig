// "How much can I spend each day?" — the daily spending guide for the
// current month. Pure; shared by the Plan and forecast page and the
// background runner (which sends the once-a-day "off track" notification).
// Tested in test/planForecast.test.ts.
//
//   Daily allowance  = variable budget left this month / days left (today included)
//   Safe per day     = (available now + income still expected (by scenario)
//                       − fixed expenses and savings still due) / days left
//   The lower of the two is the one to follow.
//   Status: On track when the last 7 days' average is within 10% of the
//   allowance; Watch when 10 to 25% over; Off track when more than 25% over,
//   or when the month-end projection exceeds the variable budget.

import type { MonthBudget } from './monthBudget';

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

export type GuideStatus = 'on_track' | 'watch' | 'off_track';

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface GuideInput {
  today: Date;
  /** The month's variable budget (planned) and what's left of it. */
  variablePlanned: number;
  variableLeft: number;
  /** Variable spending per day this month (yyyy-mm-dd → amount). */
  spentByDay: Map<string, number>;
  availableNow: number;
  expectedStill: number;
  /** Fixed expenses and savings still due this month. */
  fixedStillDue: number;
  /** Scenario factor applied to income still expected. */
  incomeFactor?: number;
}

export interface DailyGuide {
  daysLeft: number;
  allowance: number;
  safePerDay: number;
  follow: number;
  followReason: 'allowance' | 'cash';
  today: { allowance: number; spent: number; left: number };
  week: { days: number; allowance: number; spent: number; difference: number };
  avg7: number;
  projection: number;
  status: GuideStatus;
  /** Cumulative variable spending by day, and the allowance path. */
  path: { day: number; date: string; spent: number | null; allowance: number }[];
  message: string | null;
}

export function dailyGuide(input: GuideInput): DailyGuide {
  const today = startOfDay(input.today);
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysLeft = daysInMonth - today.getDate() + 1;
  const spentToday = input.spentByDay.get(dayKey(today)) ?? 0;

  // Today's allowance: what's left at the start of today, over the days left.
  const leftAtStartOfDay = input.variableLeft + spentToday;
  const allowance = r2(Math.max(0, input.variableLeft) / daysLeft);
  const allowanceToday = r2(Math.max(0, leftAtStartOfDay) / daysLeft);
  const safePerDay = r2((input.availableNow + input.expectedStill * (input.incomeFactor ?? 1) - input.fixedStillDue) / daysLeft);
  const followReason = safePerDay < allowance ? 'cash' : 'allowance';
  const follow = r2(Math.max(0, Math.min(allowance, safePerDay)));

  // This week: Monday to today.
  const weekday = (today.getDay() + 6) % 7;
  const weekStart = new Date(today.getTime() - weekday * DAY);
  let weekSpent = 0;
  let weekDays = 0;
  for (let d = new Date(weekStart); d <= today; d = new Date(d.getTime() + DAY)) {
    weekDays += 1;
    weekSpent += input.spentByDay.get(dayKey(d)) ?? 0;
  }
  const weekAllowance = r2(allowanceToday * weekDays);

  // The last 7 days (today included).
  let last7 = 0;
  for (let i = 0; i < 7; i++) last7 += input.spentByDay.get(dayKey(new Date(today.getTime() - i * DAY))) ?? 0;
  const avg7 = r2(last7 / 7);

  const spentSoFar = r2(Math.max(0, input.variablePlanned - input.variableLeft));
  const projection = r2(spentSoFar + avg7 * (daysLeft - 1));
  const ratio = allowanceToday > 0 ? avg7 / allowanceToday : avg7 > 0 ? Infinity : 0;
  let status: GuideStatus = ratio > 1.25 ? 'off_track' : ratio > 1.1 ? 'watch' : 'on_track';
  if (input.variablePlanned > 0 && projection > input.variablePlanned + 0.5) status = 'off_track';

  const path: DailyGuide['path'] = [];
  let cumulative = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = dayKey(date);
    cumulative += input.spentByDay.get(key) ?? 0;
    path.push({ day, date: key, spent: date <= today ? r2(cumulative) : null, allowance: r2((input.variablePlanned * day) / daysInMonth) });
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
  const monthName = today.toLocaleDateString('en-GB', { month: 'long' });
  const message =
    status === 'off_track'
      ? `You've spent ${fmt(avg7)} a day this week against ${fmt(allowanceToday)}. Keep to ${fmt(follow)} a day for the rest of ${monthName} to stay on plan.`
      : null;

  return {
    daysLeft,
    allowance,
    safePerDay,
    follow,
    followReason,
    today: { allowance: allowanceToday, spent: r2(spentToday), left: r2(allowanceToday - spentToday) },
    week: { days: weekDays, allowance: weekAllowance, spent: r2(weekSpent), difference: r2(weekAllowance - weekSpent) },
    avg7,
    projection,
    status,
    path,
    message,
  };
}

/**
 * Variable spending per day this month: expense transactions dated this
 * month, except those paying a fixed line (rent isn't day-to-day spending).
 */
export function variableSpendByDay(
  budget: MonthBudget,
  transactions: { id: string; type: string; direction: 'Inflow' | 'Outflow'; amount: number; date: Date; month: string }[],
  toDisplay: (amount: number, id: string) => number
): Map<string, number> {
  const fixed = new Set<string>();
  for (const item of budget.items) if (item.type === 'Expense' && item.expenseKind === 'fixed') item.transactionIds.forEach((id) => fixed.add(id));
  const out = new Map<string, number>();
  for (const t of transactions) {
    if (t.month !== budget.month || t.type !== 'Expense' || fixed.has(t.id)) continue;
    const value = toDisplay(t.amount, t.id) * (t.direction === 'Outflow' ? 1 : -1);
    const key = dayKey(t.date);
    out.set(key, r2((out.get(key) ?? 0) + value));
  }
  return out;
}

/** The month's variable budget: planned and left, from its variable expense lines. */
export function variableBudget(budget: MonthBudget): { planned: number; left: number } {
  const lines = budget.items.filter((i) => i.type === 'Expense' && i.expenseKind === 'variable' && !i.archived);
  const planned = r2(lines.reduce((s, i) => s + i.available, 0));
  // Unplanned spending eats into the same variable budget.
  const spent = r2(lines.reduce((s, i) => s + i.actual, 0) + budget.flows.unplannedSpent);
  return { planned, left: r2(Math.max(0, planned - spent)) };
}
