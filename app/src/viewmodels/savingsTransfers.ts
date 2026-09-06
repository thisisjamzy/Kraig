import type { FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';
import { isSavingsAccount } from '@/src/viewmodels/wallets';

// "Total savings" is defined purely by WHICH ACCOUNT money sits in (a
// Savings Account, see viewmodels/wallets.ts's SAVINGS_ACCOUNT_TYPE) — not
// a transaction's own type/category, and not a transfer's `kind` string.
// This replaces the earlier category- and transfer-kind-based tracking.
//
// A Savings Account's own currentBalance already IS the compounding total
// (Firestore never resets it, every transaction/transfer that ever touched
// it is baked in) — so a headline "Savings" figure (Budget's Savings row,
// Home's Savings tile, Statistics' summary tile) just sums that balance
// directly across every Savings Account; see each screen's own useLogic
// for that sum, it needs nothing from this file.
//
// What DOES need this file: a savings trend/graph, which has to show a real
// rising-or-falling line (money actually grew or shrank), not a flat "total
// repeated every bucket" or a flat "same amount saved every month" bar.
// That means working out how much flowed into/out of Savings Accounts
// during each individual bucket, then building a cumulative line anchored
// to today's real total (see budget/statistics useLogic's own savings-trend
// computations) — these two functions are that per-transaction/per-transfer
// signed flow, in the item's own native currency, same convention its
// caller already uses for every other contribution it sums.

export function savingsTransactionFlow(
  transaction: FirestoreTransaction,
  accountTypeById: Map<string, string>
): number {
  if (!transaction.accountId || accountTypeById.get(transaction.accountId) !== 'Savings Account') return 0;
  return transaction.direction === 'Inflow' ? transaction.amount : -transaction.amount;
}

// A transfer between two Savings Accounts nets to 0 — money didn't leave
// savings, it just moved within it. Only "Wallet to savings" is the whole
// story for what USED to be tracked; now money can land in a Savings
// Account via any transfer kind (or even a generic "Wallet to wallet" one),
// and it still counts.
export function savingsTransferFlow(transfer: FirestoreTransfer, accountTypeById: Map<string, string>): number {
  const toIsSavings = accountTypeById.get(transfer.toAccountId) === 'Savings Account';
  const fromIsSavings = accountTypeById.get(transfer.fromAccountId) === 'Savings Account';
  let flow = 0;
  if (toIsSavings) flow += transfer.amount;
  if (fromIsSavings) flow -= transfer.amount;
  return flow;
}

// Re-exported so callers can keep using the type-check helper without a
// second import — isSavingsAccount takes a full account, these take a
// prebuilt id->type map (cheaper when summing many transactions/transfers
// against the same account list).
export { isSavingsAccount };
