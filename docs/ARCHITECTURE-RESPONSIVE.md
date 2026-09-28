# Responsive layout layer (iPad, laptop, desktop)

Dreda was built phone first: one column inside `--app-max-width` (480px). That rule now
applies to **compact screens only (under 768px)**. From 768px up, the app has its own
shell and page layouts, added on top of the phone app without changing it.

This reverses the "no desktop split-screen" decision in `PRD Files/PRD-PROJECTS.md`
section 4 for screens 768px and wider. Phones are unchanged.

## Device classes

| Class | Width | Typical device | Shell |
|---|---|---|---|
| compact | < 768 | phones | AppHeader, bottom navs, floating "+" (unchanged) |
| medium | 768–1023 | iPad portrait, split view | drawer as a rail (80px) |
| expanded | 1024–1439 | iPad landscape, laptops | full drawer (256px) |
| large | ≥ 1440 | desktops | full drawer, extra panels |

- Tokens: `src/styles/tokens/breakpoints.ts` (`deviceBreakpoints`). CSS can't read JS
  tokens, so every wide-screen media query uses the same numbers: 768, 1024, 1440.
- Hook: `useLayout()` (`src/shared/hooks/useLayout.ts`) returns the class, `isWide`,
  `finePointer` and `canHover`. Its server snapshot is `compact`, so SSR and the first
  paint are the phone app everywhere. A phone never matches the wider queries, so
  nothing rendered only for medium and up can reach a phone. `useViewportMode()` and
  `useIsWeb()` now derive from it. The old web shell switched at 640px; 640–767px windows
  now get the phone app like any other compact width.
- Touch vs mouse: hover styles only under `(hover: hover) and (pointer: fine)`. Touch
  targets stay 44px on every class. Keyboard shortcuts are only bound with a fine pointer.

## Rules

1. **Below 768px nothing changes.** New layout code goes in one of these places:
   - `@media (min-width: 768px)` blocks, or 1024/1440;
   - `*.wide.module.css` files, applied only on wide screens;
   - attributes only wide screens set, such as `data-shell`;
   - components only wide screens render, loaded with `next/dynamic` so phones never
     download them.
2. **Same logic, different arrangement.** Every screen keeps its `useLogic` hook. Wide
   layouts rearrange presentation only. The one new screen, Today, reads the Calendar's
   hook.
3. **Same cards.** Wide layouts reuse the phone's cards (TaskCheckRow, DailyProgressCard,
   bucket cards, chart cards). Cards sit in `GridCard` containers (`container-type:
   inline-size`) so they can adapt to their own width.
4. **Phone markup stays byte-identical.** When a wide layout needs wrappers, they are
   `div`s on wide screens and `Fragment`s on phones. Where a screen needs a different
   order, each card is built once and rendered in either order (see Insights).

## App shell (`src/widgets/AppShell`)

- `app/(mobile)/layout.tsx` picks the shell by `useLayout().isWide`.
- `SideNav` has three looks: full, rail, and overlay (when hidden, or at medium).
  - The state is remembered per device class (`drawerState.ts`, localStorage).
  - "[" toggles it.
  - Contents: logo, the Time / Money switch, the mode's primary action, the mode's pages
    (`src/shared/config/wideNav.ts`), sync status, Settings, profile.
- `TopBar` is sticky inside the content column. It holds the menu button, the page
  title, a slot for page controls, search ("/"), and notifications.
  - Pages put controls in the slot with `<TopBarControls>` (`TopBarSlot.tsx`).
  - `useHasTopBar()` tells a screen it's inside the shell.
- The content area is padded 24px on medium and 32px from expanded up, and capped at
  1600px.
- Pages without a wide layout yet render their phone layout in a centred 640px column
  (`wideRoutes.ts` lists the ones that have one).
- `PanelHost` opens the task form as a right side panel from the URL (`?task=<id>` or
  `?task=new`, `src/shared/navigation/taskPanel.ts`).
  - On a phone, the same link goes to the full page.
  - Task links (`TaskCheckRow`) and "new task" actions use `useTaskPanel()`, so phones
    get exactly the addresses they always did.

## Page templates (`src/widgets/Layout`)

| Template | Component | Used by |
|---|---|---|
| A. Dashboard grid | `PageGrid` + `GridCard` (S 3 · M 4 · L 6 · XL 8 · Full 12) | Time insights, Plans forecast, Money insights (CSS grid by section) |
| B. Split planner | `SplitView` (fixed / flex / fr panels, each scrolls) | Today |
| C. List and detail | `ListDetail` + `useUrlSelection` | (available; Priorities, Buckets and Planning use sticky side columns) |
| D. Board | CSS grid | Focus (2×2 on medium, four columns from expanded) |
| E. Form | `WebFormPanel` / `SidePanel` | task form (480px panel) |

## Screens

| Screen | Medium | Expanded / Large |
|---|---|---|
| Today (`/projects`) | month, stats, next up · Tasks/Timeline switch | month, stats, next up · timeline · tasks; large adds a week strip |
| Focus | 2×2 Eisenhower matrix | four columns |
| Calendar | Day / Week / Month | plus a left column with the mini month and filters |
| Projects | 2-column card grid | 3 / 4 columns |
| Project | summary beside tasks | same |
| Time insights | dashboard grid | same |
| Money insights | full-width sections | sections half width, attention and key charts full |
| Buckets | bucket cards two across | plan cards in a sticky left column |
| Priorities | one column | controls in a sticky left column |
| Planning | Budget and Payments split | History as a sortable table |
| Plans forecast | dashboard grid | same |
