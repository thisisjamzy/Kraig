# 001 — Add shared motion tokens to globals.css

- **Status**: DONE (uncommitted)
- **Commit**: fe10031
- **Severity**: LOW (prerequisite for 002–005)
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file, ~15 added lines

## Problem

The app has no easing or duration tokens. Every transition is hand-typed with
the built-in `ease`, which is too weak for deliberate UI motion, e.g.:

```css
/* app/src/widgets/BottomNav/BottomNav.module.css:79 — current */
transition: transform 0.15s ease;
```

```css
/* app/src/screens/Home/HomeScreen.module.css:563 — current */
transition: height 0.2s ease;
```

Plans 002–005 need shared curves and durations so the Money dashboard's motion
is consistent and future screens can reuse it.

## Target

These exact tokens added to the existing `:root` block in
`app/src/styles/base/globals.css`:

```css
  /* Motion — strong custom curves; the built-in `ease`/`ease-out` are too
     weak for deliberate UI motion. UI animations stay under 300ms. */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --duration-press: 160ms;
  --duration-popover: 150ms;
  --duration-morph: 250ms;
```

## Repo conventions to follow

- Design tokens are CSS custom properties in the single `:root` block at
  `app/src/styles/base/globals.css:4`, grouped by kind with a short comment
  above each group (see the `--space-*` and `--radius-*` groups).
- Token names are kebab-case with a kind prefix (`--space-md`, `--radius-lg`).

## Steps

1. Open `app/src/styles/base/globals.css`. Find the end of the first `:root`
   block, which currently ends with:
   ```css
     --money-tint-yellow: #fffff0;
     --money-ink: #14142b;
   }
   ```
2. Insert a blank line and then the Target block above immediately before
   that closing `}` (after `--money-ink: #14142b;`).

## Boundaries

- Do NOT change any existing transition anywhere — consumers are updated by
  plans 002–005.
- Do NOT add tokens to `app/src/styles/tokens/*.ts`; motion lives in CSS only.
- Do NOT add dependencies.
- If the `:root` block no longer ends with `--money-ink`, STOP and report.

## Verification

- **Mechanical**: `cd app && npm run lint` passes; `npm run build` succeeds.
- **Feel check**: none — no visual change. In DevTools, inspect `<html>` →
  Computed and confirm `--ease-out` resolves to `cubic-bezier(0.23, 1, 0.32, 1)`.
- **Done when**: all five tokens exist in the first `:root` block with the
  exact values above.
