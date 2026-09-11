# Dreda

Dreda is a personal/household web app that combines **money management**
(wallets, transactions, transfers, budgets, goals, debts, reconciliation)
with a **PARA-style task and project manager** (Areas → Buckets → Projects →
Tasks, a calendar, a daily focus view, analytics) in one installable PWA.
It's a single Next.js App Router codebase talking directly to Firestore —
there is no separate backend server in production.

This document is the map for an engineer picking the project up cold: what
the product does, how the codebase is organized, and how data flows through
Firebase. For the fine-grained "why" behind a specific screen or field, this
repo is unusually well commented — grep the relevant `useLogic.ts` or
`types.ts` entry first; the PRD documents under `PRD Files/` go even deeper
for the four biggest subsystems.

## Contents

- [Product tour](#product-tour) — the two modes and every feature in them
- [App architecture](#app-architecture) — repo layout, layering rules, routing/navigation, data-fetching pattern
- [Firebase architecture](#firebase-architecture) — data model, security rules, the stats layer, indexes
- [Getting started](#getting-started)
- [Testing](#testing)
- [What's stubbed or not built yet](#whats-stubbed-or-not-built-yet)
- [Where to go deeper](#where-to-go-deeper)

---

## Product tour

The app has exactly two "modes," each with its own persistent header/bottom
nav and its own tab bar. Every other screen is a drill-down (detail, create,
or edit) that shows a plain back-arrow header instead — see [Navigation
modes](#navigation-modes) below for how that's enforced in code.

### Money mode

Tabs: **Home**, **Statistics**, **Budget** (`src/widgets/BottomNav`), plus a
center "+" that jumps straight to Add Transaction.

- **Home** (`/home`) — total balance (converted to the household's display
  currency), a month-progress bar, the "Unjustified" balance (see
  Reconciliation below), Savings/Spendable summary tiles, quick actions
  (Add transaction, History, Budget, Goals, Debts), a horizontally-scrolling
  row of wallet cards (tap through to Wallet Detail), and upcoming payments
  pulled from goal line-item due dates.
- **Wallets** (`/wallets`, `/wallets/[wallet]`, `.../edit`) — every account
  (bank, cash, mobile money, savings...), each with its own currency,
  starting/current balance, an optional `lockedAmount` (money set aside
  without freezing the whole wallet), and a `frozen` flag that blocks it from
  every transaction/transfer picker. One special system wallet,
  `unjustified`, backs the reconciliation feature (see below) and is filtered
  out of every normal wallet list by `useAccounts()`.
- **Transactions** (`/transactions`, `/add-transaction`,
  `/edit-transaction/[id]`, `/edit-transfer/[id]`) — the ledger. A
  transaction is Expense/Income/Savings against one wallet and one category;
  a Transfer moves money between two wallets (with an optional fee) and is a
  **separate collection** with no category of its own — it uses a fixed
  "kind" instead (`Wallet to wallet` / `Wallet to savings` / `Savings to
  wallet`). Transaction History supports search, a filter popover (type,
  wallet, category, a from/to date range) anchored to the filter button,
  sort (date/category), grouping (none/category/wallet/type) with
  collapsible sections, and long-press multi-select delete. Both
  transactions and transfers are individually editable and deletable —
  editing reverses the old contribution and reapplies the new one inside one
  Firestore transaction (see [The stats layer](#the-stats-layer)).
- **Categories** (`/categories`, `/create-category`, `.../edit`) — flat list
  per `transactionType` (Expense/Income/Savings), each with an optional
  `group` label. Never hard-deleted, only archived.
- **Budget** (`/budget`, `/add-budget-category`, `/edit-budget-category/[id]`,
  `/budget/category/[categoryId]`) — recurring "budget rules" (a category +
  a recurring amount, via the shared `@dreda/shared-recurrence` engine also
  used by Planned Payments and Debt recurring plans), one config per month
  (`budgetPlans/{yyyy-mm}`: total budget, projected income, planned savings),
  and a "this month's transactions" drill-down per category.
- **Goals** (`/goals`, `/goals/new`, `/goals/[id]`, `/goals/items`,
  `/add-goal-item`, `/edit-goal-item`) — a forward-looking savings project
  broken into line items (e.g. "Buy a car" → Down payment, Insurance).
  `Variable` goals: line items are one-off plans, manually "added to budget"
  when the household commits to one. `Fixed` goals: every line item
  auto-creates its own recurring budget rule. Completing a line item records
  a real Expense transaction. `/goals/items` is the cross-goal "everything
  left to do" list, sortable by priority/deadline/amount.
- **Debts** (`/debts`, `/debts/new`, `/debts/[id]`, `.../edit`, `.../plan`,
  `.../repay`) — a liability being paid down. `cash` debts (borrowed money
  that landed in a wallet) always write a real Expense transaction when
  repaid; `existing` debts (a mortgage, a car loan that predates the app)
  just log progress. `currentBalance`/`totalRepaid` are recalculated from the
  full repayment history on every write.
- **Reconciliation & Audit** (`/settings/reconcile`,
  `/settings/reconciliation`, `.../history`, `/settings/audit-reports`,
  `.../[reportId]`, `/settings/backfill`, `.../batches`) — "what do your
  accounts actually hold right now, versus what the ledger says," per
  `PRD-AUDIT-RECONCILIATION.md`. Any gap between reported and ledger balances
  moves through the one household-wide **Unjustified wallet** via an ordinary
  transfer, and an individual old transaction can be tagged "this explains
  part of the gap" to move it back out. Historic Backfill lets a household
  spread a recurring transaction/transfer/savings entry across past months in
  one action (tagged `isHistoricBackfill`/`backfillBatchId` so a whole batch
  can be viewed or deleted as a unit). Audit Reports are generated,
  point-in-time financial snapshots (spending breakdown, volatility,
  savings-rate trend, etc.) — immutable once created.
- **Statistics** (`/statistics`) — Habit Breakdown, Income Analysis, Income
  Consistency, and Financial Trends, all computed **live** from the last 24
  months of raw transactions/transfers rather than from the precomputed
  `statsMonthly` docs (so each section can slice by its own window without
  waiting on a write elsewhere to refresh a field). Total savings is the live
  balance sum of every Savings-type account, not a category-based figure.
- **Settings** (`/settings`) — sign out, Categories, Export/Import data
  (`/settings/export`, `/settings/import`, `/settings/download-template`),
  Reconciliation, Audit Reports, Backfill.

### Time / Projects mode

Tabs: **Home**, **Calendar**, **Focus**, **Analytics**
(`src/widgets/ProjectsBottomNav`), plus a center "+" that opens a sheet to
choose New area / New project / New task.

This is a PARA (Projects, Areas, Resources, Archive) implementation —
`PRD Files/PRD-PROJECTS.md` — adapted to: **Area → Bucket → Project → Task**.
An Area is a life domain ("Home," "Work"); every Area gets one auto-created
default Bucket so a Project never needs one explicitly; a Task belongs to a
Project (or is fully standalone) and mirrors that project's `areaId`/
`bucketId` for attribution without a join.

- **Projects hub** (`/projects`) — a horizontally-scrolling row of Area
  cards (with a cover image, sourced deterministically from a curated
  Unsplash list keyed by entity id) and a Projects carousel using one shared
  `ProjectCard` everywhere it appears. "+" buttons next to every section
  jump straight into that section's create flow.
- **Areas / Buckets / Projects** (`/areas/[area]`, `.../edit`, `/areas/new`,
  `/buckets/[bucket]`, `.../edit`, `/buckets/new`, `/projects/[project]`,
  `.../edit`, `/projects/new`) — each detail page shows its own Buckets/
  Projects/Tasks carousels (all horizontally scrollable, collapsible where it
  matters) plus a cover-image banner. A Project has a status
  (Active/Completed/Archived — no separate `archived` boolean, to avoid two
  sources of truth), a priority, a color, and start/end dates with
  reschedule tracking (`originalEndDate`/`rescheduleCount`) for the
  Analytics screen's on-time-vs-rescheduled stat.
- **Tasks** (`/tasks`, `/tasks/new`, `/tasks/[id]/edit`) — one shared
  create/edit screen. A task has a type (built-ins Meeting/Event/ToDo, or a
  household-defined custom type — one capitalized word, stored in
  `settings/taskTypes`), a priority, an optional due date/time (or a
  start–end range), a status (Pending/Stuck/In Review/Done, kept in sync
  with the `done` checkbox), and reschedule tracking mirroring Project's own.
  `/tasks?filter=` drives the drill-down list from the hub's own overview
  tiles.
- **Calendar** (`/projects/calendar`) — a month grid + day agenda over tasks
  (by `dueDate`) and projects (by `startDate`/`endDate`). No live Google
  Calendar sync (deferred — Spark plan has no Cloud Functions to run the
  bridge; see PRD-PROJECTS.md section 17).
- **Focus** (`/projects/focus`) — "what needs my attention today": every
  not-done task, filterable by priority and due date, with a quick read on
  today's completion stats. Tasks can be pinned as one of today's
  priorities (`FirestoreTask.priorityDate`).
- **Analytics** (`/projects/analytics`) — overdue/due-today counts,
  completion trends, and the on-time-vs-rescheduled stat for both tasks and
  projects.

### Cross-cutting

- **Onboarding** (`/onboarding`) — shown to a genuinely new account right
  after sign-up (see `ensureUserDoc` below); seeds nothing beyond the
  default settings/exchange-rates/Unjustified wallet already created at
  sign-up.
- **Sign in / Sign up** (`/sign-in`, `/sign-up`) — email/password + Google +
  Apple via Firebase Auth (`src/widgets/OAuthButtons`).
- **Notifications** (`/notifications`) — currently a placeholder ("coming
  soon"); the real design lives in `PRD-NOTIFICATIONS.md` but nothing in it
  is implemented (no `devices`/`notificationSettings`/`scheduledNotifications`
  collections exist yet).

---

## App architecture

### Repo layout (npm workspaces)

```
/                    root — npm workspaces, Firebase project config
├─ app/              the Next.js 16 App Router application (the product)
├─ functions/        Cloud Functions source — NOT deployed (see below)
├─ packages/
│  └─ shared-recurrence/   recurring-schedule math shared by app + functions
├─ scripts/          one-off admin scripts (seed/unseed dummy data, Notion migration)
├─ test/             firestore.rules emulator tests
├─ firestore.rules, firestore.indexes.json, firebase.json
└─ PRD Files/         the original product specs — deep detail per subsystem
```

Root `package.json` scripts: `npm run emulators`, `npm run seed` /
`unseed` (and `:goals-debt` variants), `npm run test:rules`, `npm run
test:functions`. See [Getting started](#getting-started).

### Why `functions/` exists but isn't deployed

The household runs on the Firebase **Spark** (free) plan, which doesn't
support Cloud Functions (that needs Blaze, for Cloud Build/Artifact
Registry). `functions/src/` (transactions/transfers/budgetRules triggers,
an `onCreate` auth trigger, PIN hashing) still exists, still builds, and
still passes its own emulator integration tests — but **nothing in it is
live**. Everything those triggers used to do now happens **client-side**,
inside `app/src/shared/firestore/aggregation.ts`, wrapped in
`runTransaction()` so a page reload mid-write can't leave (say) a
transaction charged but the wallet balance or stats not updated. This is a
real, named trade-off (see `firestore.rules`' own header): without a
server, Security Rules are the *only* thing stopping a buggy or malicious
client from writing a wrong number — acceptable for a single-user-per-account
app, worth revisiting if the project ever upgrades to Blaze.

Concretely, client-side now owns:
- `ensureUserDoc` (`app/src/shared/firestore/ensureUserDoc.ts`) — replaces
  the old `onCreate` Auth trigger; called after every sign-up/sign-in/OAuth
  redirect, before anything else touches Firestore (the `activeUser()` rule
  below depends on `users/{uid}` already existing).
- All wallet-balance and stats maintenance — `aggregation.ts`'s
  `create/update/deleteTransactionWithAggregation`,
  `create/update/deleteTransferWithAggregation`, and the goal/debt
  equivalents.
- The PIN feature was **retired entirely**, not just moved client-side —
  there is no PIN screen anymore (`functions/src/pin.ts` is dead code); the
  app just always re-authenticates through Firebase Auth's own session.

### Layering convention (`app/README-STRUCTURE.md`)

A module may only import from the layers below it, never sideways or
upward:

1. **app/** — Next.js routing only. Every `page.tsx` is a couple of lines
   that decode params and render a screen.
2. **screens/** — route-level composition/JSX. Screens stay presentational.
3. **widgets/** — reusable UI built from multiple screens (`AppHeader`,
   `BottomNav`/`ProjectsBottomNav`, `Modal`, `ConfirmDialog`, `ActionMenu`,
   `TaskCard`, `ProjectCard`, `BucketCard`, `EmojiPicker`, `ScreenState`,
   chart widgets, ...).
4. **logic/** — one `logic/<screen>/useLogic.ts` hook per screen, holding
   all of that screen's state, Firestore reads, and mutations. Screens never
   render JSX inside a hook; hooks never import from `screens/`.
5. **viewmodels/** — small, static, presentation-only constants a hook still
   needs (color palettes, currency lookups, fixed enums) — never live data.
6. **shared/** — reusable, app-agnostic code: Firebase client setup, the
   Firestore access layer (`refs.ts`, `hooks.ts`, `queries.ts`,
   `aggregation.ts`, `currency.ts`), generic hooks, types, utilities.
7. **styles/** — design tokens, base styles, themes (CSS Modules +
   `var(--space-md)`-style custom properties; Tailwind is present in
   devDependencies but the app itself is CSS-Modules-first).

Every screen's CSS lives in a co-located `*.module.css` file; a useful
sanity check after touching one is diffing every `styles.foo` used in the
`.tsx` against every `.foo {` defined in the `.module.css` — they should
match exactly (no orphaned classes, nothing referenced-but-missing).

### Navigation modes

`app/src/shared/config/chromeVisibility.ts` is the single source of truth
for "does this route show the persistent header/bottom nav, and which bottom
nav." It's a **whitelist**: only a mode's own hub routes
(`MONEY_HUB_ROUTES` / `PROJECTS_HUB_ROUTES`) show that mode's chrome; every
drill-down (detail, create, edit) shows none of it and uses its own
back-arrow header instead. `ModeSwitch` (a pill in `AppHeader`) and
`useSwipeModeSwitch` (a swipe gesture, active only on the two hub screens)
are the two ways to jump between Money and Time mode; both just
`router.push('/home')` / `router.push('/projects')`.

### Data-fetching pattern

There is no server API layer — every screen's `useLogic` hook talks to
Firestore directly:

- `shared/firestore/refs.ts` — every typed collection/document reference.
  Every collection is a **subcollection of `users/{uid}`**; every ref
  function takes `uid` explicitly (never "the current user" some other
  implicit way).
- `shared/firestore/hooks.ts` — generic `useFirestoreDoc<T>`/
  `useFirestoreCollection<T>`, thin wrappers over `onSnapshot` (live reads).
- `shared/firestore/queries.ts` — composed reads most screens reuse:
  `useAccounts()` (filters out the system Unjustified wallet centrally),
  `useCategories()`, `useCurrencyContext()`, `useExchangeRates()`,
  `useBuckets()`.
- `shared/firestore/aggregation.ts` — every multi-document write
  (create/update/delete a transaction, transfer, goal line item, debt
  repayment, budget rule recompute, ...), each inside one
  `runTransaction()`. Reversal-based edits (`updateTransactionWithAggregation`,
  `updateTransferWithAggregation`) reverse whatever the document *used to*
  contribute (read fresh from the doc inside the transaction, never trusted
  from the caller) and apply what the edited fields now contribute, netted
  per account/month so a no-op edit nets to exactly zero.
- `shared/firestore/currency.ts` — client-side display-currency conversion
  (multi-currency wallets, one household display currency in `settings`).

### Design system

CSS Modules throughout, driven by custom properties in
`styles/base/globals.css` (spacing/typography/radii/color tokens). Two
distinct visual languages by convention:
- **Data-display cards** (TaskCard, ProjectCard, BucketCard, Area cards,
  stat/analytics cards) — zero border-radius, a cover image header.
- **Create/edit forms** (TaskEdit, CreateArea/AreaEdit, CreateProject/
  ProjectEdit, CreateBucket/BucketEdit) — 20px-radius white cards, a
  3-column X/title/checkmark header, an emoji picker on its own row.

An anchored popover (position:relative wrapper + position:absolute panel,
closes on outside click/Escape) is the standing convention for any
contextual menu (`ActionMenu`, Home's currency picker, Transaction History's
filter popover) — never a full-screen `Modal` for something anchored to a
small trigger.

---

## Firebase architecture

### Identity

Firebase Authentication (email/password, Google, Apple) is the only
identity layer — see `PRD-AUTH-FIREBASE.md`. `app/src/shared/config/
firebaseClient.ts` is the lazy-singleton accessor for the app/auth/
firestore instances every screen goes through. Route protection is two
layers: `proxy.ts` (root-level middleware) redirects based on a plain,
non-httpOnly `dreda-signed-in` cookie — explicitly **not** a security
boundary, just a UX redirect to avoid a flash of the wrong screen — and
`AuthGuard` (wraps the whole authenticated shell) confirms against the real
Firebase Auth session before rendering anything that reads Firestore, since
the cookie can drift out of sync with real auth state (e.g. an iOS PWA
relaunch evicting one storage area but not another).

### Data model

Every collection below is a subcollection of `users/{uid}` — there is no
household/multi-user sharing; each sign-up gets an entirely private set of
data. IDs are client-generated UUIDs (`crypto.randomUUID()`) unless noted.
Full field-level detail lives in `app/src/shared/firestore/types.ts`
(heavily commented — read it directly for anything not covered here).

| Collection | Purpose | Notable fields / notes |
|---|---|---|
| `users/{uid}` | Account root doc | `archived` (revokes access via `activeUser()`); created by `ensureUserDoc`, not a trigger |
| `users/{uid}/private/{doc}` | PIN hash | Rule still exists; feature retired, unused in practice |
| `accounts/{id}` | Wallets | `currentBalance` (client-maintained), `lockedAmount`, `frozen`, `notSpendable`, `isSystemWallet`/`systemType` for the one `unjustified` wallet |
| `categories/{id}` | Budget/transaction categories | `transactionType` Expense\|Income\|Savings, `group` |
| `transactions/{id}` | The ledger | `direction` Inflow\|Outflow, `signedAmount`, `month` (yyyy-MM), `isDebtRepayment`/`linkedDebtId`, `isHistoricBackfill`/`backfillBatchId`, `isUnjustifiedAdjustment`/`pairedTransferId`, `isFrozenSavings` |
| `transfers/{id}` | Wallet-to-wallet moves | `fromAccountId`, `toAccountId`, `charges` (fee, debited from `from` only), `kind` (a `TRANSFER_CATEGORIES` string, doubles as its "category") |
| `budgetRules/{id}` | Recurring budget lines | `type` Expense\|Income\|Savings\|Transfer, recurrence fields (`frequency`/`interval`/`anchorDate`/`endCondition`), `excludedMonths`, `monthOverrides`, `sourceGoalLineItemId` |
| `plannedPayments/{id}` | Real bills with due dates | Separate from budgetRules on purpose — several bills can share one category |
| `budgetPlans/{yyyy-mm}` | Per-month budget config | `totalBudget`, `projectedIncome`, `savingsMode`/`savingsValue` |
| `goals/{id}` | Savings projects | `kind` Fixed\|Variable; `totalAmount`/`lineItemCount`/`completedLineItemCount`/`amountCompleted` denormalized from `lineItems` |
| `goals/{id}/lineItems/{id}` | Goal sub-costs | `categoryId`, `accountId`, `recurrence` (Fixed goals), `budgetRuleId`, `rank`, `priority`, `necessity`, `completed`/`expenseId` |
| `debts/{id}` | Liabilities | `debtType` cash\|existing; `currentBalance`/`totalRepaid` denormalized from `repayments` |
| `debts/{id}/repayments/{id}` | Repayment history | Never updated/deleted |
| `exchangeRates/{code}` | FX rates to base currency | Seeded per-account at sign-up |
| `stats/home` | Home screen totals | `totalBalanceBase`, `thisMonthIncome`/`thisMonthExpense` |
| `statsMonthly/{yyyy-mm}` | Per-month rollups | `totalIncome`/`totalExpense`, `perCategorySpend`/`perCategoryCount` |
| `statsBudgetProgress/{yyyy-mm}` | Per-rule progress | One field per `budgetRules` id: `{budgeted, spent, remaining, count}` |
| `auditReports/{id}` | Generated financial snapshots | Immutable once created (`allow update: if false`) |
| `reconciliations/{id}` | "What do accounts actually hold" checks | `reportedBalances`, `ledgerBalancesAtTime`, `totalGap` — history only |
| `areas/{id}` | PARA: life domains | `emoji`, `color`, `description` |
| `buckets/{id}` | PARA: sits between Area and Project | `areaId` (required), `isDefault` (the auto-created one per area) |
| `projects/{id}` | PARA: projects | `areaId`/`bucketId`, `status` Active\|Completed\|Archived, `priority`, `originalEndDate`/`rescheduleCount` |
| `tasks/{id}` | PARA: tasks | `projectId`/`areaId`/`bucketId` (area/bucket mirrored from project), `type` (custom types stored in `settings/taskTypes`), `status`, `done`, `originalDueDate`/`rescheduleCount`, `priorityDate` |
| `settings/app` | Household settings | `defaultCurrency`/`displayCurrency`, `timezone`, `householdName` |
| `settings/taskTypes` | Custom task types | `names: string[]` |

Denormalized/derived fields (`currentBalance`, goal/debt totals, every
`stats*` doc) are recalculated by the client inside the same
`runTransaction()` as the write that changed them — never trust a stale
copy without re-deriving; `aggregation.ts` is the one place that does this
correctly and is where any new derived field should be added.

### Security rules (`firestore.rules`)

Every rule requires `signedIn()` and, for everything under `users/{uid}`,
`activeUser()` — signed in **and** `users/{uid}` exists **and** isn't
archived. The file itself is extensively commented; the shape to know:

- **Archive-in-place, not delete**, for anything that's financial/task
  history: `accounts`, `categories`, `budgetRules`, `plannedPayments`,
  `goals`, `debts`, `areas`, `buckets` all have `allow delete: if false` —
  an `archived`/`status` field is the real removal mechanism.
- **Real deletes are allowed** for things that are genuinely disposable:
  `transactions`, `transfers`, `tasks`, a goal's own (incomplete)
  `lineItems`, `auditReports`, `reconciliations`.
- **Field validation on create/update** is minimal and type-only (e.g. a
  transaction's `amount is number && amount > 0`, `direction in
  ['Inflow','Outflow']`) — there is no cross-document consistency check
  (e.g. nothing stops a client from writing a wallet balance that doesn't
  match its transaction history); that's the named Spark-plan trade-off
  above.
- Every collection is scoped with `request.auth.uid == uid`, matching the
  path segment — this is the entire multi-tenancy boundary.

Validate any rule change against `test/firestore-rules.test.ts` (the
Firestore emulator + `@firebase/rules-unit-testing`) before deploying —
`npm run test:rules`.

### The stats layer

Three materialized read-optimizations, all client-maintained inside
`aggregation.ts`'s transactions:

- `stats/home` — the Home screen's total balance and this-month
  income/expense, updated on every transaction/transfer write that touches
  the current month or changes a wallet balance.
- `statsMonthly/{yyyy-mm}` — per-month totals plus `perCategorySpend`/
  `perCategoryCount` (also where a Transfer's `kind` "spends" against, so a
  Transfer-type budget rule can track "planned vs. actually moved").
- `statsBudgetProgress/{yyyy-mm}` — one entry per `budgetRules` doc,
  recomputed from the current month's `perCategorySpend` plus the rule's
  recurrence-derived budgeted amount whenever either changes.

The Statistics screen (`/statistics`) deliberately **does not** read these
— it recomputes live from raw transactions/transfers instead, so each
section can use its own arbitrary time window without depending on a
precomputed doc having been refreshed for that window.

### Indexes

`firestore.indexes.json` — composite indexes for `transactions` (by
month+date, accountId+date, categoryId+date, categoryId+month+date,
backfillBatchId+date, isHistoricBackfill+date,
isUnjustifiedAdjustment+date), `transfers` (fromAccountId+date,
toAccountId+date), and `budgetRules` (categoryId+archived). Deploy with
`firebase deploy --only firestore:indexes`.

### Shared recurrence engine

`packages/shared-recurrence` (`@dreda/shared-recurrence`, an npm workspace)
is the one implementation of "does this recurring rule apply to month X" and
"what's the effective budgeted amount for month X" (`ruleAppliesToMonth`,
`effectiveBudgetedAmount`) — used by Budget rules, Planned Payments, and
Debt recurring plans, both from the Next app and from the (undeployed)
Cloud Functions, so the two never drift.

---

## Getting started

```bash
# from the repo root
npm install                        # installs all workspaces (app, functions, packages/*)
cp app/.env.local.example app/.env.local
# fill in NEXT_PUBLIC_FIREBASE_* from your Firebase project's web app config
# (Project Settings > General > Your apps) — see PRD-AUTH-FIREBASE.md section 3
# for creating the project and enabling Auth providers.

cd app
npm run dev                        # next dev, http://localhost:3000
```

`npm run build` in `app/` runs `next build --webpack` (not plain `next
build`) — required for `@ducanh2912/next-pwa`'s service-worker generation,
see `next.config.ts`'s own comment.

One-time Firebase project setup (manual, see `PRD-AUTH-FIREBASE.md` §3 and
`PRD-FIREBASE.md`): create the project, enable the auth providers you need,
enable Firestore, then from the repo root:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

(`functions/` is intentionally **not** deployed — see [Why `functions/`
exists but isn't deployed](#why-functions-exists-but-isnt-deployed).)

Useful root-level scripts:

```bash
npm run emulators              # firebase emulators:start (auth, firestore, functions)
npm run seed                   # scripts/seed-dummy-data.ts — sample wallets/transactions/etc.
npm run unseed
npm run seed:goals-debt        # sample goals/debts
npm run unseed:goals-debt
```

## Testing

```bash
npm run test:rules       # firestore.rules against the emulator (test/firestore-rules.test.ts)
npm run test:functions    # builds functions/, runs its integration tests against the emulator
                          # (kept green even though functions/ isn't deployed — see above)
```

There is no app-level (Next.js) automated test suite today — verification
is `npx tsc --noEmit` + `npx eslint` in `app/`, plus manual/browser
verification against the dev server. If you add real UI tests, this is the
place to note how to run them.

## What's stubbed or not built yet

- **Push notifications** — `/notifications` is a placeholder screen; the
  full design (`PRD-NOTIFICATIONS.md`) has no implementation (no
  `devices`/`notificationSettings`/`scheduledNotifications` collections).
- **PIN quick-unlock** — fully retired; `functions/src/pin.ts` and the
  `users/{uid}/private/{doc}` rule are dead code kept only because
  `functions/` still needs to compile/test.
- **Google Calendar bridge** (PRD-PROJECTS.md §17) and **booking links**
  (§18) — deferred, need a server the Spark plan doesn't provide.
- **Task dependencies / sub-tasks** — `FirestoreTask.parentTaskId` and
  `dependsOnTaskId` exist as fields but aren't wired into any UI yet.
- **Kanban board view** — the PARA spec originally called for one; the
  shipped UI is hub/carousel/calendar/focus screens instead.
- **Household/multi-user sharing** — every account's data is fully private;
  there's no concept of inviting a second person into the same ledger.
- **Cloud Functions** — code exists and is tested but not deployed (Spark
  plan); revisit if the project moves to Blaze.

## Where to go deeper

`PRD Files/` at the repo root has the original, much more detailed spec for
each major subsystem — read the relevant one before making a structural
change in that area:

- `PRD-FIREBASE.md` — the Firebase-first architecture decision itself
- `PRD-AUTH-FIREBASE.md` — auth setup and route protection
- `PRD-BUDGET-TRANSACTIONS.md` — Budget screen and Transaction History
- `PRD-AUDIT-RECONCILIATION.md` — Historic Backfill and Reconciliation
- `PRD-PROJECTS.md` — the full PARA/Projects-mode design
- `PRD-NOTIFICATIONS.md` — the not-yet-built push notification design
- `prd debt n goals` — Goals and Debt features
- `PRD-BACKEND.md` — superseded (the original Google-Sheets-backed design)

Inside `app/`, `README-STRUCTURE.md` covers the layering rules, theme
system, and PWA setup in more depth than this document does.
