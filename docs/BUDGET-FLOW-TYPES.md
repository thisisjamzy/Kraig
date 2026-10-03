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
