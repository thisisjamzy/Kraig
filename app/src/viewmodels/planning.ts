// Planning (the Budget section) — the pure rules behind its screens:
//   - money and month formatting;
//   - each bucket's card: spent / planned, what's available, and the one
//     action prompt it needs (overspent → cover or justify; leftover →
//     reallocate), buckets needing action first;
//   - how a cover or a reallocation is split across items, since the
//     allocation ledger (FirestoreAllocation) moves money item to item.
// Kept free of Firestore so it's unit-testable (test/planning.test.ts).

import type { BucketGroup, CategoryGroup, ItemMonth } from '../shared/budget/monthBudget';
import type { OverspendAvoidability, OverspendExternalSource, OverspendReason } from '../shared/firestore/types';

// ---------------------------------------------------------------------------
// Formatting

/** "16,000" — thousands separators, up to 2 decimals. */
export function money(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100);
}

/** "+6,900" / "-310,911" — always signed. */
export function signedMoney(value: number): string {
  return value > 0 ? `+${money(value)}` : money(value);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "24 Sep" */
export function dayMonth(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

/** "Thu, 24 Sep" */
export function weekdayDayMonth(d: Date): string {
  return `${SHORT_DAYS[d.getDay()]}, ${dayMonth(d)}`;
}

export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthOf(new Date(y, m - 1 + delta, 1));
}

/** "September 2026" */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthName(month: string): string {
  return MONTHS[Number(month.split('-')[1]) - 1];
}

export type MonthPhase = 'past' | 'current' | 'future';

export function monthPhase(month: string, today: Date): MonthPhase {
  const now = monthOf(today);
  return month < now ? 'past' : month > now ? 'future' : 'current';
}

/** Days left after today in the month (current month only). */
export function daysLeftIn(month: string, today: Date): number | null {
  if (monthPhase(month, today) !== 'current') return null;
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate() - today.getDate();
}

/** "3 days left in September" / "Last day of September" / "Ended" / "Starts in…" */
export function monthCaption(month: string, today: Date): string {
  const phase = monthPhase(month, today);
  const name = monthName(month);
  if (phase === 'past') return `${name} has ended`;
  if (phase === 'future') return `${name} hasn't started yet`;
  const left = daysLeftIn(month, today) ?? 0;
  return left === 0 ? `Last day of ${name}` : `${left} ${left === 1 ? 'day' : 'days'} left in ${name}`;
}

// ---------------------------------------------------------------------------
// Bucket cards

/** Leftovers are offered this close to the month's end. */
export const LEFTOVER_DAYS = 5;

export type Prompt =
  | { kind: 'over'; amount: number }
  // Settled (Cover or justify) but part of it was left "not covered yet".
  | { kind: 'uncovered'; amount: number }
  | { kind: 'justified'; amount: number; reason: string }
  | { kind: 'leftover'; amount: number };

/** What an item still needs: its overspend minus the part justified. */
export function unexplained(item: ItemMonth): number {
  return Math.max(0, Math.round((item.unfunded - (item.justified?.amount ?? 0)) * 100) / 100);
}

export interface PromptContext {
  month: string;
  today: Date;
}

/**
 * The one prompt a set of items needs (a bucket, or a single item):
 * an overspend still unexplained first; else a justified overspend (a tag,
 * no action); else a leftover — once the month has ended, in its last
 * LEFTOVER_DAYS days, or when every item in it is closed.
 */
export function promptFor(items: ItemMonth[], ctx: PromptContext): Prompt | null {
  // Archived: history only, nothing to act on.
  const spending = items.filter((i) => i.type !== 'Income' && !i.archived);
  if (!spending.length) return null;
  const open = spending.filter((i) => unexplained(i) > 0);
  const over = round2(open.reduce((s, i) => s + unexplained(i), 0));
  if (over > 0) return { kind: open.every((i) => i.settlement) ? 'uncovered' : 'over', amount: over };
  // Explained, or settled entirely by moving budget — a grey tag, no action.
  const justified = spending.filter((i) => (i.justified && i.unfunded > 0) || i.settlement);
  if (justified.length) {
    return {
      kind: 'justified',
      amount: round2(justified.reduce((s, i) => s + i.unfunded, 0)),
      reason: reasonLabel(justified[0].settlement?.reason ?? justified[0].justified!.reason).toLowerCase(),
    };
  }
  // Net: an item over its estimate uses up a sibling's leftover first.
  const leftover = round2(Math.max(0, spending.reduce((s, i) => s + i.remaining, 0)));
  if (leftover <= 0) return null;
  const phase = monthPhase(ctx.month, ctx.today);
  const late = phase === 'past' || (phase === 'current' && (daysLeftIn(ctx.month, ctx.today) ?? 99) < LEFTOVER_DAYS);
  const closed = spending.every((i) => i.closed);
  return late || closed ? { kind: 'leftover', amount: leftover } : null;
}

export interface BucketCard {
  id: string;
  name: string;
  archived: boolean;
  /** Income buckets read "received / planned" and never prompt. */
  income: boolean;
  itemCount: number;
  spent: number;
  planned: number;
  /** What can still be spent (never negative). */
  available: number;
  /** Spent past the plan (0 when within it). */
  overflow: number;
  prompt: Prompt | null;
  items: ItemMonth[];
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function bucketCard(group: BucketGroup, ctx: PromptContext): BucketCard {
  const income = group.items.length > 0 && group.items.every((i) => i.type === 'Income');
  return {
    id: group.bucketId,
    name: group.name,
    archived: group.archived,
    income,
    itemCount: group.items.length,
    spent: round2(group.actual),
    planned: round2(group.available),
    available: round2(Math.max(0, group.remaining)),
    overflow: income ? 0 : round2(Math.max(0, group.actual - group.available)),
    prompt: income ? null : promptFor(group.items, ctx),
    items: group.items,
  };
}

const PROMPT_RANK = { over: 0, uncovered: 0, leftover: 1, justified: 2 } as const;

/** Needing action first (over budget, then leftover), then most left. */
export function sortCards(cards: BucketCard[]): BucketCard[] {
  return [...cards].sort((a, b) => {
    const ra = a.prompt && a.prompt.kind !== 'justified' ? PROMPT_RANK[a.prompt.kind] : 3;
    const rb = b.prompt && b.prompt.kind !== 'justified' ? PROMPT_RANK[b.prompt.kind] : 3;
    if (ra !== rb) return ra - rb;
    if (ra < 3) return (b.prompt?.amount ?? 0) - (a.prompt?.amount ?? 0);
    return b.available - a.available || a.name.localeCompare(b.name);
  });
}

export function bucketCards(groups: BucketGroup[], ctx: PromptContext): BucketCard[] {
  return sortCards(groups.map((g) => bucketCard(g, ctx)));
}

export function categoryCard(group: CategoryGroup) {
  const income = group.type === 'Income';
  return {
    id: group.categoryId,
    name: group.name,
    income,
    itemCount: group.items.length,
    spent: round2(group.actual),
    planned: round2(group.available),
    available: round2(Math.max(0, group.remaining)),
    overflow: income ? 0 : round2(Math.max(0, group.actual - group.available)),
    unplanned: round2(group.unplanned),
  };
}

/** Bar fill (0 to 1) — a full bar once spent reaches the plan. */
export function fillOf(spent: number, planned: number): number {
  if (planned <= 0) return spent > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, spent / planned));
}

// ---------------------------------------------------------------------------
// Splitting moves across items

export interface Need {
  key: string;
  amount: number;
}

export interface Pair {
  fromKey: string;
  toKey: string;
  amount: number;
}

/**
 * Takes `amount` out of `pots` in order (each up to what it has) — a
 * bucket's leftover spread over its items, or a source bucket's items.
 */
export function takeFrom(pots: Need[], amount: number): Need[] {
  const out: Need[] = [];
  let left = round2(amount);
  for (const pot of pots) {
    if (left <= 0) break;
    const take = round2(Math.min(pot.amount, left));
    if (take <= 0) continue;
    out.push({ key: pot.key, amount: take });
    left = round2(left - take);
  }
  return out;
}

/**
 * Matches what's given (by source) against what's needed (by target), in
 * order — one allocation per pair. Stops when either side runs out.
 */
export function pairUp(gives: Need[], needs: Need[]): Pair[] {
  const pairs: Pair[] = [];
  const need = needs.map((n) => ({ ...n }));
  let t = 0;
  for (const give of gives) {
    let left = give.amount;
    while (left > 0.004 && t < need.length) {
      const amount = round2(Math.min(left, need[t].amount));
      if (amount > 0) pairs.push({ fromKey: give.key, toKey: need[t].key, amount });
      left = round2(left - amount);
      need[t].amount = round2(need[t].amount - amount);
      if (need[t].amount <= 0.004) t += 1;
    }
  }
  return pairs;
}

/** What's left of each target's need after the covered pairs. */
export function uncovered(needs: Need[], pairs: Pair[]): Need[] {
  return needs
    .map((n) => ({ key: n.key, amount: round2(n.amount - pairs.filter((p) => p.toKey === n.key).reduce((s, p) => s + p.amount, 0)) }))
    .filter((n) => n.amount > 0.004);
}

export const JUSTIFY_REASONS = ['unexpected cost', 'price increase', 'emergency', 'underestimated', 'other'] as const;

// ---------------------------------------------------------------------------
// Overspend settlements (Cover or justify)

export const OVERSPEND_REASONS: { value: OverspendReason; label: string }[] = [
  { value: 'unexpected_cost', label: 'Unexpected cost' },
  { value: 'price_increase', label: 'Price went up' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'plan_too_low', label: 'Plan was too low' },
  { value: 'impulse', label: 'Impulse or unplanned spending' },
  { value: 'other', label: 'Other' },
];

export const EXTERNAL_SOURCES: { value: OverspendExternalSource; label: string }[] = [
  { value: 'savings_outside_plan', label: 'Savings (outside the plan)' },
  { value: 'loan', label: 'Borrowed / loan' },
  { value: 'extra_income', label: 'Extra income not in the budget' },
  { value: 'untracked_cash', label: 'Personal cash not tracked in the budget' },
  { value: 'unplanned_reallocation', label: 'Money pulled from somewhere without planning' },
  { value: 'not_covered', label: 'Not covered yet' },
];

export const AVOIDABILITY: { value: OverspendAvoidability; label: string }[] = [
  { value: 'avoidable', label: 'Avoidable' },
  { value: 'partly', label: 'Partly avoidable' },
  { value: 'unavoidable', label: 'Unavoidable' },
];

// Legacy item justifications stored the label itself ('price increase').
const LEGACY_REASON_LABELS: Record<string, string> = {
  'unexpected cost': 'Unexpected cost',
  'price increase': 'Price went up',
  emergency: 'Emergency',
  underestimated: 'Plan was too low',
  other: 'Other',
};

/** Display label for a settlement or legacy justification reason. */
export function reasonLabel(reason: string): string {
  return OVERSPEND_REASONS.find((r) => r.value === reason)?.label ?? LEGACY_REASON_LABELS[reason] ?? reason;
}

export function externalSourceLabel(source: OverspendExternalSource): string {
  return EXTERNAL_SOURCES.find((s) => s.value === source)?.label ?? source;
}

export function avoidabilityLabel(value: OverspendAvoidability): string {
  return AVOIDABILITY.find((a) => a.value === value)?.label ?? value;
}
