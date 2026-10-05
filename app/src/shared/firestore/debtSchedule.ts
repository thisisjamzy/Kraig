'use client';

// Scheduled debt repayments' writes. Each dated repayment lives on the
// debt (paymentPlan.scheduled) and, unless the debt is record only with
// nothing paying it from an account, has a budget line: a one-off, Fixed,
// Must have item of the managed "Debt repayments" basket, named after the
// debt and date ("Momokash loan, 15 Dec"), with the debt's priority. Being
// a basket item, it shows in Payments, Upcoming payments, Priorities, Ready
// to pay and the forecast with no extra wiring (src/shared/budget/
// occurrences.ts derives those from items).
//
// The lines are rewritten from the debt whenever it changes (a scheduled
// repayment saved or deleted, the plan changed, a repayment recorded), so
// an "Everything left" line always holds the balance left on its date.
// Recording a line (Ready to pay's confirm, Mark paid) records the
// repayment on the debt through recordRepayment, with the debt's wallet
// effect rules, and links the expense to the line.

import { deleteField, getDoc, runTransaction, serverTimestamp, Timestamp, type Transaction } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { bucketLineItemRef, bucketRef, categoryRef, debtRef } from './refs';
import { recalcBucketTotals, recordRepayment, syncLinkedItemPayment } from './aggregation';
import { writeDebtActivity } from './debtWrites';
import type { CurrencyContext } from './currency';
import { repaymentSchedule, type ScheduledLike } from '../../viewmodels/debtSchedule';
import type { PlanLike } from '../../viewmodels/debt';
import type { DebtPaidFrom, DebtPriority, FirestoreDebt, FirestoreScheduledRepayment, ItemAutomation, Priority } from './types';

export const REPAYMENTS_BASKET_ID = 'debt-repayments';
export const REPAYMENTS_CATEGORY_ID = 'debt-repayments';

const PRIORITY: Record<DebtPriority, Priority> = { low: 'Low', medium: 'Medium', high: 'High' };
const short = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export const lineIdOf = (debtId: string, scheduledId: string) => `debt_${debtId}_${scheduledId}`;

type DebtDoc = Omit<FirestoreDebt, 'id'>;

export function planLikeOf(debt: Pick<DebtDoc, 'paymentPlan'>): PlanLike | null {
  const r = debt.paymentPlan.type === 'recurring' ? debt.paymentPlan.recurring : undefined;
  if (!r) return null;
  return {
    amount: r.amount,
    interval: r.interval,
    nextPaymentDate: r.nextPaymentDate.toDate(),
    isActive: r.isActive,
    nextOverride: r.nextOverride ? { amount: r.nextOverride.amount, date: r.nextOverride.date.toDate() } : null,
  };
}

export function scheduledLikeOf(list: FirestoreScheduledRepayment[] | undefined): ScheduledLike[] {
  return (list ?? []).map((s) => ({ id: s.id, date: s.date.toDate(), amountMode: s.amountMode, amount: s.amount, recorded: Boolean(s.repaymentId) }));
}

/** A record-only debt paid from nowhere is tracked on the debt only. */
export function hasBudgetLine(debt: Pick<DebtDoc, 'debtType'>, paidFrom: DebtPaidFrom | null): boolean {
  return debt.debtType === 'cash' || Boolean(paidFrom);
}

function automationOf(s: Pick<FirestoreScheduledRepayment, 'automation' | 'paidFrom'>): ItemAutomation {
  const p = s.paidFrom;
  if (p?.kind === 'anyIncome') return { mode: s.automation, trigger: 'any_income', amountMode: 'fixed' };
  if (p?.kind === 'incomeLine') return { mode: s.automation, trigger: 'income', incomeItemId: p.itemId, amountMode: 'fixed' };
  return { mode: s.automation, trigger: 'due', amountMode: 'fixed' };
}

function accountOf(debt: Pick<DebtDoc, 'accountId'>, p: DebtPaidFrom | null): string | null {
  if (p?.kind === 'account') return p.accountId;
  if (p?.kind === 'savings') return p.accountId;
  return debt.accountId ?? null;
}

/** Reads everything rewriting the lines needs (a transaction reads before it writes). */
async function readLines(tx: Transaction, uid: string, debtId: string, scheduled: FirestoreScheduledRepayment[], extraItemIds: string[]) {
  const ids = [...new Set([...scheduled.map((s) => s.itemId ?? lineIdOf(debtId, s.id)), ...extraItemIds])];
  const [basket, category, ...items] = await Promise.all([
    tx.get(bucketRef(uid, REPAYMENTS_BASKET_ID)),
    tx.get(categoryRef(uid, REPAYMENTS_CATEGORY_ID)),
    ...ids.map((id) => tx.get(bucketLineItemRef(uid, REPAYMENTS_BASKET_ID, id))),
  ]);
  return { basket, category, items: new Map(ids.map((id, i) => [id, items[i]])) };
}

/**
 * Writes the debt's scheduled list and its budget lines: creates the
 * managed basket and category the first time, sets each pending line's
 * name, date, amount (Everything left resolved), paid from and
 * automation, and removes lines in `removeItemIds` that nothing was paid
 * against. A line already paid is never changed.
 */
function writeLines(
  tx: Transaction,
  uid: string,
  debtId: string,
  debt: DebtDoc,
  scheduled: FirestoreScheduledRepayment[],
  read: Awaited<ReturnType<typeof readLines>>,
  removeItemIds: string[],
  currency: string
): FirestoreScheduledRepayment[] {
  if (!read.basket.exists()) {
    tx.set(bucketRef(uid, REPAYMENTS_BASKET_ID), {
      name: 'Debt repayments',
      description: 'Scheduled repayments of your debts. Dreda keeps this basket up to date from each debt.',
      totalAmount: 0,
      lineItemCount: 0,
      completedLineItemCount: 0,
      amountCompleted: 0,
      currency,
      deadline: null,
      archived: false,
      kind: 'Fixed',
      type: 'Expense',
      managed: 'debt_repayments',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as never);
  }
  if (!read.category.exists()) {
    tx.set(categoryRef(uid, REPAYMENTS_CATEGORY_ID), { name: 'Debt repayments', transactionType: 'Expense', group: null, archived: false });
  }

  const schedule = repaymentSchedule(debt.currentBalance, planLikeOf(debt), scheduledLikeOf(scheduled));
  const out: FirestoreScheduledRepayment[] = [];
  for (const s of scheduled) {
    const wantsLine = hasBudgetLine(debt, s.paidFrom);
    const id = s.itemId ?? lineIdOf(debtId, s.id);
    const snap = read.items.get(id);
    const paid = Boolean(snap?.exists() && (snap.data()?.payments?.length || snap.data()?.completed));
    if (s.repaymentId || paid) {
      out.push(s);
      continue;
    }
    if (!wantsLine) {
      if (snap?.exists()) tx.delete(bucketLineItemRef(uid, REPAYMENTS_BASKET_ID, id));
      out.push({ ...s, itemId: null });
      continue;
    }
    const date = s.date.toDate();
    const amount = schedule.amountOf.get(s.id) ?? s.amount ?? 0;
    const fields = {
      goalId: REPAYMENTS_BASKET_ID,
      name: `${debt.name}, ${short(date)}`,
      description: s.note,
      amount,
      priority: PRIORITY[debt.priority] ?? 'Medium',
      necessity: 'MustHave' as const,
      expenseKind: 'Fixed' as const,
      categoryId: REPAYMENTS_CATEGORY_ID,
      accountId: accountOf(debt, s.paidFrom),
      toAccountId: null,
      charges: null,
      dueDate: s.date,
      recurrence: null,
      automation: automationOf(s),
      debtId,
      scheduledRepaymentId: s.id,
      source: 'budget_line' as const,
      updatedAt: serverTimestamp(),
    };
    if (snap?.exists()) tx.update(bucketLineItemRef(uid, REPAYMENTS_BASKET_ID, id), fields as never);
    else
      tx.set(bucketLineItemRef(uid, REPAYMENTS_BASKET_ID, id), {
        ...fields,
        subItems: [],
        rank: Date.now(),
        completed: false,
        completedAt: null,
        expenseId: null,
        transferId: null,
        createdAt: serverTimestamp(),
      } as never);
    out.push({ ...s, itemId: id });
  }
  for (const id of removeItemIds) {
    const snap = read.items.get(id);
    if (snap?.exists() && !snap.data()?.payments?.length && !snap.data()?.completed) tx.delete(bucketLineItemRef(uid, REPAYMENTS_BASKET_ID, id));
  }
  return out;
}

export interface ScheduledInput {
  id?: string;
  date: Date;
  amountMode: 'set' | 'everything';
  amount: number | null;
  paidFrom: DebtPaidFrom | null;
  automation: ItemAutomation['mode'];
  note: string;
}

/** Plans (or changes) one scheduled repayment and rewrites the debt's budget lines. */
export async function saveScheduledRepayment(uid: string, debtId: string, input: ScheduledInput, format: (n: number) => string): Promise<string> {
  const id = input.id ?? crypto.randomUUID().slice(0, 12);
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(debtRef(uid, debtId));
    const debt = snap.data() as DebtDoc | undefined;
    if (!debt) throw new Error('This debt no longer exists.');
    const current = debt.paymentPlan.scheduled ?? [];
    const before = current.find((s) => s.id === id);
    if (before?.repaymentId) throw new Error('This repayment is already recorded.');
    const entry: FirestoreScheduledRepayment = {
      id,
      date: Timestamp.fromDate(input.date),
      amountMode: input.amountMode,
      amount: input.amountMode === 'set' ? input.amount : null,
      paidFrom: input.paidFrom,
      automation: input.automation,
      note: input.note,
      itemId: before?.itemId ?? null,
      repaymentId: null,
    };
    const next = before ? current.map((s) => (s.id === id ? entry : s)) : [...current, entry];
    const read = await readLines(tx, uid, debtId, next, []);
    const written = writeLines(tx, uid, debtId, debt, next, read, [], debt.currency);
    tx.update(debtRef(uid, debtId), { 'paymentPlan.scheduled': written, updatedAt: serverTimestamp() } as never);
    const what = input.amountMode === 'everything' ? 'Everything left' : format(input.amount ?? 0);
    writeDebtActivity(tx, uid, debtId, {
      kind: 'plan',
      title: before ? 'Scheduled repayment changed' : 'Repayment planned',
      changes: [],
      lines: [`${what} on ${short(input.date)}.`],
    });
  });
  await recalcBucketTotals(uid, REPAYMENTS_BASKET_ID).catch(() => undefined);
  return id;
}

/** Removes a scheduled repayment and its budget line (a recorded one stays as history). */
export async function deleteScheduledRepayment(uid: string, debtId: string, scheduledId: string): Promise<void> {
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(debtRef(uid, debtId));
    const debt = snap.data() as DebtDoc | undefined;
    if (!debt) throw new Error('This debt no longer exists.');
    const current = debt.paymentPlan.scheduled ?? [];
    const gone = current.find((s) => s.id === scheduledId);
    if (!gone) return;
    if (gone.repaymentId) throw new Error('This repayment is already recorded.');
    const next = current.filter((s) => s.id !== scheduledId);
    const removeIds = gone.itemId ? [gone.itemId] : [];
    const read = await readLines(tx, uid, debtId, next, removeIds);
    const written = writeLines(tx, uid, debtId, debt, next, read, removeIds, debt.currency);
    tx.update(debtRef(uid, debtId), { 'paymentPlan.scheduled': written.length ? written : deleteField(), updatedAt: serverTimestamp() } as never);
    writeDebtActivity(tx, uid, debtId, { kind: 'plan', title: 'Scheduled repayment removed', changes: [], lines: [`${short(gone.date.toDate())}.`] });
  });
  await recalcBucketTotals(uid, REPAYMENTS_BASKET_ID).catch(() => undefined);
}

/**
 * Rewrites a debt's budget lines from its current balance and plan, after
 * a repayment is recorded or the plan changes, so "Everything left" stays
 * right. A no-op for a debt with nothing scheduled.
 */
export async function syncScheduledLines(uid: string, debtId: string): Promise<void> {
  const first = (await getDoc(debtRef(uid, debtId))).data() as DebtDoc | undefined;
  if (!first?.paymentPlan.scheduled?.length) return;
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(debtRef(uid, debtId));
    const debt = snap.data() as DebtDoc | undefined;
    const current = debt?.paymentPlan.scheduled ?? [];
    if (!debt || !current.length) return;
    const read = await readLines(tx, uid, debtId, current, []);
    const written = writeLines(tx, uid, debtId, debt, current, read, [], debt.currency);
    tx.update(debtRef(uid, debtId), { 'paymentPlan.scheduled': written } as never);
  });
  await recalcBucketTotals(uid, REPAYMENTS_BASKET_ID).catch(() => undefined);
}

/**
 * Records a Debt repayments line (Ready to pay's confirm or Mark paid): the
 * repayment on the debt, with its wallet effect, and the expense linked to
 * the line. Returns the expense's id (null for a record-only debt paid
 * from no account).
 */
export async function recordScheduledLine(
  uid: string,
  line: { bucketId: string; itemId: string; month: string },
  payment: { amount: number; accountId: string | null; date: Date },
  ctx: CurrencyContext
): Promise<{ repaymentId: string; transactionId: string | null }> {
  const item = (await getDoc(bucketLineItemRef(uid, line.bucketId, line.itemId))).data();
  if (!item?.debtId) throw new Error('This line is not a debt repayment.');
  const debtSnap = await getDoc(debtRef(uid, item.debtId));
  const debt = debtSnap.data() as DebtDoc | undefined;
  if (!debt) throw new Error('The debt for this repayment no longer exists.');
  const { repaymentId, transactionId } = await recordRepayment(
    uid,
    { ...debt, id: item.debtId },
    {
      amount: payment.amount,
      date: payment.date,
      notes: item.description ?? '',
      method: 'planned',
      accountId: payment.accountId,
      categoryId: REPAYMENTS_CATEGORY_ID,
      bucketItem: line,
      scheduledId: item.scheduledRepaymentId ?? null,
    },
    ctx
  );
  if (transactionId) await syncLinkedItemPayment(uid, line, transactionId, 'expense', { amount: payment.amount, date: payment.date });
  await syncScheduledLines(uid, item.debtId);
  return { repaymentId, transactionId };
}
