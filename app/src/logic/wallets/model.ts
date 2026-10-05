// Wallets' figures, shared by the Wallets page and a wallet's page (web
// and phone): wallets grouped by type, what this month's unpaid lines will
// take from each (committed) and what's free after them, the last activity
// and last reconciliation per wallet, and a wallet's balance at each month
// end. Pure; tested in test/wallets.test.ts.

export const WALLET_GROUPS = ['Mobile money', 'Bank', 'Card', 'Cash', 'Savings'] as const;
export type WalletGroup = (typeof WALLET_GROUPS)[number];

/** The type group an account type belongs to (ACCOUNT_TYPES in src/viewmodels/wallets.ts). */
export function groupOf(type: string): WalletGroup {
  if (type === 'Savings Account') return 'Savings';
  if (type === 'Mobile Money' || type === 'E-wallet') return 'Mobile money';
  if (type === 'Debit Card' || /card/i.test(type)) return 'Card';
  if (type === 'Cash') return 'Cash';
  return 'Bank';
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** This month's unpaid lines paid from each wallet (income never counts). */
export function committedByAccount(
  lines: { type: string; archived?: boolean; closed?: boolean; accountId: string | null; available: number; actual: number }[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    if (l.type === 'Income' || l.archived || l.closed || !l.accountId) continue;
    const left = Math.max(0, l.available - l.actual);
    if (left > 0) out.set(l.accountId, r2((out.get(l.accountId) ?? 0) + left));
  }
  return out;
}

/** Free after commitments: red below zero, amber under a tenth of the balance, green otherwise. */
export function freeTone(free: number, balance: number): 'good' | 'watch' | 'bad' {
  if (free < -0.5) return 'bad';
  if (balance > 0 && free < balance * 0.1) return 'watch';
  return 'good';
}

/** The latest date per wallet. */
export function latestByAccount(records: { accountIds: (string | null | undefined)[]; date: Date }[]): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const r of records) {
    for (const id of r.accountIds) {
      if (!id) continue;
      const was = out.get(id);
      if (!was || r.date > was) out.set(id, r.date);
    }
  }
  return out;
}

/** When each wallet was last reconciled (a reconciliation that reported its balance). */
export function lastReconciledByAccount(reconciliations: { performedAt: Date; reportedBalances: Record<string, number> }[]): Map<string, Date> {
  return latestByAccount(reconciliations.map((r) => ({ accountIds: Object.keys(r.reportedBalances ?? {}), date: r.performedAt })));
}

/**
 * A wallet's balance at the end of each month (oldest first), working back
 * from today's balance through the money that moved since: each month
 * end's balance is today's minus what came in after it, plus what went out.
 * The current month shows today's balance.
 */
export function balanceHistory(currentBalance: number, flows: { date: Date; signed: number }[], months: string[], today: Date): { month: string; balance: number }[] {
  return months.map((month) => {
    const [y, m] = month.split('-').map(Number);
    const end = new Date(y, m, 1);
    if (end > today) return { month, balance: r2(currentBalance) };
    const after = flows.filter((f) => f.date >= end).reduce((s, f) => s + f.signed, 0);
    return { month, balance: r2(currentBalance - after) };
  });
}

/** Wallet rows grouped by type in the page's order, with each group's subtotal. */
export function groupWallets<T extends { group: WalletGroup; balance: number }>(rows: T[]): { group: WalletGroup; rows: T[]; subtotal: number }[] {
  return WALLET_GROUPS.map((group) => {
    const inGroup = rows.filter((r) => r.group === group);
    return { group, rows: inGroup, subtotal: r2(inGroup.reduce((s, r) => s + r.balance, 0)) };
  }).filter((g) => g.rows.length > 0);
}
