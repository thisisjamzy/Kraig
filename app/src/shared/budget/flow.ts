// The four money flow types — income, expenses, savings and transfers —
// and their subtypes. Every bucket holds one flow type; so does each of its
// items and the transactions recorded against them. Nothing here mixes
// them: each total, list and chart is per flow type
// (src/shared/budget/monthTotals.ts). Pure, no Firestore or React.
//
// Older data predates explicit subtypes, so each `…Of` function reads the
// stored field first and falls back to an inference. The flow-type
// migration (flowMigration.ts) writes the inferred value once, so after it
// has run the stored field is what's read.

import type {
  BucketItemNecessity,
  ExpenseKind,
  FlowType,
  IncomeSubtype,
  ItemAutomation,
  SavingsMode,
} from '../firestore/types';

export type { FlowType, IncomeSubtype, ExpenseKind, SavingsMode };

export const FLOW_TYPES: FlowType[] = ['Income', 'Expense', 'Savings', 'Transfer'];

export const FLOW_LABEL: Record<FlowType, string> = {
  Income: 'Income',
  Expense: 'Expenses',
  Savings: 'Savings',
  Transfer: 'Transfers',
};

/** "Expense bucket", "Income bucket", ... */
export const FLOW_NOUN: Record<FlowType, string> = {
  Income: 'Income',
  Expense: 'Expense',
  Savings: 'Savings',
  Transfer: 'Transfer',
};

export const INCOME_SUBTYPE_LABEL: Record<IncomeSubtype, string> = {
  earned: 'Earned',
  other: 'Other',
  debt_financing: 'Debt financing',
};

export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = { fixed: 'Fixed', variable: 'Variable' };
export const SAVINGS_MODE_LABEL: Record<SavingsMode, string> = { absolute: 'Absolute', flexible: 'Flexible' };

/** Need and priority chips belong to expenses and savings only. */
export function hasNeedAndPriority(flow: FlowType): boolean {
  return flow === 'Expense' || flow === 'Savings';
}

export function flowOfBucket(bucket: { type?: FlowType | null }): FlowType {
  return bucket.type ?? 'Expense';
}

/**
 * An item's flow type. A Transfer bucket's items are transfers; otherwise
 * the item's category decides (a Savings category inside an Expense bucket
 * is still savings), falling back to the bucket's type. Once the flow-type
 * migration has split mixed buckets, the two always agree.
 */
export function itemFlow(
  bucketType: FlowType,
  categoryId: string | null | undefined,
  categories: Map<string, { transactionType: 'Expense' | 'Income' | 'Savings' }>
): FlowType {
  if (bucketType === 'Transfer') return 'Transfer';
  const category = categoryId ? categories.get(categoryId) : undefined;
  return category?.transactionType ?? bucketType;
}

// Words that mark an expense as a limit used through the month rather than
// a set bill. Only a fallback for items that never had a kind chosen.
const VARIABLE_WORDS = /\b(food|groceries|grocery|market|transport|taxi|moto|fuel|petrol|eating|restaurant|dining|entertainment|airtime|data|misc|miscellaneous|pocket|allowance|personal|shopping|clothes|outing|leisure)\b/i;

export interface KindSignals {
  name: string;
  categoryName?: string | null;
  recurring: boolean;
  hasDueDate: boolean;
}

/**
 * fixed when it repeats with a set date, else variable — except that a
 * name or category reading like day-to-day spending (food, transport...)
 * is variable even when it repeats. `guessed` says the name decided it.
 */
export function inferExpenseKind(signals: KindSignals): { kind: ExpenseKind; guessed: boolean } {
  if (VARIABLE_WORDS.test(signals.name) || (signals.categoryName && VARIABLE_WORDS.test(signals.categoryName))) {
    return { kind: 'variable', guessed: true };
  }
  return { kind: signals.recurring && signals.hasDueDate ? 'fixed' : 'variable', guessed: false };
}

export function expenseKindOf(item: { expenseKind?: ExpenseKind | null; name: string }, signals: Omit<KindSignals, 'name'>): ExpenseKind {
  return item.expenseKind ?? inferExpenseKind({ ...signals, name: item.name }).kind;
}

/** Must have savings are absolute by default, the rest flexible. */
export function savingsModeOf(item: { savingsMode?: SavingsMode | null; necessity?: BucketItemNecessity | null }): SavingsMode {
  return item.savingsMode ?? (item.necessity === 'MustHave' ? 'absolute' : 'flexible');
}

const LOAN_WORDS = /\b(loan|loans|borrow|borrowed|credit|advance|overdraft|lent)\b/i;
const OTHER_INCOME_WORDS = /\b(gift|gifts|refund|refunds|cashback|reimburse|reimbursement|donation)\b/i;

export function inferIncomeSubtype(name: string, categoryName?: string | null): IncomeSubtype {
  const text = `${name} ${categoryName ?? ''}`;
  if (LOAN_WORDS.test(text)) return 'debt_financing';
  if (OTHER_INCOME_WORDS.test(text)) return 'other';
  return 'earned';
}

export function incomeSubtypeOf(item: { incomeSubtype?: IncomeSubtype | null; name: string }, categoryName?: string | null): IncomeSubtype {
  return item.incomeSubtype ?? inferIncomeSubtype(item.name, categoryName);
}

/**
 * An income transaction's subtype. A cash debt's principal is credited as
 * an Income transaction linked to the debt (aggregation.ts's createDebt),
 * so a linked one that isn't a repayment is debt financing.
 */
export function incomeSubtypeOfTransaction(t: {
  incomeSubtype?: IncomeSubtype | null;
  linkedDebtId?: string | null;
  isDebtRepayment?: boolean;
  description?: string;
}): IncomeSubtype {
  if (t.incomeSubtype) return t.incomeSubtype;
  if (t.linkedDebtId && !t.isDebtRepayment) return 'debt_financing';
  if (t.description && /^Loan received/i.test(t.description)) return 'debt_financing';
  return 'earned';
}

export const SAVINGS_ACCOUNT_TYPE = 'Savings Account';

/**
 * Money set aside (+) or taken back out of savings (−) by a Savings
 * transaction. Savings were recorded three ways over time, so the sign
 * can't come from `direction` alone:
 *   - a bucket item payment credits the savings account (Inflow into a
 *     Savings Account): set aside;
 *   - "frozen" savings lock part of a wallet (Outflow, isFrozenSavings): set aside;
 *   - a plain Savings Outflow from a spending wallet: set aside.
 * The reverse of each is a withdrawal.
 */
export function savingsSign(
  t: { direction: 'Inflow' | 'Outflow'; accountId: string; isFrozenSavings?: boolean },
  accountType: Map<string, string> | undefined
): 1 | -1 {
  if (t.isFrozenSavings) return 1;
  const intoSavingsAccount = accountType?.get(t.accountId) === SAVINGS_ACCOUNT_TYPE;
  if (intoSavingsAccount) return t.direction === 'Inflow' ? 1 : -1;
  return t.direction === 'Outflow' ? 1 : -1;
}

/**
 * A transfer is savings when it moves money into a Savings Account (or is
 * filed as "Wallet to savings"), a withdrawal from savings when it moves
 * money out of one, and otherwise a plain transfer between the household's
 * own accounts. Between two Savings Accounts it's a transfer.
 */
export function transferSavingsSign(
  t: { fromAccountId: string; toAccountId: string; kind?: string },
  accountType: Map<string, string> | undefined
): 1 | -1 | 0 {
  const toSavings = accountType?.get(t.toAccountId) === SAVINGS_ACCOUNT_TYPE;
  const fromSavings = accountType?.get(t.fromAccountId) === SAVINGS_ACCOUNT_TYPE;
  if (toSavings && !fromSavings) return 1;
  if (fromSavings && !toSavings) return -1;
  if (!toSavings && !fromSavings && t.kind === 'Wallet to savings') return 1;
  return 0;
}

/**
 * The automation a line runs with: its own setting, or the default —
 * absolute savings and Must have expenses are prepared when any income
 * arrives; everything else is off. Income has no automation.
 */
export function automationOf(
  flow: FlowType,
  item: { automation?: ItemAutomation | null; necessity?: BucketItemNecessity | null },
  savingsMode: SavingsMode | null
): ItemAutomation {
  if (flow === 'Income') return { mode: 'off' };
  if (item.automation) return item.automation;
  const essential = (flow === 'Savings' && savingsMode === 'absolute') || (flow === 'Expense' && item.necessity === 'MustHave');
  return essential ? { mode: 'prepare', trigger: 'any_income', amountMode: 'fixed' } : { mode: 'off' };
}

export function automationLabel(a: ItemAutomation, incomeName?: (itemId: string) => string | undefined): string {
  if (a.mode === 'off') return 'Off';
  if (a.mode === 'remind') return 'Remind me';
  const amount = a.amountMode === 'percent' && a.percent ? `${a.percent}% · ` : '';
  if (a.trigger === 'due') return `${amount}Prepare on due date`;
  if (a.trigger === 'income') return `${amount}Prepare when ${(a.incomeItemId && incomeName?.(a.incomeItemId)) || 'income'} arrives`;
  return `${amount}Prepare when income arrives`;
}
