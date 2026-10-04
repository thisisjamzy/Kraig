# Mobile restore inventory

BASELINE: `5080974` (2026-10-03) "Budget flow types: Firestore writes, queue, migration runner, insights split", confirmed by the user.
Snapshot before the restore: tag `pre-mobile-restore` (`9bc9f67`).
Rule: phone (under 768px) renders BASELINE presentation; 768px and up renders the Notion UI unchanged.
Groups: A = web presentation leaked to phone (revert on phone), B = new feature (keep, re-present in mobile style), C = fix (keep).

| Screen | Difference at HEAD on phone | Group | Action |
|---|---|---|---|
| App shell | Phone header, bottom nav, "+" | C | Already BASELINE (src/phone/widgets). Keep. |
| App shell | Bell and notifications prompt | B | Bell with badge in BASELINE header; prompt is one line, "View" and "Later". |
| Money home | Budget notices list on home | A/B | Replace with at most two compact cards: month review, ready to pay. |
| Budget | Notion database page (BudgetMonthPage), properties, views | A | Restore BASELINE Planning screen. |
| Budget | Four money types | B | Scrollable type tab row in BASELINE style. |
| Budget | Payments and Transactions as separate pages | B | Keep the routes; phone renders BASELINE Payments and History tabs. |
| Bucket and item pages | Notion page header, properties block | A | Restore BASELINE detail pages; new fields (type, paid from, need) as rows. |
| Buckets | Database cards, Notion callout, view menus | A | Restore BASELINE Buckets; type tabs and basket wording (B). |
| Priorities | Database page | A | Restore BASELINE list; coverage (B) as a row. |
| Plan and forecast | Notion page | A/B | BASELINE card and list styles, full-screen page. |
| Ready to pay | Database page | A/B | Full-screen BASELINE list, groups by type, one primary button. |
| Month review | Database page | A/B | Full-screen BASELINE list, collapsible groups, one primary button. |
| Migration report | Database page | A/B | BASELINE list page. |
| Transactions | Database page | A | BASELINE History list. |
| Transaction details | Notion page branch | A | BASELINE details; income subtype row (B) kept. |
| Finance insights | Staggered chart grid | A | BASELINE sections; type-separated figures (C) kept. |
| Debts list, detail, forms | Phone uses copies of pre-wallet-effect logic | B/C | Phone views on current debt hooks; wallet effect as a row. |
| Areas, projects, focus, calendar, insights | Stale logic copies, small Notion branches | A/C | BASELINE views on current hooks. |
| Tasks | Recurring tasks, time blocking | B | Rows in BASELINE task form. |
| Settings | Sections, Google Calendar status, import | B | BASELINE settings list rows. |
| Forms | Full-screen forms | C | BASELINE full-screen forms; back goes up, never into a form. |
| Shared widgets | ScreenHeader, ListQuery, Toast additions | A | Scope additions to 768px and up. |
| Design tokens | No change since BASELINE | C | None. |
| Guard | None | C | Dev warning when a web-only component renders on a phone; lint boundary for src/phone. |
