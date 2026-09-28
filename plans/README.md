# Animation plans

Written by the `improve-animations` skill from an audit of the Money home
dashboard (`app/src/screens/Home/`) at commit `fe10031`. Each plan is
self-contained and can be run by any agent.

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Add shared motion tokens](001-motion-tokens.md) | LOW | DONE |
| 002 | [Currency popover entrance](002-currency-popover-entrance.md) | MEDIUM | DONE |
| 003 | [Dashboard press feedback](003-dashboard-press-feedback.md) | MEDIUM | DONE |
| 004 | [Cashflow bar easing](004-cashflow-bar-easing.md) | MEDIUM | DONE |
| 005 | [Reduced motion on the dashboard](005-dashboard-reduced-motion.md) | MEDIUM | DONE |

## Execution order

001 → 002 → 003 → 004 → 005

- 001 is a prerequisite for everything else (tokens).
- 002, 003 and 004 are independent of each other once 001 is in.
- 005 must run last; it reduces the motion that 002–004 add.

## Not planned (optional follow-ups from the audit)

- Color transition (150ms `ease`) on the `.periodTab` / `.statsTab` active pill.
- 200ms blur-masked crossfade on the Statistics donut when switching
  Expense ↔ Income (needs a feel check in the browser).
- Fade on the cashflow chart when switching Week ↔ Month.
- Outside this dashboard: `WebFormPanel` keyframe entrance with bare `ease`;
  `BottomNav` FAB `:hover` scale not gated to `(hover: hover)`.
