// The basket page's figures beyond the month's lines (src/screens/
// PlanningBucket/BucketPage.tsx on web, the phone basket screen's rows):
// each item's status in the page's words, the basket's upcoming payments
// with their Ready to pay state, the next automated payment, the items
// mix and the summary status. Pure; tested in test/basketPage.test.ts.

import { addMonths, itemOccurrence, itemOccurrenceDetail, monthKeyOf, type BudgetItemLike } from '../../shared/budget/monthBudget';
import { itemSchedule, scheduleLabel, type CadenceBasket } from '../../shared/budget/cadence';
import type { Coverage } from '@/src/shared/budget/coverage';
import type { Priority } from '@/src/shared/firestore/types';
import type { LineRow } from '@/src/logic/budgetMonth/lines';

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** What Ready to pay says about one occurrence (src/shared/budget/occurrences.ts). */
export interface OccurrenceState {
  itemId: string;
  state: 'ready' | 'waiting';
  waitingFor: string | null;
}

/**
 * An item's status: Unpaid, Paid, Overdue, Waiting for income or Over plan
 * for expenses (income, savings and transfers keep their own words).
 */
export function itemStatus(line: LineRow, coverage?: { coverage: Coverage; waitsFor: string | null }, occurrence?: OccurrenceState): string {
  if (line.type !== 'Expense') return line.state;
  if (line.state === 'Over plan' || line.state === 'Paid' || line.state === 'Overdue') return line.state;
  if (occurrence?.state === 'waiting' || coverage?.coverage === 'waiting') return 'Waiting for income';
  return 'Unpaid';
}

export const STATUS_TONE: Record<string, 'good' | 'bad' | 'watch' | 'neutral'> = {
  Paid: 'good',
  Received: 'good',
  Saved: 'good',
  Moved: 'good',
  Overdue: 'bad',
  Late: 'bad',
  'Over plan': 'bad',
  'Waiting for income': 'watch',
};

export interface UpcomingPayment {
  key: string;
  itemId: string;
  name: string;
  date: Date | null;
  amount: number;
  paidFrom: string | null;
  /** Ready, "Waiting for AIMS salary", Paid, or Upcoming. */
  state: string;
  tone: 'good' | 'watch' | 'neutral' | 'bad';
}

/**
 * This month's payments from the basket's items: still to pay first, by
 * date (late ones on top), then what's paid; at most `limit`.
 */
export function upcomingPayments(lines: LineRow[], occurrences: OccurrenceState[], today: Date, limit = 6): UpcomingPayment[] {
  const occ = new Map(occurrences.map((o) => [o.itemId, o]));
  const rows = lines
    .filter((l) => l.type !== 'Income' && !l.archived && (l.available > 0 || l.actual > 0))
    .map((l): UpcomingPayment => {
      const paid = l.left <= 0.5;
      const o = occ.get(l.itemId);
      const late = !paid && l.due !== null && dayOf(l.due) < dayOf(today);
      const state = paid ? 'Paid' : o?.state === 'ready' ? 'Ready' : o?.state === 'waiting' ? `Waiting for ${o.waitingFor ?? 'income'}` : late ? 'Overdue' : 'Upcoming';
      return {
        key: l.key,
        itemId: l.itemId,
        name: l.name,
        date: l.due,
        amount: paid ? r2(l.actual) : r2(l.left),
        paidFrom: l.accountName,
        state,
        tone: paid ? 'good' : state === 'Ready' ? 'good' : state.startsWith('Waiting') ? 'watch' : late ? 'bad' : 'neutral',
      };
    });
  return rows
    .sort((a, b) => Number(a.state === 'Paid') - Number(b.state === 'Paid') || (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * "Next: Rent, 160,000 on 1 Nov": the soonest automated payment still to
 * come, this month's unpaid ones first, else the items' next month.
 */
export function nextAutomated(
  lines: LineRow[],
  items: (BudgetItemLike & { automation?: { mode: string } | null })[],
  month: string,
  today: Date
): { name: string; amount: number; date: Date | null } | null {
  const open = lines
    .filter((l) => l.automation.mode === 'prepare' && l.left > 0.5 && !l.closed && (!l.due || dayOf(l.due) >= dayOf(today)))
    .sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
  if (open.length) return { name: open[0].name, amount: r2(open[0].left), date: open[0].due };
  const next = addMonths(month, 1);
  const upcoming = items
    .filter((i) => i.automation?.mode === 'prepare')
    .map((i) => ({ item: i, occ: itemOccurrence(i, next) }))
    .filter((x): x is { item: (typeof items)[number]; occ: NonNullable<ReturnType<typeof itemOccurrence>> } => Boolean(x.occ))
    .sort((a, b) => (a.occ.due?.getTime() ?? Infinity) - (b.occ.due?.getTime() ?? Infinity));
  return upcoming.length ? { name: upcoming[0].item.name, amount: r2(upcoming[0].occ.planned), date: upcoming[0].occ.due } : null;
}

/** "3 must have, 2 nice to have" */
export function itemsMix(lines: LineRow[]): string | null {
  const must = lines.filter((l) => l.necessity === 'MustHave').length;
  const nice = lines.filter((l) => l.necessity === 'NiceToHave').length;
  if (!must && !nice) return null;
  return [must ? `${must} must have` : null, nice ? `${nice} nice to have` : null].filter(Boolean).join(', ');
}

const RANK: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];

export function highestPriority(lines: LineRow[]): Priority | null {
  for (const p of RANK) if (lines.some((l) => l.priority === p)) return p;
  return null;
}

/** The summary card's chip: On track, Over plan or Unused. */
export function summaryStatus(planned: number, actual: number, type: LineRow['type']): { text: string; tone: 'good' | 'bad' | 'neutral' } {
  if (type !== 'Income' && actual > planned + 0.5) return { text: 'Over plan', tone: 'bad' };
  if (actual <= 0.5) return { text: 'Unused', tone: 'neutral' };
  return { text: 'On track', tone: 'good' };
}

/** "Payments due": what's still to pay this month. */
export function paymentsDue(lines: LineRow[]): { count: number; total: number } {
  const open = lines.filter((l) => l.type !== 'Income' && !l.closed && l.left > 0.5);
  return { count: open.length, total: r2(open.reduce((s, l) => s + l.left, 0)) };
}

// ---- All time ----

/** One item of the basket across all time (the page's "All time" view). */
export interface AllTimeItem {
  id: string;
  name: string;
  /** "Every month", "One-off", "Not scheduled". */
  schedule: string;
  /** What one occurrence costs, display currency. */
  amount: number;
  /** Everything recorded against it, display currency. */
  paid: number;
  payments: number;
  lastPaid: Date | null;
  /** The next date it falls on from today (null: none ahead). */
  next: Date | null;
  status: 'Open' | 'Done' | 'Dropped' | 'Ended' | 'Not scheduled';
}

export interface AllTimeView {
  items: AllTimeItem[];
  paid: number;
  payments: number;
  /** Still open (a one-off not done, or a repeating item with a date ahead). */
  open: number;
  firstPaid: Date | null;
}

type AllTimeSource = BudgetItemLike & { id: string; name: string; completed?: boolean; status?: 'dropped' | null };

/**
 * Every item in the basket, whatever its months: how it repeats, what it
 * costs, everything paid against it (from all transactions linked to it),
 * the last payment and the next date. Open items first, then by next date.
 */
export function basketAllTime(
  items: AllTimeSource[],
  txs: { itemId: string; amount: number; date: Date }[],
  bucket: CadenceBasket | null,
  today: Date,
  toDisplay: (item: AllTimeSource, amount: number) => number
): AllTimeView {
  const byItem = new Map<string, { paid: number; count: number; last: Date | null; first: Date | null }>();
  for (const t of txs) {
    const row = byItem.get(t.itemId) ?? { paid: 0, count: 0, last: null, first: null };
    row.paid += t.amount;
    row.count += 1;
    if (!row.last || t.date > row.last) row.last = t.date;
    if (!row.first || t.date < row.first) row.first = t.date;
    byItem.set(t.itemId, row);
  }
  const current = monthKeyOf(today);
  const out: AllTimeItem[] = items.map((item) => {
    const spec = itemSchedule(item, bucket);
    let next: Date | null = null;
    for (let i = 0; i < 25 && !next && spec; i++) {
      const detail = itemOccurrenceDetail(item, addMonths(current, i), bucket);
      next = detail?.dates.find((d) => dayOf(d) >= dayOf(today)) ?? null;
    }
    const pay = byItem.get(item.id);
    const once = !spec || spec.frequency === 'Once';
    const status: AllTimeItem['status'] =
      item.status === 'dropped' ? 'Dropped' : once && item.completed ? 'Done' : !spec ? 'Not scheduled' : next ? 'Open' : once ? 'Open' : 'Ended';
    return {
      id: item.id,
      name: item.name,
      schedule: scheduleLabel(spec),
      amount: r2(toDisplay(item, item.amount)),
      paid: r2(pay?.paid ?? 0),
      payments: pay?.count ?? 0,
      lastPaid: pay?.last ?? null,
      next: status === 'Open' ? next : null,
      status,
    };
  });
  const order = { Open: 0, 'Not scheduled': 1, Ended: 2, Done: 3, Dropped: 4 } as const;
  out.sort((a, b) => order[a.status] - order[b.status] || (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity) || a.name.localeCompare(b.name));
  const firsts = [...byItem.values()].map((r) => r.first).filter((d): d is Date => Boolean(d));
  return {
    items: out,
    paid: r2(out.reduce((s, i) => s + i.paid, 0)),
    payments: out.reduce((s, i) => s + i.payments, 0),
    open: out.filter((i) => i.status === 'Open' || i.status === 'Not scheduled').length,
    firstPaid: firsts.length ? new Date(Math.min(...firsts.map((d) => d.getTime()))) : null,
  };
}
