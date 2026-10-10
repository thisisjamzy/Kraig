# Budget: the four flow types, month setup and Ready to pay

Every bucket, budget line and transaction has exactly one flow type, and nothing mixes
them: income, expenses, savings and transfers each have their own totals, lists, tabs and
charts.

| Type | Subtypes | Notes |
|---|---|---|
| Income | earned, other, debt financing | Loans received are income for their month, shown as "of which … borrowed". |
| Expense | fixed, variable | Transfer fees are expenses. |
| Savings | absolute, flexible | Always positive; withdrawals are shown separately. |
| Transfer | none | Moves between your own accounts: never income, never an expense. |

Need and priority apply to expenses and savings only.

## Where things live

- `src/shared/budget/flow.ts`: flow types, subtype inference, the savings sign rule,
  default automation.
- `src/shared/budget/monthBudget.ts`: one month's lines, derived from the bucket items
  (templates), with per-flow figures.
- `src/shared/budget/monthTotals.ts`: the month's totals, the only place they are
  computed. Available now = received − spent − saved (never expected income).
- `src/shared/budget/monthSetup.ts`: month setup, and the month-lines decision below.
- `src/shared/budget/automation.ts`: what gets prepared, in what order, and how far the
  money received goes.
- `src/shared/budget/flowMigration.ts`: the one-time migration plan and report.
- `src/shared/budget/BudgetRunner.tsx`: runs the migration once, sets months up and
  prepares payments while the app is open (no Cloud Functions).
- Tests: `test/budgetFlow.test.ts`, `test/monthBudget.test.ts` (`npm run test:budget`).

## Month lines: derived, not stored

A month's lines stay derived from the items by `itemOccurrence`. Month-only edits
(`monthOverrides`, now with a due date), this-and-future edits (`changesFrom`), deletions
for one month (`excludedMonths`) and one-off lines (a one-off item due that month) are all
stored on the item, keyed by month, and every occurrence already has a deterministic key
(`itemId@yyyy-MM`; the queue uses `itemId__yyyyMM`). Copying lines into per-month docs
would add a second source of truth to keep in step with every template edit without
enabling anything new. What is stored per month is `budgetMonths/{yyyy-MM}`: created once
by id, with the lines the month started with (the start-of-month banner) and whether it
was reviewed.

## Ready to pay

The app never moves money. When a line's trigger fires (its due date, one income line
received, or any income received), its payment is written to `paymentQueue/{itemId__yyyyMM}`
once. The queue proposes payments in order (absolute savings and must-haves first, then
by due date, then priority) only as far as the money received this month covers; the rest
waits under "Not enough yet". Confirming records each payment in one transaction that also
checks the entry is still ready, so it can't be recorded twice; Undo deletes them again.

## Migration

`migrations/flowTypesV1` records the run and its report. Buckets that held more than one
type are split (`<bucketId>__<type>`, named "<name> · <Type>"); items get explicit
subtypes; negative savings amounts are corrected; "Loan received" income is tagged as debt
financing. Planning already-migrated data yields no writes, so it is safe to run again.

## Baskets: cadence and item kinds

A basket is an envelope. Each month's budget is every basket's items that fall in that
month, and spending is recorded against a basket and an item for what was actually spent.

- **Cadence** (`src/shared/budget/cadence.ts`): a basket is Monthly (the default), Weekly,
  Daily, Quarterly, Yearly, Custom (an RRULE in `cadenceRule`) or One-off. An item without a
  `recurrence` of its own runs on its basket's cadence. A month's planned amount is the
  item's amount times its occurrences that month ("4 weeks × 10,000"). Dates are stepped on
  the calendar, never by adding milliseconds.
- **Item kinds** (`src/shared/budget/itemKinds.ts`, `itemKind` on the item):
  - Payment: a fixed amount due on a date. Paid, Due or Overdue (overdue only for the
    occurrences already due); partial payments show "40,000 of 160,000 paid".
  - Allowance: money for the period, spent bit by bit. Spent / Left and a pace; an optional
    release day (`availableFrom.day`). Never overdue.
  - Set aside: money put away toward `targetAmount` (by `targetDate`). Contributions add up
    across months (`setAsideHistory` in monthBudget.ts); spending recorded against it counts
    as used, not as more saved.
- **Transfers** have no kind: a transfer moves money between your own wallets (into one where
  it can be spent). It's never a payment, never due or overdue, never in Payments or Ready to
  pay, and only its fee counts as spending (and comes off what's available). A basket page
  lists transfer items under "Moves between wallets" with a Move action.
- **Income** (`incomeMode`): a lump sum on a date, or a trickle of small receipts over the
  period (Received / Expected and "62,000 received, 70,000 expected by today").
- Only payments have due dates in the month's lines (`ItemMonth.due`, `dueDates`), so only
  payments appear in Payments, Upcoming payments and Ready to pay. A savings item can be made
  a Payment to keep "pay yourself first" in Ready to pay.
- Add expense never fills in the amount from the basket. Basket, then Item (or "Not sure
  yet"); a Payment offers "Pay the full 12,000 due" as a chip. "Mark as paid" opens the form
  with the remaining due amount suggested.
- **Migration** (`src/shared/budget/basketsMigration.ts`, run by BudgetRunner, stored at
  `migrations/basketKindsV1`): stores each item's kind and each basket's cadence, pins
  one-off items so they don't start inheriting a cadence, and lists every inferred kind for
  the one-time review page `/budget/item-kinds`.
- Tests: `test/basketKinds.test.ts` (`npm run test:baskets`).
