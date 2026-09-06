'use client';

// PRD-AUDIT-RECONCILIATION.md — Historic Transaction Backfill (section 1)
// and Balance Reconciliation via the Unjustified wallet (section 2). Named
// distinctly from src/shared/firestore/reconciliation.ts on purpose — that
// module is a DIFFERENT feature (Settings > Audit & reconcile balances: a
// data-integrity check comparing each wallet's stored currentBalance
// against what its own transaction history sums to). This module is about
// comparing the ledger against what the household reports their accounts
// actually hold in the real world, and closing that gap one historic
// transaction at a time. The two are easy to conflate by name; they don't
// share any code or data.

import { getDoc, getDocs, setDoc, updateDoc, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import {
  accountsRef,
  transactionsRef,
  transfersRef,
  reconciliationsRef,
  reconciliationRef,
  UNJUSTIFIED_WALLET_ID,
  unjustifiedWalletRef,
} from './refs';
import {
  createTransactionWithAggregation,
  recordTransactionExplainingUnjustifiedBalance,
  recordIncomeExplainingUnjustifiedBalance,
  createTransferWithAggregation,
  deleteBackfillBatch as deleteBackfillBatchTransactions,
} from './aggregation';
import { round2, type CurrencyContext } from './currency';
import type { FirestoreAccount, FirestoreTransaction, FirestoreTransfer, FirestoreReconciliation } from './types';
import type { TRANSFER_CATEGORIES } from '../../viewmodels/categories';

type TransferKind = (typeof TRANSFER_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// The Unjustified wallet itself
// ---------------------------------------------------------------------------

/**
 * Creates the one household-wide Unjustified wallet if it doesn't already
 * exist — called both from ensureUserDoc.ts (a brand new account) and
 * lazily from the Reconciliation screen's own load (an existing account
 * that predates this feature), so either path is safe to call repeatedly.
 */
export async function ensureUnjustifiedWallet(uid: string, defaultCurrency: string): Promise<void> {
  const ref = unjustifiedWalletRef(uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    name: 'Unjustified',
    type: 'System',
    currency: defaultCurrency,
    startingBalance: 0,
    currentBalance: 0,
    notes:
      'Tracks the gap between what the ledger records and what a reconciliation check reports as real — see Settings > Reconciliation. Not a real spendable account.',
    archived: false,
    isSystemWallet: true,
    systemType: 'unjustified',
  });
}

export { UNJUSTIFIED_WALLET_ID };

// ---------------------------------------------------------------------------
// Reconciliation (section 2.3, 2.4)
// ---------------------------------------------------------------------------

export interface ReconciliationResult {
  totalLedger: number;
  totalReported: number;
  totalGap: number;
}

/**
 * Sets the Unjustified wallet's balance to the freshly measured gap — a
 * deliberate full reset, not an incremental adjustment, since each
 * reconciliation is meant to be an authoritative re-check of the truth,
 * not a guess layered on a guess (section 2.3's own reasoning). Reads
 * every real wallet (accounts minus the Unjustified one itself), so this
 * intentionally does NOT run inside a single runTransaction — the number
 * of wallets is unbounded across households in principle, and Firestore
 * transactions cap how many documents they can touch; a plain read-then-
 * two-writes sequence matches this app's existing "no locking, last-write-
 * wins" trust model (the same tradeoff already recorded for every other
 * unlocked write here) rather than forcing an artificial wallet-count cap
 * just to fit inside one transaction.
 */
export async function performReconciliation(
  uid: string,
  reportedBalances: Record<string, number>
): Promise<ReconciliationResult> {
  const accountsSnap = await getDocs(accountsRef(uid));
  const realWallets = accountsSnap.docs
    .map((d) => ({ ...d.data(), id: d.id }) as FirestoreAccount)
    .filter((a) => !a.archived && !a.isSystemWallet);

  const ledgerBalancesAtTime: Record<string, number> = {};
  let totalLedger = 0;
  let totalReported = 0;
  for (const wallet of realWallets) {
    ledgerBalancesAtTime[wallet.id] = round2(wallet.currentBalance);
    totalLedger += wallet.currentBalance;
    totalReported += reportedBalances[wallet.id] ?? 0;
  }
  const totalGap = round2(totalLedger - totalReported);

  await updateDoc(unjustifiedWalletRef(uid), { currentBalance: totalGap, updatedAt: serverTimestamp() });
  await setDoc(reconciliationRef(uid, crypto.randomUUID()), {
    uid,
    performedAt: serverTimestamp(),
    reportedBalances,
    ledgerBalancesAtTime,
    totalGap,
    notes: '',
  });

  return { totalLedger: round2(totalLedger), totalReported: round2(totalReported), totalGap };
}

export async function listReconciliations(uid: string, take = 50): Promise<FirestoreReconciliation[]> {
  const snap = await getDocs(query(reconciliationsRef(uid), orderBy('performedAt', 'desc'), limit(take)));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as FirestoreReconciliation);
}

// ---------------------------------------------------------------------------
// The "explain a historic entry" toggle (section 2.5) — routes to whichever
// of aggregation.ts's two wrapped writes matches the direction the person
// already picked on the Add Transaction / Backfill screen.
// ---------------------------------------------------------------------------

export interface ExplainHistoricEntryInput {
  date: Date;
  type: string;
  description: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  direction: 'Inflow' | 'Outflow';
  createdBy: string;
  isHistoricBackfill?: boolean;
  backfillBatchId?: string | null;
  // Only ever set alongside a Savings entry that stays in its own account
  // rather than moving anywhere — mutually exclusive with
  // explainsUnjustifiedBalance below (that path always moves money
  // into/out of the Unjustified wallet via a real transfer, which
  // "frozen, never moved" directly contradicts; callers don't offer both
  // at once).
  isFrozenSavings?: boolean;
}

export async function recordHistoricEntry(
  input: ExplainHistoricEntryInput,
  explainsUnjustifiedBalance: boolean,
  ctx: CurrencyContext
): Promise<void> {
  if (!explainsUnjustifiedBalance) {
    await createTransactionWithAggregation(
      { ...input, id: crypto.randomUUID() },
      ctx
    );
    return;
  }
  const write = input.direction === 'Inflow' ? recordIncomeExplainingUnjustifiedBalance : recordTransactionExplainingUnjustifiedBalance;
  await write({ ...input, id: crypto.randomUUID(), transferId: crypto.randomUUID() }, ctx);
}

// ---------------------------------------------------------------------------
// Historic Transaction Backfill (section 1)
// ---------------------------------------------------------------------------

// 'once' is a single occurrence on startDate (endDate/dayOfWeek/dayOfMonth
// all ignored); 'daily'/'weekdays'/'weekly' walk startDate..endDate directly
// ('weekdays' skips Saturday/Sunday, 'weekly' is anchored to dayOfWeek);
// 'monthly'/'quarterly' walk calendar months (every 1 or every 3) landing on
// dayOfMonth each time.
export type BackfillFrequency = 'once' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'quarterly';

interface BackfillSpreadCommon {
  title: string;
  amount: number;
  frequency: BackfillFrequency;
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd, inclusive — ignored when frequency is 'once'
  dayOfWeek: number; // 0 (Sun) - 6 (Sat) — only used when frequency is 'weekly'
  dayOfMonth: number; // 1-28, kept low enough to exist in every month — 'monthly'/'quarterly' only
  createdBy: string;
}

export interface BackfillTransactionSpreadInput extends BackfillSpreadCommon {
  kind: 'transaction';
  type: string; // 'Expense' | 'Income' | 'Savings'
  categoryId: string | null;
  accountId: string;
  direction: 'Inflow' | 'Outflow';
  // Only for type 'Savings' — see ExplainHistoricEntryInput's own doc comment
  // for the mutual-exclusion rule with the Unjustified-balance toggle.
  isFrozenSavings?: boolean;
}

export interface BackfillTransferSpreadInput extends BackfillSpreadCommon {
  kind: 'transfer';
  fromAccountId: string;
  toAccountId: string;
  transferKind: TransferKind;
  charges?: number;
}

export type BackfillSpreadInput = BackfillTransactionSpreadInput | BackfillTransferSpreadInput;

export interface BackfillOccurrence {
  date: Date;
  title: string;
  amount: number;
}

// Bounds a single bulk write (commitBackfillSpread writes one transaction
// per occurrence, sequentially) and keeps a fat-fingered decade-long daily
// spread from happening by accident. Applies to the occurrence COUNT, not
// the calendar span, so it scales naturally with frequency: about a year of
// daily entries, ~7 years weekly, decades for monthly/quarterly.
export const BACKFILL_MAX_OCCURRENCES = 366;

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number, dayOfMonth: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, dayOfMonth);
}

/** Builds the preview list shown before any write happens (section 1.4, Screen 2). */
export function previewBackfillSpread(input: BackfillSpreadInput): BackfillOccurrence[] {
  const start = parseDateKey(input.startDate);

  if (input.frequency === 'once') {
    return [{ date: start, title: input.title, amount: input.amount }];
  }

  const end = parseDateKey(input.endDate);
  if (end < start) {
    throw new Error('The end date must be on or after the start date.');
  }

  const occurrences: BackfillOccurrence[] = [];

  if (input.frequency === 'daily' || input.frequency === 'weekdays') {
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
      if (input.frequency === 'weekdays' && isWeekend) continue;
      occurrences.push({ date: cursor, title: input.title, amount: input.amount });
      if (occurrences.length > BACKFILL_MAX_OCCURRENCES) break;
    }
  } else if (input.frequency === 'weekly') {
    const firstOccurrence = addDays(start, (input.dayOfWeek - start.getDay() + 7) % 7);
    for (let cursor = firstOccurrence; cursor <= end; cursor = addDays(cursor, 7)) {
      occurrences.push({ date: cursor, title: input.title, amount: input.amount });
      if (occurrences.length > BACKFILL_MAX_OCCURRENCES) break;
    }
  } else {
    // monthly or quarterly
    const step = input.frequency === 'quarterly' ? 3 : 1;
    let cursor = new Date(start.getFullYear(), start.getMonth(), input.dayOfMonth);
    if (cursor < start) cursor = addMonths(cursor, step, input.dayOfMonth);
    for (; cursor <= end; cursor = addMonths(cursor, step, input.dayOfMonth)) {
      occurrences.push({ date: cursor, title: input.title, amount: input.amount });
      if (occurrences.length > BACKFILL_MAX_OCCURRENCES) break;
    }
  }

  if (occurrences.length > BACKFILL_MAX_OCCURRENCES) {
    throw new Error(`A backfill spread covers at most ${BACKFILL_MAX_OCCURRENCES} occurrences — narrow the range and try again.`);
  }
  return occurrences;
}

/**
 * Writes one real transaction or transfer per previewed occurrence —
 * sequential, not concurrent, same reasoning as every other bulk write in
 * this codebase (e.g. deleteBackfillBatch below): a dozen simultaneous
 * writes to the same account/statsMonthly/stats-home docs would just
 * contend with each other for no benefit. `fundFromUnjustified` applies the
 * same explain-the-gap choice to every occurrence in the spread as one
 * decision (section 2.5) rather than asking per-occurrence — it only ever
 * applies to the 'transaction' branch, since a transfer never touches the
 * Unjustified wallet.
 */
export async function commitBackfillSpread(
  input: BackfillSpreadInput,
  fundFromUnjustified: boolean,
  ctx: CurrencyContext
): Promise<{ batchId: string; count: number }> {
  const occurrences = previewBackfillSpread(input);
  const batchId = crypto.randomUUID();

  if (input.kind === 'transaction') {
    for (const occ of occurrences) {
      await recordHistoricEntry(
        {
          date: occ.date,
          type: input.type,
          description: input.title,
          accountId: input.accountId,
          categoryId: input.categoryId,
          amount: input.amount,
          direction: input.direction,
          createdBy: input.createdBy,
          isHistoricBackfill: true,
          backfillBatchId: batchId,
          isFrozenSavings: input.isFrozenSavings,
        },
        fundFromUnjustified,
        ctx
      );
    }
  } else {
    for (const occ of occurrences) {
      await createTransferWithAggregation({
        id: crypto.randomUUID(),
        date: occ.date,
        description: input.title,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: input.amount,
        charges: input.charges,
        kind: input.transferKind,
        createdBy: input.createdBy,
        isHistoricBackfill: true,
        backfillBatchId: batchId,
      });
    }
  }

  return { batchId, count: occurrences.length };
}

export interface BackfillBatch {
  batchId: string;
  title: string;
  startMonth: string;
  endMonth: string;
  count: number;
  total: number;
}

/** Groups every backfilled transaction or transfer by batch, for the "Manage backfill batches" screen. */
export async function listBackfillBatches(uid: string): Promise<BackfillBatch[]> {
  // where + orderBy on different fields needs a composite index Firestore
  // won't auto-create; every doc here gets merged into a batch summary
  // regardless of order, so the orderBy buys nothing — drop it.
  const [transactionsSnap, transfersSnap] = await Promise.all([
    getDocs(query(transactionsRef(uid), where('isHistoricBackfill', '==', true))),
    getDocs(query(transfersRef(uid), where('isHistoricBackfill', '==', true))),
  ]);
  const batches = new Map<string, BackfillBatch>();
  const merge = (batchId: string, description: string, month: string, amount: number) => {
    const existing = batches.get(batchId);
    if (!existing) {
      batches.set(batchId, { batchId, title: description, startMonth: month, endMonth: month, count: 1, total: amount });
    } else {
      existing.endMonth = month > existing.endMonth ? month : existing.endMonth;
      existing.startMonth = month < existing.startMonth ? month : existing.startMonth;
      existing.count += 1;
      existing.total += amount;
    }
  };
  transactionsSnap.docs.forEach((doc) => {
    const t = { ...doc.data(), id: doc.id } as FirestoreTransaction;
    merge(t.backfillBatchId ?? 'unknown', t.description, t.month ?? '', t.amount);
  });
  transfersSnap.docs.forEach((doc) => {
    const t = { ...doc.data(), id: doc.id } as FirestoreTransfer;
    const d = t.date.toDate();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    merge(t.backfillBatchId ?? 'unknown', t.description, month, t.amount);
  });
  return [...batches.values()].sort((a, b) => b.endMonth.localeCompare(a.endMonth));
}

export async function deleteBackfillBatch(uid: string, batchId: string, ctx: CurrencyContext): Promise<void> {
  await deleteBackfillBatchTransactions(uid, batchId, ctx);
}

// ---------------------------------------------------------------------------
// Explained transactions list (section 3 / 5) — every transaction created
// through the "explains part of my unaccounted balance" toggle.
// ---------------------------------------------------------------------------

export async function listExplainedTransactions(uid: string, take = 100): Promise<FirestoreTransaction[]> {
  // where + orderBy on different fields needs a composite index Firestore
  // won't auto-create; this collection is scoped to one household's
  // unjustified adjustments (small), so sort client-side instead.
  const snap = await getDocs(query(transactionsRef(uid), where('isUnjustifiedAdjustment', '==', true)));
  return snap.docs
    .map((d) => ({ ...d.data(), id: d.id }) as FirestoreTransaction)
    .sort((a, b) => b.date.toMillis() - a.date.toMillis())
    .slice(0, take);
}
