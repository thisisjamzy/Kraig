# Mobile restore inventory

BASELINE: `5080974` (2026-10-03) "Budget flow types: Firestore writes, queue, migration runner, insights split", confirmed by the user.
Snapshot before the restore: tag `pre-mobile-restore` (`9bc9f67`). Work on branch `fix/restore-mobile-ui`.
Rule: phone (under 768px) renders BASELINE presentation from `src/phone`; 768px and up renders the Notion UI from `src/screens`, unchanged. `src/routes` picks one with `DeviceSplit`.
Groups: A = web presentation leaked to phone (revert on phone), B = new feature (keep, re-present in mobile style), C = fix (keep).

| Screen | Difference at HEAD on phone | Group | Action | Status |
|---|---|---|---|---|
| App shell | Phone header, bottom nav, "+" | C | Already BASELINE (src/phone/widgets). | Kept |
| App shell | Bell, app-open prompt | B | Unread badge on the bell; prompt is one line with View and Later. | Done |
| Money home | Budget notices list on home | A/B | At most two compact cards: month review, ready to pay. | Done |
| Budget | Notion database page | A | BASELINE Budget, Payments, History tabs. | Done |
| Budget | Four money types | B | Type tabs in BASELINE style (from `e1e670c`). | Done |
| Budget | Notices, Ready to pay card | A/B | BASELINE cards; Ready to pay as a one-line banner. | Done |
| Payments, Transactions | Separate Notion pages | A | Phone routes show the Budget Payments tab and the History list. | Done |
| Bucket and item pages | Notion page branch | A | BASELINE detail pages only; history links to Budget > History. | Done |
| Buckets | Database cards | A | BASELINE money plan card and bucket cards, type tabs. | Done |
| Priorities | Database page | A | BASELINE list; coverage line (B) in "Can I cover it?". | Done |
| Ready to pay | Database page | A/B | Full-screen list, groups by type, one Confirm button. | Done |
| Month review | Tables | A/B | Full-screen list, collapsible groups, Confirm month at the bottom. | Done |
| Migration report | Notion page | A/B | BASELINE list by kind of change, Got it at the bottom. | Done |
| Transaction details | Notion page branch | A | BASELINE details plus the income type row. | Done |
| Finance insights | Masonry chart grid | A | BASELINE sections with Needs attention; type-separated figures (C). | Done |
| Notifications | Notion inbox | A/B | Full-screen list by day; Inbox, Unread, Archived. | Done |
| Notification settings | Notion page | A/B | BASELINE list, on/off per type, push and email. | Done |
| Resources | Notion page | A | BASELINE Coming soon screen. | Done |
| Debts list | Stale logic copy | C | Shared debts list logic. | Done |
| Debt forms | Phone hooks over shared writes | B/C | Kept; wallet effect is in the phone edit form. | Kept |
| Time screens | BASELINE views, BASELINE hooks | C | Web moved to new hooks; the phone keeps the BASELINE ones. | Kept |
| Tasks | Recurring tasks, time blocking | B | Already rows in the BASELINE task form. | Kept |
| Shared widgets | Zero-radius forms, popover sheet on all phones | A | Square forms and 6px popovers from 768px only; sheet under 360px. | Done |
| Design tokens | No change since BASELINE | C | None. | Kept |
| Guard | None | C | `useWebOnly` dev warning; lint boundary for src/phone. | Done |

## Open

- Plan and forecast: the phone keeps the BASELINE forecast (shared forecast model, unchanged since BASELINE). The new planning board (draft, move between months, split, apply) has no phone presentation yet; it needs a mobile design.
- Basket wording: not implemented anywhere (web or phone); the UI says "bucket".
- Screenshots at 375, 430, 1024 and 1440px were not captured (no browser connection in this session).
