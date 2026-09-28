# 004 — Give the cashflow bars an on-screen morph curve

- **Status**: DONE (uncommitted)
- **Commit**: fe10031
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file, 1 line changed
- **Depends on**: 001 (uses `--ease-in-out`, `--duration-morph`)

## Problem

The cashflow chart's bars animate their height when the Linear/Log toggle is
flipped (the columns keep their React keys, so heights transition in place).
That is on-screen morphing, which calls for a strong ease-in-out; the built-in
`ease` is weak and front-loaded, so the bars lurch then drift.

```css
/* app/src/screens/Home/HomeScreen.module.css:559 — current */
.breakdownBarIncome,
.breakdownBarExpense {
  width: 7px;
  border-radius: 2px;
  transition: height 0.2s ease;
}
```

Why keep `height` rather than switching to `transform: scaleY()`: the bars have
a 2px border-radius on a 7px width, which `scaleY` would visibly squash, and
there are only ~14–60 small bars inside a fixed-height chart, so the layout
cost is contained. This is a deliberate exception — do not "optimise" it.

## Target

```css
.breakdownBarIncome,
.breakdownBarExpense {
  width: 7px;
  border-radius: 2px;
  transition: height var(--duration-morph) var(--ease-in-out);
}
```

## Repo conventions to follow

- Motion tokens from `app/src/styles/base/globals.css` (plan 001).
- Keep the rule's structure; change only the `transition` value.

## Steps

1. In `app/src/screens/Home/HomeScreen.module.css`, in the
   `.breakdownBarIncome, .breakdownBarExpense` rule (line ~559), replace
   `transition: height 0.2s ease;` with
   `transition: height var(--duration-morph) var(--ease-in-out);`.

## Boundaries

- Do NOT change to `transform`/`scaleY`.
- Do NOT add transitions to `.breakdownBarEmpty` or
  `.placeholderBreakdownBar`.
- Do NOT add a load-time grow-in animation — the dashboard is opened many
  times a day.
- Do NOT touch `HomeScreen.tsx`.
- Reduced motion is handled in plan 005.

## Verification

- **Mechanical**: `cd app && npm run lint`; `npm run build` succeeds.
- **Feel check** (`npm run dev`, Money home, a period with several bars):
  - Toggle Linear ↔ Log: bars glide to their new heights, starting and ending
    softly, with no lurch at the start.
  - Toggle rapidly back and forth: each bar reverses from where it is (no
    jump back to a start height).
  - DevTools Animations at 10%: duration ~250ms, symmetric S-curve.
- **Done when**: the one `transition` line matches the Target exactly.
