# 002 — Grow the currency popover out of its trigger chip

- **Status**: DONE (uncommitted)
- **Commit**: fe10031
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 1 file, ~15 added lines
- **Depends on**: 001 (uses `--ease-out`, `--duration-popover`)

## Problem

The currency picker on the Money dashboard appears with no motion. It is
anchored to the currency chip (top-right of the popover sits under the chip,
`right: 0; top: calc(100% + 8px)`), but nothing tells the eye it came from
there. It is rendered conditionally in two places, both using the same class:

- `app/src/screens/Home/HomeScreen.tsx:237` (mobile balance card)
- `app/src/screens/Home/HomeScreen.tsx:503` (web Balance stat card)

```css
/* app/src/screens/Home/HomeScreen.module.css:64 — current */
.currencyPopover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: 240px;
  max-width: calc(100vw - 2 * var(--space-lg));
  padding: var(--space-sm);
  border-radius: var(--radius-lg);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
  color: var(--color-text-primary);
  text-align: left;
}
```

## Target

Entrance only: scale from 0.97 + opacity 0 to rest, 150ms, strong ease-out,
origin at the top-right corner (where the chip is). Exit stays instant — the
popover is dismissed by Escape / outside click / picking a currency, and those
should feel immediate.

Use `@starting-style` (a transition, not `@keyframes`) so the entrance is
interruptible. Browsers without `@starting-style` simply show it instantly,
which is today's behaviour — acceptable fallback, no JS needed.

```css
/* target — added inside .currencyPopover */
  transform-origin: top right;
  transition:
    transform var(--duration-popover) var(--ease-out),
    opacity var(--duration-popover) var(--ease-out);

/* target — new rule directly after .currencyPopover's closing brace */
@starting-style {
  .currencyPopover {
    opacity: 0;
    transform: scale(0.97);
  }
}
```

## Repo conventions to follow

- CSS modules, plain CSS, no animation library. Motion tokens come from
  `app/src/styles/base/globals.css` (added by plan 001).
- Keep the existing comment above `.currencyPopover` as-is.

## Steps

1. In `app/src/screens/Home/HomeScreen.module.css`, inside `.currencyPopover`
   (line ~64), after `text-align: left;`, add the three declarations from the
   Target (`transform-origin`, `transition`).
2. Directly after the closing `}` of `.currencyPopover`, add the
   `@starting-style { .currencyPopover { … } }` block exactly as in Target.

## Boundaries

- Do NOT touch `HomeScreen.tsx` — no exit animation, no mount-state JS.
- Do NOT animate `.currencyRow` items or add a stagger.
- Do NOT use `scale(0)` or any start scale below 0.95.
- Do NOT change `.currencyPopover`'s positioning or sizing.
- Reduced motion is handled in plan 005; don't add it here.
- If `.currencyPopover` no longer matches the excerpt, STOP and report.

## Verification

- **Mechanical**: `cd app && npm run lint`; `npm run build` succeeds.
- **Feel check** (`npm run dev`, open the Money home at desktop width and at
  a phone width):
  - Click the currency chip: the popover grows out of the chip's corner, not
    from its own center. It should feel instant-but-soft, never slow.
  - DevTools → Animations panel at 10%: scale starts at 0.97, opacity at 0,
    and the top-right corner stays pinned under the chip.
  - Press Escape / click outside: it disappears immediately (no exit anim).
  - Rapidly open/close 5×: no flicker, no stuck half-transparent state.
  - The search input still receives focus on open (`autoFocus`).
- **Done when**: both web and mobile popovers show the 150ms scale+fade entrance
  from top-right, and closing remains instant.
