// A wallet over a window of time: its balance on any past date, and a
// statement for a window (opening balance, money in, money out, changes
// made by reconciliations, closing balance), worked back from the
// balance now. Used by a wallet's audit page and by reconciling "as of"
// the end of a window (src/shared/firestore/unaccountedBalance.ts).
//
// Back from now, not forward from the starting balance: the balance now
// is what every write kept up to date, so a window's figures stay right
// even if something older never added up (that is the audit's job,
// src/shared/firestore/reconciliation.ts).

export interface WalletFlow {
  date: Date;
  /** + money in, − money out (a transfer out includes its charges). */
  amount: number;
}

/** A change to the balance with no entry behind it (a reconciliation). */
export interface WalletAdjustment {
  at: Date;
  amount: number;
}

export interface WindowStatement {
  opening: number;
  moneyIn: number;
  moneyOut: number;
  /** What reconciliations changed inside the window. */
  adjusted: number;
  closing: number;
}

export type WindowPreset = 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear' | 'custom';

export interface ReconcileWindow {
  /** Start of the first day; null means "from the beginning". */
  from: Date | null;
  /** End of the last day (never later than now). */
  to: Date;
}

export const WINDOW_PRESETS: { value: WindowPreset; label: string }[] = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'last3Months', label: 'Last 3 months' },
  { value: 'thisYear', label: 'This year' },
  { value: 'custom', label: 'Custom dates' },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** yyyy-MM-dd (a date input's value) to a local date, or null. */
export function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function dayValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The window a preset (or two custom dates) stands for, ending no later than now. */
export function windowFor(preset: WindowPreset, now: Date, custom?: { from: string; to: string }): ReconcileWindow {
  const clamp = (d: Date) => (d.getTime() > now.getTime() ? now : d);
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === 'lastMonth') return { from: new Date(y, m - 1, 1), to: endOfDay(new Date(y, m, 0)) };
  if (preset === 'last3Months') return { from: new Date(y, m - 2, 1), to: now };
  if (preset === 'thisYear') return { from: new Date(y, 0, 1), to: now };
  if (preset === 'custom') {
    const from = parseDay(custom?.from ?? '');
    const to = parseDay(custom?.to ?? '');
    return { from, to: to ? clamp(endOfDay(to)) : now };
  }
  return { from: new Date(y, m, 1), to: now };
}

/** True when the window ends now (reconciling it is reconciling today). */
export function endsNow(window: ReconcileWindow, now: Date): boolean {
  return now.getTime() - window.to.getTime() < 60_000;
}

/** The balance at the end of `at`: now, less everything dated or done after it. */
export function balanceAt(balanceNow: number, flows: WalletFlow[], adjustments: WalletAdjustment[], at: Date): number {
  let balance = balanceNow;
  for (const f of flows) if (f.date.getTime() > at.getTime()) balance -= f.amount;
  for (const a of adjustments) if (a.at.getTime() > at.getTime()) balance -= a.amount;
  return r2(balance);
}

export function windowStatement(balanceNow: number, flows: WalletFlow[], adjustments: WalletAdjustment[], window: ReconcileWindow): WindowStatement {
  const closing = balanceAt(balanceNow, flows, adjustments, window.to);
  const from = window.from?.getTime() ?? -Infinity;
  const to = window.to.getTime();
  const inside = (t: number) => t >= from && t <= to;
  let moneyIn = 0;
  let moneyOut = 0;
  let adjusted = 0;
  for (const f of flows) {
    if (!inside(f.date.getTime())) continue;
    if (f.amount >= 0) moneyIn += f.amount;
    else moneyOut -= f.amount;
  }
  for (const a of adjustments) if (inside(a.at.getTime())) adjusted += a.amount;
  return { opening: r2(closing - moneyIn + moneyOut - adjusted), moneyIn: r2(moneyIn), moneyOut: r2(moneyOut), adjusted: r2(adjusted), closing };
}

/** What each check changed on one wallet: stored when kept, else reported less ledger. */
export function reconciliationAdjustments(
  checks: { performedAt: Date; reportedBalances: Record<string, number>; ledgerBalancesAtTime: Record<string, number>; adjustments?: Record<string, number> }[],
  walletId: string
): WalletAdjustment[] {
  const out: WalletAdjustment[] = [];
  for (const c of checks) {
    const kept = c.adjustments?.[walletId];
    const reported = c.reportedBalances?.[walletId];
    const ledger = c.ledgerBalancesAtTime?.[walletId];
    const amount = kept ?? (reported !== undefined && ledger !== undefined ? reported - ledger : 0);
    if (Math.abs(amount) > 0.005) out.push({ at: c.performedAt, amount: r2(amount) });
  }
  return out;
}

/** A wallet's flows from its transactions and transfers (excluded and frozen savings never touch the balance). */
export function walletFlows(
  walletId: string,
  transactions: { accountId: string; date: Date; amount: number; direction: string; signedAmount?: number; excluded?: boolean; isFrozenSavings?: boolean }[],
  transfers: { fromAccountId: string; toAccountId: string; date: Date; amount: number; charges?: number }[]
): WalletFlow[] {
  const flows: WalletFlow[] = [];
  for (const t of transactions) {
    if (t.accountId !== walletId || t.excluded || t.isFrozenSavings) continue;
    flows.push({ date: t.date, amount: t.signedAmount ?? (t.direction === 'Inflow' ? t.amount : -t.amount) });
  }
  for (const t of transfers) {
    if (t.fromAccountId === walletId) flows.push({ date: t.date, amount: -(t.amount + (t.charges ?? 0)) });
    if (t.toAccountId === walletId) flows.push({ date: t.date, amount: t.amount });
  }
  return flows;
}
