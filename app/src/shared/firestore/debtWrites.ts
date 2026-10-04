'use client';

// Debt writes beyond creating a debt and recording a repayment (those stay
// in aggregation.ts, which Add transaction and Import also use): the wallet
// effect switch and the cash-debt edits that move money (through
// src/shared/debt/walletEffectRun.ts, in one runTransaction), undo, details,
// payment plan, archive and delete. Every change adds an entry to the
// debt's activity log (users/{uid}/debts/{id}/activity).

import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type Transaction,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { debtActivityRef, debtRef, repaymentsRef, transactionsRef } from './refs';
import { fromStored, toStored } from './storedDates';
import type { CurrencyContext } from './currency';
import type { DebtPaidFrom, DebtPriority, FirestoreDebt, FirestoreDebtPaymentPlan } from './types';
import type { WalletChange } from '@/src/shared/debt/walletEffect';
import {
  runDeleteDebt,
  runWalletChange,
  undoWalletChange,
  type LedgerDoc,
  type LedgerStore,
  type RunResult,
} from '@/src/shared/debt/walletEffectRun';

/** walletEffectRun's store, on Firestore: paths live under users/{uid}. */
export function debtLedgerStore(uid: string): LedgerStore {
  const db = getFirebaseFirestore();
  const ref = (path: string) => doc(db, 'users', uid, ...path.split('/'));
  return {
    async linkedTransactionIds(debtId) {
      const snap = await getDocs(query(transactionsRef(uid), where('linkedDebtId', '==', debtId)));
      return snap.docs.map((d) => d.id);
    },
    async repaymentIds(debtId) {
      const snap = await getDocs(repaymentsRef(uid, debtId));
      return snap.docs.map((d) => d.id);
    },
    newId: () => crypto.randomUUID(),
    run: (fn) =>
      runTransaction(db, (tx: Transaction) =>
        fn({
          async get(path) {
            const snap = await tx.get(ref(path));
            return snap.exists() ? (fromStored(snap.data()) as LedgerDoc) : null;
          },
          set: (path, data) => void tx.set(ref(path), toStored(data) as LedgerDoc),
          merge: (path, data) => void tx.set(ref(path), toStored(data) as LedgerDoc, { merge: true }),
          delete: (path) => void tx.delete(ref(path)),
        })
      ),
  };
}

/**
 * Switches a debt between cash debt and record only, or edits a cash
 * debt's amount, account or date, correcting balances and month figures in
 * the same transaction. Returns the change id for undo.
 */
export async function changeDebtWalletEffect(
  uid: string,
  debtId: string,
  change: WalletChange,
  ctx: CurrencyContext,
  format?: (n: number) => string
): Promise<RunResult> {
  return runWalletChange(debtLedgerStore(uid), { debtId, change, ctx, now: new Date(), changeId: crypto.randomUUID(), uid, format });
}

export async function undoDebtChange(uid: string, debtId: string, changeId: string): Promise<void> {
  await undoWalletChange(debtLedgerStore(uid), { debtId, changeId, undoId: crypto.randomUUID(), now: new Date(), uid });
}

export async function deleteDebt(uid: string, debtId: string, ctx: CurrencyContext): Promise<void> {
  const activity = await getDocs(debtActivityRef(uid, debtId));
  await runDeleteDebt(debtLedgerStore(uid), { debtId, ctx, now: new Date(), uid, activityIds: activity.docs.map((d) => d.id) });
}

/** Adds an activity entry inside a write that's already running. */
export function writeDebtActivity(
  tx: Transaction,
  uid: string,
  debtId: string,
  entry: { kind: string; title: string; changes?: { label: string; from: string; to: string }[]; lines?: string[] }
): string {
  const id = crypto.randomUUID();
  tx.set(doc(collection(getFirebaseFirestore(), 'users', uid, 'debts', debtId, 'activity'), id), {
    at: Timestamp.now(),
    kind: entry.kind,
    title: entry.title,
    changes: entry.changes ?? [],
    lines: entry.lines ?? [],
    plan: null,
    undoneAt: null,
    undoOf: null,
  });
  return id;
}

export interface DebtDetailsInput {
  name: string;
  lender: string;
  priority: DebtPriority;
  notes: string;
}

const PRIORITY_WORD: Record<DebtPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** Name, lender, priority and notes: no money moves. */
export async function updateDebtDetails(uid: string, debtId: string, input: Partial<DebtDetailsInput>): Promise<void> {
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(debtRef(uid, debtId));
    const debt = snap.data();
    if (!debt) throw new Error('This debt no longer exists.');
    const changes: { label: string; from: string; to: string }[] = [];
    if (input.name !== undefined && input.name !== debt.name) changes.push({ label: 'Name', from: debt.name, to: input.name });
    if (input.lender !== undefined && input.lender !== (debt.lender ?? '')) changes.push({ label: 'Lender', from: debt.lender || 'None', to: input.lender || 'None' });
    if (input.priority !== undefined && input.priority !== debt.priority) changes.push({ label: 'Priority', from: PRIORITY_WORD[debt.priority], to: PRIORITY_WORD[input.priority] });
    const notesChanged = input.notes !== undefined && input.notes !== debt.notes;
    if (changes.length === 0 && !notesChanged) return;
    tx.update(debtRef(uid, debtId), { ...input, updatedAt: serverTimestamp() });
    // Notes are saved as you type; they don't fill the log.
    if (changes.length) writeDebtActivity(tx, uid, debtId, { kind: 'details', title: changes.length === 1 ? `${changes[0].label} changed` : 'Details changed', changes });
  });
}

export interface DebtPlanInput {
  amount: number;
  interval: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  firstPayment: Date;
  paidFrom: DebtPaidFrom | null;
  automation: 'off' | 'remind' | 'prepare';
}

export const INTERVAL_WORD: Record<DebtPlanInput['interval'], string> = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly', yearly: 'yearly' };

export function planText(plan: FirestoreDebtPaymentPlan, format: (n: number) => string): string {
  const r = plan.type === 'recurring' ? plan.recurring : undefined;
  if (!r) return 'No plan';
  return `${format(r.amount)} ${INTERVAL_WORD[r.interval]}`;
}

/**
 * Sets or clears the payment plan. `scope: 'next'` changes only the next
 * payment (its amount and date) and leaves the plan as it is after it.
 */
export async function updateDebtPlan(
  uid: string,
  debtId: string,
  input: DebtPlanInput | null,
  scope: 'future' | 'next',
  format: (n: number) => string
): Promise<void> {
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(debtRef(uid, debtId));
    const debt = snap.data() as Omit<FirestoreDebt, 'id'> | undefined;
    if (!debt) throw new Error('This debt no longer exists.');
    const current = debt.paymentPlan.type === 'recurring' ? debt.paymentPlan.recurring : undefined;
    let next: FirestoreDebtPaymentPlan;
    let title: string;
    if (scope === 'next' && current && input) {
      next = { type: 'recurring', recurring: { ...current, nextOverride: { amount: input.amount, date: Timestamp.fromDate(input.firstPayment) } } };
      title = 'Next payment changed';
    } else {
      next = input
        ? {
            type: 'recurring',
            recurring: {
              amount: input.amount,
              interval: input.interval,
              nextPaymentDate: Timestamp.fromDate(input.firstPayment),
              isActive: true,
              paidFrom: input.paidFrom,
              automation: input.automation,
              nextOverride: null,
            },
          }
        : { type: 'none' };
      title = input ? (current ? 'Payment plan changed' : 'Payment plan set') : 'Payment plan removed';
    }
    tx.update(debtRef(uid, debtId), { paymentPlan: next, updatedAt: serverTimestamp() });
    const from = planText(debt.paymentPlan, format);
    const to = scope === 'next' && input ? `${format(input.amount)} on ${input.firstPayment.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : planText(next, format);
    writeDebtActivity(tx, uid, debtId, { kind: 'plan', title, changes: from === to ? [] : [{ label: scope === 'next' ? 'Next payment' : 'Payment plan', from, to }] });
  });
}

export async function setDebtArchived(uid: string, debtId: string, archived: boolean): Promise<void> {
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    tx.update(debtRef(uid, debtId), { archivedAt: archived ? serverTimestamp() : null, updatedAt: serverTimestamp() });
    writeDebtActivity(tx, uid, debtId, { kind: 'archived', title: archived ? 'Archived' : 'Restored from the archive' });
  });
}
