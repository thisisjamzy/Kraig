// Finance Insights — the inputs every calculation in this folder reads.
// Built once by src/logic/financeInsights/useFinanceData.ts from Firestore
// (every amount already in the display currency); everything here is pure.

export type TxKind = 'income' | 'expense' | 'savings';

export interface FinTx {
  id: string;
  date: Date;
  /** "YYYY-MM" of `date`. */
  month: string;
  kind: TxKind;
  /** Display currency. Expense: money spent (a refund is negative).
   * Income: money received. Savings: money put aside. */
  amount: number;
  categoryId: string | null;
  categoryName: string;
  accountId: string;
  accountName: string;
  /** Who was paid / who paid — the transaction's description. */
  payee: string;
  /** The budget item (and which month's occurrence) it pays for. */
  link: { bucketId: string; itemId: string; month: string } | null;
  /** Paid against an item in a Fixed (recurring) bucket. */
  fixed: boolean;
  /** Signed flow into (+) or out of (−) savings accounts. */
  savingsFlow: number;
  /** Repays a loan / debt. */
  debtRepayment: boolean;
}

export interface FinTransfer {
  id: string;
  date: Date;
  month: string;
  amount: number;
  charges: number;
  /** Signed flow into (+) or out of (−) savings accounts. */
  savingsFlow: number;
}

export interface FinPlanItem {
  /** "itemId@YYYY-MM" — same key as monthBudget.ts's itemMonthKey. */
  key: string;
  bucketId: string;
  bucketName: string;
  itemId: string;
  name: string;
  type: 'Expense' | 'Income' | 'Savings' | 'Transfer';
  fixed: boolean;
  /** Planned before any budget moves. */
  planned: number;
  /** Effective planned: planned + moves in − moves out. */
  available: number;
  actual: number;
  /** Overspend not yet covered or explained (Cover or justify). */
  unexplained: number;
  createdAt: Date | null;
}

export interface FinMonthPlan {
  month: string;
  items: FinPlanItem[];
  plannedIncome: number;
  /** Effective planned Expense items. */
  plannedExpense: number;
  plannedSavings: number;
}

export interface FinAllocation {
  /** Item-month keys at each end, null for the pool / savings. */
  fromKey: string | null;
  toKey: string | null;
  amount: number;
  createdAt: Date | null;
}

export interface FinJustification {
  id: string;
  month: string;
  bucketId: string;
  overspend: number;
  covered: number;
  external: { source: string; amount: number }[];
  uncovered: number;
  reason: string;
  awareness: 'conscious' | 'discovered_later';
  avoidability: 'avoidable' | 'partly' | 'unavoidable';
}

export interface FinPayment {
  itemId: string;
  bucketId: string;
  name: string;
  amount: number;
  due: Date;
  kind: 'expense' | 'income' | 'savings';
  status: 'paid' | 'upcoming' | 'overdue';
}

export interface ForecastItem {
  id: string;
  name: string;
  month: string;
  kind: 'income' | 'expense';
  amount: number;
}

export interface FinData {
  today: Date;
  txs: FinTx[];
  transfers: FinTransfer[];
  /** A month's budget (memoized by the caller). */
  plan: (month: string) => FinMonthPlan;
  allocations: FinAllocation[];
  justifications: FinJustification[];
  /** Planned payments of the current and next month. */
  payments: FinPayment[];
  /** Spending wallets (not savings) and savings accounts, today. */
  balance: { spending: number; savings: number };
  savingsTarget: number; // 0.2 = 20%
  forecastItems: ForecastItem[];
  /** Earliest month with a transaction, or null. */
  firstMonth: string | null;
}
