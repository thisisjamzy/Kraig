# Style migration (phone first)

The app moves to the Dreda style guide in `Remix/` (`Dreda Remix.free`, the
Lunacy board, and `Style Guide/Style Guide Starter.html`). Phone first, then
tablet and web.

## Rules

- Only what the style guide defines. No status colours (no success, warning
  or danger palette) and no dark theme: the guide has neither.
- The one red is the guide's Delete red `#C62828`, for destructive actions.
  A problem (overdue, over plan) uses the guide's own badge and accent
  styles, not a status colour.
- The accent lime `#D3FC72` is a fill with dark text on it, never text on
  white.
- Tokens live in `app/src/styles/tokens/styleGuide.ts` and, for CSS, in the
  phone block of `app/src/styles/base/globals.css` (under 768px). Change
  both together; `test/styleGuide.test.ts` checks they match.

## The guide

| | |
|---|---|
| Primary | `#553199` main actions, links |
| Primary dark | `#342066` hover, pressed, headers, dark surfaces |
| Accent | `#D3FC72` highlights, badges, charts |
| Primary light | `#E6EEF8` tints, selected states |
| Neutrals | `#FFFFFF` 0, `#F9FAFB` 50, `#F3F4F6` 100, `#E5E7EB` 200, `#D1D5DB` 300, `#9CA3AF` 400, `#6B7280` 500, `#4B5563` 600, `#374151` 700, `#1F2937` 800, `#111827` 900 |
| Roles | surface 0, muted surface 50, border 200, text 900, muted text 600, text on primary 0 |
| Headings | Bricolage Grotesque: display 48/56, h1 36/44, h2 28/36 bold, h3 22/30 semibold |
| Body | Figtree: 18/28, 16/24, 14/20, caption 12/16 medium |
| Amounts | IBM Plex Mono |
| Corners | 5, 10, 20, pill |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64 |
| Buttons | 36, 48, 56 high; primary, outlined, text, accent, disabled |
| Icons | 24 px grid, 2 px stroke, round caps (Lucide) in tiles: default, primary, on primary, accent, disabled |

Components on the board: buttons, pill badges, search field, list rows
(icon tile, title and subtitle, mono amount, selected tint, checkbox,
toggle), dropdowns and multi-select, action menu, figure cards with a
change pill and trend line, budget bars, 32 charts, calendars, logo
lockups, brand patterns, hero banner, empty-state illustrations. Logos at
full size are in `Remix/Logos`.

## Phases

1. **Tokens and fonts, phone only.** Done: `styleGuide.ts`, the fonts in
   `app/app/layout.tsx`, and the phone block in `globals.css` pointing the
   existing variables (`--color-*`, `--font-*`, `--radius-*`, `--ink-*`,
   `--money-*`) at guide values. The phone stays light.
2. **Brand assets.** Done: `app/public/brand/` holds the lockups made from
   `Remix/Logos` (full logo for light surfaces as supplied; a reversed one
   for dark surfaces, white square with a purple "d" and a white wordmark,
   as the guide's "reversed on primary/dark"; the square mark and its
   reversed form). `Logo` and the splash show them on the phone; web keeps
   the old files. The app icons are rebuilt from the purple square. The
   artwork's purple is `#4D2561`, used as supplied (the guide's primary is
   `#553199`). The receipt PDF and the web sidebar move with the web.
3. **Shared phone parts.** Done:
   - The phone's shared palette (`Planning.module.css` `--p-*`, used by
     Budget, Baskets, Priorities and the screens they open) points at guide
     colours; cards have a neutral-200 border instead of a shadow, the large
     corner (20); outlined buttons are the guide's small secondary button.
   - `Minimal.module.css`: the month card is primary dark into primary, the
     Baskets card neutral 900 into primary dark; a problem on a card is the
     accent; list amounts in IBM Plex Mono; icon tiles with 10 corners; the
     primary button 48 high with 10 corners.
   - Bottom navigation: the active tab is the guide's accent tile (lime,
     dark icon) on the primary-dark pill; the "+" stays primary.
   - Forms (`FormFrame`, `CardForm`): the 48-high button with 10 corners on
     the phone, the guide's colours, errors and Delete in the guide's red.
   - Task rows: priorities in guide colours (very important red, important
     primary dark, normal primary, low grey; the High badge is the lime
     accent pill).
   - Every `[data-theme='dark']` rule in `src/phone` CSS removed (the phone
     is light only); shared widgets reset dark tokens on the phone.
   - `test/styleGuide.test.ts` keeps these files to guide colours.
4. **Screens.** Done for colour and shape:
   - Home: the balance card is primary dark into primary (no light
     corner), income bars lime, wallet cards in the guide's light fills
     (primary light, lime, neutral 100); kept to a phone-only block because
     the web dashboard reuses Home's classes.
   - Every other phone stylesheet: old colours mapped to guide colours by
     role (blues to primary, navy fills to primary dark and navy text to
     neutral 900, reds to the guide red, ambers to lime as fills and primary
     dark as text, greens to primary, greys to the nearest neutral).
   - Charts and status colours set in phone components use `styleGuide`.
   - Sign-in, sign-up, onboarding and splash buttons: the medium button on
     the phone.
   - Shared widgets the phone shows (project cards, task rows, the
     notification bell and prompt, the More sheet): phone-only overrides.
     The receipt stays a black-and-grey printed slip.
   - `test/styleGuide.test.ts` holds every phone stylesheet to guide colours.
   Still per screen: type sizes and spacing against the board.

   Original plan for this phase: Home; Budget (Budget, Payments, History);
   Baskets and basket detail; Priorities; Add transaction and the other
   forms; Wallets; Transactions; Debt; Insights and Plan and forecast; Time
   (Today, Projects, Calendar, Focus); Settings and Notifications. Each:
   hard-coded colours and its own palette (`--p-*`, `--fi-*`, `--pl-*`,
   `--i-*`) replaced by tokens, checked at phone width, `phone:approve`.
5. **Charts and empty states.** The chart palette and the illustrations.
6. **Lock it in.** A test against hard-coded colours in `src/phone` CSS,
   the per-screen palettes removed, `UI-PLATFORM-RULES.md` updated.
7. **Tablet and web.** The `globals.css` phone block becomes the default,
   then the Notion-style parts are restyled.

Each phase is its own PR ("Layouts touched: phone" until phase 7).
