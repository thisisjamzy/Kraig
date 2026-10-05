// Planned payment occurrences, derived. Ready to pay, Upcoming payments,
// Payments, Priorities and the forecast all read the CURRENT basket items
// (monthBudget.ts derives each month's lines from them, including debt
// repayments, which are items of the managed "Debt repayments" basket), so
// an edit to an item shows everywhere at once. Nothing here is a stored
// copy of an item.
//
// What IS stored is only what the user did to one occurrence, in
// users/{uid}/paymentQueue/{itemId__yyyyMM} (automation.ts's queueId):
// confirmed (with the record ids), skipped, postponed, or an amount edited
// before confirming. Those docs are read here as `actions`.
//
// Rules (tested in test/occurrences.test.ts):
//   - Confirmed and skipped occurrences never show again and are never
//     changed automatically.
//   - An unconfirmed occurrence takes the item's current values.
//   - An amount edited before confirming is kept only while the item's
//     amount is what it was when the edit was made; once the item changes,
//     the edit is dropped and the row says "Updated" (old and new amounts).
//   - A payment waiting for an income not received yet is "Waiting for
//     income"; once the income arrives it's ready.
//   - A deleted, archived or closed item, or one not due this month, has
//     no occurrence at all.
//
// Pure: no Firestore, no React.

import { incomeEvents, paymentOf, type QueueDraft } from './automation';
import type { MonthBudget } from './monthBudget';

export type OccurrenceStatus = 'ready' | 'confirmed' | 'skipped' | 'postponed';

/** A stored action on one occurrence (a paymentQueue doc, read loosely). */
export interface OccurrenceAction {
  id: string;
  status: OccurrenceStatus;
  /** The amount the user typed before confirming. */
  amountEdit?: number | null;
  /** The item's amount when that edit was made. */
  amountEditBase?: number | null;
  /** Postponed: hidden until this day (yyyy-MM-dd). */
  postponedUntil?: string | null;
}

export interface Occurrence extends QueueDraft {
  /** Ready to confirm, or waiting for an income not received yet. */
  state: 'ready' | 'waiting';
  waitingFor: string | null;
  /** What the item itself asks for now. */
  planned: number;
  /** The user's own amount is in use. */
  edited: boolean;
  /** An edit dropped because the item changed: "was 150,000, now 160,000". */
  updated: { from: number; to: number } | null;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

export function deriveOccurrences(
  budget: MonthBudget,
  today: Date,
  actions: Map<string, OccurrenceAction>,
  incomeName?: (itemId: string) => string | undefined
): Occurrence[] {
  const events = incomeEvents(budget);
  const names = incomeName ?? ((itemId: string) => budget.items.find((i) => i.itemId === itemId && i.type === 'Income')?.name);
  const out: Occurrence[] = [];
  for (const entry of budget.items) {
    const payment = paymentOf(entry, today, events, names);
    if (!payment) continue;
    // A due date not reached isn't in Ready to pay at all: it's upcoming.
    if (!payment.fired && !payment.waitingFor) continue;
    const { draft } = payment;
    const action = actions.get(draft.id);
    if (action && (action.status === 'confirmed' || action.status === 'skipped')) continue;
    if (action?.status === 'postponed' && (action.postponedUntil ?? '') > dayKey(today)) continue;

    let amount = draft.amount;
    let edited = false;
    let updated: Occurrence['updated'] = null;
    if (action?.amountEdit != null && action.amountEdit > 0) {
      if (action.amountEditBase != null && same(action.amountEditBase, draft.amount)) {
        amount = action.amountEdit;
        edited = true;
      } else {
        updated = { from: action.amountEdit, to: draft.amount };
      }
    }
    out.push({ ...draft, amount, planned: draft.amount, edited, updated, state: payment.fired ? 'ready' : 'waiting', waitingFor: payment.fired ? null : payment.waitingFor });
  }
  return out;
}

/** Stored action docs that no longer match an occurrence (the item changed, was deleted, or the month passed). */
export function staleActions(occurrences: Occurrence[], actions: OccurrenceAction[]): OccurrenceAction[] {
  const live = new Set(occurrences.map((o) => o.id));
  return actions.filter((a) => a.status === 'ready' || a.status === 'postponed' ? !live.has(a.id) : false);
}

/**
 * The one-time repair: older versions stored a full copy of each prepared
 * payment. Compares each still-waiting copy with what the item asks for
 * now. `changed` copies get their amount or account from the item;
 * `removed` ones no longer have an occurrence. Only plain copies are
 * touched: confirmed and skipped entries stay as they are.
 */
export function repairPlan(
  occurrences: Occurrence[],
  stored: { id: string; status: string; amount?: number; accountId?: string | null; amountEdit?: number | null }[]
): { changed: string[]; removed: string[]; report: string | null } {
  const byId = new Map(occurrences.map((o) => [o.id, o]));
  const changed: string[] = [];
  const removed: string[] = [];
  for (const s of stored) {
    if (s.status !== 'ready') continue;
    const live = byId.get(s.id);
    if (!live) removed.push(s.id);
    else if (s.amountEdit == null && ((s.amount != null && !same(s.amount, live.planned)) || (s.accountId ?? null) !== (live.accountId ?? null))) changed.push(s.id);
  }
  const n = changed.length + removed.length;
  const report = n ? `${n} waiting ${n === 1 ? 'payment was' : 'payments were'} updated to match your baskets.` : null;
  return { changed, removed, report };
}
