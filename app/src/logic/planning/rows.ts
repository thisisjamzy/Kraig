// The History row — one transaction or transfer as the Planning screens
// show it (History tab, a bucket's latest transactions, an item's payments).

import { toDisplay, type CurrencyContext } from '@/src/shared/firestore/currency';
import type { MonthBudget } from '@/src/shared/budget/monthBudget';
import type { FirestoreAccount, FirestoreCategory, FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';

// 'Adjustment': a budget move or overspend settlement — not money in or out.
export type RowType = 'Income' | 'Expense' | 'Savings' | 'Transfer' | 'Adjustment';

export interface HistoryRow {
  id: string;
  kind: 'transaction' | 'transfer' | 'adjustment';
  type: RowType;
  flow: 'in' | 'out' | 'move' | 'adjust';
  name: string;
  note: string;
  method: string;
  /** Signed for transactions (+ in, − out); plain for transfers. */
  amount: number;
  date: Date;
  bucketId: string | null;
  bucketName: string | null;
  /** A transaction that can still be tied to a bucket item. */
  assignable: boolean;
  /** For filtering: the category (transactions only) and wallets touched. */
  categoryId: string | null;
  accountIds: string[];
  href: string;
}

export interface RowLookups {
  accounts: FirestoreAccount[];
  categories: FirestoreCategory[];
  /** A month's budget, for records linked the pre-Budgets-v2 way. */
  budget?: MonthBudget | null;
  bucketName: Map<string, string>;
  ctx: CurrencyContext;
}

function bucketOfRecords(budget: MonthBudget | null | undefined) {
  const byTransaction = new Map<string, string>();
  const byTransfer = new Map<string, string>();
  for (const item of budget?.items ?? []) {
    for (const id of item.transactionIds) byTransaction.set(id, item.bucketId);
    for (const id of item.transferIds) byTransfer.set(id, item.bucketId);
  }
  return { byTransaction, byTransfer };
}

export function buildRows(
  transactions: FirestoreTransaction[],
  transfers: FirestoreTransfer[],
  { accounts, categories, budget, bucketName, ctx }: RowLookups
): HistoryRow[] {
  const account = new Map(accounts.map((a) => [a.id, a]));
  const category = new Map(categories.map((c) => [c.id, c.name]));
  const linked = bucketOfRecords(budget);
  const rows: HistoryRow[] = [];
  for (const t of transactions) {
    const currency = account.get(t.accountId)?.currency ?? ctx.base;
    const value = toDisplay(ctx, t.amount, currency);
    const bucketId = linked.byTransaction.get(t.id) ?? t.bucketItem?.bucketId ?? null;
    const type: RowType = t.type === 'Income' ? 'Income' : t.type === 'Savings' ? 'Savings' : 'Expense';
    rows.push({
      id: t.id,
      kind: 'transaction',
      type,
      flow: t.direction === 'Inflow' ? 'in' : 'out',
      name: (t.categoryId && category.get(t.categoryId)) || t.description || 'Transaction',
      note: t.description,
      method: account.get(t.accountId)?.name ?? '',
      amount: t.direction === 'Inflow' ? value : -value,
      date: t.date.toDate(),
      bucketId,
      bucketName: bucketId ? bucketName.get(bucketId) ?? null : null,
      assignable: !bucketId && !t.isDebtRepayment && !t.isUnjustifiedAdjustment && Boolean(t.categoryId),
      categoryId: t.categoryId,
      accountIds: [t.accountId],
      href: `/transactions/${t.id}`,
    });
  }
  for (const t of transfers) {
    const currency = account.get(t.fromAccountId)?.currency ?? ctx.base;
    const bucketId = linked.byTransfer.get(t.id) ?? t.bucketItem?.bucketId ?? null;
    rows.push({
      id: t.id,
      kind: 'transfer',
      type: 'Transfer',
      flow: 'move',
      name: t.kind || 'Transfer',
      note: t.description || t.notes || '',
      method: `${account.get(t.fromAccountId)?.name ?? ''} → ${account.get(t.toAccountId)?.name ?? ''}`,
      amount: toDisplay(ctx, t.amount, currency),
      date: t.date.toDate(),
      bucketId,
      bucketName: bucketId ? bucketName.get(bucketId) ?? null : null,
      assignable: false,
      categoryId: null,
      accountIds: [t.fromAccountId, t.toAccountId],
      href: `/transactions/${t.id}?kind=transfer`,
    });
  }
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export interface DayGroup {
  key: string;
  date: Date;
  net: number;
  rows: HistoryRow[];
}

export function groupByDay(rows: HistoryRow[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const row of rows) {
    const d = row.date;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const group = groups.get(key) ?? { key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), net: 0, rows: [] };
    group.rows.push(row);
    if (row.kind === 'transaction') group.net += row.amount;
    groups.set(key, group);
  }
  return [...groups.values()];
}
