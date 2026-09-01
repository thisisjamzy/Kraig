// Firestore document shapes — PRD-FIREBASE.md section 5 and 6. Raw shapes
// as stored (Timestamp, not Date/string) — src/shared/firestore/currency.ts
// and each screen's useLogic convert these into what's actually rendered.

import type { Timestamp } from 'firebase/firestore';

export interface FirestoreAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
  startingBalance: number;
  currentBalance: number;
  notes: string;
  archived: boolean;
  // Both default false and are optional so older/seeded docs written before
  // these existed still parse. notSpendable excludes the balance from the
  // Home screen's "Spendable" total only — the account is still usable.
  // frozen excludes it from that total too, AND blocks the account from
  // every transaction/transfer picker until unfrozen (see aggregation.ts's
  // frozen checks, the actual enforcement point).
  notSpendable?: boolean;
  frozen?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FirestoreCategory {
  id: string;
  name: string;
  transactionType: 'Expense' | 'Income' | 'Savings';
  group: string | null;
  notes?: string;
  archived: boolean;
  needsReview?: boolean;
}

export interface FirestoreTransaction {
  id: string; // the client-generated id, see PRD-FIREBASE.md section 7
  date: Timestamp;
  type: string;
  description: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  direction: 'Inflow' | 'Outflow';
  // Trigger-maintained (onTransactionWrite), never trust a client-side stale
  // copy — optional because a just-created doc genuinely lacks them until
  // the trigger's first run fills them in a moment later.
  signedAmount?: number;
  month?: string; // yyyy-MM
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FirestoreTransfer {
  id: string;
  date: Timestamp;
  description: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  kind: string;
  notes: string;
  createdBy: string;
  createdAt?: Timestamp;
}

export type Frequency = 'Once' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
export type EndCondition = 'Never' | 'After Occurrences' | 'On Date';

export interface FirestoreBudgetRule {
  id: string;
  categoryId: string;
  description: string;
  budgetedAmount: number;
  frequency: Frequency;
  interval: number;
  anchorDate: Timestamp;
  endCondition: EndCondition;
  endOccurrences: number | null;
  endDate: Timestamp | null;
  accountId: string | null;
  tag: string | null;
  archived: boolean;
  // Months (yyyy-MM) this recurring rule is deliberately skipped for —
  // "delete" on a per-month view of a recurring item doesn't archive the
  // whole rule (that would remove it from every month, past and future),
  // it just adds the viewed month here. Every other month keeps applying
  // (see src/logic/budget/useLogic.ts's categories computation, and
  // aggregation.ts's/recomputeStats.ts's/functions' exclusion checks).
  // Optional — most rules never skip a month.
  excludedMonths?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * A real bill with a due date — Netflix, rent, an insurance premium.
 * Deliberately its own collection, NOT a field on FirestoreBudgetRule: a
 * budget is a monthly spending cap for a category, not a schedule, and
 * several planned payments can share one category (e.g. Netflix + Spotify
 * both count against a "Subscriptions" budget). Drives Payments Calendar
 * and Home's "Upcoming Payments" (src/shared/firestore/upcomingPayments.ts)
 * — budgetRules no longer feed either of those.
 */
export interface FirestorePlannedPayment {
  id: string;
  categoryId: string;
  description: string;
  amount: number;
  frequency: Frequency;
  interval: number;
  anchorDate: Timestamp;
  endCondition: EndCondition;
  endOccurrences: number | null;
  endDate: Timestamp | null;
  accountId: string | null;
  archived: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FirestoreSettings {
  defaultCurrency: string;
  displayCurrency: string;
  timezone: string;
  householdName: string;
}

/**
 * users/{uid}/budgetPlans/{yyyy-mm} — one doc per month, replacing the old
 * single global settings.totalBudget (which was the same number no matter
 * which month you viewed — a pre-existing quirk, not a per-month plan).
 * totalBudget is what you intend to spend that month; projectedIncome and
 * planned savings let the Budget screen warn you if totalBudget is more
 * than you'll actually have left after saving (see
 * src/logic/budget/useLogic.ts's overspend computation). Set via the
 * config modal (Budget screen's gear icon), never inline on the page —
 * inline number inputs there used to overflow on narrow screens.
 *
 * Planned savings is either a fixed amount or a percentage of
 * projectedIncome, the user's choice (savingsMode) — savingsValue holds
 * the raw number either way (an amount if 'fixed', a percent like 15 if
 * 'percent'); the effective amount is derived, never stored twice. A month
 * with no doc yet just reads as all-zero — created lazily the first time
 * its plan is saved, same as statsMonthly/statsBudgetProgress.
 */
export interface FirestoreBudgetPlan {
  totalBudget: number;
  projectedIncome: number;
  savingsMode: 'fixed' | 'percent';
  savingsValue: number;
  updatedAt?: Timestamp;
}

export interface FirestoreExchangeRate {
  id: string; // currency code
  rateToBase: number;
  updatedAt?: Timestamp;
  notes?: string;
}

export interface StatsHome {
  totalBalanceBase: number;
  thisMonthIncome: number;
  thisMonthExpense: number;
  lastUpdated?: Timestamp;
}

export interface StatsMonthly {
  id: string; // yyyy-MM
  totalIncome: number;
  totalExpense: number;
  transactionCount: number;
  perCategorySpend: Record<string, number>;
  perCategoryCount: Record<string, number>;
  lastUpdated?: Timestamp;
}

export interface BudgetProgressEntry {
  budgeted: number;
  spent: number;
  remaining: number;
  count: number;
}

/** statsBudgetProgress/{yyyy-mm} — one field per ruleId, see
 * functions/src/lib/budgetProgress.ts. */
export type StatsBudgetProgress = Record<string, BudgetProgressEntry>;

export interface FirestoreUserDoc {
  email: string;
  name: string;
  archived: boolean;
  createdAt?: Timestamp;
  lastLoginAt?: Timestamp;
}
