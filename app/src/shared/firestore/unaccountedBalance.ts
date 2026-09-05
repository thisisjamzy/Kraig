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
  reconciliationsRef,
  reconciliationRef,
  UNJUSTIFIED_WALLET_ID,
  unjustifiedWalletRef,
} from './refs';
import {
  createTransactionWithAggregation,
  recordTransactionExplainingUnjustifiedBalance,
  recordIncomeExplainingUnjustifiedBalance,
  deleteBackfillBatch as deleteBackfillBatchTransactions,
} from './aggregation';
import { round2, type CurrencyContext } from './currency';
import type { FirestoreAccount, FirestoreTransaction, FirestoreReconciliation } from './types';

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

export interface BackfillSpreadInput {
  title: string;
  type: string; // 'Expense' | 'Income'
  categoryId: string | null;
  accountId: string;
  amount: number;
  direction: 'Inflow' | 'Outflow';
  startMonth: string; // yyyy-MM
  endMonth: string; // yyyy-MM, inclusive
  dayOfMonth: number; // 1-28, kept low enough to exist in every month
  createdBy: string;
}

export interface BackfillOccurrence {
  date: Date;
  month: string;
  title: string;
  amount: number;
}

// Section 1.5's range cap — bounds a single bulk write and keeps a
// fat-fingered decade-long range from happening by accident.
export const BACKFILL_MAX_MONTHS = 36;

function parseMonthKey(key: string): { year: number; month0: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month0: m - 1 };
}

/** Builds the preview list shown before any write happens (section 1.4, Screen 2). */
export function previewBackfillSpread(input: BackfillSpreadInput): BackfillOccurrence[] {
  const start = parseMonthKey(input.startMonth);
  const end = parseMonthKey(input.endMonth);
  const startIndex = start.year * 12 + start.month0;
  const endIndex = end.year * 12 + end.month0;
  const count = Math.max(0, endIndex - startIndex + 1);
  if (count > BACKFILL_MAX_MONTHS) {
    throw new Error(`A backfill spread covers at most ${BACKFILL_MAX_MONTHS} months — narrow the range and try again.`);
  }
  const occurrences: BackfillOccurrence[] = [];
  for (let i = 0; i < count; i++) {
    const totalMonth = startIndex + i;
    const year = Math.floor(totalMonth / 12);
    const month0 = totalMonth % 12;
    const date = new Date(year, month0, input.dayOfMonth);
    occurrences.push({
      date,
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      title: input.title,
      amount: input.amount,
    });
  }
  return occurrences;
}

/**
 * Writes one real transaction per previewed occurrence — sequential, not
 * concurrent, same reasoning as importRow (src/logic/importCsv/useLogic.ts):
 * a dozen simultaneous writes to the same account/statsMonthly/stats-home
 * docs would just contend with each other for no benefit. `fundFromUnjustified`
 * applies the same explain-the-gap choice to every occurrence in the spread
 * as one decision (section 2.5) rather than asking per-occurrence.
 */
export async function commitBackfillSpread(
  input: BackfillSpreadInput,
  fundFromUnjustified: boolean,
  ctx: CurrencyContext
): Promise<{ batchId: string; count: number }> {
  const occurrences = previewBackfillSpread(input);
  const batchId = crypto.randomUUID();
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
      },
      fundFromUnjustified,
      ctx
    );
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

/** Groups every backfilled transaction by batch, for the "Manage backfill batches" screen. */
export async function listBackfillBatches(uid: string): Promise<BackfillBatch[]> {
  const snap = await getDocs(query(transactionsRef(uid), where('isHistoricBackfill', '==', true), orderBy('date', 'asc')));
  const batches = new Map<string, BackfillBatch>();
  snap.docs.forEach((doc) => {
    const t = { ...doc.data(), id: doc.id } as FirestoreTransaction;
    const batchId = t.backfillBatchId ?? 'unknown';
    const existing = batches.get(batchId);
    const month = t.month ?? '';
    if (!existing) {
      batches.set(batchId, { batchId, title: t.description, startMonth: month, endMonth: month, count: 1, total: t.amount });
    } else {
      existing.endMonth = month > existing.endMonth ? month : existing.endMonth;
      existing.startMonth = month < existing.startMonth ? month : existing.startMonth;
      existing.count += 1;
      existing.total += t.amount;
    }
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
  const snap = await getDocs(
    query(transactionsRef(uid), where('isUnjustifiedAdjustment', '==', true), orderBy('date', 'desc'), limit(take))
  );
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as FirestoreTransaction);
}
