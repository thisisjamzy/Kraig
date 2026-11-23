# Claude Code brief: a time on every transaction (23 November 2026)

Paste everything below the line into Claude Code, with the repo open at `Kraig/app`. Keep a copy in `Kraig/docs/briefs/` with the other briefs.

What this covers: transactions get a time as well as a date, set with a new time picker that matches the custom date picker. If the user does not set a time, the time the transaction was recorded is used. Existing transactions take their time from when they were recorded.

---

You are working in the Dreda Next.js PWA at `Kraig/app`. Read `claude/dreda-project-handover.md` (section 3, the owner's rules) first.

House rules:

- UK English in all copy. No em dashes anywhere: UI copy, comments, sample data, commit messages.
- Semantic tokens only. Never raw hex.
- Logic stays in the existing layers (`src/viewmodels`, `src/logic`, `src/shared/firestore`). No time arithmetic in screen components.
- Every new Firestore field is optional with a safe default, so existing records work without a migration. The backfill in section 5 is an optional, idempotent script.
- Dates and times are handled in the user's time zone (Africa/Douala unless the user has set another). Never build a stored value through `toISOString()` or a UTC `Date`.
- Before changing anything, find and list the files involved: the transaction type in `src/shared/firestore/types.ts`, every place a transaction is created or updated (Add transaction, Edit transaction, templates, transfers, reconcile and balance checks, import, Full restore), the custom date picker component, and every place a transaction's date is shown or sorted.

## 1. The rule

1. A transaction has a date and a time.
2. If the user sets a time, that time is used.
3. If the user does not set a time, the clock time **at the moment they press Save** is used, on the date they chose. Recording today with no time set gives today at the save time. Backdating to 3 November with no time set gives 3 November at the save time.
4. Existing transactions with no time use the clock time of their `createdAt`, in the user's time zone, on their existing transaction date. Their date never changes. (Using the whole `createdAt` would move backdated transactions to the day they were typed in, so only its clock time is taken.)
5. A transaction with no time and no `createdAt` uses 12:00 on its date. Report how many such records exist.

## 2. Data

Add to the transaction type, both optional:

```
occurredAt?: Timestamp            // the date and time the transaction happened
timeSource?: 'user' | 'recorded'  // 'user' when picked, 'recorded' when taken from the save time
```

- Keep the existing date field exactly as it is. All day grouping, month and week ranges, budgets, accountability and Firestore range queries keep using it. `occurredAt` always falls on the same local day as the date field.
- One pure selector, `transactionInstant(tx, timeZone)`, in the view model layer, returns `occurredAt` if present, otherwise the fallback from rule 4 or 5. Every screen reads the time through it. Unit tests: a user time; a recorded time; a backdated record whose `createdAt` is days later (date must not move); `createdAt` at 00:30 Douala time that is 23:30 UTC the day before (time must read 00:30, date unchanged); no `createdAt`.
- One write helper, `withTransactionTime(date, time | null, now, timeZone)`, returns `{ date, occurredAt, timeSource }`. Every create and update path uses it, so they cannot drift.
- Editing: changing only the date keeps the stored clock time and moves `occurredAt` to the new date. Changing the time sets `timeSource: 'user'`. Editing other fields leaves both untouched. Clearing the time in Edit sets it back to the original recorded time (`createdAt` clock time) with `timeSource: 'recorded'`.

## 3. The time picker

Build `TimePicker` in `shared/ui` as the app's only time input, made to look and behave like the existing custom date picker. Find that component first and reuse its parts rather than copying styles:

- **Same trigger field.** Stacked style, label "Time" above the field, the same height, radius, border, icon slot, focus ring and error state as the date field. When no time is set the field reads "Now" in `text/muted`, with a small "Uses the time you save" helper under it. When a time is set it shows `14:30` with a clear button that returns it to "Now".
- **Same container.** Bottom sheet on phone, popover on web, the same header, padding, elevation and footer buttons (Cancel, Done) as the date picker.
- **Quick picks** in the same chip style as the date picker's Today, Yesterday, 2 days ago: Now, 08:00, 12:00, 18:00, 21:00.
- **Hour and minute selection**, 24-hour, one-minute steps: two scrolling wheel columns with snap on phone; on web the same columns, scrollable with mouse or trackpad, plus a text input that accepts `14:30`, `1430`, `2:30 pm`, `9h30`.
- **Keyboard and accessibility:** arrow keys move hour and minute, Enter confirms, Escape closes; columns are `listbox` roles with labels; tap targets at least 44px.
- In Add transaction and Edit transaction, place Time directly after Date, on the same row on web (Date wider) and stacked on phone.
- Do not swap the Time mode pickers (`timepicker-ui`, `CardForm/TimeWheel`, `WindowPicker`) in this change. List where they are used so they can move to `TimePicker` later.

## 4. Where the time shows

- **Transactions table:** the date column shows `5 Dec 2026` with `14:30` under it in `text/muted` on phone, and `5 Dec 2026, 14:30` on web. Default sort is newest `transactionInstant` first, so transactions on the same day are in time order. Sorting by date uses the instant.
- **Transaction rows on Dashboard, wallet detail and elsewhere:** show the time beside the date in the secondary line.
- **Transaction detail and side peek:** "Date" row reads `Friday 5 December 2026, 14:30`.
- **Running balances and statements** on wallet pages use the instant for order within a day.
- **Templates:** using a template sets the date to today and the time to "Now".
- **Export and import:** exports gain a Time column (`HH:mm`, local time). The Money import accepts an optional Time column; rows without one follow rule 3 using the import time. Full restore keeps `occurredAt` and `timeSource` as stored.
- No visual difference between a picked time and a recorded one. `timeSource` is kept for later use.

## 5. Existing records

The selector in section 2 already gives every old transaction its recorded time, so nothing has to run. Also write an idempotent script, `scripts/backfillTransactionTime.ts`, that sets `occurredAt` and `timeSource: 'recorded'` on transactions that have no `occurredAt`, in batches of 450, with a dry run that prints the count and five samples (id, date, `createdAt`, resulting time). Do not run it; give me the dry run output.

## 6. Checks

1. Unit tests for `transactionInstant` and `withTransactionTime` pass, including the Douala midnight case.
2. Add an expense with no time: it shows the save time. Add one backdated to yesterday with no time: yesterday's date, today's save time. Add one with 07:15 picked: 07:15.
3. Edit an old transaction's date: the time stays.
4. Two transactions on the same day sort by time in the table and on the wallet page.
5. Budget, accountability and month totals are unchanged for October and November.
6. Compare the date picker and the time picker side by side at 320px, 375px and on web; field, sheet and popover must match.

When done, report: the files changed, the new fields, the count of transactions with no `createdAt`, where the Time mode pickers are used, and the backfill dry run output.

## Defaults for the owner to confirm

1. A backdated transaction with no time set uses the save time on the chosen date, not the date it was typed in. Old records do the same with `createdAt`.
2. Records with no `createdAt` get 12:00.
3. Times are to the minute, 24-hour.
4. Picked and recorded times look the same.
5. Time mode keeps its own pickers for now.
