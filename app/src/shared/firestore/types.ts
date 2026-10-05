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
  // A savings wallet the plan may count on (Plan and forecast's starting
  // balance); savings are left out otherwise.
  usableForPlan?: boolean;
  // A <=5 character label for the Home screen's wallet bar chart (its
  // x-axis wraps/distorts with a full wallet name — see src/logic/home/
  // useLogic.ts's `wallets` mapping) — set alongside the full `name` when
  // creating/editing a wallet (src/logic/wallets and src/logic/walletDetail).
  // Optional: a wallet written before this field existed, or one the user
  // never bothered to set, falls back to the first 5 characters of `name`.
  shortName?: string;
  // PRD-AUDIT-RECONCILIATION.md section 2.2 — true only for the one
  // household-wide "Unjustified" wallet (src/shared/firestore/
  // unaccountedBalance.ts's UNJUSTIFIED_WALLET_ID), a real account document
  // so it can move money via the ordinary transfer mechanism, but excluded
  // everywhere a real, spendable wallet is expected: useAccounts() filters
  // it out centrally, so every screen built on that hook (Wallets, Home,
  // every account picker) never sees it without each needing its own check.
  isSystemWallet?: boolean;
  systemType?: 'unjustified' | null;
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
  // PRD-AUDIT-RECONCILIATION.md section 1.2 — true for every occurrence a
  // backfill spread generated (src/shared/firestore/aggregation.ts's
  // createBackfillSpread); backfillBatchId is shared by every occurrence
  // from the same spread action, letting the household view or delete the
  // whole batch as one unit rather than hunting down each row.
  isHistoricBackfill?: boolean;
  backfillBatchId?: string | null;
  // PRD-AUDIT-RECONCILIATION.md section 2.2 — true for a transaction
  // recorded through the "this explains part of my unaccounted balance"
  // toggle (section 2.5); pairedTransferId points at the transfer created
  // alongside it (moving the same amount into/out of the Unjustified
  // wallet, section 2.1) so the Transaction History row can show both
  // halves of the pair together.
  isUnjustifiedAdjustment?: boolean;
  pairedTransferId?: string | null;
  // True for a Savings-type entry recorded as "frozen in this account"
  // rather than moved elsewhere (src/logic/addTransaction/useLogic.ts's and
  // src/logic/backfillSpread/useLogic.ts's savings-mode choice) — the money
  // never leaves the account, so unlike every other transaction this one
  // does NOT touch currentBalance/totalBalanceBase; it increments the same
  // account's lockedAmount instead (see aggregation.ts's
  // writeTransactionContribution). Still a real transaction — it counts
  // toward totalExpense/perCategorySpend/budget tracking exactly like any
  // other Savings entry, and still shows up in Transaction History; only
  // its effect on the account's own balance differs.
  isFrozenSavings?: boolean;
  // PRD-BUDGETS-V2.md section 4.3 — which bucket item (and which month's
  // occurrence of it) this transaction pays for. The single source of truth
  // for "spent against item X in month M" (src/shared/budget/monthBudget.ts)
  // — nothing on the item itself is denormalized from it, so editing or
  // deleting the transaction keeps every budget figure right for free.
  // `month` is explicit rather than derived from `date`: paying September's
  // rent on Aug 30 counts toward September. Absent/null = not tied to any
  // item (category-only spend, shown as "Unplanned" on the Budget screen).
  bucketItem?: BucketItemLink | null;
  // Income only: what kind of money came in (earned, other, or borrowed —
  // see IncomeSubtype). Absent on an older Income transaction, which reads
  // as 'earned' unless it's a cash debt's "Loan received" credit
  // (linkedDebtId set), which reads as 'debt_financing'
  // (src/shared/budget/flow.ts's incomeSubtypeOfTransaction).
  incomeSubtype?: IncomeSubtype | null;
  // Excluded: kept for the audit trail but no longer counted anywhere
  // (balances, income and spending totals, stats, charts). Set when a debt
  // changes to record only (src/shared/debt/walletEffect.ts), with the
  // reason shown when "Show excluded" is on. countsInFigures() reads it.
  excluded?: boolean;
  excludedReason?: string | null;
  excludedAt?: Timestamp | null;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** False for an excluded transaction: it stays listed under "Show excluded" only. */
export function countsInFigures(transaction: { excluded?: boolean }): boolean {
  return !transaction.excluded;
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
  // Same convention as FirestoreTransaction's own isHistoricBackfill/
  // backfillBatchId — true for every occurrence a backfill spread
  // generated (a recurring Transfer, or a Savings entry backfilled as
  // "moved to another account"); backfillBatchId is shared by every
  // occurrence from the same spread so the batch can be viewed/deleted as
  // one unit. See src/shared/firestore/unaccountedBalance.ts.
  isHistoricBackfill?: boolean;
  backfillBatchId?: string | null;
  // Same as FirestoreTransaction.bucketItem — a Transfer (or moved-Savings)
  // bucket item's own occurrence this transfer settles.
  bucketItem?: BucketItemLink | null;
}

/** See FirestoreTransaction.bucketItem. `bucketId` is the buckets/{id} doc id
 * (buckets are still stored under `goals` — PRD-BUDGETS-V2.md section 3). */
export interface BucketItemLink {
  bucketId: string;
  itemId: string;
  month: string; // yyyy-MM of the occurrence being paid, not the payment's own date
}

/**
 * users/{uid}/allocations/{id} — PRD-BUDGETS-V2.md section 4.4. One budget
 * move: leftover reallocated, an overspend covered, next month's plan
 * borrowed from. Moves budget, never money — except a `savings` source,
 * which is created alongside a real transfer (transferId) so the cash that
 * actually funded the overspend is traceable too. Deleting one simply
 * reverses it (and its transfer, if any).
 */
export interface FirestoreAllocation {
  id: string;
  // The month whose pool a `pool` endpoint refers to, and the month the
  // move was made for — the item endpoints carry their own month.
  month: string;
  // Every yyyy-MM this allocation touches (this month plus either item
  // endpoint's own), so one array-contains query finds everything that
  // affects a given month's budget.
  months: string[];
  from: AllocationEndpoint;
  to: AllocationEndpoint;
  amount: number;
  currency: string; // the display currency the amount was entered in
  reason: AllocationReason;
  transferId: string | null;
  note: string;
  createdBy: string;
  createdAt?: Timestamp;
  // The overspend settlement this move was part of (Cover or justify), or
  // absent for a plain move (a reallocated leftover).
  justificationId?: string | null;
  // Undone — never deleted, so the history keeps every move. A reverted
  // allocation no longer counts toward any figure (monthBudget.ts).
  revertedAt?: Timestamp | null;
  // A savings-funded move's own reversing transfer, written on undo.
  reverseTransferId?: string | null;
}

// ---------------------------------------------------------------------------
// Overspend settlements ("Cover or justify") — one record per settlement:
// how an overspend was paid for, why it happened, and whether it was
// noticed at the time. The money moves themselves are allocations
// (FirestoreAllocation.justificationId points back here); the original
// transactions and planned amounts are never edited.

export type OverspendReason = 'unexpected_cost' | 'price_increase' | 'emergency' | 'plan_too_low' | 'impulse' | 'other';

// How the part NOT covered by moving budget was paid for. `not_covered`
// leaves that amount open: the bucket stays flagged until it's resolved.
export type OverspendExternalSource =
  | 'savings_outside_plan'
  | 'loan'
  | 'extra_income'
  | 'untracked_cash'
  | 'unplanned_reallocation'
  | 'not_covered';

export type OverspendAwareness = 'conscious' | 'discovered_later';
export type OverspendAvoidability = 'avoidable' | 'partly' | 'unavoidable';

export interface OverspendItemShare {
  itemId: string;
  overspend: number; // what this item needed at the time of settling
  covered: number; // by the settlement's allocations
  external: number; // by externalSources other than not_covered
  uncovered: number; // left open (not_covered)
}

export interface FirestoreOverspendJustification {
  id: string;
  month: string;
  bucketId: string;
  itemId: string | null; // null when the whole bucket was settled at once
  currency: string; // the display currency every amount here is in
  overspendAmount: number;
  coveredByAdjustments: number;
  externalSources: { source: OverspendExternalSource; amount: number }[];
  uncoveredAmount: number;
  // The same settlement split per overspent item — what the month budget
  // actually applies (a bucket-level settlement spans several items).
  items: OverspendItemShare[];
  adjustmentIds: string[];
  reason: OverspendReason;
  awareness: OverspendAwareness;
  noticedOn: Timestamp | null;
  avoidability: OverspendAvoidability;
  note: string;
  attachments: string[];
  status: 'settled' | 'partially_settled' | 'reverted';
  // Settles what an earlier partially settled record left uncovered.
  followsUp: string[];
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  revertedAt?: Timestamp | null;
}

export type AllocationReason = 'reallocate_leftover' | 'cover_overspend' | 'borrow_next_month' | 'return_to_pool';

export type AllocationEndpoint =
  | { kind: 'item'; bucketId: string; itemId: string; month: string }
  | { kind: 'pool' }
  | { kind: 'savings'; accountId: string };

// A prefilled shortcut for a transaction/transfer a household records often
// (a daily commute expense, a weekly savings sweep, ...) — src/logic/
// addTransaction/useLogic.ts reads one via ?templateId= on /add-transaction,
// applies every field below, and jumps straight to the 'details' step so
// the person only has to confirm or tweak it before submitting through the
// exact same write path (createTransactionWithAggregation/
// createTransferWithAggregation) an ordinary entry uses — a template is
// never written to the ledger directly. `type` mirrors src/logic/
// addTransaction/useLogic.ts's own lowercase TransactionType rather than
// FirestoreCategory's Title-Case transactionType, since that's the
// vocabulary this collection actually gets read back into.
export type TransactionTemplateType = 'expense' | 'income' | 'transfer' | 'savings';

export interface FirestoreTransactionTemplate {
  id: string;
  name: string; // the template's own label in the template list — never sent to the ledger
  type: TransactionTemplateType;
  // A real categories/{id} for expense/income/savings — for transfer (and
  // savings type with savingsMode 'moved') one of viewmodels/categories.ts's
  // TRANSFER_CATEGORIES strings instead, same dual-purpose "category" shape
  // Add Transaction's own transfer step already uses.
  categoryId: string;
  description: string;
  // null means "leave it blank" — a variable-amount recurring entry (e.g. a
  // fuel top-up) still wants a template for its category/account, just not
  // a fixed amount applied every time.
  amount: number | null;
  // The single account for expense/income/savings(frozen); the source
  // (debited) account for transfer/savings(moved).
  accountId: string | null;
  toAccountId: string | null; // transfer and savings(moved) only
  charges: number | null; // transfer only — see FirestoreTransfer.charges
  savingsMode: 'moved' | 'frozen' | null; // type 'savings' only
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type Frequency = 'Once' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
export type EndCondition = 'Never' | 'After Occurrences' | 'On Date';

// The four kinds of money a bucket (and so a bucket item) can be about —
// FirestoreBucket.type. 'Expense' | 'Income' | 'Savings' mirror
// FirestoreCategory.transactionType; 'Transfer' items use one of
// viewmodels/categories.ts's TRANSFER_CATEGORIES strings as their
// "category" instead of a real categories/{id}.
export type BudgetLineType = 'Expense' | 'Income' | 'Savings' | 'Transfer';

// The four money flow types (src/shared/budget/flow.ts). Every bucket holds
// exactly one, and so does each of its items, budget lines and the
// transactions recorded against them. Same values as BudgetLineType.
export type FlowType = BudgetLineType;
// Income: earned (salary, fees, sales), other (gifts, refunds), or
// debt_financing (a loan or credit received — counted as income for its
// month, and linked to the cash debt that tracks paying it back).
export type IncomeSubtype = 'earned' | 'other' | 'debt_financing';
// Expense: fixed (a set amount on a set date, rent) or variable (a limit
// used through the month, food).
export type ExpenseKind = 'fixed' | 'variable';
// Savings: absolute (set aside every month before discretionary spending)
// or flexible (if money allows).
export type SavingsMode = 'absolute' | 'flexible';

/**
 * How the app prepares a line's payment (src/shared/budget/automation.ts).
 * The app records money, it never moves real money: "prepare" puts the
 * payment in the Ready to pay queue for a one-tap confirmation.
 */
export interface ItemAutomation {
  mode: 'off' | 'remind' | 'prepare';
  // prepare only: on the due date, when one income line is received, or
  // when any income is received.
  trigger?: 'due' | 'income' | 'any_income';
  // trigger 'income': the income bucket item whose arrival fires it.
  incomeItemId?: string | null;
  // fixed (the line's own planned amount) or, for savings, a percent of
  // the triggering income.
  amountMode?: 'fixed' | 'percent';
  percent?: number | null;
  // The account to pay from (defaults to the line's own account).
  accountId?: string | null;
}

/**
 * A real bill with a due date — Netflix, rent, an insurance premium.
 * Deliberately its own collection, NOT a field on a budget rule (rules
 * were removed in Budgets v2 — PRD-BUDGETS-V2.md): a * budget is a monthly spending cap for a category, not a schedule, and
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

// settings/finance — the finance Insights page's own settings: the savings
// target and the forecast's "what if" items (one-off future income or
// expenses the household expects).
export interface FirestoreFinanceSettings {
  savingsTarget?: number; // 0.2 = 20%
  forecastItems?: { id: string; name: string; month: string; kind: 'income' | 'expense'; amount: number }[];
}

export interface FirestoreSettings {
  defaultCurrency: string;
  displayCurrency: string;
  timezone: string;
  householdName: string;
}

// users/{uid}/settings/taskTypes — a household's own custom task types
// (viewmodels/projects.ts's TASK_TYPES ToDo/Meeting/Event are always
// available and never stored here), added from the task edit screen's own
// Details page. Same settings/{docId} collection and rule as
// FirestoreSettings above (a fixed id, "taskTypes", not "app" — no new
// Firestore rule needed for it).
export interface FirestoreTaskTypesSettings {
  names: string[];
}

/**
 * A forward-looking savings project with its own line-item costs (see
 * `PRD Files/prd debt n goals` section 1) — "Buy a new car" broken into
 * "Down payment," "Insurance," etc., each paid off (and marked complete)
 * on its own. `totalAmount` is denormalized, the sum of every lineItem's
 * `amount`, recalculated inside the same `runTransaction()` as any
 * lineItems write (aggregation.ts's createBucketLineItem/
 * recordBucketLineItemPayment) — never trust a stale client copy of it
 * without re-deriving. No frozen-balance field lives here on purpose: "how
 * much of this line item is covered by locked wallet money" is computed
 * live from FirestoreAccount.lockedAmount at render time (section 1.3,
 * "no frozen balance stored on the schema"). `lineItemCount`/
 * `completedLineItemCount`/`amountCompleted` are the same denormalize-for-
 * read-performance idea the spec applies to `totalAmount`, extended one
 * step further — recalculated alongside it in the same transaction — so
 * the Buckets list and Home's preview can show real progress without each
 * subscribing to every bucket's own lineItems subcollection just to render a
 * progress bar.
 */
export interface FirestoreBucket {
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
  // Variable (the default): line items are one-off plans, manually "added
  // to budget" (aggregation.ts's addBucketLineItemToBudget) when the
  // household is ready to commit one to a month's plan. Fixed: a basket of
  // recurring costs (rent, subscriptions, a recurring savings transfer) —
  // its line items carry their own recurrence/due-date instead (see
  // FirestoreBucketLineItem.recurrence), no budget rule involved either way
  // any more. Optional for back-compat with a bucket written before this
  // field existed; every read defaults it to 'Variable'.
  kind?: 'Fixed' | 'Variable';
  // What kind of money this bucket is about — decides which categories (or,
  // for Transfer, which TRANSFER_CATEGORIES kind) its own line items may
  // use: an Expense bucket's items only ever pick an Expense category, an
  // Income bucket's only an Income category, and so on. A Transfer bucket has
  // no category at all — its items move money between two of the
  // household's own accounts (fromAccountId/toAccountId on the line item)
  // and exist to track the cost of doing so (see
  // FirestoreBucketLineItem.charges), not a category-based spend. Optional
  // for back-compat with a bucket written before this field existed; every
  // read defaults it to 'Expense'.
  type?: 'Expense' | 'Income' | 'Savings' | 'Transfer';
  // Kept by the app, not the user: 'debt_repayments' holds scheduled debt
  // repayments' budget lines (src/shared/firestore/debtSchedule.ts).
  managed?: 'debt_repayments' | null;
  // The New basket form's defaults for the items added to it (all
  // optional; older baskets read as none): the category, the first month,
  // whether items repeat, where they're paid from ('account:<id>',
  // 'any_income', 'income:<itemId>', 'savings') and their automation.
  categoryId?: string | null;
  startMonth?: string | null; // yyyy-MM
  repeats?: 'monthly' | 'once' | null;
  defaultPaidFrom?: string | null;
  automationDefault?: 'off' | 'remind' | 'prepare' | null;
  // Savings baskets: the amount to reach (by `deadline`).
  targetAmount?: number | null;
  // "YYYY-MM" → closed for that month: the household is done with this
  // bucket then. Its items count as closed (leftover can be moved on, no
  // more payments expected), with an optional note on how it went.
  closedMonths?: Record<string, { at: Timestamp | null; note: string }>;
  // The bucket page's free-text notes block.
  notes?: string;
  // Set by the flow-type migration (src/shared/budget/flowMigration.ts) on
  // a bucket split out of a mixed one: the original bucket's id.
  splitFrom?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * users/{uid}/baskets/{goalId}/lineItems/{lineItemId} — one sub-cost (or, for
 * an Income-category item, one expected inflow; or, for a Transfer bucket,
 * one planned account-to-account move) of a bucket. Marking it complete
 * (aggregation.ts's recordBucketLineItemPayment) records a real transaction
 * (Expense/Income/Savings, linked back via `expenseId`) or, for a Transfer
 * bucket, a real transfer (linked back via `transferId`) — either way the
 * transaction/transfer itself never needs to know about the bucket.
 */
export interface FirestoreBucketLineItem {
  id: string;
  goalId: string;
  name: string;
  description: string;
  amount: number;
  // What this item actually is, budget-wise — every line item is
  // budgetable now, not just a wish-list entry, and Income is a valid bucket
  // item type too (an expected income source, not just Expense/Savings
  // plans). Its category's own transactionType decides which accountId
  // below is even selectable: a Savings-category item may only point at a
  // Savings Account, an Expense- or Income-category item may only point at
  // a spendable one (see src/logic/bucketDetail/useLogic.ts's validation).
  // For a Transfer bucket (FirestoreBucket.type), this holds a
  // TRANSFER_CATEGORIES kind string instead of a real categories/{id} —
  // same pseudo-category convention src/logic/addBudgetCategory/useLogic.ts
  // already uses for a Transfer-type budget rule. Optional only for
  // back-compat with a line item written before this field existed — the
  // add/edit form always requires it going forward, same convention as
  // priority/necessity below.
  categoryId?: string;
  // The wallet this item is earmarked against, if any — lets Home compute
  // "how much of what's required for this wallet is actually there yet"
  // (src/logic/home/useLogic.ts's wallet chart). For a Transfer bucket's
  // item, this is specifically the FROM account — the source the amount
  // (and any charges) leaves. Optional: a bucket item doesn't have to target
  // a specific account.
  accountId: string | null;
  // Transfer bucket items only — the account the amount lands in. Unset for
  // every other bucket type.
  toAccountId?: string | null;
  // Transfer bucket items only — the planned cost of making this transfer
  // (a wire fee, a mobile-money charge, etc.), same field
  // createTransferWithAggregation already writes onto the real transfer
  // once this item is completed. This is what Buckets' own dashboard
  // "Transfers" card sums — moving your own money between your own
  // accounts isn't spend, but what it costs to do so is. Unset (or 0) for
  // a free transfer, and for every non-Transfer bucket type.
  charges?: number | null;
  // Fixed-bucket items only — how often this recurring cost repeats, i.e.
  // which months' budgets it appears in (src/shared/budget/monthBudget.ts's
  // itemOccurrence). Unset for a Planned (Variable) bucket's items, which
  // are one-off: they appear only in their dueDate's month.
  // `endDate` (optional) stops the recurrence after that date — set by
  // scripts/migrate-budgets-v2.ts for a budget rule that had an end
  // condition ("for 3 months", "until March"); absent = repeats forever.
  recurrence?: { frequency: Frequency; interval: number; endDate?: Timestamp | null } | null;
  // Legacy, read by scripts/migrate-budgets-v2.ts only — the budget rule an
  // item created long ago auto-generated. Budget rules no longer exist
  // (PRD-BUDGETS-V2.md); nothing writes this any more.
  budgetRuleId?: string | null;
  // When this cost is actually due — replaces the old separate
  // plannedPayments-based "Upcoming Payments" feature entirely (Home and
  // the Payments Calendar now read due dates straight off line items
  // instead). Optional: not every bucket item has a hard deadline.
  dueDate: Timestamp | null;
  // Custom manual order within the cross-bucket "All bucket items" list
  // (Priorities' "My order", src/logic/priorities) — lower sorts first. Set once at creation
  // (Date.now(), always after every existing item) and only ever changed by
  // a manual reorder or by applying a Priority/Ease sort as the new
  // baseline. Absent on a line item written before this field existed;
  // every read defaults it to 0, same as this app's other back-compat
  // fields.
  rank: number;
  // Shared Priority type (types.ts, above) — lets the cross-bucket "All bucket
  // items" list filter across buckets the same way it already sorts by
  // deadline/amount. Absent on a line item written before this field
  // existed; every read defaults it to 'Medium'.
  priority: Priority;
  // Independent of priority: how essential this cost actually is, not how
  // urgent it is — a "Must have" item might be low priority (not due soon)
  // while a "Nice to have" item is high priority (due soon but skippable).
  necessity: BucketItemNecessity;
  // `completed` means fully closed — no more spend is expected against
  // this item. An item with one or more `payments` but `completed: false`
  // is "partial": some real money has already gone toward it (covers the
  // case where an expense/transfer isn't settled in a single payment),
  // and Bucket Detail's own "Record payment" action stays available on it
  // to log another one.
  completed: boolean;
  completedAt: Timestamp | null;
  // The MOST RECENT payment's own transaction id — kept for back-compat
  // with a line item completed before `payments` existed (see its own
  // header below); every reader should prefer `payments` when present.
  expenseId: string | null;
  // Set instead of expenseId when the most recent payment was a Transfer
  // bucket's item — recording one creates a real transfers/{id}
  // (aggregation.ts's recordBucketLineItemPayment) rather than a
  // transactions/{id}.
  transferId?: string | null;
  // Running total of every payment recorded so far (sum of `payments`
  // below) — real spend against a planned `amount`, which the Record
  // Payment form (src/logic/bucketDetail/useLogic.ts's handleRecordPayment)
  // lets differ from the plan since actual cost is very often more or
  // less than budgeted. Unset (or absent, on a line item completed
  // before this field existed) means no payment has ever been recorded
  // separately from the plan, and every reader should fall back to
  // `amount`.
  actualAmount?: number | null;
  // Every payment recorded against this item so far, oldest first — an
  // expense that isn't settled in one shot (the item's real cost turns
  // out higher than planned, or it's paid off across several
  // transactions) accumulates more than one entry here rather than
  // overwriting expenseId/transferId. Absent (or empty) on a line item
  // completed before this feature existed, or one never yet paid at all
  // — BucketDetailScreen synthesizes a single legacy entry from
  // expenseId/transferId + actualAmount/amount when this is empty but the
  // item is already completed, so an old item still links through.
  payments?: FirestoreBucketLineItemPayment[];
  // Legacy, read by scripts/migrate-budgets-v2.ts only — the old "Add to
  // budget" flag. A Planned item joins a month's budget by having a dueDate
  // in it now (src/shared/firestore/bucketBudget.ts's scheduleItem).
  addedToBudget?: boolean;
  // A checklist within this one line item — e.g. a "Groceries" item's own
  // shopping list, each entry with its own planned amount. Purely a
  // planning/tracking aid: ticking one off never writes a transaction or
  // touches this item's own `completed`/`amount` — see
  // src/logic/bucketDetail/useLogic.ts's subItemsConsumed/subItemsRemaining
  // for the rollup against this item's own `amount` as the budget cap.
  // Embedded array, not a subcollection — always small, always read
  // together with the item itself, and every other write to a line item
  // already goes through one whole-document update/transaction. Absent
  // (or empty) on every line item created before this feature existed.
  subItems?: BucketLineItemSubItem[] | null;
  // Ported from FirestoreBudgetRule (PRD-BUDGETS-V2.md section 4.2), same
  // yyyy-MM keying and meaning: skip this item in a month outright, or plan
  // a different amount for just that one month. Read through
  // src/shared/budget/monthBudget.ts's itemOccurrence, never directly.
  excludedMonths?: string[];
  // `dueDate` (optional): that month's line is due on a different day.
  monthOverrides?: Record<string, { amount: number; dueDate?: Timestamp | null }>;
  // "This and future months" edits to a recurring item: from the keyed
  // month (yyyy-MM) on, the amount and/or day of the month change. Earlier
  // months keep what they had. Read through monthBudget.ts's itemOccurrence.
  changesFrom?: Record<string, { amount?: number; dueDay?: number }>;
  // Flow subtypes (src/shared/budget/flow.ts) — only the one matching the
  // bucket's type is used. Absent on older items, inferred on read.
  incomeSubtype?: IncomeSubtype | null;
  expenseKind?: ExpenseKind | null;
  savingsMode?: SavingsMode | null;
  // Variable expenses: roll an unused amount into next month (off by default).
  rollover?: boolean;
  automation?: ItemAutomation | null;
  // The item page's free-text notes block.
  notes?: string;
  // An overspend explained rather than (or as well as) covered — per month,
  // the part of that month's overspend the household accepted, and why.
  // Written by the Planning "Cover or justify" flow
  // (src/shared/firestore/bucketBudget.ts's justifyItemMonth).
  // Priorities (src/viewmodels/plans): moved to a later date, with why.
  postponeHistory?: { fromDate: Timestamp | null; toDate: Timestamp; reason: string; at: Timestamp }[];
  // 'dropped' — decided not to buy it (a one-off; it's also marked
  // completed so its plan closes). Absent means it's still wanted.
  status?: 'dropped';
  // A penalty if it's late, or an installment tied to a contract — ranks
  // it ahead of equal items in Priorities' recommended order.
  penaltyIfLate?: boolean;
  monthJustifications?: Record<string, ItemJustification>;
  // Plan and forecast (src/viewmodels/plans/engine.ts, allocate.ts). All
  // optional; an older item reads as: no window, not splittable, a budget
  // line. A fixed recurring item is never movable by dragging (derived).
  notBefore?: Timestamp | null;
  neededBy?: Timestamp | null;
  splittable?: boolean;
  // The lines one split made ("Couch, 1 of 3") share this id.
  splitGroupId?: string | null;
  source?: 'budget_line' | 'plan_item' | 'want_to_buy';
  // A scheduled debt repayment's budget line (the managed Debt repayments
  // basket): recording it records the repayment on the debt.
  debtId?: string | null;
  scheduledRepaymentId?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type JustificationReason = 'unexpected cost' | 'price increase' | 'emergency' | 'underestimated' | 'other';

export interface ItemJustification {
  reason: JustificationReason;
  note: string;
  amount: number; // in the display currency it was entered in
  currency: string;
  at: Timestamp;
}

export interface BucketLineItemSubItem {
  id: string;
  name: string;
  amount: number;
  completed: boolean;
}

// See FirestoreBucketLineItem.payments's own header — one entry per real
// transaction/transfer recorded against a line item, in case it takes more
// than one to cover it.
export interface FirestoreBucketLineItemPayment {
  id: string; // the transaction's or transfer's own client id
  kind: 'expense' | 'transfer';
  amount: number;
  date: Timestamp;
}

export type BucketItemNecessity = 'MustHave' | 'NiceToHave';

export type DebtType = 'cash' | 'existing';
export type DebtPriority = 'low' | 'medium' | 'high';

/**
 * Where a debt's planned payments come from — the same funding choices as
 * other payments: an account, any income, one income line (a bucket item),
 * or savings.
 */
export type DebtPaidFrom =
  | { kind: 'account'; accountId: string }
  | { kind: 'anyIncome' }
  | { kind: 'incomeLine'; itemId: string; bucketId: string }
  | { kind: 'savings'; accountId: string | null };

export interface FirestoreDebtRecurringPlan {
  amount: number;
  interval: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  nextPaymentDate: Timestamp;
  isActive: boolean;
  paidFrom?: DebtPaidFrom | null;
  automation?: ItemAutomation['mode'];
  // "Only the next payment": a one-off amount and date for the next
  // payment; the plan itself is unchanged and resumes after it.
  nextOverride?: { amount: number; date: Timestamp } | null;
}

/**
 * One dated repayment on a debt, on its own or alongside the repeating
 * plan (src/viewmodels/debtSchedule.ts): a set amount, or "Everything
 * left" (the balance left on that date after every earlier repayment,
 * worked out again whenever the balance or plan changes). Unless the debt
 * is record only and nothing pays it from an account, it has a budget line:
 * an item of the managed "Debt repayments" basket
 * (src/shared/firestore/debtSchedule.ts), so it shows in Payments,
 * Priorities, Ready to pay and the forecast like any fixed payment.
 */
export interface FirestoreScheduledRepayment {
  id: string;
  date: Timestamp;
  amountMode: 'set' | 'everything';
  amount: number | null;
  paidFrom: DebtPaidFrom | null;
  automation: ItemAutomation['mode'];
  note: string;
  /** Its budget line: the Debt repayments basket's item (null: none). */
  itemId: string | null;
  /** Set once it's recorded on the debt. */
  repaymentId: string | null;
}

export interface FirestoreDebtPaymentPlan {
  type: 'none' | 'recurring';
  recurring?: FirestoreDebtRecurringPlan;
  // Dated one-off repayments; they combine with a repeating plan.
  scheduled?: FirestoreScheduledRepayment[];
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
  // Who the money is owed to (a person or organisation).
  lender?: string;
  // The debt financing income transaction (a cash debt; kept, excluded,
  // when it changes to record only). Older debts find it by linkedDebtId.
  borrowingTransactionId?: string | null;
  // The latest activity entry that can be undone (src/shared/debt/walletEffectRun.ts).
  lastChangeId?: string | null;
  // Set when a repayment brings the balance owed to zero.
  paidOffAt?: Timestamp | null;
  archivedAt: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * users/{uid}/debts/{debtId}/activity/{entryId} — the debt's activity log:
 * type switches, amount, account and date edits, plan changes, repayments.
 * A wallet change keeps its plan so it can be undone exactly; see
 * DebtActivityEntry in src/shared/debt/walletEffectRun.ts for the fields.
 */
export interface FirestoreDebtActivity {
  id: string;
  at: Timestamp;
  kind: string;
  title: string;
  changes: { label: string; from: string; to: string }[];
  lines: string[];
  plan: unknown;
  undoneAt: Timestamp | null;
  undoOf: string | null;
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

export interface FirestoreUserDoc {
  email: string;
  name: string;
  archived: boolean;
  createdAt?: Timestamp;
  lastLoginAt?: Timestamp;
}

/**
 * users/{uid}/reconciliations/{reconciliationId} — PRD-AUDIT-RECONCILIATION.md
 * section 2.2. One document per "what do your accounts actually hold right
 * now" check — a history, not a working value; the working value is always
 * the Unjustified wallet's own currentBalance (src/shared/firestore/
 * unaccountedBalance.ts), which keeps moving as the household explains
 * individual historic transactions between checks. This history exists so
 * the Audit Report can chart the gap shrinking (or not) over time, and so
 * "tap a row to see the full per-account breakdown for that check" (the
 * Reconciliation History screen) has something to read from.
 */
export interface FirestoreReconciliation {
  id: string;
  uid: string;
  performedAt: Timestamp;
  reportedBalances: Record<string, number>; // accountId -> what the person entered
  ledgerBalancesAtTime: Record<string, number>; // accountId -> currentBalance read at the same moment
  totalGap: number; // signed: total ledger minus total reported
  notes: string;
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

// Sits between Area and Project — every area can have buckets, and a
// project can belong to one (see FirestoreProject.bucketId below). Same
// shape as FirestoreArea, deliberately, so the create/edit screens can
// reuse the same form pattern.
export interface FirestoreSection {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  description: string; // required — same convention as Area
  areaId: string; // required — a bucket always belongs to exactly one area
  archived: boolean;
  // True for the one bucket src/shared/firestore/buckets.ts auto-creates per
  // area (fixed id `default-{areaId}`) — every project in that area with no
  // bucket of its own effectively lives here, so this bucket can be
  // renamed/recolored but never archived (see bucketEdit/useLogic.ts).
  isDefault?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ProjectStatus = 'Active' | 'Completed' | 'Archived';

// Shared by projects and tasks — viewmodels/projects.ts's PRIORITY_LEVELS.
// 'Urgent' is the fourth level the new task form added ("very important").
// The three older values keep their stored names — shown as important /
// normal / low (viewmodels/projects.ts's priorityLabel), so existing data
// needs no migration.
export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface ProjectMilestone {
  id: string;
  name: string;
  dueDate: Timestamp;
  taskIds: string[];
  status: 'pending' | 'done';
}

/** settings/insights — the Insights screen's capacity, alert thresholds and
 * notification switches. Absent fields fall back to INSIGHTS_DEFAULTS
 * (src/viewmodels/insights/settings.ts). */
export interface FirestoreInsightsSettings {
  capacityHours?: number;
  workStart?: string; // "HH:mm"
  workEnd?: string;
  thresholds?: Partial<Record<string, number>>;
  notifyMorning?: boolean;
  notifyProjectRed?: boolean;
  notifyEvening?: boolean;
}

export interface FirestoreProject {
  id: string;
  name: string;
  emoji: string | null;
  areaId: string | null;
  // Optional — a project can belong directly to an area with no bucket.
  // When set, areaId above is always that bucket's own areaId (the create/
  // edit screens enforce this; a bucket never gets picked without pulling
  // its area along, see src/logic/projectForm/useLogic.ts).
  bucketId: string | null;
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
  // Checkpoints on the way to endDate (the deadline) — Insights forecasts
  // each from its linked tasks. Absent on projects written before them.
  milestones?: ProjectMilestone[];
  description: string; // required
  // The project page's free-text notes block. Absent on older projects.
  notes?: string;
  // No separate `archived: boolean` — deliberately, so there's only ever
  // one source of truth for whether a project is active: `status`. A
  // second boolean that could drift out of sync with it (archived:false but
  // status:'Archived', or the reverse) is exactly the kind of bug this
  // avoids. "Archived" is one of ProjectStatus's three values, see above.
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Shown at the top of each Calendar agenda row, and selectable on the task
// edit screen (viewmodels/projects.ts's TASK_TYPES). Meeting/Event/ToDo are
// the built-in presets, but a household can add its own free-form type
// (viewmodels/projects.ts's isValidCustomTaskType — one capitalized word)
// via the task edit screen's own Details page, stored in
// settings/taskTypes (src/shared/firestore/refs.ts's taskTypesRef) — so
// this is a plain string, not a closed union.
export type TaskType = string;

// viewmodels/tasks.ts's TASK_STATUSES — set from TaskQuickActionsMenu's
// status picker, kept in sync with FirestoreTask.done (see that field's own
// comment below).
// 'Cancelled' (the Focus page's swipe-left): not done, dropped from today's
// plan — never counted in progress, and hidden from Today's Tasks.
export type TaskStatus = 'Pending' | 'Stuck' | 'In Review' | 'Done' | 'Cancelled';

// The Eisenhower quadrant a task sits in on the Focus board — see
// src/viewmodels/eisenhower.ts. Stored only once chosen (dragged on the
// board, or picked on the task form); otherwise derived live from priority
// and due date.
export type Quadrant = 'do' | 'schedule' | 'delegate' | 'eliminate';

// Time blocking (src/viewmodels/scheduling.ts): a 'blocked' task owns its
// time window outright; 'free' windows can be shared with other free
// tasks. Absent on tasks written before this existed — read through
// effectiveTimeMode, which defaults by type (meetings/events blocked,
// to-dos free).
export type TimeMode = 'blocked' | 'free';

export interface TaskSubtask {
  id: string;
  title: string;
  done: boolean;
}

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
  // Same mirroring convention as areaId — copied from the project's own
  // bucketId, never set directly, null whenever projectId is null (or the
  // project itself has no bucket).
  bucketId: string | null;
  parentTaskId: string | null; // subtask — a later build step
  // The done checkbox's own binary state, kept in sync with `status` below
  // rather than independent of it: done flips true exactly when status
  // becomes 'Done', and flips false (resetting status to 'Pending') when
  // unchecked directly — see taskWrites.ts's updateTaskDone/
  // updateTaskStatus. `archived` further below is a third, independent
  // "removed from view" flag, unrelated to either.
  done: boolean;
  // Optional so older docs (written before this field existed) still
  // parse — read through resolveTaskStatus() (viewmodels/tasks.ts) rather
  // than this field directly, which falls back to 'Done'/'Pending' from
  // `done` alone for those. Changed via TaskQuickActionsMenu's status
  // picker.
  status?: TaskStatus;
  // Optional — most tasks are still a single point in time (dueDate alone).
  // When set, the task spans a range (dueDate is then read as the end):
  // task cards and the Calendar agenda show "start – end" instead of a
  // single time. Not subject to the originalDueDate/rescheduleCount
  // bookkeeping below — that tracks the deadline (dueDate) slipping, not
  // the start.
  startTime: Timestamp | null;
  dueDate: Timestamp | null; // date AND time — the only schedule a task has, shown on the Calendar agenda as "time below"
  // A date-only task — a "todo" saved without a time (the task form's "set a
  // time" toggle left off). Still stored with a full-day startTime (00:00)
  // and dueDate (23:59) so every date filter/sort works unchanged; this flag
  // only tells displays to show the day alone, and the Calendar to list it
  // with the day's all-day items instead of on the hour timeline. Absent on
  // tasks written before it existed (= timed).
  allDay?: boolean;
  // See Quadrant above — absent means "derive it" (eisenhower.ts).
  quadrant?: Quadrant | null;
  // See TimeMode above. Only meaningful for a timed task (not allDay).
  timeMode?: TimeMode;
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
  // The task page's checklist (subtasks as lines, not tasks). Absent on
  // older tasks.
  subtasks?: TaskSubtask[];
  archived: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  // "YYYY-MM-DD" (taskWrites.ts's toDateOnly) of the day this task was
  // picked as one of that day's top priorities on the Time hub (Projects
  // hub) — not a Timestamp, since it's only ever compared for equality
  // against today's own toDateOnly() output, never read as a real instant.
  // null/absent means "not a priority for any day". Stays set after that
  // day passes (harmless history) — a task simply stops showing under
  // "Today's priorities" once the date no longer matches today.
  priorityDate?: string | null;
  // Recurring tasks (src/viewmodels/recurrence.ts): an iCalendar RRULE,
  // e.g. "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU". Set = this doc is a series whose
  // first date is startTime (or dueDate); every other date it falls on is
  // generated on the fly (src/shared/tasks/recurringTasks.ts). The series
  // doc's own done/status stay 'Pending' — each date has its own, below.
  // Absent/null = an ordinary one-off task, exactly as before.
  rrule?: string | null;
  // ---- Insights (src/viewmodels/insights) ----
  // The start as first planned — set once at creation (originalDueDate is
  // its end counterpart).
  originalStartTime?: Timestamp | null;
  // Set when the task is cancelled, cleared if it's reopened.
  cancelledAt?: Timestamp | null;
  // Minutes it really took — the optional prompt after ticking it done.
  // Absent = assume the estimate (dueDate − startTime).
  actualMinutes?: number | null;
  // Every status change, oldest first, so trends can be rebuilt for any
  // range. `key` names the date of a recurring series it applies to.
  statusLog?: TaskStatusChange[];
  // Per-date changes to a series, keyed by the date the rule generated
  // ("YYYY-MM-DD", local) — even when that date's task was moved to another
  // day.
  exceptions?: Record<string, TaskException>;
  // Google Calendar sync (src/shared/calendarSync) — only on tasks pushed to
  // Google as Busy blocks. Absent = never pushed.
  googleSync?: TaskGoogleSync;
}

/** A pushed task's Google Calendar state. `pending` is set in the same
 * write that creates a pushable task or changes its time, title or mode
 * (taskWrites.ts); the sync engine sets synced/error after each push. */
export interface TaskGoogleSync {
  state: 'pending' | 'synced' | 'error';
  // Occurrence id (the task id, or taskId__yyyyMMdd for one date of a
  // recurring task) → its Google event id.
  googleEventIds?: Record<string, string>;
  lastSyncedAt?: Timestamp | null;
  error?: string | null;
  // Real Google events the block overlaps (a meeting booked in the seconds
  // before the block reached Google).
  conflicts?: TaskGoogleConflict[];
}

export interface TaskGoogleConflict {
  googleEventId: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  // Which occurrence it hit (the task id, or taskId__yyyyMMdd).
  blockId?: string;
}

/** users/{uid}/calendarEvents/{googleEventId} — a read-only mirror of one
 * Google Calendar event, written by the sync engine's pull (merge, Google
 * fields only). The app never edits title or time; linkedTaskId,
 * linkedProjectId and notes are the app's own and a pull never touches
 * them. */
export interface FirestoreCalendarEvent {
  id: string;
  googleEventId: string;
  recurringEventId: string | null;
  kind: 'meeting' | 'event';
  source: 'google' | 'booking';
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  // Raw, as Google sent them: { dateTime } or { date } (all-day end date
  // exclusive).
  start: { dateTime?: string | null; date?: string | null; timeZone?: string | null };
  end: { dateTime?: string | null; date?: string | null; timeZone?: string | null };
  // All-day events: midnight in the calendar's time zone.
  startAt: Timestamp;
  endAt: Timestamp;
  blocksTime: boolean;
  selfResponse: string | null;
  organizer: { email: string | null; name: string | null; self: boolean } | null;
  attendees: { email: string | null; name: string | null; responseStatus: string | null; optional: boolean }[];
  eventType: string | null; // 'default', 'focusTime', 'outOfOffice', ...
  meetingLink: string | null;
  htmlLink: string | null;
  updated: string | null;
  syncedAt: Timestamp;
  // App-owned, editable in the app.
  linkedTaskId?: string | null;
  linkedProjectId?: string | null;
  notes?: string;
}

/** users/{uid}/settings/calendarSync — the last sync's outcome, and the
 * one Google Calendar setting. */
export interface FirestoreCalendarSyncState {
  lastSyncAt?: Timestamp | null;
  lastSuccessAt?: Timestamp | null;
  lastError?: { code: string; message: string; at: Timestamp } | null;
  calendarName?: string | null;
  calendarTimeZone?: string | null;
  lastCounts?: { meetings: number; events: number; blocksPushed: number; deleted: number; conflicts: number } | null;
  // "Also mark free tasks as busy on Google" — off by default.
  markFreeAsBusy?: boolean;
}

export interface TaskStatusChange {
  at: Timestamp;
  status: TaskStatus;
  key?: string;
}

/** One date of a recurring series, changed on its own. */
export interface TaskException {
  // Removed from the series (deleted, or skipped for a conflict). Still
  // counts toward an "after N occurrences" end, as in RRULE.
  deleted?: boolean;
  // Done or cancelled on this date only; absent = pending.
  status?: 'Done' | 'Cancelled';
  completedAt?: Timestamp | null;
  cancelledAt?: Timestamp | null;
  actualMinutes?: number | null;
  // "This task" edits — only the fields that differ from the series.
  title?: string;
  notes?: string;
  type?: TaskType;
  priority?: Priority;
  quadrant?: Quadrant | null;
  timeMode?: TimeMode;
  allDay?: boolean;
  startTime?: Timestamp;
  dueDate?: Timestamp;
}

/**
 * users/{uid}/budgetMonths/{yyyy-MM} — a month that has been set up from
 * the recurring items (src/shared/budget/monthSetup.ts). A month's lines
 * are still derived from the items (monthBudget.ts), this doc records that
 * the month was opened, what it started with (for the start-of-month
 * banner), and whether it was reviewed. Created once, by a deterministic
 * id, so setting a month up twice changes nothing.
 */
export interface FirestoreBudgetMonth {
  id: string; // yyyy-MM
  setupAt: Timestamp | null;
  // Lines the month started with, per flow type, and their keys
  // (itemId@yyyy-MM) — what the banner and the review page list.
  counts: { income: number; expense: number; savings: number; transfer: number };
  lineKeys: string[];
  reviewedAt: Timestamp | null;
  bannerDismissedAt: Timestamp | null;
  // "Did it arrive?" answered "Not yet": income line key -> yyyy-MM-dd,
  // asked again from the next day.
  incomeSnoozed?: Record<string, string>;
}

/**
 * users/{uid}/paymentQueue/{itemId__yyyyMM} — what the user did to one
 * payment occurrence: confirmed (with the records written), skipped,
 * postponed, or an amount typed before confirming. The occurrence itself
 * is derived from the current item (src/shared/budget/occurrences.ts), so
 * these docs never hold a copy to keep in step. Confirming writes the doc
 * inside the same transaction that records the payment, so it can't be
 * confirmed twice. Docs from before derivation held full copies; the
 * one-time repair (paymentQueue.ts's repairQueue) cleared those.
 */
export interface FirestorePaymentQueueEntry {
  id: string;
  bucketId: string;
  itemId: string;
  month: string; // the occurrence this pays (yyyy-MM)
  flow: 'Expense' | 'Savings' | 'Transfer';
  name: string;
  bucketName: string;
  amount: number; // in `currency`
  currency: string;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  fee: number;
  // Ordering: absolute savings and Must have first, then due date, then priority.
  first: boolean;
  dueDate: Timestamp | null;
  priority: Priority;
  trigger: { kind: 'due' | 'income' | 'any_income'; incomeKey: string | null; incomeName: string | null; incomeAmount: number | null };
  status: 'ready' | 'confirmed' | 'skipped' | 'postponed';
  recordIds: string[];
  // What the user did before confirming (src/shared/budget/occurrences.ts):
  // the amount they typed and the item's amount at the time, kept only
  // while the item's amount stays the same.
  amountEdit?: number | null;
  amountEditBase?: number | null;
  // Postponed: hidden from Ready to pay until this day (yyyy-MM-dd).
  postponedUntil?: string | null;
  createdAt?: Timestamp;
  confirmedAt?: Timestamp | null;
}

/** users/{uid}/migrations/{id} — a one-time data migration and its report. */
export interface FirestoreMigration {
  id: string;
  version: number;
  completedAt: Timestamp | null;
  reviewedAt: Timestamp | null;
  report: { kind: string; subject: string; detail: string }[];
}
