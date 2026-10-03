// Automated payments: prepare, then confirm. The app records money, it
// never moves real money — "automated" means that when a trigger fires
// (a line's due date, one income line arriving, or any income arriving)
// the app prepares the line's payment in the Ready to pay queue, and the
// household confirms it with one tap. Pure, unit tested in
// test/budgetFlow.test.ts; src/shared/firestore/paymentQueue.ts does the
// reads and writes.
//
// Idempotent by construction: one queue entry per line occurrence, with a
// deterministic id (queueId), and an occurrence that already has an entry,
// whatever its status, is never prepared again.

import type { ItemMonth, MonthBudget } from './monthBudget';
import type { Priority } from '../firestore/types';

const r2 = (n: number) => Math.round(n * 100) / 100;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** templateId__yyyyMM — one entry per line occurrence. */
export function queueId(itemId: string, month: string): string {
  return `${itemId}__${month.replace('-', '')}`;
}

export interface IncomeEvent {
  /** The income line's key, or null for "any income". */
  key: string | null;
  itemId: string | null;
  name: string;
  amount: number;
}

export interface QueueDraft {
  id: string;
  bucketId: string;
  itemId: string;
  month: string;
  flow: 'Expense' | 'Savings' | 'Transfer';
  name: string;
  bucketName: string;
  amount: number;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  fee: number;
  first: boolean;
  due: Date | null;
  priority: Priority;
  trigger: { kind: 'due' | 'income' | 'any_income'; incomeKey: string | null; incomeName: string | null; incomeAmount: number | null };
}

/** Income received so far this month, per line, and in total. */
export function incomeEvents(budget: MonthBudget): { byItem: Map<string, IncomeEvent>; any: IncomeEvent | null } {
  const byItem = new Map<string, IncomeEvent>();
  const received = budget.items.filter((entry) => entry.type === 'Income' && entry.actual > 0);
  for (const entry of received) {
    byItem.set(entry.itemId, { key: entry.key, itemId: entry.itemId, name: entry.name, amount: entry.actual });
  }
  const total = r2(budget.actualIncome);
  if (total <= 0) return { byItem, any: null };
  // "Any income": named after the line when exactly one arrived.
  const any: IncomeEvent =
    received.length === 1 ? { ...byItem.get(received[0].itemId)!, amount: total } : { key: null, itemId: null, name: 'Income', amount: total };
  return { byItem, any };
}

/** Prepared first: absolute savings and Must have expenses. */
export function isFirst(entry: Pick<ItemMonth, 'type' | 'savingsMode' | 'necessity'>): boolean {
  return (entry.type === 'Savings' && entry.savingsMode === 'absolute') || (entry.type === 'Expense' && entry.necessity === 'MustHave');
}

/**
 * The payments whose trigger has fired and that aren't in the queue yet.
 * `existing` holds every queue id already written (any status).
 */
export function preparePayments(budget: MonthBudget, today: Date, existing: Set<string>): QueueDraft[] {
  const events = incomeEvents(budget);
  const out: QueueDraft[] = [];
  for (const entry of budget.items) {
    if (entry.type === 'Income' || entry.archived || entry.closed) continue;
    const a = entry.automation;
    if (a.mode !== 'prepare') continue;
    const id = queueId(entry.itemId, entry.month);
    if (existing.has(id)) continue;

    let event: IncomeEvent | null = null;
    const trigger = a.trigger ?? 'any_income';
    if (trigger === 'due') {
      if (!entry.due || startOfDay(entry.due) > startOfDay(today)) continue;
    } else if (trigger === 'income') {
      event = (a.incomeItemId && events.byItem.get(a.incomeItemId)) || null;
      if (!event) continue;
    } else {
      event = events.any;
      if (!event) continue;
    }

    const owed = r2(entry.available - entry.actual);
    const amount =
      a.amountMode === 'percent' && a.percent && event ? r2(Math.max(0, (a.percent / 100) * event.amount - entry.actual)) : owed;
    if (amount <= 0) continue;

    out.push({
      id,
      bucketId: entry.bucketId,
      itemId: entry.itemId,
      month: entry.month,
      flow: entry.type as QueueDraft['flow'],
      name: entry.name,
      bucketName: entry.bucketName,
      amount,
      accountId: a.accountId ?? entry.accountId,
      toAccountId: entry.toAccountId,
      categoryId: entry.categoryId,
      fee: entry.fee,
      first: isFirst(entry),
      due: entry.due,
      priority: entry.priority ?? 'Medium',
      trigger: {
        kind: trigger,
        incomeKey: event?.key ?? null,
        incomeName: event?.name ?? null,
        incomeAmount: event ? r2(event.amount) : null,
      },
    });
  }
  return out;
}

const PRIORITY_RANK: Record<Priority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

export interface Queued {
  id: string;
  name: string;
  amount: number;
  fee?: number;
  first: boolean;
  due: Date | null;
  priority: Priority;
}

/** Absolute savings and Must have first, then by due date, then priority. */
export function queueOrder<T extends Queued>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      Number(b.first) - Number(a.first) ||
      (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.name.localeCompare(b.name)
  );
}

/**
 * What the money received covers, in priority order. Proposal stops at the
 * first payment that doesn't fit, so a lower-priority payment never jumps
 * ahead of a higher one; everything from there on waits under "Not enough
 * yet" for the next income. A transfer's fee counts toward what it needs.
 */
export function proposeQueue<T extends Queued>(entries: T[], available: number): { proposed: T[]; notEnough: T[]; total: number } {
  const ordered = queueOrder(entries);
  const proposed: T[] = [];
  let left = r2(Math.max(0, available));
  let index = 0;
  for (; index < ordered.length; index++) {
    const need = r2(ordered[index].amount + (ordered[index].fee ?? 0));
    if (need > left + 0.004) break;
    proposed.push(ordered[index]);
    left = r2(left - need);
  }
  return { proposed, notEnough: ordered.slice(index), total: r2(proposed.reduce((s, e) => s + e.amount + (e.fee ?? 0), 0)) };
}

/** Does an income amount match an expected line (within 10%)? */
export function matchesExpected(amount: number, expected: number): boolean {
  return expected > 0 && Math.abs(amount - expected) <= expected * 0.1;
}

/**
 * "Did AIMS salary (1,013,381) arrive?" — expected income lines whose date
 * has passed with nothing received, unless answered "Not yet" today.
 */
export function incomePrompts(budget: MonthBudget, today: Date, snoozed: Record<string, string> = {}): ItemMonth[] {
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return budget.items
    .filter(
      (entry) =>
        entry.type === 'Income' &&
        !entry.archived &&
        !entry.closed &&
        entry.planned > 0 &&
        entry.actual === 0 &&
        entry.due !== null &&
        startOfDay(entry.due) < startOfDay(today) &&
        (snoozed[entry.key] ?? '') < day
    )
    .sort((a, b) => a.due!.getTime() - b.due!.getTime());
}
