# MonthSpend: Navigation Scaffold Brief

## Context

MonthSpend is a Next.js (App Router) PWA, built at the project root with no `src/` directory. Existing conventions to follow:

- `app/` for routes, `shared/`, `widgets/`, `styles/` at project root
- Design tokens live in `styles/tokens/` and are exposed as CSS custom properties in `styles/base/globals.css`
- Theming goes through the existing `useColorTheme` hook, `ThemeProvider` already wraps the root layout
- Simple pages stay as a single `page.tsx` plus a co-located `page.module.css`, no extra folders unless a page genuinely has reusable, non-trivial logic
- Icons come from `lucide-react`
- `app/page.tsx` (the landing page) already exists and should not be rebuilt

## Goal

Build a click-through skeleton of the whole app so navigation can be tested end to end before any real page content exists. Every page below should be functionally empty (a heading naming the screen is enough) but every link and nav path must actually work.

## Routes to add

### 1. Sign up

`app/signup/page.tsx` + `app/signup/page.module.css`

- Standalone page, no bottom nav, this is pre-login
- Minimal mock form (email and password fields), no real validation or auth logic yet
- A "Create account" button that navigates to `/home`
- Match the landing page's visual language using the existing theme tokens

### 2. Mobile app shell

These five pages share one layout with a bottom navigation bar, so they belong in a route group:

- `app/(app)/layout.tsx`, renders `children` plus the bottom nav widget, nav fixed to the bottom of the viewport
- `app/(app)/home/page.tsx`
- `app/(app)/add-transaction/page.tsx`
- `app/(app)/statistics/page.tsx`
- `app/(app)/budget/page.tsx`
- `app/(app)/settings/page.tsx`

Each page is just `page.tsx` plus a co-located `page.module.css`, with a heading naming the screen and nothing else for now.

### 3. Bottom navigation widget

`widgets/BottomNav/BottomNav.tsx` + `widgets/BottomNav/BottomNav.module.css`

- Fixed to the bottom of the screen, mobile width only for now
- Five items with `lucide-react` icons: Home, Add Transaction (`PlusCircle`), Statistics (`BarChart3`), Budget (`Wallet`), Settings (`Settings`)
- Use `usePathname()` to detect the active route, active item styled with `var(--color-primary)`, inactive items with `var(--color-text-secondary)`
- Each item is a `next/link` to its route

### 4. Wire up the landing page

Update the existing "Start free" call to action on `app/page.tsx` so it links to `/signup`.

## Constraints

- No `src/` directory, everything stays at the project root
- Reuse the existing theme system rather than introducing new colors or spacing values
- Mobile first only, do not build a desktop or web layout yet, that is a separate task for later
- Keep every placeholder page to a single file plus its CSS module, no entities, features, or screens folders for these yet, there is no real logic to justify them
- No em dashes in any generated text, comments, or copy

## Acceptance criteria

- From the landing page, "Start free" navigates to `/signup`
- From `/signup`, "Create account" navigates to `/home`
- From `/home`, the bottom nav reaches add transaction, statistics, budget, and settings, and back to home, with the active tab visibly highlighted each time
- The bottom nav appears only on the five app shell pages, not on the landing page or `/signup`
