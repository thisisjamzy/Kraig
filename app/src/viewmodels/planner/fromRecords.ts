// From the user's baskets to the money plan's input (src/viewmodels/planner/
// money.ts). Each basket item becomes one plan item with its dated amounts
// from today on: what is still due this month (an unpaid date already gone
// lands on today), then every later date as planned. Income and fixed
// costs are locked. Savings baskets become goals, their items one monthly
// transfer each. Variable items with no date are wishes ("Not scheduled").
// Pure; tested in test/planner.test.ts.

import { dayFrom, dayOf, ymd, type Day } from './days';
import type { Confidence, MoneyInput, PlanGoal, PlanItem, PlanKind, PlanPriority } from './money';

export interface RecordBasket {
  id: string;
  name: string;
  type: 'Expense' | 'Income' | 'Savings' | 'Transfer';
  /** Display currency. */
  target: number | null;
  deadline: Date | null;
  /** Months ("2026-10") the basket is closed. */
  closedMonths: string[];
}

export interface RecordMonth {
  /** Every date it falls on that month. */
  dates: Date[];
  /** The month's planned total, display currency. */
  planned: number;
  frequency: 'Once' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
}

export interface RecordItem {
  id: string;
  bucketId: string;
  name: string;
  kind: PlanKind | 'transfer';
  need: 'must' | 'nice';
  priority: 'High' | 'Medium' | 'Low';
  confidence: Confidence;
  fundedByGoalId: string | null;
  /** A one-off that is paid or dropped. */
  done: boolean;
  /** Its amount, display currency (for a wish). */
  amount: number;
  hasDueDate: boolean;
  /** "2026-10" → that month's occurrence (none: not that month). */
  months: Record<string, RecordMonth>;
  /** "2026-10" → paid so far that month. */
  paid: Record<string, number>;
}

export interface RecordsInput {
  today: Date;
  balance: number;
  baskets: RecordBasket[];
  items: RecordItem[];
  /** Saved so far into each savings basket. */
  savedByBasket: Record<string, number>;
}

const priorityOf = (i: RecordItem): PlanPriority => (i.kind === 'income' || i.kind === 'fixed' || i.need === 'must' ? 'Must' : i.priority === 'Low' ? 'Could' : 'Should');

const repeatOf = (f: RecordMonth['frequency']): PlanItem['repeat'] => (f === 'Daily' ? 'daily' : f === 'Weekly' ? 'weekly' : f === 'Once' ? 'once' : 'monthly');

/** Dated amounts from today on. This month: what is left, latest dates first; anything overdue on today. */
export function scheduleOf(item: RecordItem, today: Day, currentMonth: string, closed: string[]): { day: Day; amount: number }[] {
  const out: { day: Day; amount: number }[] = [];
  for (const [month, occ] of Object.entries(item.months).sort(([a], [b]) => a.localeCompare(b))) {
    if (month < currentMonth || closed.includes(month) || !occ.dates.length || occ.planned <= 0) continue;
    const days = occ.dates.map(dayOf).sort((a, b) => a - b);
    const unit = occ.planned / days.length;
    if (month > currentMonth) {
      for (const d of days) out.push({ day: d, amount: unit });
      continue;
    }
    let left = Math.max(0, occ.planned - (item.paid[month] ?? 0));
    const ahead = days.filter((d) => d >= today);
    const part: { day: Day; amount: number }[] = [];
    for (const d of [...ahead].reverse()) {
      const amount = Math.min(unit, left);
      if (amount <= 0) break;
      part.unshift({ day: d, amount });
      left -= amount;
    }
    if (left > 0.5) part.unshift({ day: today, amount: left });
    out.push(...part);
  }
  return out.filter((x) => x.amount > 0.5);
}

export function moneyInputFromRecords(r: RecordsInput): MoneyInput {
  const today = dayOf(r.today);
  const { y, m } = ymd(today);
  const current = `${y}-${String(m).padStart(2, '0')}`;
  const basketById = new Map(r.baskets.map((b) => [b.id, b]));
  const items: PlanItem[] = [];
  const goalMonthly = new Map<string, { monthly: number; dueNow: number; day: number | null; sources: { bucketId: string; itemId: string }[] }>();

  for (const it of r.items) {
    const basket = basketById.get(it.bucketId);
    if (!basket || it.kind === 'transfer') continue;
    const closed = basket.closedMonths;
    if (it.kind === 'savings') {
      const row = goalMonthly.get(basket.id) ?? { monthly: 0, dueNow: 0, day: null, sources: [] };
      const next = Object.entries(it.months).filter(([month]) => month > current).sort(([a], [b]) => a.localeCompare(b))[0]?.[1];
      const now = it.months[current];
      row.monthly += next?.planned ?? 0;
      row.dueNow += now ? Math.max(0, now.planned - (it.paid[current] ?? 0)) : 0;
      const firstDate = (next ?? now)?.dates[0];
      if (firstDate && row.day === null) row.day = firstDate.getDate();
      row.sources.push({ bucketId: basket.id, itemId: it.id });
      goalMonthly.set(basket.id, row);
      continue;
    }
    const base = { id: it.id, name: it.name, basketId: basket.id, basketName: basket.name, kind: it.kind, priority: priorityOf(it) };
    const months = Object.values(it.months);
    if (!months.length) {
      // A wish: a variable cost with no date yet.
      if (it.kind === 'variable' && !it.hasDueDate && !it.done && it.amount > 0) items.push({ ...base, amount: it.amount, freq: 'once', date: null, repeat: 'once', source: { bucketId: basket.id, itemId: it.id, recurring: false } });
      continue;
    }
    if (it.done && months.every((x) => x.frequency === 'Once')) continue;
    const schedule = scheduleOf(it, today, current, closed);
    if (!schedule.length) continue;
    const frequency = months[0].frequency;
    items.push({
      ...base,
      amount: schedule[schedule.length - 1].amount,
      freq: 'dates',
      schedule,
      repeat: repeatOf(frequency),
      confidence: it.kind === 'income' ? it.confidence : undefined,
      fundedByGoalId: it.kind === 'fixed' ? it.fundedByGoalId : null,
      source: { bucketId: basket.id, itemId: it.id, recurring: frequency !== 'Once' },
    });
  }

  const goals: PlanGoal[] = r.baskets
    .filter((b) => b.type === 'Savings')
    .map((b) => {
      const row = goalMonthly.get(b.id);
      return {
        id: b.id,
        name: b.name,
        current: r.savedByBasket[b.id] ?? 0,
        target: b.target,
        deadline: b.deadline ? dayOf(b.deadline) : null,
        monthly: Math.round(row?.monthly ?? 0),
        day: row?.day ?? 1,
        dueThisMonth: row ? Math.round(row.dueNow) : 0,
        sources: row?.sources ?? [],
      };
    });

  return { today, balance: r.balance, items, goals };
}

/** The first day of a month key, for labels. */
export const monthStart = (month: string): Day => dayFrom(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1);
