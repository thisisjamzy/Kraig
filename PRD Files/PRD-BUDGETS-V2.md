# PRD — Budgets v2: Buckets are the budget

Status: phases 2–5 built, 7 partly (2026-09-26) — see §11. Supersedes the category-rule half of
PRD-BUDGET-TRANSACTIONS.md and the Goals half of `prd debt n goals`.

## 1. Why

Today there are two planning systems that fight each other:

- **Budget rules** (`budgetRules`) are per-category caps. You type a rough
  figure for "Groceries" and it recurs.
- **Goals** (`goals/{id}/lineItems`) are named, purpose-specific costs.

The Budget screen tries to reconcile them ("dedicated" vs "unplanned",
auto-included categories, `addGoalLineItemToBudget` bumping a rule), and it
still can't answer the questions that matter:

- What did I plan for *this item* this month, and what did I actually spend?
- Where did the leftover go?
- When I overspent, where did the extra money come from?

Two structural bugs make this impossible today:

1. A Fixed (recurring) item's `payments[]`, `actualAmount` and `completed`
   are **item-global, not per month**. Rent paid in August and September
   accumulate into one array and one `completed` flag.
2. A transaction has **no back-reference** to the item it paid for. Editing
   or deleting the transaction leaves the item's `payments[]` stale.

## 2. The model in one paragraph

Goals are renamed **Buckets**. A bucket holds **items**. Every month has a
budget, and that budget is *derived*, never typed in. It consists of every
Fixed bucket item whose recurrence hits that month, plus every Planned item
scheduled into that month. Categories are just a lens over those items:
the month page groups items by category and shows planned vs spent, but you
can't create a budget "for a category" any more. Spending is tracked per
**item-month** (one occurrence of one item in one month). Leftovers and
overspends are resolved through an explicit **allocation ledger**, so every
dollar's movement is traceable.

## 3. Naming

| Today | v2 | Notes |
| --- | --- | --- |
| Goal | **Bucket** | UI, types, logic, routes |
| Goal line item | **Bucket item** | |
| Goal kind `Fixed` / `Variable` | `Fixed` / `Planned` | Fixed repeats monthly; Planned is scheduled into one month |
| Projects' Bucket (Area → Bucket → Project) | **Section** | Frees the word. `bucketId` → `sectionId` on projects/tasks |

**Firestore paths (decision):** phase 1 renames code and UI only. `refs.ts`
already abstracts paths, so `goals/*` stays the storage path for money
buckets and `buckets/*` stays the path for project sections. A later,
optional migration moves the data to `buckets/*` / `sections/*`. Doing the
storage move first would put a risky data migration in front of every
feature below for no user-visible gain.

## 4. Data model

### 4.1 Bucket (was FirestoreGoal)

No change beyond the rename. `kind: 'Fixed' | 'Planned'`, where the stored
value `'Variable'` is read as `'Planned'`.

### 4.2 Bucket item (was FirestoreGoalLineItem)

Keep: `name, amount, categoryId, accountId, toAccountId, charges,
recurrence, dueDate, priority, necessity, rank, subItems`.

Add (ported from `FirestoreBudgetRule`, same semantics):

```ts
excludedMonths?: string[];                                // skip this item in yyyy-MM
monthOverrides?: Record<string, { amount: number }>;      // different plan for one month
```

For a Planned item, `dueDate` *is* its scheduled month. An item with no
`dueDate` is **unscheduled**: a wish-list entry that is in no month's
budget. "Add to budget" becomes "Schedule into month…", which just sets
`dueDate`.

Deprecate (read for back-compat, stop writing): `payments[]`,
`actualAmount`, `expenseId`, `transferId`, `completed`, `completedAt`,
`addedToBudget`, `budgetRuleId`. Spend and status become derived (§5).

### 4.3 Transaction / transfer: the back-reference

```ts
// on FirestoreTransaction and FirestoreTransfer
bucketItem?: {
  bucketId: string;
  itemId: string;
  month: string;   // yyyy-MM of the OCCURRENCE this pays for,
                   // not necessarily the transaction's own month
} | null;
```

The transaction is now the source of truth for "spent against item X in
month M". `month` is explicit because paying September's rent on Aug 30 is
normal. Edit and delete then stay correct for free, because nothing
denormalized has to be patched.

Firestore index: `transactions (bucketItem.itemId ASC, bucketItem.month ASC)`,
and the same on transfers.

### 4.4 Allocation ledger (new)

`users/{uid}/allocations/{id}`: one doc per budget movement. **No money
moves wallets** except for the `savings` source, which also records a real
transfer.

```ts
interface FirestoreAllocation {
  id: string;
  month: string;                         // yyyy-MM the move applies to
  from: AllocationEndpoint;
  to: AllocationEndpoint;
  amount: number;                        // display currency at write time, stored in base
  reason: 'reallocate_leftover' | 'cover_overspend' | 'borrow_next_month' | 'return_to_pool';
  transferId?: string | null;            // set when from.kind === 'savings'
  note: string;
  createdAt: Timestamp;
}

type AllocationEndpoint =
  | { kind: 'item'; bucketId: string; itemId: string; month: string }
  | { kind: 'pool' }                     // the month's unallocated income
  | { kind: 'savings'; accountId: string };
```

The four funding sources for an overspend all map onto this shape:

| Source | `from` | Extra effect |
| --- | --- | --- |
| Another item's leftover | `item` (same month) | none |
| Unallocated income | `pool` | none |
| Savings withdrawal | `savings` | writes a real transfer savings → spending wallet, stores `transferId` |
| Next month's plan | `item` (same item, `month + 1`) | reduces next month's available amount for that item |

Leftover handling uses the same doc with `from = item`, `to = item | pool`.

### 4.5 Removed

`budgetRules`, `statsBudgetProgress`, `budgetPlans` (already unused), the
`onBudgetRuleWrite` trigger, `functions/src/lib/budgetProgress.ts`, and the
`recomputeRulesForCategory` call in `functions/src/transactions.ts`.

## 5. Derivation: one pure function

`src/shared/budget/buildMonthBudget.ts`, pure and unit-tested. It replaces
the 600-line computation in `src/logic/budget/useLogic.ts`.

```ts
buildMonthBudget({ month, buckets, itemsByBucket, transactions, transfers,
                   allocations, categories, ctx }) => MonthBudget
```

For each item that applies to `month` (`goalLineItemAppliesToMonth`, minus
`excludedMonths`):

```
planned      = monthOverrides[month]?.amount ?? amount × occurrence.multiplier
spent        = Σ linked transactions/transfers with bucketItem.month === month
               (Transfer buckets count `charges`, as today)
allocatedIn  = Σ allocations where to   = this item-month
allocatedOut = Σ allocations where from = this item-month
available    = planned + allocatedIn − allocatedOut
remaining    = available − spent
status       = remaining > 0 ? 'under' : remaining === 0 ? 'on' : 'over'
unfunded     = max(0, −remaining)   // an overspend nobody has covered yet
```

Month level:

```
plannedIncome   = Σ planned of Income items
plannedOutflow  = Σ planned of Expense + Savings items (+ Transfer charges)
pool            = plannedIncome − plannedOutflow
                  + Σ allocations to pool − Σ allocations from pool
unplannedSpend  = per category: spend with categoryId but no bucketItem
```

Categories are a `groupBy(categoryId)` over the items plus
`unplannedSpend`. They are read-only rows with no create, edit or delete.

## 6. Screens

### 6.1 Monthly Budget (`/budget`, rewritten)

- **Header card:** planned income, planned outflow, pool ("left to
  budget"), actual spent. The overspend warning stays when `pool < 0`.
- **By category (default view):** each category shows planned / spent /
  remaining, expanding to the items that make it up and an "Unplanned"
  line for category-only spend. There's no "Add category" button; the
  empty state links to Buckets instead.
- **By bucket (toggle):** the same data grouped by bucket.
- **Needs attention strip:** items with `unfunded > 0`, each with a
  "Cover" action.
- **Month-end strip** (current month, last 5 days, and past months): items
  with leftover and a "Reallocate" action.
- Removed: AddBudgetCategory, EditBudgetCategory, the "Save for this month
  only" rule path. Per-month skip/override now lives on the item (§6.2).

### 6.2 Item-month detail (new sheet/panel, opened from any item row)

```
Rent · September 2026                         Fixed · Housing
Planned         1,200
+ Allocated in    150   ← from Groceries leftover (Sep)
− Allocated out     0
= Available     1,350
Spent           1,350   2 transactions ›
Remaining           0   ✓ on budget

Funding trail
  Sep 28  +150  Groceries (Sep) leftover → covered overspend
Payments
  Sep 01  1,200  Rent – landlord transfer
  Sep 15    150  Rent – late fee
[Record payment] [Reallocate leftover] [Cover overspend] [Skip this month] [Change for this month]
```

- **Reallocate leftover:** pick the destination (another item this month,
  pool, or this item next month) and an amount, which defaults to the full
  remainder.
- **Cover overspend:** pick the source from the four in §4.4. Only sources
  with enough available are enabled, and a source can't go below zero.
- Traceability runs both ways: the source item's trail shows
  "−150 → Rent (Sep) overspend".

### 6.3 Buckets (was Goals)

Same screens, renamed. Item rows gain this month's planned / spent / status
chip. A Planned item with no `dueDate` shows "Unscheduled · Schedule".
Recurring items show a small month history (last 6 item-months,
over/under), which also fixes the per-month `completed` bug.

### 6.4 Add / Edit Transaction

- The linked-item picker already exists (`linkedGoalItemId`). It now writes
  `bucketItem` onto the transaction through the normal
  `createTransactionWithAggregation` path instead of the special
  `recordGoalLineItemPayment` path.
- It defaults to items that apply to the transaction's month in the chosen
  category. An "Applies to month" selector covers early or late payments.
- The budgeted-category filter now means "categories with at least one
  item this month", and "Add a budget" links to Buckets.
- Edit Transaction can link, unlink or re-link an item.
- Category-only transactions stay allowed and count as unplanned.

## 7. Migration (one-time script, `scripts/migrate-budgets-v2.ts`)

Idempotent, with a dry-run flag, run per user.

1. **Rules → bucket items.** Create a Fixed bucket "Migrated budgets", plus
   a Planned one when there are one-off rules. Each active rule becomes an
   item: `amount = budgetedAmount`, `recurrence` from
   frequency/interval, `dueDate = anchorDate`, and `excludedMonths` /
   `monthOverrides` copied across (renaming `budgetedAmount` to `amount`).
   Rules with `sourceGoalLineItemId` or pointed to by an item's
   `budgetRuleId` are skipped because the item already exists. Every rule
   is archived after it's converted.
2. **payments[] → back-references.** For every item payment, set
   `bucketItem = { bucketId, itemId, month: monthKey(payment.date) }` on the
   referenced transaction or transfer. Payments pointing at a missing doc
   are logged, not guessed.
3. **Variable → Planned.** Items with `addedToBudget: true` and no
   `dueDate` get `dueDate` set to the first day of `updatedAt`'s month, so
   they stay in the month they were added to.
4. The script prints a per-month planned-total diff (old rules + dedicated
   vs new derived) so you can eyeball it before running for real.

## 8. Phases

Each phase ships on its own and leaves the app working.

| # | Phase | Main files | Done when |
| --- | --- | --- | --- |
| 1 | Projects: Bucket → Section rename (UI + code; `sectionId` read with `bucketId` fallback) | `logic/bucket*`, `screens/Bucket*`, `widgets/BucketCard`, `shared/firestore/buckets.ts`, routes | No "bucket" left in Projects UI |
| 2 | `bucketItem` back-reference on transactions/transfers, index, Add/Edit Transaction writes it, `recordGoalLineItemPayment` writes it too | `types.ts`, `aggregation.ts`, `logic/addTransaction`, `logic/editTransaction`, `firestore.indexes.json` | Editing or deleting a linked transaction updates the item's spent figure |
| 3 | `buildMonthBudget` + tests, item `excludedMonths` / `monthOverrides` | `shared/budget/*`, `test/` | Unit tests cover recurrence, overrides, skips, early payment, transfers, currency |
| 4 | Budget screen rewrite on `buildMonthBudget` (read-only categories, by-bucket toggle, unplanned line) | `logic/budget`, `screens/Budget` | No reads of `budgetRules` from the Budget screen |
| 5 | Allocation ledger + item-month sheet (reallocate, cover overspend ×4 sources, funding trail) | `aggregation.ts` (`createAllocation`, savings transfer inside one `runTransaction`), new `screens/BucketItemMonth` | Every overspend can be covered and traced from both ends |
| 6 | Goals → Buckets rename (UI, types, routes with redirects from `/goals/*`) | `logic/goal*`, `screens/Goal*`, widgets, strings | No "goal" left in Money UI |
| 7 | Migration script, then remove `budgetRules` code paths, screens, functions, rules and indexes | `scripts/`, `functions/src/*`, `logic/addBudgetCategory`, `logic/editBudgetCategory`, `statistics`, `home`, `export/import`, `onboarding`, `auditReport` | `grep budgetRule` returns only the migration script |

Phase 7's removal list comes from the current usages of `budgetRules`:
`addBudgetCategory`, `addTransaction`, `budget`, `categoryTransactions`,
`editBudgetCategory`, `exportData`, `goalDetail`, `goals`, `home`,
`importData`, `onboarding`, `statistics`, `aggregation.ts`,
`auditReport.ts`, `dataWorkbook.ts`, `hooks.ts`, `refs.ts`,
`upcomingPayments.ts`, `viewmodels/budget.ts`, `functions/src/{budgetRules,
transactions,index}.ts`, `functions/src/lib/budgetProgress.ts`, plus
`firestore.rules` and `firestore.indexes.json`.

## 9. Edge cases

- **Early or late payment:** `bucketItem.month` ≠ the transaction month.
  The payment counts toward the occurrence month's item.
- **Quarterly or yearly item:** it only applies in its hit months
  (multiplier from `ruleAppliesToMonth`). To budget a yearly bill as a
  monthly accrual, use a monthly Savings item instead; that stays out of
  scope.
- **Currency:** allocations are stored in base currency, and items are
  converted from their bucket's currency to base, as `dedicatedByCategory`
  does today.
- **Deleting an item** that has linked transactions or allocations is
  blocked (same spirit as today's "only a not-yet-completed item"). Archive
  it instead.
- **Deleting an allocation** is allowed and simply reverses it. A
  savings-sourced allocation deletes its transfer in the same transaction.
- **Borrowing from next month** for an item that doesn't apply next month
  is disabled.
- **Past months** stay editable: you can still reallocate after the month
  closes.

## 10. Open questions

1. Should an item's unspent leftover **roll over automatically** into the
   same item next month (envelope-style), or only on explicit
   "Reallocate"? The draft says explicit only.
2. Section vs Department for the Projects tier. The draft uses Section.
3. Should the Firestore storage-path migration (`goals` → `buckets`,
   `buckets` → `sections`) happen at all, or stay code-only?

## 11. Build status (2026-09-26)

Decisions taken for the open questions: leftovers move only on an explicit
"Reallocate" (no auto-rollover); the Projects tier becomes **Section**;
renames are code/UI-only — Firestore paths and stored field names keep
their old names (`goals/*` holds money buckets, `buckets/*` holds Projects'
sections, bucket items still store `goalId`, projects/tasks still store
`bucketId` for their section). Function-local variable names were left as
they were.

| # | Phase | Status |
| --- | --- | --- |
| 1 | Projects Bucket → Section | Done — screens, logic, widget, `sections.ts`, routes `/sections/*`, copy. |
| 2 | `bucketItem` back-reference | Done — Add Transaction (incl. Transfer-bucket items), Edit Transaction, Edit Transfer, `recordBucketLineItemPayment`. |
| 3 | `buildMonthBudget` + tests | Done — `npm run test:budget` (12 tests). |
| 4 | Budget screen rewrite | Done. |
| 5 | Allocation ledger + item-month sheet | Done. Deleting an item/bucket with linked payments or moves is refused. |
| 6 | Goals → Buckets | Done — types/refs/functions/hooks/screens/widgets, routes `/buckets/*`, `/add-bucket-item`, `/edit-bucket-item`, `/settings/archived-buckets`, with permanent redirects from the old `/goals…` URLs. Old Projects `/buckets/:id` links can't redirect (the path is taken). |
| 7 | Migration + rule removal | Done except running it — `npm run migrate:budgets-v2` (dry run by default). No app code reads or writes rules any more: export/import dropped the Budgets sheet (old files still import; "Goals"/"Goal Items"/Projects' "Buckets" sheets are accepted by their old names), the audit report's budget adherence is per bucket item, Cloud Functions' rule trigger and progress code are removed, `budgetRules`/`budgetPlans`/`statsBudgetProgress` are read-only in `firestore.rules`, and the rules index is gone. |

Not verified in this environment: the Firestore rules tests and the
migration script (both need the emulator, which needs Java), and the
screens in a browser.
