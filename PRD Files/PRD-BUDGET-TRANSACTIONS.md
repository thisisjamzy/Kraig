# Dreda: Budget Detail and Monthly Transactions

**Status**: Feature specification for the Budget screen and its category drill-down. This is an
enhancement PRD, not a green-field one: every section below is checked directly against the live
repo (`app/src/screens/Budget`, `app/src/logic/budget`, `app/src/logic/addTransaction`,
`app/src/screens/TransactionHistory`) rather than assumed, so the gap between "already built" and
"new" is explicit throughout.
**Arch**: Same established Dreda pattern as `PRD-GOALS-DEBT.md` and `PRD-ANALYTICS.md`: every
collection a subcollection of `users/{uid}`, client-side aggregation via `runTransaction()` at
write time (no Cloud Functions, Firebase Spark plan), mobile-first single column. Nothing in this
PRD needs a new collection or a new write path; it is almost entirely new reads and new UI on top
of data the app already writes.

---

## 0. What's already built (read directly from the repo before writing this spec)

The household asked to "go back and look at what we've already built" before scoping this, so
this section records what's real, confirmed by reading the code, not remembered from an earlier
PRD.

- **Budget screen** (`app/src/screens/Budget/BudgetScreen.tsx`, `app/src/logic/budget/useLogic.ts`):
  month/year picker, a list of budget headings (one row per active `budgetRules` document that
  applies to the viewed month, via `ruleAppliesToMonth`), each showing spent vs. budgeted, an
  "Add category" route (`/add-budget-category`), and a "Record a past transaction" button that
  deep-links to Add Transaction pre-dated into the viewed month. That last button is deliberately
  hidden when the viewed month **is** the real current month (the code's own comment: the
  ordinary "+" quick action already covers that case, a second button would just duplicate it).
  There is currently no pagination on the category list and no transactions of any kind shown on
  this screen.
- **Category drill-down**: tapping a budget heading already navigates to
  `/transactions?categoryId={id}` (`app/src/screens/TransactionHistory`). But that screen fetches
  the **last 100 transactions across all months** (`orderBy('date','desc'), limit(100)`) and
  filters to the category **client-side**, explicitly to avoid a new composite index (the code's
  own comment says as much). It is not scoped to the month the household was viewing on the
  Budget screen, has no budgeted/spent/remaining summary, and has no "add a transaction" entry
  point at all, only an edit-pencil per existing row.
- **Add Transaction already restricts categories to what was budgeted that month.**
  `app/src/logic/addTransaction/useLogic.ts` computes `budgetedCategoryIds` off the date currently
  set on the transaction (not "today"), using the same `ruleAppliesToMonth` + `excludedMonths`
  check the Budget screen uses, and shows only those categories by default. A "record as
  unplanned" toggle is the deliberate escape hatch when nothing's budgeted. **This already
  satisfies the household's requirement that recording a transaction into a past month only
  offers that month's real budget headings.** Nothing needs to change here except one small
  addition (Section 3.4): letting this screen also be opened pre-filled with a specific category.
- **Transactions are a flat collection**, `users/{uid}/transactions/{id}`
  (`FirestoreTransaction`: `date`, `categoryId`, `accountId`, `amount`, `direction`, `month`
  ("yyyy-MM", written client-side by `createTransactionWithAggregation` at save time), plus
  debt-repayment linking fields). `firestore.indexes.json` already has two indexes that matter
  here: `(month ASC, date DESC)` and `(categoryId ASC, date DESC)`. It does **not** have one that
  combines `categoryId` and `month` together, which is exactly the gap Section 2.2 below closes.

## 1. What the household asked for, mapped to gap or already-done

| # | Ask (as described in the walkthrough) | Current state | This PRD |
|---|---|---|---|
| 1 | See a budget for any month/year, with budget headings per category | Already built | No change |
| 2 | Budget heading list shows ~6, then a "Show more" button unfolds the rest | List renders every heading, no cap | New: pagination (Section 3.1) |
| 3 | Below the headings, see a list of all transactions recorded for that month, with a button to record a new one for that month | Not on this screen at all | New: "This Month's Transactions" panel (Section 3.2) |
| 4 | Recording a transaction for a past month should only offer that month's real budget headings | Already built (`addTransaction/useLogic.ts`) | No change, documented for completeness |
| 5 | Should be able to go back into a budget heading and record a transaction against it directly | Category drill-down has no add-transaction entry point | New: "Add Transaction" button on the category detail screen, pre-filled category (Section 3.4) |
| 6 | Clicking a budget heading shows all transactions recorded for that category, lets you add one at a date, and shows details for that spending category | Drill-down exists but is all-time (not month-scoped) and has no budgeted/spent/remaining summary | New: month-scoped query + summary header (Sections 2.2, 3.3) |

---

## 2. Data and query changes

### 2.1 No new collections, no new fields

Every field this PRD reads already exists: `FirestoreTransaction.categoryId`,
`FirestoreTransaction.month`, `FirestoreBudgetRule` (+ `ruleAppliesToMonth`), `StatsMonthly.
perCategorySpend`. This is a UI and query layer on top of the existing write path in
`aggregation.ts`; `createTransactionWithAggregation` does not need to change.

### 2.2 New composite index: category detail, scoped to a month

The category detail screen (Section 3.3) needs "all transactions where `categoryId == X` and
`month == 'yyyy-MM'`, newest first." Firestore can satisfy multiple equality filters without a
composite index, but the moment `orderBy('date', 'desc')` is added on top, a composite index is
required, the same reasoning the existing `TransactionHistoryScreen` code comment already gives
for why it avoided a `categoryId` filter server-side. Add to `firestore.indexes.json`:

```json
{
  "collectionGroup": "transactions",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "categoryId", "order": "ASCENDING" },
    { "fieldPath": "month", "order": "ASCENDING" },
    { "fieldPath": "date", "order": "DESCENDING" }
  ]
}
```

This is the **only** index change this PRD needs.

### 2.3 "This month's transactions" panel needs no new index

`where('month', '==', monthStr).orderBy('date', 'desc')` matches the existing
`(month ASC, date DESC)` index exactly. This query is new to the Budget screen, but it needs
nothing added to `firestore.indexes.json`.

### 2.4 Category name for an archived category

`categoryName` on both the Budget screen and today's `TransactionHistoryScreen` is looked up via
`useCategories()`, which filters `archived == false`. A category that was budgeted and spent
against in a past month, then later archived, currently falls back to printing its raw
`categoryId` string instead of a name (`categoryName.get(id) ?? id`). That's a pre-existing,
low-traffic gap today because nothing links into a category's own detail view; once the category
detail screen (Section 3.3) becomes the household's normal way to drill into a spending category,
it will be hit far more often. Fix: the detail screen reads the specific category doc directly
(`categoryRef(uid, categoryId)` via `useFirestoreDoc`), not the archived-filtered list, so an
archived category still shows its real name, its recorded `transactionType`, and (if useful)
an "archived" badge.

---

## 3. UI/UX specification

### 3.1 Budget screen: "Show more" on the heading list

```
[Budget headings, sorted <open decision, see Section 8>]
  Groceries        45,000 spent of 60,000 XAF   Monthly
  Transport        18,000 spent of 25,000 XAF   Monthly
  Rent            150,000 spent of 150,000 XAF  Monthly
  Subscriptions     6,500 spent of 10,000 XAF   Monthly
  Utilities        22,000 spent of 20,000 XAF   Monthly
  Dining Out        9,000 spent of 15,000 XAF   Monthly
  [Show more (4)]                    <- only rendered when > 6 headings exist
```

- Default render: first 6 entries of `categories` (the array `useLogic()` already produces).
- Tapping "Show more" expands the full list in place (no navigation, no reload); the button
  becomes "Show less" and collapses back to 6.
- Purely a rendering change in `BudgetScreen.tsx`; `useLogic()`'s `categories` array is untouched.
- The count shown on the button ("Show more (4)") is the number of hidden rows, not a static
  label, so the household can tell at a glance how many more categories they've budgeted.

### 3.2 Budget screen: "This Month's Transactions" panel

New section, placed directly below the (now paginated) budget heading list, above the existing
footer note:

```
[Section title: "Transactions this month"]
[Record Transaction button]

  Groceries    Carrefour weekly shop       -4,500 XAF   Sep 2
  Rent         September rent               -150,000 XAF Sep 1
  Transport    Moto fare                    -1,200 XAF   Aug 31
  ...                                                     (preview: newest 5-8)

  [View all N transactions this month]        <- links to /transactions?month=X&year=Y
```

- Query: `where('month', '==', monthStr).orderBy('date', 'desc').limit(8)` (reuses the existing
  `(month ASC, date DESC)` index, Section 2.3). This is a **preview**, not the full month; a busy
  household could easily log 40+ transactions in a month, so the Budget screen itself never loads
  more than a handful.
- "View all N transactions this month" opens a month-scoped (not category-scoped) transaction
  list. This reuses `TransactionHistoryScreen` with a new `month`/`year` query param path
  (Section 3.3 covers the shared screen changes), the same UI already used for the category
  drill-down, just filtered by month instead of category.
- **Record Transaction button**: links to `/add-transaction?month={monthIndex}&year={year}`,
  exactly the same href the existing (conditionally hidden) "Record a past transaction" button at
  the bottom of the page already builds (`retroTransactionHref`). Because this new button is
  always visible in this panel regardless of which month is being viewed, it makes the existing
  bottom-of-page button, which only appears for a non-current month, redundant. Recommendation:
  remove the old button and let this one replace it everywhere, one entry point instead of two
  that sometimes overlap. Flagged as an open decision in Section 8 rather than decided here,
  since it's a call the household should confirm, not one this PRD should make silently.
- Empty state: "No transactions recorded for {Month} yet." plus the Record Transaction button,
  never a blank panel that could read as a loading state.

### 3.3 Budget heading (category) detail screen, scoped to a month

This reworks `TransactionHistoryScreen`/`useLogic` in place, it is the same component the "View
all" link and the existing all-time `/transactions?categoryId=` link both use, now accepting an
optional `month`/`year` pair alongside the existing `categoryId`.

**Entry points:**
- Tap a budget heading on the Budget screen -> `/transactions?categoryId={id}&month={monthIndex}&year={year}` (the month currently being viewed).
- "View all transactions this month" from Section 3.2 -> `/transactions?month={monthIndex}&year={year}` (no `categoryId`).
- Any existing link that only passes `categoryId` (none currently found elsewhere in the repo,
  but kept safe for forward compatibility) still works exactly as it does today: all-time,
  unscoped by month.

**Layout:**

```
[Back]  Groceries                              [Search] [Filter]

[Category summary card]   <- new, only rendered when both categoryId and month/year are present
  Budgeted: 60,000 XAF        Spent: 45,000 XAF        Remaining: 15,000 XAF
  [progress bar, same over/under color convention as the Budget screen]

[Add Transaction button]  <- new

  Carrefour weekly shop                -4,500 XAF   Sep 2      [Edit]
  Corner store                         -2,100 XAF   Aug 26     [Edit]
  ...

[Show more / pagination as today, if the list is long]
```

- **Query**: when both `categoryId` and `month` are present, `where('categoryId', '==', id).
  where('month', '==', monthStr).orderBy('date', 'desc')`, the new index from Section 2.2. When
  only `month` is present (the "view all this month" entry point), drop the `categoryId` filter
  entirely (Section 2.3's existing index). When only `categoryId` is present (today's behavior,
  kept for compatibility), fall back to the existing last-100-then-filter-client-side approach
  unchanged, no regression for any link that doesn't pass a month.
- **Category summary card** reuses the exact computation `src/logic/budget/useLogic.ts` already
  does for `categories[].budgeted`/`.spent` (the matching `budgetRules` entry for that
  `categoryId` + month, and `statsMonthly.perCategorySpend[categoryId]`), so the number shown
  here always agrees with what the Budget screen showed for that same heading. Not passed across
  navigation as state (a page refresh or a direct deep link must still work); recomputed
  independently from `budgetRulesRef` + `statsMonthlyRef` the same way, using the category name
  fix from Section 2.4.
- **Add Transaction button**: `/add-transaction?categoryId={id}&month={monthIndex}&year={year}`
  (Section 3.4 covers what Add Transaction does with `categoryId`). Only rendered when a
  `categoryId` is present, this is "add a transaction to this specific spending category," not
  a generic add button, that already exists via Section 3.2's panel for the whole month.

### 3.4 Add Transaction: pre-fill from a category

`app/src/logic/addTransaction/useLogic.ts` already reads `month`/`year` off the URL
(`retroTargetFromSearch`) to pre-date the transaction. New: also read an optional `categoryId`
param.

- On mount, when `categoryId` is present: fetch that category doc (`categoryRef(uid, categoryId)`),
  derive `type` from its `transactionType` (`Expense`/`Income`/`Savings`, the same mapping
  `CATEGORY_TYPE` already inverts), set `type` and `category` accordingly, and open directly on
  the `'details'` step instead of `'type'`, skipping the two steps the household has already
  answered by tapping a specific budget heading.
- The existing budgeted-categories-only filter (Section 0) still applies underneath, unaffected;
  if the deep-linked category somehow isn't budgeted for the target month (an edge case, see
  Section 5), the screen still opens on `'details'` with that category selected rather than
  silently clearing it. Tapping "back" from `'details'` in this flow returns to the `'category'`
  step with the same budgeted-only list Section 0 already produces, in case the household wants
  to change it.

---

## 4. Backend logic (reads only, no new write path)

```
// Budget screen: this month's transactions preview (Section 3.2)
query(
  transactionsRef(uid),
  where('month', '==', monthStr),
  orderBy('date', 'desc'),
  limit(8)
)

// Category detail, scoped to the month it was opened from (Section 3.3)
query(
  transactionsRef(uid),
  where('categoryId', '==', categoryId),
  where('month', '==', monthStr),
  orderBy('date', 'desc')
)

// Category summary card (Section 3.3), same shape budget/useLogic.ts already computes
budgeted = rules
  .filter(rule => rule.categoryId === categoryId)
  .map(rule => ruleAppliesToMonth(toRecurrenceRule(rule), year, month))
  .reduce((sum, occurrence) => sum + rule.budgetedAmount * (occurrence?.multiplier ?? 0), 0)
spent = statsMonthly?.perCategorySpend?.[categoryId] ?? 0
remaining = budgeted - spent
```

No `runTransaction()` is introduced by this PRD; every write path (`createTransactionWithAggregation`,
the `statsMonthly`/`statsBudgetProgress` updates it already performs) is unchanged.

---

## 5. Edge cases and validation

- **Category budgeted that month but later archived or renamed**: still shows correctly in the
  category detail screen after the Section 2.4 fix (reads the doc directly, bypassing the
  archived filter); the Budget screen's own heading list still has the pre-existing
  `categoryName.get(id) ?? id` fallback for an archived category's row, which this PRD does not
  change, since that's a heading-list display quirk unrelated to the new detail screen.
- **Budget rule excluded for a specific month** (`excludedMonths`, e.g. a subscription skipped
  for September): that heading correctly stops appearing in that month's Budget screen list, as
  it does today. Any transaction already recorded against that category in that month still
  shows up in Section 3.2's "This Month's Transactions" panel (which lists by `month`, not by
  which headings are currently active), it's just not reachable by tapping a heading for that
  category that month, only via the "View all transactions this month" link. Intentional: the
  transaction happened, hiding it from the month's transaction list because the budget line was
  later skipped would be surprising.
- **Deep-linking a `categoryId` that has no budget for the target month** (Section 3.4): the
  transaction can still be recorded (falls back to the same "unplanned" path Add Transaction
  already supports), it's just reached differently, no dead end.
- **A month with zero budget headings and/or zero transactions**: both new sections show their
  own empty state (Section 3.2); the "Show more" button (Section 3.1) simply doesn't render when
  there are 6 or fewer headings.
- **Timezone / which month a transaction belongs to**: unchanged, already governed by the
  existing client-side `monthKey(input.date)` in `aggregation.ts`.

---

## 6. Integration points

- No change to `PRD-ANALYTICS.md`'s Money Analytics page; its M3 "Where It Went" bar already
  taps into a filtered transaction list, the same underlying pattern this PRD extends for the
  Budget screen's own drill-down, consistent with that PRD's existing precedent for tap-to-filter
  interactions (Debt/Goals rows behave the same way).
- `statsMonthly` and `statsBudgetProgress` are read-only here, this PRD adds no new consumer that
  writes to either.

## 7. Not in scope (deferred)

- A historical, point-in-time snapshot of a category's name (a category renamed today always
  shows its current name against past months, everywhere in the app, not just here). A real,
  pre-existing behavior, out of scope to change as part of this PRD.
- Bulk/CSV import of transactions scoped to a specific month.
- Reminders or notifications nudging the household to log a retrospective transaction for a
  month that looks incomplete.
- Changing how `budgetedAmount` or recurrence works, this PRD only adds visibility into
  transactions already tied to existing budget headings.

## 8. Open decisions (confirm with the household before or during build)

1. **Remove the existing bottom-of-page "Record a past transaction" button** once Section 3.2's
   always-visible Record Transaction button ships, to avoid two buttons that do the same thing on
   a non-current month. Recommended, not decided here.
2. **Default sort order for budget headings** before the "Show more" cut-off applies. Today's
   order is whatever Firestore returns for `budgetRules` (insertion order, not deterministic).
   Worth picking one, alphabetical, or highest-spent-first, since which 6 headings show by
   default now matters in a way it didn't when the whole list rendered.
3. **Preview size for "This Month's Transactions"** (Section 3.2 assumes 8). Fine to tune once
   the household sees it against a real month of data.

---

## 9. Summary

| | Budget headings | This month's transactions | Category (budget heading) detail |
|---|---|---|---|
| **Where** | Budget screen, existing | Budget screen, new panel | `/transactions`, reworked |
| **Query** | Existing, unchanged | `month == X`, existing index | `categoryId == X AND month == Y`, new index |
| **New index needed** | No | No | Yes (Section 2.2) |
| **New UI** | "Show more" past 6 (3.1) | Whole panel (3.2) | Summary card + Add Transaction button (3.3) |
| **Record transaction from here** | Via the new panel's button | Same button, scoped to the viewed month | Own Add Transaction button, category pre-filled (3.4) |
| **Category picker still limited to that month's real headings** | N/A | Already true (Section 0), unchanged | Already true (Section 0), unchanged |
