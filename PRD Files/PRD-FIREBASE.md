# Dreda: Firebase-first architecture (data, stats, auth)

## 1. What this replaces

This is now the master architecture document. `PRD-BACKEND.md`'s data-layer content (the
Apps Script action catalog, the Google Sheet as the primary datastore, the shared-secret
pipeline) is retired, that file is reduced to a short pointer here. `PRD-AUTH-FIREBASE.md`
stays the authority for the actual OAuth mechanics, sign-in redirect handling, and provider
setup (the auth migration itself is already decided and underway, this document does not
redo that work), but three specific things in it are corrected by this document and should be
read as updated, not as still-current:

- Its `Users` tab lived in the Google Sheet. It now lives in Firestore, `users/{uid}`,
  alongside every other collection, see section 5.
- Its session model (a Next.js `app/api/auth/session` route, `firebase-admin` verifying an ID
  token, an httpOnly session cookie, `middleware.ts` doing the real security check) is dropped.
  With Firestore as the live datastore, Google's own infrastructure verifies the Firebase Auth
  token on every single read and write, Security Rules are the real enforcement point (section
  9), not anything Next.js does. `middleware.ts` stays, but purely as a UX redirect based on the
  client SDK's own persisted auth state, the same "not a security boundary" framing
  `PRD-AUTH-FIREBASE.md` already used for the Edge-cookie-presence check, just now true for the
  whole app, not only that one check.
- PIN set/verify move from Next.js API routes to Firebase Callable Functions (`onCall`), see
  section 10. Callable Functions verify the caller's ID token automatically, run on Node so
  `bcryptjs` works unchanged, and need no cookie plumbing at all.

Everything else in `PRD-AUTH-FIREBASE.md`, Google and Apple provider setup, `signInWithRedirect`
over `signInWithPopup` because this app runs as a standalone PWA, the Apple one-time-name quirk,
still applies exactly as written.

## 2. What "Firebase-first" actually means here

Not "Firebase instead of a shared secret, same shape otherwise." The shape changes: the browser
talks to Firestore directly through the Firebase Web SDK, governed by Security Rules, the same
way it already talks to Firebase Auth directly. There is no more server standing between the app
and its data. Cloud Functions replace Apps Script, but for a narrower job than Apps Script had:
maintaining derived/aggregate data via triggers, and the two PIN operations that need a protected
field no client should read directly. Everything else, listing accounts, creating a transaction,
reading last month's spend, is a direct Firestore call from the client.

This is also what answers the stats requirement directly: a document read is one round trip
regardless of how many transactions exist behind it, a live aggregation query gets slower and
more expensive as the ledger grows. Precomputing the aggregate once, on write, and reading it
as a single small document is the whole point of section 6.

## 3. Goals

- Every screen reads Firestore directly (mostly via live `onSnapshot` listeners, so the UI
  updates the instant a linked device writes something, no polling, no refetch button needed).
- Home, Statistics, and Budget read precomputed aggregate documents, never a full scan or a sum
  over the `transactions` collection, no matter how many transactions exist.
- Every write (a new transaction, an edited budget rule) is reflected in those aggregates within
  the same request, via a Cloud Function trigger, not on the next page load, not via a manual
  "recalculate" step.
- Auth stays exactly what `PRD-AUTH-FIREBASE.md` already specced, corrected only per section 1.
- The PWA still installs cleanly and still works with no network, largely for free now, see
  section 15.

## 4. Non-goals

Unchanged from `PRD-BACKEND.md`: no multi-tenant support beyond one household, no Notion bridge,
no passkeys/WebAuthn this pass. Added: no analytics/BI pipeline, `stats` documents exist to make
the app's own screens fast, not to become a general-purpose reporting layer.

## 5. Firestore data model

`accounts/{accountId}`: `name`, `type`, `currency`, `startingBalance`, `currentBalance` (number,
maintained by the transaction/transfer trigger in section 6, replaces the old `SUMIF` formula),
`notes`, `archived`, `createdAt`, `updatedAt`. Reuse the existing seed ids (`acc_sgcb`, `acc_momo`,
etc.) as the document ids when migrating, see section 11.

`categories/{categoryId}`: `name`, `transactionType`, `group`, `notes`, `archived`.

`transactions/{clientId}`: the document id **is** the client-generated id, not a separate field,
see section 7. Fields: `date` (Timestamp), `type`, `description`, `accountId`, `categoryId`,
`amount`, `direction`, `signedAmount` and `month` (both written by the trigger, not trusted from
the client, see section 6), `createdBy` (uid), `createdAt`, `updatedAt`.

`transfers/{clientId}`: same id convention. `date`, `description`, `fromAccountId`,
`toAccountId`, `amount`, `kind`, `notes`, `createdBy`, `createdAt`.

`budgetRules/{ruleId}`: `categoryId`, `description`, `budgetedAmount`, `frequency`, `interval`,
`anchorDate`, `endCondition`, `endOccurrences`, `endDate`, `accountId` (optional), `tag`
(optional), `archived`, `createdAt`, `updatedAt`. The recurrence math itself (which months a rule
applies to) ports out of `Code.gs` into a shared TypeScript module, e.g.
`src/shared/budgetRecurrence.ts`, imported both by the client (instant "does this apply this
month" UI, no round trip) and by the Cloud Function that maintains `stats/budgetProgress`.

`settings/app` (single document): `totalBudget`, `defaultCurrency`, `displayCurrency`,
`timezone`, `householdName`. One shared toggle, matching the one-household non-goal, not a
per-user preference.

`exchangeRates/{currencyCode}`: `rateToBase`, `updatedAt`, `notes`. One document per currency,
same meaning as the old tab: units of `defaultCurrency` per 1 unit of this currency.

`users/{uid}`: `email`, `name`, `createdAt`, `lastLoginAt`, `archived`. The PIN hash is
deliberately not a field on this document, it lives at `users/{uid}/private/pin` (`pinHash`,
`updatedAt`), a location Security Rules block from all direct client access, see section 9, only
reachable through the two Callable Functions in section 10.

## 6. The stats layer (materialized, trigger-maintained)

`stats/home` (single document): `totalBalanceBase` (sum of every account's `currentBalance`,
converted to `defaultCurrency`), `thisMonthIncome`, `thisMonthExpense`, `lastUpdated`. Read by the
Home screen as one document, replacing what would otherwise be a query across every account plus
every transaction in the current month.

`stats/monthly/{yyyy-mm}`: `totalIncome`, `totalExpense`, `perCategorySpend` (map of
`categoryId` to amount), `transactionCount`, `lastUpdated`. The Statistics screen's month-over-
month trend reads a small range of these documents directly, twelve document reads for a year of
trend data, never a scan over however many thousand transactions exist by then.

`stats/budgetProgress/{yyyy-mm}`: a map of `ruleId` to `{budgeted, spent, remaining}` for that
month. Recomputed whenever either input changes: a transaction lands in, moves out of, or is
edited within that month for a category some active rule covers, or the rule itself is created,
edited, or archived.

Two triggers maintain all of this, both `onWrite` (Firestore's trigger type that fires uniformly
on create, update, and delete, exposing `change.before` and `change.after`) rather than
`onCreate`, because edits and deletes have to adjust these aggregates too, not just new records:

`onTransactionWrite` (and its `onTransferWrite` counterpart): computes the delta between
`change.before` and `change.after`, not just the new value. Three cases that must all be handled,
each is a real correctness bug if missed: a plain edit to the amount (delta is `after.amount -
before.amount`), a delete (subtract the full `before` amount, `after` does not exist), and an edit
that moves a transaction to a different category or account (subtract the full old amount from the
old category/account's stats, add the full new amount to the new one, not a net delta applied to
one bucket). Apply the account balance delta and the `stats/monthly` delta in the same operation,
using `FieldValue.increment()` for every numeric field so concurrent writes from two devices never
race each other into a wrong total (never read-then-write-a-new-total by hand).

`onBudgetRuleWrite`: when a rule's `budgetedAmount`, recurrence fields, or `archived` flag change,
recompute that rule's contribution to `stats/budgetProgress` for the current month (and any future
month already materialized, if the app pre-generates a few months ahead, optional). Past, closed
months do not need to be touched by this trigger, a rule change should not rewrite history.

## 7. Idempotency

The client generates the id (a UUID) for a new transaction or transfer and writes to
`transactions/{thatId}` (or `transfers/{thatId}`) directly, using a `set()` rather than `add()`.
A retried write with the same id lands on the same document, no separate `ClientID` field or a
scan for one is needed, this is strictly simpler than the Sheet's `findFirstEmptyRow_` plus
`ClientID` column approach and gets idempotency for free from how Firestore document ids work.

## 8. Multi-currency

Same principle as before, display-layer conversion, never mutate a stored native amount. What
changes: since the client now reads `exchangeRates` directly (a handful of small documents,
cheap to keep in a live listener), the conversion for display can happen entirely client-side, a
small hook or selector that takes the raw Firestore data plus the current `displayCurrency` and
returns converted numbers for render, no server round trip needed at all for a currency switch.
`stats` documents themselves stay stored in `defaultCurrency` internally, exactly like the old
Sheet's formulas did, and get converted for display the same way.

## 9. Security Rules

`firestore.rules` is the real access boundary now, not a shared secret. Every collection requires
`request.auth != null` and that `exists(/databases/$(database)/documents/users/$(request.auth.uid))`
with `archived != true`, this is the direct replacement for the old server-side
`auth.upsertUser`-checks-`Archived` logic, now enforced on every single request by Firestore
itself rather than by a Next.js route.

Rules also do basic shape validation (a transaction write must include `amount` as a positive
number, `direction` as one of the two allowed strings, and so on), but rules cannot run an atomic
increment across other documents or recompute an aggregate, so anything in section 6 stays a
Cloud Function's job, not a rule's. `users/{uid}/private/**` is denied to every client request
outright, `allow read, write: if false;`, the two Callable Functions in section 10 reach it only
through the Admin SDK, which bypasses rules entirely by design.

## 10. Auth adjustments (read alongside `PRD-AUTH-FIREBASE.md`)

`setPin` and `verifyPin` become Callable Functions (`functions/src/pin.ts`, `onCall`), not Next.js
routes. A Callable Function automatically receives and verifies the caller's Firebase ID token,
so there is no manual token plumbing, and it runs on Node, so `bcryptjs` works unchanged. The
client calls them with `httpsCallable(functions, 'verifyPin')({pin})`. Firebase Admin SDK inside
the function reads/writes `users/{uid}/private/pin` directly, bypassing the rule in section 9 that
blocks the client from doing the same.

`auth.upsertUser`'s old job (create or update the `users/{uid}` document after a Firebase sign-in,
refuse if `archived`) becomes an `onCreate`/`beforeSignIn` piece: an `onCreate` Auth trigger
(`functions/src/auth.ts`) creates the `users/{uid}` document the moment a Firebase account is
first created (covers both email/password sign-up and a first-time OAuth sign-in), a small client-
side call after every sign-in updates `lastLoginAt`. The `archived` check happens where it matters,
in Security Rules (section 9), which is what actually blocks a revoked person from reading or
writing anything, not a separate server check.

## 11. Migration plan

Source directly from Notion, not from the xlsx intermediate. The real Dreda databases still
live in Notion (Accounts, Categories, Transactions, Transfers, Budget Line Items, five data
sources, fetched and schema-checked directly against the live workspace on 2026-08-30), and
going straight from there is more current than round-tripping through the Sheet, which was
itself only ever a snapshot. `scripts/migrate-notion-to-firestore.ts` does this: reads all
five Notion data sources with `@notionhq/client`, resolves every relation (an Account, a
Category) to the Firestore id created earlier in the same run via an in-memory id map, and
writes `accounts`, `categories`, `transfers`, `transactions`, and `budgetRules` documents with
`firebase-admin`'s `BulkWriter`. Run it once, against the real Firebase project, with
`NOTION_API_KEY` and the `FIREBASE_ADMIN_*` credentials set, then it is done, it is not a
recurring sync. Re-running it is safe (it overwrites the same migrated documents by id, Notion's
own page id becomes the Firestore doc id for transactions/transfers/budgetRules, a slug of the
name for accounts/categories), it will not touch anything the live app creates afterward.

Read the script's own header comment before running it, it documents four real gaps in the
source data it cannot silently paper over, each handled by flagging rather than guessing:
Notion never modeled a per-account currency (every migrated account defaults to XAF, fix by
hand for any account actually held elsewhere), Notion's category taxonomy has more Transaction
Type options than the app's 3-value enum plus a pre-existing typo duplicate ("Transfers" vs
"Transfer") in the live data (anything that doesn't cleanly map gets `needsReview: true` and the
original value preserved), Notion's Transfers database has no Date property (Created time is
used instead), and Transfers has no Kind field (inferred from the two accounts' Type instead).

The harder judgment call is budget recurrence, the whole reason this project started: Notion
stored one Budget Line Item page per month per bill, exactly the flat structure `budgetRules`
exists to replace, so the script does not try to guess which line items were really the same
recurring bill repeated by hand. It migrates every one faithfully as a one-off rule pinned to
its own Due Date, then prints a consolidation report grouping line items that share a category,
name, and amount across multiple pages, the same signal a person would use to spot "this is
really a recurring rule Notion just couldn't express." Turning a reported group into one real
`Monthly` `budgetRules` doc afterward is a manual step, on purpose, the two rules already
hand-authored in `sheets/SCHEMA.md` (Subscriptions, Entertainment, both Monthly) are the shape
to match. The script also does not rely on the Cloud Function triggers from section 6 to
backfill `currentBalance` during this bulk import, a one-time backfill racing thousands of
writes through `FieldValue.increment()` is slower and riskier than computing the right total
once directly in the script, which is what its final pass does, before those triggers are even
handling ordinary live usage.

The Google Sheet was not wasted work even though it is no longer the source, `sheets/Dreda-
Ledger.xlsx` and `sheets/SCHEMA.md` stay in the repo as a second, independently-shaped
reference for the same fields, useful if Notion access is ever unavailable when this needs to
run.

Retire, do not carry forward: `sheets/Code.gs`, the Apps Script deployment, `app/api/apps-script-
sync/route.ts`, `src/shared/api/appsScriptClient.ts`, and the `APPS_SCRIPT_WEB_APP_URL` /
`APPS_SCRIPT_SHARED_SECRET` env vars.

## 12. Libraries and project layout

Client: `firebase` (already being added for auth, the same SDK covers Firestore and Callable
Functions, no separate package). Server/tooling: `firebase-admin` (the migration script, and
inside Cloud Functions), `firebase-functions` (the Cloud Functions runtime). Keep `bcryptjs` (now
used only inside the two Callable Functions) and `zod` (validate Callable Function inputs and
client-side forms).

New top-level pieces: `functions/` (a separate Node package per Firebase Functions convention,
`functions/src/transactions.ts`, `transfers.ts`, `budgetRules.ts`, `pin.ts`, `auth.ts`),
`firestore.rules`, `firestore.indexes.json` (needed once a query like "this month's transactions
for account X" exists), `firebase.json` wiring all three together plus the emulator ports.

## 13. Cost note

Cloud Functions require the Blaze (pay-as-you-go) plan, Authentication alone did not, this is a
real change from what `PRD-AUTH-FIREBASE.md` said. In practice, Blaze still has the same generous
free monthly quota underneath it (roughly 2 million function invocations and 50,000 Firestore
reads a day, as of when this was written, check Firebase's current pricing page since these
numbers move), a single household's transaction volume is very unlikely to ever cross it, "Blaze"
here means billing is enabled, not that a bill should be expected.

## 14. Screen-to-data wiring

| Screen | Reads | Writes |
|---|---|---|
| Home | `stats/home`, `accounts` (for the per-account list) | none |
| Add Transaction | `accounts`, `categories` (for the form) | `transactions/{clientId}` or `transfers/{clientId}` |
| Statistics | `stats/monthly/{yyyy-mm}` for the selected range | none |
| Budget / Active Budget | `budgetRules`, `stats/budgetProgress/{yyyy-mm}` | `budgetRules/{ruleId}` (create/edit/archive a rule) |
| Wallets / Wallet Detail | `accounts` | edits to an account's static fields (name, notes), never `currentBalance` directly |
| Transaction History | `transactions` (paginated query by `month` or date range) | edits/deletes route back through the same trigger in section 6 |
| Settings | `settings/app`, `exchangeRates`, `users/{uid}` | `settings/app.displayCurrency`, PIN via the Callable Functions in section 10 |
| Payments Calendar | same open question `PRD-BACKEND.md` flagged, audit `viewmodels/payments.ts` before deciding whether it needs its own collection or reuses `budgetRules` | n/a until decided |

## 15. PWA, revisited

Firestore's own SDK persistence (`persistentLocalCache` in the modern Firebase JS SDK) already
caches reads and queues writes made while offline, replaying them when connectivity returns, for
free, no custom service-worker caching logic needed for ledger data specifically. This replaces
the NetworkFirst/API-caching part of `PRD-BACKEND.md`'s PWA section. What still stands from that
section, unrelated to the data layer: the four missing icon files, wiring `withPWA` for the app
shell itself (so the PWA installs and the built JS/CSS are available offline), the offline
fallback for a full-page navigation the shell has never cached, and confirming `InstallDialog` is
actually triggered somewhere.

## 16. Testing

Firebase Local Emulator Suite (`firebase emulators:start`) runs Firestore, Functions, and Auth
together, point the app at it in development (`connectFirestoreEmulator`,
`connectFunctionsEmulator`, alongside the `connectAuthEmulator` `PRD-AUTH-FIREBASE.md` already
specs). Test the two `onWrite` triggers directly against the emulator: create a transaction,
confirm the account balance and the month's `stats` document both moved by the right amount; edit
it to a different category, confirm the old category's `perCategorySpend` went down and the new
one went up by the full amount, not a net delta; delete it, confirm both fully reverse. Test
`firestore.rules` with `@firebase/rules-unit-testing`, an unauthenticated read is denied, an
`archived` user's read is denied, a client attempt to read `users/{uid}/private/pin` is denied
regardless of whose uid it is.

## 17. Acceptance criteria

A transaction created on Add Transaction is visible on Home and Transaction History immediately
via the live listener, no manual refresh. Editing that transaction's category updates both the old
and new category's numbers on the Statistics screen correctly. Deleting it returns every affected
number to what it was before it existed. Budget screen's spent/remaining numbers come from
`stats/budgetProgress`, confirmed by checking they did not require a live query over
`transactions` (check the Firestore usage panel or a network trace during a Budget screen load,
it should show a handful of document reads, not a query returning many rows). An unauthenticated
client, or a client authenticated as an `archived` user, is refused by Security Rules on every
collection, verified directly against the emulator, not just through the UI. Airplane-mode
relaunch still shows the last-synced Home dashboard, this time because of Firestore's own offline
cache, not a custom caching layer.

## 18. Build order

1. Firebase project's Firestore enabled, `firestore.rules` and `firestore.indexes.json` from
   section 9, the migration script from section 11 run once against real seed data.
2. `functions/` scaffolded, the `onTransactionWrite` / `onTransferWrite` triggers and their tests,
   since these are the highest-risk correctness surface (section 6's edit/delete/category-move
   cases) and are worth getting solid before anything depends on them.
3. `onBudgetRuleWrite`, the recurrence module ported to `src/shared/budgetRecurrence.ts`.
4. Continue `PRD-AUTH-FIREBASE.md`'s own build order, with the corrections from section 1 and 10
   here (Users doc in Firestore not the Sheet, PIN via Callable Functions not a Next.js route).
5. Wire the screens per the table in section 14, retiring the Apps Script client and every static
   viewmodel file it used to stand in for.
6. PWA per section 15.
7. Full acceptance pass per section 17.
