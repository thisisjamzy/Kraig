# 003 — Add press feedback to the Money dashboard's buttons

- **Status**: DONE (uncommitted)
- **Commit**: fe10031
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 2 files, ~20 added lines
- **Depends on**: 001 (uses `--ease-out`, `--duration-press`)

## Problem

None of the dashboard's pressable controls respond to being pressed, so they
feel dead compared to the bottom-nav FAB, which already scales on `:active`.
These classes have no `:active` rule and no transition:

- `app/src/screens/Home/HomeScreen.web.module.css:348` `.textButton` ("See wallets" pill)
- `app/src/screens/Home/HomeScreen.web.module.css:684` `.highlightButton` (dark pill in the lime/blue/red highlight cards)
- `app/src/screens/Home/HomeScreen.web.module.css:130` `.statCurrencyChip` (currency chip on the web Balance card)
- `app/src/screens/Home/HomeScreen.web.module.css:145` `.statEyeToggle` (hide-balances eye button)
- `app/src/screens/Home/HomeScreen.module.css:266` `.viewAllButton` (round blue arrow buttons, used on mobile and web)
- `app/src/screens/Home/HomeScreen.module.css:45` `.currencyChip` (mobile balance card currency chip)

Example of current shape (none of them have motion):

```css
/* app/src/screens/Home/HomeScreen.module.css:266 — current */
.viewAllButton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--money-blue);
  color: #ffffff;
  text-decoration: none;
  flex-shrink: 0;
}
```

## Target

Each of the six classes gets:

```css
  transition: transform var(--duration-press) var(--ease-out);
```

added inside its existing rule, plus a new `:active` rule:

```css
.<className>:active {
  transform: scale(0.97);
}
```

No hover transform (hover growth on a dashboard is decoration, and on touch it
sticks after a tap).

## Repo conventions to follow

- Exemplar of the pattern already in the repo:
  `app/src/widgets/BottomNav/BottomNav.module.css:79-88`
  (`.fabButton { transition: transform 0.15s ease; }` and
  `.fabButton:active { transform: scale(0.96); }`). Follow its shape, but use
  the token values above, and do NOT copy its `:hover` scale.

## Steps

1. `app/src/screens/Home/HomeScreen.web.module.css`:
   - In `.statCurrencyChip` (line ~130), add the `transition` line after
     `cursor: pointer;`. After its closing `}`, add
     `.statCurrencyChip:active { transform: scale(0.97); }` (formatted on
     three lines like the rest of the file).
   - Same for `.statEyeToggle` (line ~145).
   - Same for `.textButton` (line ~348).
   - Same for `.highlightButton` (line ~684).
2. `app/src/screens/Home/HomeScreen.module.css`:
   - Same for `.currencyChip` (line ~45).
   - Same for `.viewAllButton` (line ~266).

## Boundaries

- Only these six classes. Do NOT add press feedback to table rows, wallet rows
  (`.planRow`), the tab pills (`.periodTab`, `.statsTab`) or the stat cards.
- Do NOT add `:hover` transforms.
- Do NOT touch `BottomNav.module.css`.
- Reduced motion is handled in plan 005.
- If any class no longer exists at roughly the cited line, STOP and report.

## Verification

- **Mechanical**: `cd app && npm run lint`; `npm run build` succeeds.
- **Feel check** (`npm run dev`, Money home, desktop and phone width):
  - Press and hold each of the six controls: it visibly but subtly shrinks
    (3%); releasing springs it back quickly.
  - A quick click still navigates / toggles normally — no delay.
  - On a touch device or DevTools touch emulation, after tapping, nothing
    stays shrunk or enlarged.
  - DevTools Animations at 10%: transition is ~160ms with a fast start.
- **Done when**: all six classes have the transition and the `:active`
  `scale(0.97)` rule, and nothing else changed.
