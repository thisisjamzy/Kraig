# 005 — Respect prefers-reduced-motion on the Money dashboard

- **Status**: DONE (uncommitted)
- **Commit**: fe10031
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 2 files, ~30 added lines
- **Depends on**: 002, 003, 004 (reduces the motion they add)

## Problem

No file in the app handles `prefers-reduced-motion` (a grep for it across
`app/src` and `app/app` returns nothing). After plans 002–004, the Money
dashboard has three kinds of movement: the currency popover scaling in, button
press scaling, and cashflow bars morphing height. Users who ask the OS for
reduced motion should keep comprehension-aiding feedback (fades) but lose
movement (scale, size changes).

Reduced motion means fewer and gentler animations, not zero.

## Target

Append to the end of `app/src/screens/Home/HomeScreen.module.css`:

```css
/* Reduced motion — keep the popover's fade, drop scale and size changes. */
@media (prefers-reduced-motion: reduce) {
  .currencyPopover {
    transition: opacity var(--duration-popover) var(--ease-out);
  }

  .breakdownBarIncome,
  .breakdownBarExpense {
    transition: none;
  }

  .currencyChip,
  .viewAllButton {
    transition: none;
  }

  .currencyChip:active,
  .viewAllButton:active {
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  @starting-style {
    .currencyPopover {
      opacity: 0;
      transform: none;
    }
  }
}
```

Append to the end of `app/src/screens/Home/HomeScreen.web.module.css`:

```css
/* Reduced motion — no press scaling. */
@media (prefers-reduced-motion: reduce) {
  .statCurrencyChip,
  .statEyeToggle,
  .textButton,
  .highlightButton {
    transition: none;
  }

  .statCurrencyChip:active,
  .statEyeToggle:active,
  .textButton:active,
  .highlightButton:active {
    transform: none;
  }
}
```

## Repo conventions to follow

- Neither Home CSS module has an `@media` block yet; put the new ones at the
  very end of each file so they override the base rules by source order.
- Use tokens from plan 001; do not hard-code durations.

## Steps

1. Confirm plans 002, 003 and 004 are applied: `.currencyPopover` has a
   `@starting-style` block, the six button classes have `:active` rules, and
   the bars use `var(--ease-in-out)`. If not, STOP and report.
2. Append the first Target block to the end of `HomeScreen.module.css`.
3. Append the second Target block to the end of `HomeScreen.web.module.css`.

## Boundaries

- Do NOT add a global `* { animation: none !important }` reset.
- Do NOT touch other screens or widgets (BottomNav, WebFormPanel, etc.).
- Do NOT change any rule outside the appended media queries.

## Verification

- **Mechanical**: `cd app && npm run lint`; `npm run build` succeeds.
- **Feel check** (`npm run dev`; DevTools → Rendering → "Emulate CSS media
  feature prefers-reduced-motion: reduce"):
  - Open the currency popover: it fades in over ~150ms with no scale.
  - Press any of the six buttons: no shrink.
  - Toggle Linear ↔ Log: bars snap to new heights instantly.
  - Turn emulation off: plans 002–004 behaviour returns unchanged.
- **Done when**: all three behaviours differ as described under emulation,
  and are unchanged without it.
