# Claude Code brief: Dreda feature updates (23 November 2026)

Paste everything below the line into Claude Code, with the repo open at `Kraig/app`.

A copy of this brief lives in the repo at `Kraig/docs/briefs/` with the other Claude Code briefs.

What this covers: 20 changes requested by the owner on 23 November, grouped into seven work packages. Some are presentation fixes. Others add new data and business logic (monthly accountability, templates, transfer fees, debt forgiveness, closing items, rescheduling payments). Where the owner did not settle a detail, this brief picks a default and marks it **Default**, so the work can go ahead; the list of defaults is repeated at the end for the owner to confirm.

---

You are working in the Dreda Next.js PWA at `Kraig/app`. Read `claude/dreda-project-handover.md` (section 3, the owner's rules) and `claude/dreda-system-map.md` before you start. Tokens live in `Design-System/tokens.css` and `tokens.tailwind.css`.

House rules for every change:

- UK English in all copy. No em dashes anywhere: UI copy, comments, sample data, commit messages.
- Semantic tokens only. Never raw hex.
- Unlike the earlier fix prompt, this brief **does** add business logic and data. Keep it in the existing layers: view models and hooks under `src/viewmodels` and `src/logic`, Firestore access where the current code already does it. Do not put calculations in screen components.
- Keep existing rules: a transaction uses a real wallet or "Unaccounted money", never both. Basket before basket item. Forms use the stacked style (label above control).
- Every new Firestore field must be optional with a safe default, so existing records keep working without a migration. Where a backfill is needed, write it as an idempotent script and say so.
- Dreda is a ledger. Nothing in this brief moves money or records a transaction without the user confirming it.
- Work through the packages in order. Run the app after each item and check it at 375px wide (phone) as well as on web.
- Before you change anything, find the files involved and list them for each item, because this brief names screens, not paths, where the paths were not known.

## Package 1: Phone UI fixes (small, do first)

### 1.1 Wallet number overflows the wallet card

**The fault.** The masked wallet number (dots plus last four digits) is wider than the card's content box on phone, so the last digits are cut off at the card's edge. It happens wherever a wallet card renders, not only on phone.

**What to build.**
1. Show three groups instead of four: `•••• •••• 1234` (12 characters). We never show the full number, so the fourth group carries no information.
2. Tighten the spacing: dots at a smaller letter-spacing than the digits, and a group gap of about 6px rather than a full space at the current size.
3. Guard it: `white-space: nowrap`, `overflow: hidden`, and size the text with `clamp()` so it never exceeds the card's padded width. The number must sit inside the card's padding at 320px wide.
4. Make the masking one shared formatter (for example `formatMaskedNumber(last4)`) and use it everywhere a wallet number is shown.

### 1.2 Some pages show two back buttons (phone)

**The fault.** Some phone pages show a back arrow in the mobile header and a second back control just below the header.

**What to build.** Search every screen for back controls (`router.back`, back links, `ArrowLeft` or chevron icons with back behaviour) and list each page that renders two. Rule: one back control per page, in the mobile header. Remove the in-page one. Report the list of pages you changed.

### 1.3 "All" on the Projects card should read "See all ↗"

**Where.** Time mode, phone, the Projects card that leads to all projects.

**What to build.** Replace the "All" label with "See all" followed by an arrow pointing up and to the right (45 degrees, the `arrow-up-right` icon). Text link style, icon at text size, same tap target as before (at least 44px). Use the same pattern for any other card that links to a full list, so the app has one "See all" affordance.

### 1.4 Board view scrolls vertically on phone

**The fault.** Switching from card to board view on phone stacks the columns, so you scroll down through each board.

**What to build.** On phone the board scrolls horizontally: columns in a row, each about 85% of the viewport wide so the next column peeks in, `overflow-x: auto`, `scroll-snap-type: x mandatory` with each column snapping to start. Each column scrolls vertically inside itself. Keep a visible column header with its count. Web layout is unchanged.

### 1.5 Basket item health summary overflows its card

**The fault.** On a basket item, the written health summary runs out of the card.

**What to build.** Let it wrap: remove any `white-space: nowrap` or fixed height, set `overflow-wrap: anywhere` only for long unbroken strings and `normal` otherwise, `min-width: 0` on the flex child that holds it. Long summaries wrap to as many lines as they need; never truncate mid-word.

### 1.6 Remove the plus from the Money bottom bar (phone)

**What to build.** Remove the plus (add) item from the Money mode bottom navigation and rebalance the remaining items evenly. Do not touch the Time bottom bar. Adding a transaction stays reachable from the Add buttons on Dashboard and Transactions (see 4.3 for the Add sheet).

### 1.7 "Free after commitments" takes two lines on the wallet summary (phone)

**The fault.** In the wallet summary figures on phone, "Free after commitments" wraps to two lines inside its small inner card, which breaks the row.

**What to build.** Remove the inner cards (and their padding) from the wallet summary figures. Render the figures directly on the base card as a list of rows: label on the left in `text/muted`, figure on the right in the Amount style, a hairline between rows. "Free after commitments" then fits on one line. If any label still wraps at 320px, let the label wrap and keep the figure on the first line, right-aligned. Apply the same treatment on web only if it already uses the same inner-card component; otherwise leave web as is.

## Package 2: Wallets

### 2.1 Pick a wallet colour

**What to build.**
1. Add `color` to the wallet model: one of the nine label hues (`purple`, `blue`, `teal`, `green`, `lime`, `amber`, `orange`, `rose`, `grey`). Optional. **Default** for existing wallets: derive one from the wallet id so they do not all look the same; store it on first edit.
2. In Create wallet and Edit wallet, add a "Colour" row: a row of nine swatches (32px circles, `color/label/<hue>/solid`), the selected one with a check and a focus ring. Accessible as a radio group.
3. Use the colour on the wallet card (tinted background from `color/label/<hue>/bg` with text in `fg`), on the wallet dot in pickers and lists, and on the wallet's line in charts.

### 2.2 Edit wallet must not change the starting balance

**What to build.** Remove the starting balance field from Edit wallet. Starting balance is set once, in Create wallet, and is read-only afterwards. Edit wallet keeps: name, colour, type, savings on or off, frozen on or off, and the fees section (2.3). If the balance is wrong, the path is Reconcile, not Edit. Add a one-line note at the bottom of the form: "To correct the balance, count this wallet" linking to the balance check. Also enforce it below the UI: the update function for wallets must ignore or reject a change to the starting balance.

### 2.3 Transfer and withdrawal fees per wallet

Some wallets (mobile money, some bank accounts) charge a fee that depends on the amount: one range of amounts costs one fee, the next range another. Dreda does not fetch operators' rates. The user keeps the schedule themselves and the app applies it.

**Data.** Add `feeSchedule` to the wallet, optional:

```
feeSchedule: {
  appliesTo: ('transfer' | 'withdrawal' | 'payment')[],   // Default: ['transfer', 'withdrawal']
  bands: { min: number, max: number | null, fee: number, kind: 'fixed' | 'percent' }[],
  updatedAt: Timestamp
}
```

Bands are inclusive of `min`, exclusive of `max`; `max: null` means "and above". Validate: no overlaps, no gaps, bands sorted, fees not negative.

**Edit wallet UI.** A "Fees" section: a toggle "This wallet charges fees". When on, a table of bands, one row each: From, To (blank for "and above"), Fee, and a Fixed or % switch; add row, delete row; a validation message when bands overlap or leave a gap. Under it, a line showing the date the schedule was last changed.

**Logic.** One pure function, `feeFor(wallet, amount, kind)`, in the view model layer, with unit tests for band edges, "and above", percent and fixed.

**Where it applies.** In Add transaction, when the type is Transfer (or the from wallet is used for a withdrawal or payment listed in `appliesTo`), prefill the existing Fees row with `feeFor(...)` and show "From your fee schedule" under it. The user can always change it. The fee is recorded the way fees are recorded today; do not invent a second fee field. Templates (4.x) that use a wallet with a schedule recompute the fee when the amount changes.

## Package 3: Month on month accountability

### 3.1 The problem

"Unaccounted for" is currently a running figure, so what was unaccounted in November is still in the figure in December. The owner wants each month to carry its own unaccounted amount, so they can see whether accountability improves month on month, and also week on week.

### 3.2 Definitions (put these in the view model, in one place)

- **Unaccounted for a period** = the money that left the user's wallets in that period without being explained. In this app that is the sum of entries in that period recorded against the "Unaccounted money" wallet (`useUnaccountedWallet`) plus any shortfall found by a balance check dated in that period, minus anything later explained against that period (a transaction with "This explains part of my unaccounted balance" switched on, dated in that period).
- An entry belongs to the period of its **transaction date**, not the date it was entered. Explaining November money in December reduces November's figure, not December's.
- **Accountability rate** for a period = 1 minus (unaccounted for the period divided by total outflow for the period), shown as a percentage. Total outflow = expenses + transfers out of the user's wallets + savings moved out, excluding transfers between the user's own wallets.
- Weeks run Monday to Sunday, in the user's time zone (Africa/Douala by default).

**Default:** the all-time Unaccounted money wallet balance stays as it is, and still shows on that wallet's own page. Every summary that says "Unaccounted for" (Budget, Available now, Dashboard) shows **this month's** figure instead, with the month named: "Unaccounted for in November".

### 3.3 What to build

1. A selector `unaccountedByPeriod(transactions, checks, { period: 'month' | 'week', range })` returning, per period: unaccounted amount, total outflow, accountability rate, and change from the previous period. Unit tests, including entries explained in a later month and a month with no outflow (rate shown as "No spending", not 100%).
2. Budget and Available now: the Unaccounted for figure is scoped to the month in the month switcher. A new month opens at zero.
3. An "Accountability" card (on Insights, and as a compact tile on Dashboard): a bar chart of the unaccounted amount for the last six months, the accountability rate as a line or labelled figure per month, and a sentence: "You accounted for 94% of your spending in November, up from 88% in October." A Month or Week switch shows the last eight weeks instead.
4. Month review step (system map, section 2) includes the month's unaccounted figure and rate before the month is closed.
5. Make sure closing a month does not carry its unaccounted figure into the next one anywhere, including cached totals. If a stored running total exists, stop reading it for these summaries; derive from transactions.

## Package 4: Templates

### 4.1 What a template is

A saved transaction the user records often, such as daily transport, a weekly allowance, a monthly salary or a regular transfer. Any type: Expense, Income, Transfer, Savings.

**Templates already exist in the code; extend them, do not start again.** `FirestoreTransactionTemplate` (`src/shared/firestore/types.ts`), `src/screens/TransactionTemplates`, `src/logic/transactionTemplates/useLogic.ts`, `src/screens/CreateTransactionTemplate` and `src/logic/createTransactionTemplate/useLogic.ts` already handle name, type, category, description, amount (`null` means ask each time), `accountId`, `toAccountId`, `charges` and `savingsMode`. Find out why the owner does not see them from Add (most likely they are only reachable from the `/transaction-templates` route) and add these optional fields:

```
basketId: string | null, basketItemId: string | null,
repeat: 'none' | 'daily' | 'weekly' | 'monthly',   // Default 'none'
repeatDay: number | null,       // weekday 1 to 7 for weekly, day of month for monthly
remind: boolean,                // Default false
lastUsedAt: Timestamp | null, archived: boolean
```

`charges: null` on a transfer template means "use the wallet's fee schedule" (2.3).

### 4.2 Managing templates

The existing Templates screen, reachable from Money > Settings > Templates and from the Add sheet: list grouped by repeat (Daily, Weekly, Monthly, No repeat), each row showing name, type arrow, amount and wallet. Create, edit, archive. "Create template" uses the same stacked form as Add transaction plus a Repeat row and a Name field. Also offer "Save as template" on Add transaction and on a transaction's detail.

### 4.3 Using a template when adding

Every Add entry point opens the Add transaction form with a **Templates** entry at the top (the templates icon already sits on the right of the panel header; make it work, and on phone add a "Use a template" row above the type selector). It opens a picker with:

- "Create new template" as the first row,
- then the user's templates, most recently used first, with a search field once there are more than eight.

Choosing a template prefills the form (amount, wallets, category, basket, item, description, fee) and sets the date to today. The user can change anything, then records as usual. Recording updates `lastUsedAt`.

### 4.4 Repeating templates

**Default:** a repeating template never records on its own. On the days it is due, it appears in Payments > Upcoming and in a "Due today" notification (if `remind` is on), with "Record" (opens the prefilled form) and "Skip". Skipping records nothing. This keeps the ledger honest.

## Package 5: Baskets and payments

### 5.1 Stop the "must be spent" reminders once an item has been paid

**The fault.** If 5,000 is allocated to a basket item and 4,000 has been spent from it, the app keeps notifying that the money must be spent, as though the remaining 1,000 were an overdue payment. Circumstances change, so a payment can come in under or over plan.

**What to build.**
1. Change the reminder rule: an item stops generating "due" or "must be spent" notifications for the month once **any** payment has been recorded against it in that month. For Variable items, reminders only fire if nothing has been spent and the due date has passed.
2. Remove "must be spent" wording everywhere. A partly spent item shows its remainder as "Left on this item", not as overdue.
3. Clear existing queued notifications that no longer meet the rule.

### 5.2 Close an item for the month

**What to build.** On the item panel (and the item row's menu), add "Close for <month>" once the item has a payment, or at any time from the menu. Closing:

- marks the item `closedFor: { [yyyy-mm]: { closedAt, leftover } }`,
- stops all reminders for that item for that month,
- shows the item as "Closed" with what was spent against plan,
- **Default:** returns the leftover to the month's money left to plan, recorded as "under plan" so it counts in Reallocate and Insights. If the item is over plan, closing first asks the user to Cover or justify, as today.
- can be reopened from the item's menu in the same month.

This mirrors the "Close for November" action that already exists for a whole basket; reuse its logic where possible.

### 5.3 Reschedule a planned payment from the Payments page

**The fault.** Payments lists planned payments but the planned date cannot be changed there.

**What to build.**
1. Each payment row in Upcoming (and Priorities) gets "Change date": tap the date on the row, or the row's menu. It opens the app's standard date picker.
2. After choosing a date, ask the scope: "Just this month" or "This and future months". **Default** selection: "Just this month".
   - Just this month: store an override, `scheduleOverrides: { [yyyy-mm]: date }`, on the item.
   - This and future months: change the item's planned day.
3. The list re-sorts immediately, Ready to pay and Priorities recalculate coverage with the new date, and any reminder for the payment moves with it.
4. A moved payment shows "Moved from 5 Dec" in small text under its date for that month.

## Package 6: Debts

### 6.1 Debts as a list on phone, and a better phone layout

**What to build.**
1. Add a Cards or List switch to the Debts screen on phone (remember the choice per device). **Default** on phone: List.
2. List row: person or lender avatar and name, direction ("You owe" or "Owes you" as a small tag), amount remaining in the Amount style on the right, and a thin progress line underneath for repaid against original. Due date under the name; overdue in `status/error`.
3. Above the list, two summary figures on one card: "You owe" and "Owed to you", each with its count. Group the list by direction with headers.
4. Tidy the existing phone cards to the same content and spacing, so switching views does not change what is shown.

### 6.2 Forgive or cancel a debt

**What to build.**
1. On a debt's detail, add "Forgive debt" (for money owed to you) or "Cancel debt" (for money you owe that has been written off by the other party). Both open a confirm sheet: the remaining amount, an optional note, the date, and a confirm button. State plainly that this cannot be undone except by reopening.
2. Confirming records a `forgiven` (or `cancelled`) event on the debt with amount, date and note, sets the remaining amount to 0 and the status to Forgiven or Cancelled.
3. No wallet moves. It is not a payment and must not appear in Transactions as spending or income.
4. Forgiven and cancelled debts leave "You owe" and "Owed to you" totals, move to a "Settled" filter with their tag, and keep their full history.
5. "Reopen" on a forgiven debt reverses the event.

### 6.3 Remove contact suggestions when typing names

**The fault.** When typing a name in the new debt form, names from the phone's contacts pop up. The owner did not ask for this and wants it gone.

**What to build.**
1. Search the code for the Contact Picker API (`navigator.contacts`), any contacts library, and any permission request for contacts. Remove them.
2. If there is none, the suggestions are browser autofill triggered by the field. Set `autoComplete="off"` on the name field and avoid `name="name"` or other autofill-friendly names and ids on it. Check the other free-text name fields in the app (people, lenders) for the same thing.
3. **Default:** keep suggestions only from people already in Dreda (existing debts and People), shown in the app's own dropdown.
4. Remove any contacts permission from the manifest if present. Tell me what you found and removed.

## Package 7: Rewrite the task import (Time mode)

### 7.1 What is wrong today (found in the code on 23 November)

1. **Two import engines for the same job.** Settings > Data has a whole-account workbook import (`src/logic/importData/useLogic.ts` with `src/shared/firestore/dataEntities.ts` and `dataWorkbook.ts`) whose Download template (`src/screens/DownloadTemplate`) produces one tab per entity: areas, sections, accounts, categories, projects, tasks, baskets, debts. Projects has a second import (`src/logic/importData/useProjectImport.ts`, `src/shared/import/projectTasks.ts`, `src/forms/ImportProjectsForm`) that guesses between three layouts (tasks for one project, projects and tasks in one sheet, or separate Projects and Tasks sheets). The person filling in a file has to know which template, which layout and which tab. That is the "template for everything" the owner is describing.
2. **A task row cannot say where it belongs.** `TASK_FIELDS` has Project but no Area and no Folder. Areas are only created from project rows, and folders (sections, `FirestoreSection`, stored as `bucketId`) are never created by the project import at all. New projects are written with `bucketId: null`. New tasks are written with `areaId: null` and `bucketId: null` even when their project has an area, which breaks the mirroring rule documented on `FirestoreTask`.
3. **Dates go wrong in several ways.**
   - Only numeric dates are read. "5 Dec 2026", "December 5, 2026", "5 déc. 2026" and a date with a time in the same cell ("05/12/2026 14:00") are all rejected, because the patterns are anchored to the end of the cell.
   - One global day-first switch applies to every date column in the file, so a file that mixes formats cannot be read correctly.
   - The workbook is read with `cellDates: true`, so SheetJS hands back JavaScript `Date` objects built through the time zone. Those can land at 23:59 on the day before.
   - `cellText()` turns a `Date` into text with `toISOString()`, which is UTC. In Douala (UTC+1) local midnight on 5 December displays as 4 December, so the mapping preview can show a different date from the one that is imported. This is a likely source of the "date mismatches" the owner sees.
4. **Column matching is loose.** It matches synonyms by "starts with" and "ends with", and short words such as "to", "from" and "due" mean different fields on the projects side and the tasks side. A header like "Due to" or "From area" can land in the wrong field without anyone noticing.

### 7.2 What to build instead: one task list, one template

The file is **a list of tasks, one per row, on one sheet**. Every row carries where the task belongs. The import creates whatever is missing above it.

| Column | Required | Accepts |
| --- | --- | --- |
| Area | Yes, when Folder or Project is filled | Any name. Created if new |
| Folder | No | Any name. Created inside the Area if new. Blank means the area's default folder ("General", `defaultSectionId`) |
| Project | No | Any name. Created inside the Folder if new. **Default** when blank: a project with the folder's name (or "General tasks" in the default folder), created if missing |
| Task | Yes | The task title |
| Due date | No | See 7.3 |
| Start time, End time | No | 14:30, 2:30 pm, 9am, 9h30 |
| Priority | No | High, Medium, Low; also Do first, Schedule, Delegate, Eliminate |
| Status | No | To do, Doing, Stuck, In review, Done, Cancelled (French equivalents accepted) |
| Repeats | No | The phrases the current `parseRepeats` accepts (keep it) |
| Notes | No | Free text |
| Subtasks | No | Separated by semicolons or new lines |
| Tags | No | Separated by commas or semicolons |

A row with no Area, Folder or Project goes to the Inbox (`projectId: null`). A Folder or Project with no Area is a problem on that row ("Which area is this in?"), shown in the check step.

**Matching names.** Compare names after `normalizeName` (case, accents, punctuation and extra spaces ignored), and only within their parent: a folder called "Admin" under Work and one under Home are two different folders. Where a new name is close to an existing one (`similarity` of 0.85 or more, or the same once numbers are removed), do not create it silently. Show "Did you mean <existing>?" with "Use existing" and "Create new"; this decision applies to every row with that name.

### 7.3 Dates, done once and properly

1. Read the workbook with `cellDates: false` and `raw: true`. Convert Excel date serials to a plain `yyyy-mm-dd` string yourself. No `Date` object exists between the file and the final write.
2. Accept: Excel serials; ISO (`2026-12-05`, with or without a time); `05/12/2026`, `5-12-26` and `5.12.2026`; month names and abbreviations in English and French (`5 Dec 2026`, `December 5, 2026`, `5 décembre 2026`); and a date followed by a time in the same cell, which also fills Start time when that column is empty.
3. Day or month first is decided **per column, from its values**. If any value has a first number above 12, the column is day first. If any value has a second number above 12, it is month first. If the values conflict, flag them as problems. If every value is ambiguous, use the user's setting (**Default:** day first), and say so in the check step with an example: "05/12/2026 is read as 5 December 2026. Switch to month first."
4. A date with no year takes the next occurrence of that day from today.
5. Build every Firestore `Timestamp` from the date parts in the user's time zone (Africa/Douala unless set otherwise), never through `toISOString()` or a UTC `Date`. Due-only tasks keep the current all-day convention (end of day). Fix `cellText()` so it can never print a UTC date.
6. Unit tests must include a regression test: an `.xlsx` date cell for 5 December 2026, imported with the time zone set to Africa/Douala, previews and saves as 5 December.

### 7.4 The flow

1. **Upload.** Accept `.xlsx`, `.xls` and `.csv`; a sheet called "Tasks" is preferred, otherwise use the first sheet. Offer "Download the task list template" on the same screen.
2. **Columns.** Skip this step whenever the headers match the template (exact match after normalising, English or French). Otherwise show one row per column of the file, with a dropdown of the twelve fields plus "Ignore", three sample values, and exact-name matches pre-selected. Do not use prefix or suffix guessing. Remember the user's choices per header, as now.
3. **Check.** A summary first: "This will add 1 area, 2 folders, 3 projects and 24 tasks. 2 rows need a look." Then the rows grouped as a tree, Area, then Folder, then Project, then the tasks, with "New" tags on anything that will be created. Problem rows sit at the top with the problem in words and the cell editable in place, so a bad date or a missing area can be fixed without going back to the spreadsheet. The "Did you mean" choices from 7.2 show here. Duplicate tasks (same project, same normalised title, same due date, whether already in Dreda or repeated in the file) are skipped by default and can be switched on. Keep the existing time-conflict check for timed, blocked tasks.
4. **Import.** Write in batches of no more than 450 operations, in order: areas (each with `ensureDefaultSection`), folders (`areaId` set), projects (`areaId` and `bucketId` set), then tasks (`projectId`, and `areaId` and `bucketId` mirrored from the project). Create tasks through the same function in `src/shared/firestore/taskWrites.ts` that the task form uses, rather than a hand-built object, so the defaults cannot drift. Put `importId` on every document written.
5. **Done.** "Imported 24 tasks into 3 projects", with links to each project, a downloadable report of skipped and problem rows, and Undo, which keeps the current behaviour: it deletes what was created and archives areas.

### 7.5 Where the import is opened

Tasks, Projects, an area's page and a project's page, each with "Import tasks". Opened from an area or a project, that context fills Area (and Folder and Project) for rows that leave them blank, and the check step says so.

### 7.6 The template

"Task list template" downloads as `.xlsx`, with a `.csv` option. It has:

- a **Tasks** sheet with the twelve headers, dropdown validation on Priority and Status, the date column formatted as text dd/mm/yyyy, and three example rows that show a new area, an existing folder and an Inbox task;
- a **How to fill this in** sheet listing each column and what it accepts;
- a **Your lists** sheet showing the user's current areas, folders and projects, so they can copy names exactly.

### 7.7 What to remove and what to keep

- Remove the three-layout detection and the Projects-sheet route from `useProjectImport.ts`, `projectTasks.ts` and `ImportProjectsForm`. Move the parsers worth keeping (time, repeats, subtasks, importance, `normalizeName`, `similarity`) into one pure module, `src/shared/import/taskList.ts`, with tests in `test/importTaskList.test.ts`. Update or retire `test/importTasks.test.ts`.
- **Default:** take areas, sections, projects and tasks out of the Settings > Data entity template and workbook import, so tasks have one way in. Keep Full restore (`src/screens/ImportData/FullRestore.tsx`) as it is, because restoring a backup is a different job. The Money entities stay in the Settings import for now.
- Keep the import log and Undo stored under `users/{uid}/settings/import-{id}`.

## Order of work and checks

1. Package 1 (phone fixes), then check every changed screen at 320px, 375px and on web.
2. Package 2 (wallets), with unit tests for `feeFor`.
3. Package 3 (accountability), with unit tests for `unaccountedByPeriod`. Check Budget for October and November shows different Unaccounted figures.
4. Package 5 (reminders, close item, reschedule).
5. Package 4 (templates).
6. Package 6 (debts).
7. Package 7 (task import), with the date tests in 7.3 passing before any UI work. Then import a file of 30 tasks that names two new areas, three new folders and a near-duplicate project name, and check that each task's `areaId` and `bucketId` match its project's.

When you are done, report: the files changed per item, any new Firestore fields and collections, any backfill scripts, the pages that had two back buttons, what was behind the contact suggestions, and how many existing tasks have `areaId` or `bucketId` out of step with their project. Offer an idempotent script that fixes them, but do not run it.

## Defaults for the owner to confirm

These were not settled in the request. The brief goes ahead with them; change any before building if they are wrong.

1. Wallet number shows three groups (`•••• •••• 1234`) with tighter spacing.
2. Existing wallets get a colour derived from their id until edited.
3. The fee schedule applies to transfers and withdrawals by default; the user can add payments.
4. Headline "Unaccounted for" figures show the current month only; the all-time balance stays on the Unaccounted money wallet's page. Money explained later counts back to the month it happened.
5. Repeating templates never record on their own; they remind and wait for a tap.
6. Closing an item returns its leftover to the month's money left to plan.
7. Rescheduling a payment changes just this month unless the user picks "This and future months".
8. Debts on phone open in List view.
9. Name suggestions come only from people already in Dreda.
10. In the task import, a row with a Folder but no Project goes into a project with the folder's name, created if missing.
11. An ambiguous date column (every value could be either order) is read day first.
12. Task import is taken out of the Settings > Data workbook import, so tasks have one way in; Full restore stays.
