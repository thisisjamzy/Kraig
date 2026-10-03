// Plans — the shared model behind Buckets, Priorities and the Plans
// forecast. Everything here is pure: the data hook (src/logic/plans/
// usePlansData.ts) turns budget items and each month's budget into
// Occurrences (one item in one month: what's planned, what's been paid, when
// it's due), and every screen computes from those, so the three always
// agree. Money figures are in the display currency.

// One per flow type, with expenses split into fixed and variable.
// Transfers are their own kind: never an expense, never a must-have.
export type Kind = 'fixed' | 'variable' | 'savings' | 'income' | 'transfer';
export type Need = 'must' | 'nice';
export type Priority = 'High' | 'Medium' | 'Low';
export type Urgency = 'overdue' | 'week' | 'month' | 'next' | 'later';
export type ItemStatus = 'open' | 'partly' | 'paid' | 'postponed' | 'dropped';

export interface Occurrence {
  /** "itemId@YYYY-MM" — monthBudget.ts's itemMonthKey. */
  key: string;
  itemId: string;
  bucketId: string;
  /** The bucket (or plan) it belongs to. */
  bucketName: string;
  name: string;
  month: string;
  kind: Kind;
  need: Need;
  priority: Priority;
  /** The item's label (its category). */
  tag: string;
  due: Date | null;
  planned: number;
  paid: number;
  recurring: boolean;
  /** Belongs to a plan: a non-recurring bucket spread over months. */
  inPlan: boolean;
  /** "Penalty if late" / an installment tied to a contract. */
  consequence: boolean;
  manualRank: number;
  postponed: boolean;
  dropped: boolean;
  /** Its bucket is closed for the month or it's a closed one-off. */
  closed: boolean;
  /** The account it's paid from, when the item names one. */
  accountId?: string | null;
  /** How it's prepared for payment ("Prepare when income arrives"). */
  automationText?: string;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function remaining(o: Pick<Occurrence, 'planned' | 'paid'>) {
  return r2(Math.max(0, o.planned - o.paid));
}

export function statusOf(o: Occurrence): ItemStatus {
  if (o.dropped) return 'dropped';
  if (o.planned > 0 && o.paid >= o.planned - 0.5) return 'paid';
  if (o.postponed) return 'postponed';
  if (o.paid > 0) return 'partly';
  return 'open';
}

/** Still something to pay (or receive), and not dropped or closed. */
export function isOpen(o: Occurrence) {
  return !o.dropped && !o.closed && remaining(o) > 0;
}

/** Still worth acting on: a repeating item's missed date counts for one
 * month back at most (older ones are history, not a pile of "overdue"); a
 * one-off stays until it's paid, postponed or dropped. */
export function relevant(o: Pick<Occurrence, 'recurring' | 'month'>, today: Date) {
  return !o.recurring || o.month >= shiftMonth(monthKey(today), -1);
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function monthLabel(key: string, long = false) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', long ? { month: 'long', year: 'numeric' } : { month: 'short' });
}

export const DAY = 86_400_000;

/** Overdue | This week (7 days) | This month | Next month | Later. An
 * item with no due date counts from its month. */
export function urgency(o: Pick<Occurrence, 'due' | 'month'>, today: Date): Urgency {
  const t = startOfDay(today);
  const due = o.due ? startOfDay(o.due) : null;
  const thisMonth = monthKey(today);
  if (due ? due < t : o.month < thisMonth) return 'overdue';
  if (due && (due.getTime() - t.getTime()) / DAY <= 7) return 'week';
  const m = due ? monthKey(due) : o.month;
  if (m === thisMonth) return 'month';
  if (m === shiftMonth(thisMonth, 1)) return 'next';
  return 'later';
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: 'Overdue',
  week: 'This week',
  month: 'This month',
  next: 'Next month',
  later: 'Later',
};

export const URGENCY_ORDER: Urgency[] = ['overdue', 'week', 'month', 'next', 'later'];

export function daysUntil(due: Date, today: Date) {
  return Math.round((startOfDay(due).getTime() - startOfDay(today).getTime()) / DAY);
}

/** "Oct 10 · in 13 days" / "Sep 2 · 25 days late" */
export function dueText(due: Date | null, today: Date) {
  if (!due) return 'No due date';
  const date = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const d = daysUntil(due, today);
  if (d === 0) return `${date} · today`;
  if (d === 1) return `${date} · tomorrow`;
  if (d > 0) return `${date} · in ${d} days`;
  return `${date} · ${-d} ${d === -1 ? 'day' : 'days'} late`;
}

export function money(n: number, currency?: string) {
  const v = Math.round(n).toLocaleString('en-US');
  return currency ? `${v} ${currency}` : v;
}
