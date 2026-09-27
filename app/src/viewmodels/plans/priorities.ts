// Priorities — "what should I pay next?". Which open items a view shows,
// the five ways to order them, the affordability walk (where the money runs
// out) and the list grouped by urgency. Pure.

import {
  URGENCY_ORDER,
  daysUntil,
  isOpen,
  monthKey,
  r2,
  relevant,
  remaining,
  shiftMonth,
  urgency,
  type Occurrence,
  type Urgency,
} from './model';

export type View = 'month' | 'open';
export type SortMode = 'recommended' | 'deadline' | 'priority' | 'smallest' | 'mine';

/** Things to pay: fixed, plan and savings items (income and variable
 * spending limits aren't "payments"). */
export function payable(o: Occurrence) {
  return o.kind === 'fixed' || o.kind === 'savings' || (o.inPlan && o.kind !== 'income');
}

/**
 * "This month": overdue items plus those due this month. "All open":
 * everything not yet paid or dropped — a repeating item only for this
 * month (and any overdue), a one-off whenever it's due.
 */
export function itemsFor(view: View, occurrences: Occurrence[], today: Date): Occurrence[] {
  const thisMonth = monthKey(today);
  return occurrences.filter((o) => {
    if (!payable(o) || !isOpen(o) || !relevant(o, today)) return false;
    const u = urgency(o, today);
    if (u === 'overdue') return true;
    const m = o.due ? monthKey(o.due) : o.month;
    if (view === 'month') return m === thisMonth;
    return o.recurring ? m === thisMonth : m >= thisMonth;
  });
}

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 } as const;
const time = (o: Occurrence) => o.due?.getTime() ?? Number.MAX_SAFE_INTEGER;

/** The recommended order, rule by rule. */
export function compareRecommended(a: Occurrence, b: Occurrence, today: Date): number {
  const ua = urgency(a, today);
  const ub = urgency(b, today);
  // 1. Overdue before anything else.
  if ((ua === 'overdue') !== (ub === 'overdue')) return ua === 'overdue' ? -1 : 1;
  // 2. Must have before Nice to have.
  if (a.need !== b.need) return a.need === 'must' ? -1 : 1;
  // 3. Urgency.
  if (ua !== ub) return URGENCY_ORDER.indexOf(ua) - URGENCY_ORDER.indexOf(ub);
  // 4. Priority.
  if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  // 5. A consequence if late.
  if (a.consequence !== b.consequence) return a.consequence ? -1 : 1;
  // 6. Smaller remaining amount (a quick win).
  const ra = remaining(a);
  const rb = remaining(b);
  if (ra !== rb) return ra - rb;
  // 7. Earlier due date.
  return time(a) - time(b);
}

export function sortItems(items: Occurrence[], mode: SortMode, today: Date): Occurrence[] {
  const list = [...items];
  switch (mode) {
    case 'deadline':
      return list.sort((a, b) => time(a) - time(b) || compareRecommended(a, b, today));
    case 'priority':
      return list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || time(a) - time(b));
    case 'smallest':
      return list.sort((a, b) => remaining(a) - remaining(b) || time(a) - time(b));
    case 'mine':
      return list.sort((a, b) => a.manualRank - b.manualRank || compareRecommended(a, b, today));
    default:
      return list.sort((a, b) => compareRecommended(a, b, today));
  }
}

/** "must have · due in 13 days" — shown under the amount in Recommended. */
export function reasonFor(o: Occurrence, today: Date): string {
  const parts = [o.need === 'must' ? 'must have' : 'nice to have'];
  if (o.due) {
    const d = daysUntil(o.due, today);
    parts.push(d < 0 ? `${-d} ${d === -1 ? 'day' : 'days'} overdue` : d === 0 ? 'due today' : `due in ${d} ${d === 1 ? 'day' : 'days'}`);
  }
  if (o.consequence) parts.push('penalty if late');
  return parts.join(' · ');
}

export interface WalkRow {
  item: Occurrence;
  remaining: number;
  covered: boolean;
  /** Money left after this row (negative once it runs out). */
  after: number;
  /** For rows past the line: the first month it fits, or null. */
  fitsIn: string | null;
}

export interface Walk {
  rows: WalkRow[];
  /** Index of the first row that doesn't fit (the divider goes before it), or −1. */
  divider: number;
  /** Left after the covered rows. */
  spare: number;
  due: number;
  available: number;
  gap: number;
  coveredCount: number;
  /** Must-haves past the line. */
  mustShort: number;
  mustShortAmount: number;
}

/**
 * Walks down the list in its current order, taking each item's remaining
 * amount from what's available; the first item that doesn't fit is where
 * the money runs out (everything after it is past the line). For those,
 * `capacity` (money free for plans in each coming month, from the forecast)
 * says when they'd fit.
 */
export function affordabilityWalk(ordered: Occurrence[], available: number, capacity: { month: string; free: number }[] = []): Walk {
  let left = available;
  let divider = -1;
  const rows: WalkRow[] = [];
  for (const [i, item] of ordered.entries()) {
    const rem = remaining(item);
    const covered = divider === -1 && rem <= left + 0.005;
    if (!covered && divider === -1) divider = i;
    left = r2(left - rem);
    rows.push({ item, remaining: rem, covered, after: left, fitsIn: null });
  }
  // When would each uncovered row fit? Its shortfall against the
  // cumulative free money of the coming months.
  let cumulative = 0;
  const cumulativeFree = capacity.map((c) => ({ month: c.month, total: (cumulative += Math.max(0, c.free)) }));
  for (const row of rows) {
    if (row.covered) continue;
    const shortfall = -row.after;
    row.fitsIn = cumulativeFree.find((c) => c.total >= shortfall - 0.005)?.month ?? null;
  }
  const coveredRows = rows.filter((r) => r.covered);
  const due = r2(rows.reduce((s, r) => s + r.remaining, 0));
  const must = rows.filter((r) => !r.covered && r.item.need === 'must');
  return {
    rows,
    divider,
    spare: r2(available - coveredRows.reduce((s, r) => s + r.remaining, 0)),
    due,
    available: r2(available),
    gap: r2(available - due),
    coveredCount: coveredRows.length,
    mustShort: must.length,
    mustShortAmount: r2(must.reduce((s, r) => s + r.remaining, 0)),
  };
}

/** Nice-to-haves above the line that could be postponed to cover `gap`. */
export function postponeSuggestions(walk: Walk, gap: number): Occurrence[] {
  const out: Occurrence[] = [];
  let freed = 0;
  const nice = walk.rows.filter((r) => r.covered && r.item.need === 'nice').sort((a, b) => b.remaining - a.remaining);
  for (const r of nice) {
    if (freed >= gap) break;
    out.push(r.item);
    freed += r.remaining;
  }
  return out;
}

export interface UrgencyGroup {
  urgency: Urgency;
  rows: WalkRow[];
  subtotal: number;
}

/** The list grouped by urgency (empty groups left out), rows keeping their order. */
export function groupByUrgency(rows: WalkRow[], today: Date): UrgencyGroup[] {
  return URGENCY_ORDER.map((u) => {
    const list = rows.filter((r) => urgency(r.item, today) === u);
    return { urgency: u, rows: list, subtotal: r2(list.reduce((s, r) => s + r.remaining, 0)) };
  }).filter((g) => g.rows.length > 0);
}

export { shiftMonth };
