# Project structure

A module may only import from the layers below it in this list, never sideways or upward.

1. app          Next.js routing, root layout, global providers, API route handlers.
2. screens      Route-level composition. Files under app/ stay thin and just render a
                 screen from here.
3. widgets      Reusable UI sections built from multiple screens/features (AppHeader,
                 BottomNav, Modal, OAuthButtons, ScreenState, ...).
4. logic        One `useLogic` hook per screen, holding that screen's state and effects.
                 Screens stay presentational; logic never renders JSX.
5. viewmodels   Small presentation-only constants a screen's logic still needs (color
                 palettes, currency name lookups, fixed enums) — never live data anymore,
                 see "Auth and data" below.
6. shared       Reusable, app-agnostic code: api clients, hooks, config, types, utilities.
7. styles       Single source of truth for visual design: tokens, base, layouts, themes.

(`entities`, `features`, and `processes` were scaffolded by `setupstructure.sh` for a
feature-sliced variant of this layering but never got adopted — every screen's data and
actions live in its own `logic/*/useLogic.ts` instead. Removed rather than left as empty
placeholder folders; recreate them if a screen ever genuinely needs cross-feature
coordination.)

## Theme system

- styles/tokens holds the raw color values (spacing/typography/radii/breakpoints tokens
  also live here, feeding ThemeProvider's context, but nothing currently reads them back
  out — CSS Modules use the `var(--space-md)`-style custom properties in
  styles/base/globals.css directly instead).
- shared/components/ThemeProvider wraps the color tokens, tracks light/dark `scheme`
  (persisted to localStorage), and sets `data-theme` on a wrapping `<div>` — that
  attribute is what actually drives globals.css's `[data-theme='dark']` overrides.
- There is currently no UI control that calls `toggleScheme`/`setScheme` — the app always
  renders in light mode until one gets built (e.g. a Settings row).

## PWA

- app/manifest.ts generates the manifest dynamically from the color tokens.
- next.config.ts wires up @ducanh2912/next-pwa for the service worker — `npm run build`
  (not `next build` directly) is required, see that file's comment on why.
- Icons live in public/icons/, generated from logomark_primary.png (see that folder's
  README for how to regenerate them if the logo changes).

## Auth and data

- Firebase Authentication is the identity layer (email/password, Google, Apple) — see
  `PRD-AUTH-FIREBASE.md` at the repo root for the full design, and
  shared/config/firebaseClient.ts for the lazy-singleton app/auth/firestore/functions
  accessors every screen goes through.
- Everything else (accounts, transactions, transfers, budgetRules, settings,
  exchangeRates, stats/*) lives directly in Firestore, read and written straight from the
  client through Security Rules (firestore.rules) — there is no server API in between. See
  `PRD-FIREBASE.md` at the repo root for the full design.
- shared/firestore/ is what every screen's `useLogic` actually calls: refs.ts for typed
  collection/document references, hooks.ts for the generic `useFirestoreDoc`/
  `useFirestoreCollection` live-read hooks, queries.ts for composed reads every screen
  reuses (`useAccounts`, `useCategories`, `useCurrencyContext`, ...), and currency.ts for
  client-side display-currency conversion.
- The two things a client can't do directly — setting/verifying the PIN, and materialized
  stats aggregation (stats/home, statsMonthly, statsBudgetProgress) — are Cloud Functions,
  see functions/src/. The Google Sheet ledger this app originally used
  (sheets/, PRD-BACKEND.md) is retired; sheets/ now only exists as an archived reference.

## Still manual

- Fill in .env.local from .env.local.example (Firebase config).
- Create the Firebase project, enable the Authentication providers you need (see
  `PRD-AUTH-FIREBASE.md` section 3), enable Firestore, and deploy firestore.rules /
  firestore.indexes.json / functions (see `PRD-FIREBASE.md`).
