'use client';

// Client-side balance audit — recomputes each account's currentBalance from
// scratch (startingBalance + every transaction and transfer that actually
// touched it) and compares that against the live, incrementally-maintained
// currentBalance field (aggregation.ts). The two are supposed to always
// agree — aggregation.ts keeps currentBalance in lockstep with every write
// the live app itself makes, in a single Firestore transaction alongside
// the transaction/transfer doc, regardless of what date the entry is
// backdated to (a July 3rd income logged after July 4-30 already exist
// still lands as a plain +amount to currentBalance, order never matters).
// What CAN drift the two apart is anything that ever wrote a transaction or
// transfer document without going through aggregation.ts at all — a
// one-off Firestore Console edit, a script run directly against
// production, a bug in a past version of the app — leaving currentBalance
// stuck at whatever it was, silently wrong from then on with nothing in
// the UI ever surfacing it. This is the user-triggered "make sure the
// numbers still add up" check for exactly that: nothing here runs
// automatically or patches anything on its own, it only ever computes and
// reports — applying a fix is a separate, explicit step
// (src/logic/reconcileBalances/useLogic.ts calls applyBalanceCorrections
// only after the household has reviewed the results).
//
// Reconciling (src/shared/firestore/unaccountedBalance.ts) sets each
// wallet to the balance the household reports and moves the gap into the
// Unjustified wallet, with no transaction or transfer behind either
// change; clearing the unaccounted balance zeroes that wallet the same
// way. Each such change is kept on the account as balanceAdjustments and
// counted here, so the audit agrees with a reconciliation instead of
// proposing to put the unaccounted money back into the wallets.
//
// Mirrors scripts/lib/recomputeStats.ts's account-balance formula, with one
// correction: that script's transfer loop only subtracts a transfer's
// `amount` from fromAccountId, forgetting `charges` (see its own
// balanceDeltas loop) — aggregation.ts's createTransferWithAggregation
// debits fromAccountId by `amount + charges`, so this audit does too, or a
// wallet with any charged transfer would show a permanent phantom
// mismatch.

import { getDocs, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { accountsRef, accountRef, reconciliationsRef, transactionsRef, transfersRef } from './refs';
import type { FirestoreAccount, FirestoreTransaction, FirestoreTransfer } from './types';
import { countsInFigures } from './types';

export interface AccountAudit {
  accountId: string;
  name: string;
  currency: string;
  archived: boolean;
  startingBalance: number;
  // Balance changes made outside any entry (reconciliations, clearing
  // the unaccounted balance), see FirestoreAccount.balanceAdjustments.
  adjustments: number;
  storedBalance: number;
  expectedBalance: number;
  // expectedBalance - storedBalance, rounded, zeroed out under EPSILON so
  // ordinary floating-point noise never reads as a real mismatch.
  difference: number;
  transactionCount: number;
  transferCount: number;
  // The reconciled figure is negative — not itself a bug in the audit, but
  // exactly the "expenses this account couldn't actually cover" signal the
  // household asked this feature to surface, see applyBalanceCorrections's
  // header.
  goesNegative: boolean;
}

// A transaction/transfer referencing an accountId that doesn't match any
// account this uid currently has — the one case a plain per-account balance
// comparison above can never surface: the entry doesn't just make some
// account's balance wrong, it's invisible to every account's math entirely
// (bump() below has nowhere to attribute its delta), so a mis-typed or
// stale accountId from a migration/import would otherwise pass a "no
// mismatches" audit silently. `role` distinguishes which side of a transfer
// is the dangling reference — a transfer can have one orphaned side and one
// valid side.
export interface OrphanedEntry {
  kind: 'transaction' | 'transfer';
  id: string;
  description: string;
  amount: number;
  accountId: string;
  role: 'account' | 'from' | 'to';
}

export interface BalanceAudit {
  accounts: AccountAudit[];
  orphaned: OrphanedEntry[];
  // Reconciled before balanceAdjustments existed: what was reconciled
  // can't be told apart from a fault any more, so the stored balance is
  // taken as right (saveBalanceBaselines writes that once).
  needsBaseline: string[];
}

const EPSILON = 0.005;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Reads every account, transaction, and transfer this uid owns. Returns one
 * AccountAudit row per account (mismatched or not — the caller decides what
 * to show/highlight) plus any transaction/transfer whose accountId doesn't
 * resolve to a real account at all. Read-only: never writes anything.
 */
export async function auditAccountBalances(uid: string): Promise<BalanceAudit> {
  const [accountsSnap, txSnap, trSnap, recSnap] = await Promise.all([
    getDocs(accountsRef(uid)),
    getDocs(transactionsRef(uid)),
    getDocs(transfersRef(uid)),
    getDocs(reconciliationsRef(uid)),
  ]);
  const reconciled = new Set<string>();
  recSnap.forEach((doc) => Object.keys(doc.data().reportedBalances ?? {}).forEach((id) => reconciled.add(id)));
  return computeAudit(
    accountsSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as FirestoreAccount),
    txSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
    trSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
    reconciled
  );
}

type AuditTransaction = Pick<FirestoreTransaction, 'id' | 'accountId' | 'amount' | 'direction' | 'description'> & { signedAmount?: number; excluded?: boolean };
type AuditTransfer = Pick<FirestoreTransfer, 'id' | 'fromAccountId' | 'toAccountId' | 'amount' | 'description'> & { charges?: number };

/** The audit itself, on records already read (pure, for the tests). */
export function computeAudit(
  accountDocs: FirestoreAccount[],
  transactions: AuditTransaction[],
  transfers: AuditTransfer[],
  reconciled: Set<string>
): BalanceAudit {

  const knownAccountIds = new Set(accountDocs.map((a) => a.id));
  const orphaned: OrphanedEntry[] = [];

  const deltas = new Map<string, number>();
  const counts = new Map<string, { tx: number; tr: number }>();
  function bump(accountId: string | undefined, delta: number, kind: 'tx' | 'tr') {
    if (!accountId) return;
    deltas.set(accountId, (deltas.get(accountId) ?? 0) + delta);
    const entry = counts.get(accountId) ?? { tx: 0, tr: 0 };
    entry[kind] += 1;
    counts.set(accountId, entry);
  }

  transactions.forEach((t) => {
    // An excluded transaction (a debt changed to record only) had its
    // balance effect reversed when it was excluded.
    if (!countsInFigures(t)) return;
    // signedAmount is written alongside every transaction by
    // aggregation.ts, but fall back to deriving it the same way for any
    // doc old enough (or written by a path) to lack it.
    const signedAmount = t.signedAmount ?? (t.direction === 'Inflow' ? t.amount : -t.amount);
    if (!knownAccountIds.has(t.accountId)) {
      orphaned.push({
        kind: 'transaction',
        id: t.id,
        description: t.description ?? '',
        amount: t.amount,
        accountId: t.accountId,
        role: 'account',
      });
    }
    bump(t.accountId, signedAmount, 'tx');
  });

  transfers.forEach((t) => {
    const charges = t.charges ?? 0;
    if (!knownAccountIds.has(t.fromAccountId)) {
      orphaned.push({
        kind: 'transfer',
        id: t.id,
        description: t.description ?? '',
        amount: t.amount,
        accountId: t.fromAccountId,
        role: 'from',
      });
    }
    if (!knownAccountIds.has(t.toAccountId)) {
      orphaned.push({
        kind: 'transfer',
        id: t.id,
        description: t.description ?? '',
        amount: t.amount,
        accountId: t.toAccountId,
        role: 'to',
      });
    }
    bump(t.fromAccountId, -(t.amount + charges), 'tr');
    bump(t.toAccountId, t.amount, 'tr');
  });

  const needsBaseline: string[] = [];
  const accounts = accountDocs.map((account) => {
    const delta = deltas.get(account.id) ?? 0;
    const storedBalance = round2(account.currentBalance);
    const legacy = account.balanceAdjustments === undefined && (reconciled.has(account.id) || Boolean(account.isSystemWallet));
    if (legacy) needsBaseline.push(account.id);
    const adjustments = round2(legacy ? storedBalance - account.startingBalance - delta : (account.balanceAdjustments ?? 0));
    const expectedBalance = round2(account.startingBalance + delta + adjustments);
    const rawDifference = round2(expectedBalance - storedBalance);
    const entry = counts.get(account.id) ?? { tx: 0, tr: 0 };
    return {
      accountId: account.id,
      name: account.name,
      currency: account.currency,
      archived: account.archived,
      startingBalance: account.startingBalance,
      adjustments,
      storedBalance,
      expectedBalance,
      difference: Math.abs(rawDifference) < EPSILON ? 0 : rawDifference,
      transactionCount: entry.tx,
      transferCount: entry.tr,
      goesNegative: expectedBalance < -EPSILON,
    };
  });

  return { accounts, orphaned, needsBaseline };
}

/**
 * The once-only start of balanceAdjustments for wallets reconciled before
 * it existed (BalanceAudit.needsBaseline): the adjustments that make the
 * audit agree with the balance stored now.
 */
export async function saveBalanceBaselines(uid: string, audit: BalanceAudit): Promise<void> {
  if (audit.needsBaseline.length === 0) return;
  const batch = writeBatch(getFirebaseFirestore());
  for (const row of audit.accounts) {
    if (audit.needsBaseline.includes(row.accountId)) batch.update(accountRef(uid, row.accountId), { balanceAdjustments: row.adjustments });
  }
  await batch.commit();
}

/**
 * The balanceAdjustments each wallet needs so the audit agrees with the
 * balance it is about to be set to (a reconciliation's reported figure,
 * or 0 when the unaccounted balance is cleared): whatever the entries
 * don't explain is, from now on, a deliberate change and not a fault.
 */
export function adjustmentsFor(audit: BalanceAudit, newBalances: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of audit.accounts) {
    const next = newBalances[row.accountId];
    if (next === undefined) continue;
    out[row.accountId] = round2(row.adjustments + next - row.expectedBalance);
  }
  return out;
}

/**
 * Writes the audited expectedBalance to each given account's currentBalance
 * in one batch. Only ever called with rows the household explicitly
 * selected after reviewing auditAccountBalances' output — see
 * src/logic/reconcileBalances/useLogic.ts.
 */
export async function applyBalanceCorrections(
  uid: string,
  corrections: { accountId: string; expectedBalance: number }[]
): Promise<void> {
  if (corrections.length === 0) return;
  const db = getFirebaseFirestore();
  const batch = writeBatch(db);
  for (const correction of corrections) {
    batch.update(accountRef(uid, correction.accountId), { currentBalance: correction.expectedBalance });
  }
  await batch.commit();
}
