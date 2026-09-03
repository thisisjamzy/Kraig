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
  // A portion of currentBalance set aside and blocked from spending —
  // e.g. money pushed into this wallet as savings, without freezing the
  // whole wallet the way `frozen` does. Native to this account's own
  // currency, same as currentBalance. Never negative, never (enforced at
  // the UI layer, src/logic/walletDetail/useLogic.ts) more than
  // currentBalance. aggregation.ts's frozen checks are joined by an
  // equivalent "would this dip below what's locked" check wherever an
  // outflow debits this account (a transaction, a transfer's fromAccountId,
  // or an edit that increases either). Optional/0 for a wallet with nothing
  // locked, and absent on accounts written before this field existed.
  lockedAmount?: number;
  // A <=5 character label for the Home screen's wallet bar chart (its
  // x-axis wraps/distorts with a full wallet name — see src/logic/home/
  // useLogic.ts's `wallets` mapping) — set alongside the full `name` when
  // creating/editing a wallet (src/logic/wallets and src/logic/walletDetail).
  // Optional: a wallet written before this field existed, or one the user
  // never bothered to set, falls back to the first 5 characters of `name`.
  shortName?: string;
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
  // Set when this transaction is a "cash" debt's repayment (see
  // FirestoreDebt.debtType), written by aggregation.ts's recordRepayment
  // alongside the matching debts/{id}/repayments/{id} doc, which carries
  // the same id back via its own transactionId. An "existing" debt's
  // repayment has no transaction at all by default, so these stay
  // false/null on every other transaction.
  isDebtRepayment?: boolean;
  linkedDebtId?: string | null;
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
  // What the transfer itself cost — a wire fee, a mobile-money charge, etc.
  // Deducted from fromAccountId on top of `amount` (toAccountId only ever
  // receives `amount`); optional/0 for a free transfer, and absent on
  // transfers written before this field existed. See
  // aggregation.ts's createTransferWithAggregation.
  charges?: number;
  kind: string;
  notes: string;
  createdBy: string;
  createdAt?: Timestamp;
}

export type Frequency = 'Once' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
export type EndCondition = 'Never' | 'After Occurrences' | 'On Date';

// What kind of budget line this is. 'Expense' | 'Income' | 'Savings' mirror
// FirestoreCategory.transactionType (categoryId then points at a real
// categories/{id} doc of that same type); 'Transfer' has no such doc —
// categoryId there is one of viewmodels/categories.ts's TRANSFER_CATEGORIES
// strings instead (e.g. "Wallet to savings"), the same "category" shape
// Add Transaction's transfer step already uses (src/logic/addTransaction).
// Optional for back-compat with rules written before this field existed —
// those are always Expense/Income/Savings, never Transfer, so callers fall
// back to the linked category's own transactionType (see
// src/logic/budget/useLogic.ts's toAppBudgetType).
export type BudgetLineType = 'Expense' | 'Income' | 'Savings' | 'Transfer';

export interface FirestoreBudgetRule {
  id: string;
  categoryId: string;
  type?: BudgetLineType;
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
  // Opt out of the PIN gate entirely — the app opens straight to /home.
  // Account-wide (this doc, not a local flag) so it's the source of truth
  // across devices; src/shared/config/pinGate.ts's PIN_DISABLED_KEY mirrors
  // it into a local cookie/localStorage flag per device for proxy.ts's
  // Edge middleware, which can't read Firestore (see that file's header).
  // Undefined/false means the PIN is required, same as every account before
  // this field existed.
  pinDisabled?: boolean;
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

/**
 * A forward-looking savings project with its own line-item costs (see
 * `PRD Files/prd debt n goals` section 1) — "Buy a new car" broken into
 * "Down payment," "Insurance," etc., each paid off (and marked complete)
 * on its own. `totalAmount` is denormalized, the sum of every lineItem's
 * `amount`, recalculated inside the same `runTransaction()` as any
 * lineItems write (aggregation.ts's createGoalLineItem/
 * markGoalLineItemComplete) — never trust a stale client copy of it
 * without re-deriving. No frozen-balance field lives here on purpose: "how
 * much of this line item is covered by locked wallet money" is computed
 * live from FirestoreAccount.lockedAmount at render time (section 1.3,
 * "no frozen balance stored on the schema"). `lineItemCount`/
 * `completedLineItemCount`/`amountCompleted` are the same denormalize-for-
 * read-performance idea the spec applies to `totalAmount`, extended one
 * step further — recalculated alongside it in the same transaction — so
 * the Goals list and Home's preview can show real progress without each
 * subscribing to every goal's own lineItems subcollection just to render a
 * progress bar.
 */
export interface FirestoreGoal {
  id: string;
  name: string;
  description: string;
  totalAmount: number; // denormalized sum of lineItems.amount
  lineItemCount: number;
  completedLineItemCount: number;
  amountCompleted: number; // denormalized sum of completed lineItems.amount
  currency: string;
  deadline: Timestamp | null;
  archived: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * users/{uid}/goals/{goalId}/lineItems/{lineItemId} — one sub-cost of a
 * goal. Marking it complete (aggregation.ts's markGoalLineItemComplete)
 * records a real Expense transaction and links back to it via
 * `expenseId`; the transaction never needs to know about the goal.
 */
export interface FirestoreGoalLineItem {
  id: string;
  goalId: string;
  name: string;
  description: string;
  amount: number;
  // Custom manual order within the cross-goal "All goal items" list
  // (src/logic/goalItems) — lower sorts first. Set once at creation
  // (Date.now(), always after every existing item) and only ever changed by
  // a manual reorder or by applying a Priority/Ease sort as the new
  // baseline. Absent on a line item written before this field existed;
  // every read defaults it to 0, same as this app's other back-compat
  // fields.
  rank: number;
  // Shared Priority type (types.ts, above) — lets the cross-goal "All goal
  // items" list filter across goals the same way it already sorts by
  // deadline/amount. Absent on a line item written before this field
  // existed; every read defaults it to 'Medium'.
  priority: Priority;
  // Independent of priority: how essential this cost actually is, not how
  // urgent it is — a "Must have" item might be low priority (not due soon)
  // while a "Nice to have" item is high priority (due soon but skippable).
  necessity: GoalItemNecessity;
  completed: boolean;
  completedAt: Timestamp | null;
  expenseId: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type GoalItemNecessity = 'MustHave' | 'NiceToHave';

export type DebtType = 'cash' | 'existing';
export type DebtPriority = 'low' | 'medium' | 'high';

export interface FirestoreDebtRecurringPlan {
  amount: number;
  interval: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  nextPaymentDate: Timestamp;
  isActive: boolean;
}

export interface FirestoreDebtPaymentPlan {
  type: 'none' | 'recurring';
  recurring?: FirestoreDebtRecurringPlan;
}

/**
 * A liability being paid down (see `PRD Files/prd debt n goals` section
 * 2). `debtType` decides what a repayment actually does: `'cash'` means
 * this was borrowed money that landed in an account, so repaying it always
 * writes a real Expense transaction (debits that account); `'existing'`
 * means an obligation that already existed outside the ledger (a
 * mortgage, a car loan), so repaying it just logs progress, no account
 * transaction unless the household links one manually. `currentBalance`
 * and `totalRepaid` are denormalized, recalculated from the full
 * `repayments` subcollection inside the same `runTransaction()` as every
 * repayment write (aggregation.ts's recordRepayment) — never trust a
 * stale client copy without re-deriving.
 */
export interface FirestoreDebt {
  id: string;
  name: string;
  description: string;
  debtType: DebtType;
  // The wallet this debt's cash landed in (a 'cash' debt) — set once at
  // creation, so every later repayment can default to debiting the same
  // wallet instead of asking from scratch. Always null for an 'existing'
  // debt created before this field existed, or one the household chose not
  // to link (an 'existing' debt can still link an account per-repayment via
  // recordRepayment's own accountId, independent of this field).
  accountId: string | null;
  principalAmount: number;
  currentBalance: number; // denormalized: principalAmount - totalRepaid
  totalRepaid: number; // denormalized
  currency: string;
  priority: DebtPriority;
  startDate: Timestamp;
  paymentPlan: FirestoreDebtPaymentPlan;
  notes: string;
  archivedAt: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** users/{uid}/debts/{debtId}/repayments/{repaymentId} */
export interface FirestoreRepayment {
  id: string;
  debtId: string;
  amount: number;
  date: Timestamp;
  method: 'manual' | 'planned';
  notes: string;
  transactionId: string | null; // always set for a 'cash' debt, optional for 'existing'
  createdAt?: Timestamp;
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

// ---------------------------------------------------------------------
// Projects / Areas / Resources — PRD Files/PRD-PROJECTS.md section 7. The
// PARA method (Projects, Areas, Resources, Archive) as this app's
// organizing model for anything that isn't a ledger transaction. Same
// per-user subcollection convention as the ledger (see this file's own
// header and refs.ts) — no cross-account sharing here either.
// ---------------------------------------------------------------------

export interface FirestoreArea {
  id: string;
  name: string;
  emoji: string | null; // optional, user-picked — viewmodels/projects.ts's EMOJI_OPTIONS
  color: string; // one of viewmodels/projects.ts's PROJECT_COLORS swatches
  description: string; // required — every area names what it actually covers
  archived: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ProjectStatus = 'Active' | 'Completed' | 'Archived';

// Shared by projects and tasks — viewmodels/projects.ts's PRIORITY_LEVELS.
export type Priority = 'Low' | 'Medium' | 'High';

export interface FirestoreProject {
  id: string;
  name: string;
  emoji: string | null;
  areaId: string | null;
  color: string;
  priority: Priority;
  // Both are plain, freely editable target dates — no immutable "baseline"
  // (a household re-plans a personal project's dates as reality changes;
  // freezing one at creation for a formal schedule-slippage comparison is
  // more process than this feature calls for).
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  // Set once, the first time endDate is ever given a value — never changed
  // again. Compared against the live endDate to show whether the project's
  // timeline was extended or shortened (mirrors FirestoreTask.originalDueDate
  // below — same reschedule-flag idea, one level up).
  originalEndDate: Timestamp | null;
  // Incremented each time an edit changes endDate to a new, different,
  // non-null value — the Analytics screen's on-time-vs-rescheduled stat.
  rescheduleCount: number;
  status: ProjectStatus;
  description: string; // required
  // No separate `archived: boolean` — deliberately, so there's only ever
  // one source of truth for whether a project is active: `status`. A
  // second boolean that could drift out of sync with it (archived:false but
  // status:'Archived', or the reverse) is exactly the kind of bug this
  // avoids. "Archived" is one of ProjectStatus's three values, see above.
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Meeting/Event/ToDo — shown at the top of each Calendar agenda row, and
// selectable on the task edit screen (viewmodels/projects.ts's TASK_TYPES).
export type TaskType = 'Meeting' | 'Event' | 'ToDo';

export interface FirestoreTask {
  id: string;
  title: string;
  emoji: string | null;
  type: TaskType;
  priority: Priority;
  // A task belongs to a project, or is fully standalone (both null) — never
  // tied to an area directly. areaId is never set by the user; it's mirrored
  // from the project's own areaId purely so a task can be attributed to an
  // area without a join, and is always null when projectId is null.
  projectId: string | null;
  areaId: string | null;
  parentTaskId: string | null; // subtask — a later build step
  // Only ever these two states, plus `archived` below as a third,
  // independent "removed from view" flag — no kanban board, no in-progress
  // status. A task is either not done yet or it's done.
  done: boolean;
  dueDate: Timestamp | null; // date AND time — the only schedule a task has, shown on the Calendar agenda as "time below"
  // Set once, the first time dueDate is ever given a value — never changed
  // again. Compared against the live dueDate to show whether it was
  // extended or shortened (Analytics screen, task/project cards).
  originalDueDate: Timestamp | null;
  // Incremented each time an edit changes dueDate to a new, different,
  // non-null value — the Analytics screen's on-time-vs-rescheduled stat.
  rescheduleCount: number;
  // Set the moment `done` flips true, cleared if it flips back — lets the
  // Analytics screen bucket completions by week without re-deriving it from
  // updatedAt (which changes on every edit, not only a completion).
  completedAt: Timestamp | null;
  calendarEventId: string | null; // the mirrored calendarEvents doc — a later build step
  dependsOnTaskId: string | null; // Finish-to-Start only — a later build step
  estimatedCost: number | null;
  linkedTransactionId: string | null; // a later build step (PRD section 15)
  notes: string; // required — every task says what it actually needs
  tags: string[];
  archived: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
