// Reverting a reconciliation: back to every wallet's balance just before
// that check was performed. That means undoing the check itself, every
// check performed after it, every clear of the unaccounted balance made
// after it, and deleting every transaction and transfer logged after it.
//
// Pure: works on records already read, so the tests can drive it
// (src/shared/firestore/unaccountedBalance.ts does the reads and writes).
//
// "Logged after" is the entry's loggedAt (server time it was written).
// Entries written before loggedAt existed only have their own date
// (createdAt is the same date), so for those the date stands in: one
// backdated to before the check but logged after it can't be told apart
// and stays.

export interface RevertCheck {
  id: string;
  performedAt: Date;
  reportedBalances: Record<string, number>;
  ledgerBalancesAtTime: Record<string, number>;
  totalGap: number;
  adjustments?: Record<string, number>;
}

export interface RevertTransaction {
  id: string;
  accountId: string;
  description?: string;
  amount: number;
  direction: string;
  signedAmount?: number;
  date: Date;
  loggedAt?: Date | null;
  excluded?: boolean;
  isFrozenSavings?: boolean;
}

export interface RevertTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  description?: string;
  amount: number;
  charges?: number;
  date: Date;
  loggedAt?: Date | null;
}

export interface RevertAccount {
  id: string;
  name: string;
  currentBalance: number;
  frozen?: boolean;
  unaccountedClears?: { at: Date; amount: number }[];
}

export interface RevertEntry {
  kind: 'transaction' | 'transfer';
  id: string;
  description: string;
  amount: number;
  date: Date;
  accountIds: string[];
}

export interface RevertPlan {
  cutoff: Date;
  /** The check being reverted and every later one, newest first. */
  checkIds: string[];
  /** What each wallet's balance changes by when the checks are undone (Unjustified included). */
  checkChanges: Record<string, number>;
  /** Deleted, in this order: expenses first, then transfers, then income (see below). */
  entries: RevertEntry[];
  /** Excluded transactions logged after: they never counted, so they are left alone. */
  skipped: RevertEntry[];
  /** Clears of the unaccounted balance made after the check: put back. */
  clears: { at: Date; amount: number }[];
  /** Every wallet whose balance changes: now, and after the revert. */
  balances: { accountId: string; name: string; now: number; after: number }[];
  /** Wallets the entries touch that are frozen: the revert can't run until they're unfrozen. */
  frozen: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const EPSILON = 0.005;

/** What a check changed on each wallet: kept on it, else reported less ledger (and the gap on Unjustified). */
export function checkChangesOf(check: RevertCheck, unjustifiedId: string): Record<string, number> {
  if (check.adjustments) return check.adjustments;
  const out: Record<string, number> = {};
  for (const id of Object.keys(check.reportedBalances)) {
    const ledger = check.ledgerBalancesAtTime[id];
    if (ledger !== undefined) out[id] = r2(check.reportedBalances[id] - ledger);
  }
  out[unjustifiedId] = check.totalGap;
  return out;
}

export function loggedAfter(entry: { date: Date; loggedAt?: Date | null }, cutoff: Date): boolean {
  return (entry.loggedAt ?? entry.date).getTime() > cutoff.getTime();
}

export function planRevert(input: {
  target: RevertCheck;
  checks: RevertCheck[];
  transactions: RevertTransaction[];
  transfers: RevertTransfer[];
  accounts: RevertAccount[];
  unjustifiedId: string;
}): RevertPlan {
  const { target, unjustifiedId } = input;
  const cutoff = target.performedAt;
  const at = cutoff.getTime();

  const checks = input.checks
    .filter((c) => c.id === target.id || c.performedAt.getTime() > at)
    .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime());
  if (!checks.some((c) => c.id === target.id)) checks.push(target);

  const delta = new Map<string, number>();
  const bump = (id: string, n: number) => delta.set(id, (delta.get(id) ?? 0) + n);

  const checkChanges: Record<string, number> = {};
  for (const c of checks) {
    for (const [id, change] of Object.entries(checkChangesOf(c, unjustifiedId))) {
      checkChanges[id] = r2((checkChanges[id] ?? 0) + change);
      bump(id, -change);
    }
  }

  const unjustified = input.accounts.find((a) => a.id === unjustifiedId);
  const clears = (unjustified?.unaccountedClears ?? []).filter((c) => c.at.getTime() > at);
  for (const c of clears) bump(unjustifiedId, c.amount);

  const entry = (kind: RevertEntry['kind'], e: RevertTransaction | RevertTransfer, accountIds: string[]): RevertEntry => ({
    kind,
    id: e.id,
    description: e.description ?? '',
    amount: e.amount,
    date: e.date,
    accountIds,
  });
  const newestFirst = <T extends { date: Date; loggedAt?: Date | null }>(a: T, b: T) =>
    (b.loggedAt ?? b.date).getTime() - (a.loggedAt ?? a.date).getTime();

  const skipped: RevertEntry[] = [];
  const outflows: RevertEntry[] = [];
  const inflows: RevertEntry[] = [];
  for (const t of input.transactions.filter((t) => loggedAfter(t, cutoff)).sort(newestFirst)) {
    if (t.excluded) {
      skipped.push(entry('transaction', t, [t.accountId]));
      continue;
    }
    const signed = t.signedAmount ?? (t.direction === 'Inflow' ? t.amount : -t.amount);
    if (!t.isFrozenSavings) bump(t.accountId, -signed);
    (signed < 0 ? outflows : inflows).push(entry('transaction', t, [t.accountId]));
  }
  const transfers: RevertEntry[] = [];
  for (const t of input.transfers.filter((t) => loggedAfter(t, cutoff)).sort(newestFirst)) {
    bump(t.fromAccountId, t.amount + (t.charges ?? 0));
    bump(t.toAccountId, -t.amount);
    transfers.push(entry('transfer', t, [t.fromAccountId, t.toAccountId]));
  }
  // Deleting an expense gives money back and deleting income takes it
  // away, so expenses go first and income last: a wallet with money
  // locked is least likely to dip below it part way (an explained
  // expense's pair, money in from Unjustified then the expense, comes
  // apart the same safe way round).
  const entries = [...outflows, ...transfers, ...inflows];

  const byId = new Map(input.accounts.map((a) => [a.id, a]));
  const frozen = [...new Set(entries.flatMap((e) => e.accountIds))].filter((id) => byId.get(id)?.frozen);

  const balances = [...delta.entries()]
    .filter(([, n]) => Math.abs(n) > EPSILON)
    .map(([accountId, n]) => {
      const account = byId.get(accountId);
      const now = r2(account?.currentBalance ?? 0);
      return { accountId, name: account?.name ?? accountId, now, after: r2(now + n) };
    });

  return { cutoff, checkIds: checks.map((c) => c.id), checkChanges, entries, skipped, clears, balances, frozen };
}
