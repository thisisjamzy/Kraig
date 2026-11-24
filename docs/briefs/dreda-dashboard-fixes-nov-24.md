# Claude Code brief: Money dashboard corrections (24 November 2026, afternoon)

Paste everything below the line into Claude Code, with the repo open at `Kraig/app`.

A copy of this brief lives in the repo at `Kraig/docs/briefs/` with the other Claude Code briefs.

What this covers: the owner reviewed the dashboard built from `dreda-dashboard-insights-nov-24.md` (commit `ef5716c`) and asked for these corrections: bring back the purple balance card on phone, drop "Safe to spend" everywhere, replace Transfers with Unaccounted for, shorten the change lines, line up the hairline under every figure, fix the cash flow chart (expense bars, colours, and the scale on phone), and stack the "Worth doing now" cards on Insights into one column on phone. Where the owner did not settle a detail, this brief picks a default and marks it **Default**; the defaults are repeated at the end.

---

You are working in the Dreda Next.js PWA at `Kraig/app`. Read `claude/dreda-project-handover.md` (section 3) and `AGENTS.md` first. The code to change is in `src/widgets/MoneyHome/MoneyHome.tsx` and `MoneyHome.module.css`, `src/screens/Home/HomeScreen.tsx`, `src/phone/screens/Home/HomeScreen.tsx` and `src/logic/home/useLogic.ts`.

House rules: UK English, no em dashes anywhere (copy, comments, commit messages), semantic tokens only, no calculations in components. Check every change at 320px, 375px, 768px, 1024px with the drawer open and closed, 1280px and 1440px, in Light and Dark.

## 1. Phone: bring back the purple balance card

The owner prefers the balance card the phone had before `ef5716c` to the new headline block.

1. Restore `BalanceCard` on phone from commit `641a5fa` (`src/widgets/MoneyHome/MoneyHome.tsx` and the `.balance*`, `.currency`, `.unaccounted` styles in `MoneyHome.module.css` at that commit): the purple card with its decoration, "Total balance", the currency switch, the large amount with the currency, and the Spendable and Savings figures.
2. **Remove "Safe to spend today"** from it.
3. Remove the "Unaccounted for in November" line from the card too (owner, 24 Nov), because Unaccounted for now has its own card (section 3). The card shows only Total balance, the currency switch, Spendable and Savings.
4. Under the balance card, **four separate cards in a 2 by 2 grid** (12px gap): Money in, Money out, Unaccounted for, Saved this month. Each card is its own surface with the full content of its figure: the marker and label, the figure, the percentage change against last month, the hairline, and the footer ("Up 1,240,000" or "Down 1,240,000", from section 4). Unaccounted for shows whether it is up or down on last month like the others. Apply the hairline rule from section 5 across each row of two cards, so the lines in Money in and Money out sit level, and the lines in Unaccounted for and Saved sit level.
5. Phone order: greeting header, balance card, the four cards, quick actions, then the rest as now.
6. The web keeps the strip of five cells (Total balance plus the same four figures); the purple card is the phone's version of the Total balance cell.

## 2. Remove "Safe to spend" everywhere on the dashboard

Web and phone. Remove the `hSafe` link from the Total balance cell, the `safe` variable and the `.hSafe` styles. Do not remove `v.guide` from the logic if Budget or another screen uses it; only stop showing the figure on the dashboard. The Total balance cell then has one footer line: "Spendable 120,000 · Savings 80,000".

## 3. Unaccounted for replaces Transfers

The four figures are now **Money in, Money out, Unaccounted for, Saved this month**. On web the strip is Total balance plus these four.

**Unaccounted for** cell:
- Marker colour `--color-data-negative`. Label "Unaccounted for", tip "Money that left your wallets this month without an explanation."
- Figure: this month's unaccounted amount (`v.unexplained`, from `useAccountability`, already in `useLogic`).
- Change percentage beside the figure: change in the unaccounted amount against last month; **up is bad** (red), down is good (green).
- Footer: the change line from section 4 (for example "Down 4,500"), from `rows[current].change.unaccounted` in the accountability view model. Add `unexplainedChange` to `useLogic` if it is not exposed.
- The cell links to the Unaccounted money wallet (`/wallets/${UNJUSTIFIED_WALLET_ID}`).
- When the amount is zero, the figure reads 0 and the footer "All accounted for" in `status/success` text.

Transfers leaves the dashboard; it stays on Transactions.

## 4. Shorter change lines

The footer under each figure currently reads "↑ 1,240,000 vs October". Drop the month: the period is understood.

- New footer: the arrow in its tinted circle, then **"Up 1,240,000"** or **"Down 1,240,000"**. Tone as now (green when good, red when bad; for Money out and Unaccounted for, down is good).
- With nothing to compare: "Nothing to compare yet".
- Remove the `last` parameter from `ChangeFoot` and every "vs <month>" string on the dashboard.
- Saved this month keeps "18% of income" as its footer.
- Money in keeps "of 450,000 expected" as a second footer line only when income is still expected.

## 5. The hairline sits at the same height across every cell

Today each cell is a flex column with the footer pushed down by `margin-top: auto`, and the footer's top border is the hairline. When the figures wrap differently (tablet, drawer open) the cells' top parts have different heights and the hairlines step up and down.

Make the hairline one straight line across the row:

1. Make `.headline` a grid with two row tracks per row of cells (top part, footer), and each cell `display: grid; grid-row: span 2; grid-template-rows: subgrid;`. The top parts of all cells in a row then share one height and every footer starts on the same line, however many lines a footer has. Do the same for the 2 by 2 grid on phone.
2. The hairline is the footer's top border, so it now runs at one height across the row. Footers align to the top of their track; a cell with a one-line footer and a cell with two lines both start on the line.
3. `subgrid` is supported in current Safari, Chrome and Firefox; no fallback needed beyond the current layout.

## 6. Tablet and drawer open: two lines, decided by the space the strip has

The strip breaks on viewport width (`@media (max-width: 1023px)`), so at 1024px to 1279px with the drawer open the five cells are squeezed and "vs October" wraps badly.

1. Make `.headline` a size container (`container-type: inline-size; container-name: headline`) and switch layouts with `@container headline (...)`, not viewport media queries.
2. When the strip is narrower than about 960px, put the figure and its percentage on **two lines**: the figure on the first, the percentage under it. The footer change line ("Down 1,240,000") stays on one line; if a value is too long for its cell, the figure shrinks with `clamp()` rather than wrapping.
3. Below about 720px of strip width, keep the current tablet arrangement (Total balance and Money in on the first row, three cells on the second), with the hairline rule from section 5 applying within each row.
4. Check with the drawer open and closed at 1024px, 1180px and 1280px: no label, figure or footer wraps mid-number, and all hairlines in a row are level.

## 7. Cash flow chart

### 7.1 Expense bars: flat edge on the zero line

The expense bars are drawn with their rounded corners against the zero line and the flat edge at the bottom, so they look as if they grow up from the bottom. Recharts draws a negative bar as an inverted rectangle, so `radius={[0, 0, 6, 6]}` lands on the zero line.

- Fix it so each expense bar has its **flat edge on the zero line and its rounded corners at the bottom tip**. Either give the negative series the radius that renders correctly (`[6, 6, 0, 0]` on a negative bar) or draw both series with one small custom `shape` that rounds the end away from zero whatever the sign. Check it visually; do not rely on the radius order alone.
- Income bars keep their flat edge on the zero line and rounded corners at the top.
- Do the same for any other diverging bar on the dashboard and on Insights (`DivergingColumnChart` in `src/widgets/Charts/Columns`, used by "Is it getting better?" and the reconciliation chart). Same rule: flat on zero, rounded at the tip.

### 7.2 Strong, bright colours

The owner wants both series in strong, prominent colours. The lilac expense colour is too pale.

- **Default:** income `--color-brand-default` (purple 600, Dark purple 400); expenses the rose label solid (`color/label/rose/solid`, or the matching `--color-data-*` token if one already maps to it). If a token for the rose solid is not exposed to the app CSS, add `--color-flow-out` to the token files and map it to rose solid in Light and Dark, rather than writing a hex value.
- Change the `IN` and `OUT` constants in `MoneyHome.tsx`; the legend dots, the figures above the chart and the tooltip follow.
- Drop the 60% fade on periods that are not hovered. Every bar is drawn at full strength; while one period is hovered or tapped, the others dim to 70%.
- Check contrast: each bar colour against the card surface at 3:1 or better in Light and Dark.

### 7.3 Phone: the scale is always visible

On phone the Y axis is hidden (`hide={phone}`), so there is no sense of size.

1. Always show the Y axis on phone, with three to five compact tick labels as absolute values ("200k" above and below the line, never "-200k") and light gridlines.
2. The chart still scrolls sideways through the 12 periods, so **pin the axis**: render the Y axis in a narrow column outside the scrolling area (a second small Recharts chart with only the `YAxis`, or HTML labels placed from the same ticks), and keep the gridlines inside the scrolling chart lined up with it.
3. Fix the Y domain from all 12 periods (the largest income and the largest expense), so the scale does not change while scrolling, and pass the same domain and ticks to both parts.
4. Apply the same rule to the other bar charts on the phone dashboard (Accountability, Commitments): a visible scale or values printed on the bars, never bars with no reference.

## 8. Insights: "Worth doing now" cards stack on phone

**The fault.** On Insights (`/statistics`), the "Worth doing now" cards (for example Reconcile, Give a basket a repeat, Put the debts on a plan) sit in `.cards` in `src/widgets/Dashboard/InsightsPage.module.css`, which is fixed at `repeat(3, minmax(0, 1fr))` with no phone rule. On phone the three cards squeeze into three narrow columns and their text breaks badly.

**What to build.**
1. Below 768px (use a container query on the section if the page already uses them, otherwise `@media (max-width: 767.98px)`), `.cards` becomes **one column**: `grid-template-columns: minmax(0, 1fr)`, each card full width, one under the other, 12px apart. This overrides the `data-count` variants too, and drops the `max-width: 520px` of the single-card case.
2. Between 768px and the width where three cards fit comfortably (about 900px of section width, check with the drawer open), use two columns, with a third card spanning both.
3. Inside each card on phone: title and text wrap normally (`overflow-wrap: normal`, `min-width: 0` on flex children, no fixed heights or `nowrap`), the action button sits under the text at full width or left-aligned, never squeezed beside it.
4. Check the same for the KPI tiles on Insights: on phone they are a 2 by 2 grid, never three or more columns.

## 9. Tidy up

- Update the header comments in both Home screens and in `MoneyHome.tsx` to the new order and the four figures.
- Remove `Transfers` cell code and the `hSafe` and "vs" leftovers once unused.

## Checks

1. Phone at 320px and 375px: purple balance card with Total balance, Spendable and Savings, and no Safe to spend; four separate cards two by two under it, each with its change on last month; hairlines level in each row; cash flow axis visible while scrolling, scale steady.
2. Web at 1440px: one row of five cells, every figure and footer on one line, hairline straight across.
3. 1024px and 1180px with the drawer open: figure and percentage on two lines, hairline straight across, nothing broken mid-number.
4. Cash flow: expense bars flat on the zero line with rounded tips at the bottom; both colours strong in Light and Dark.
5. Insights at 320px and 375px: the "Worth doing now" cards are one column, full width, text fully readable; at 1024px with the drawer open they do not squeeze.
6. Lint, type check and tests pass.

Report the files changed, the token you used for the expense colour, and anything that did not fit.

## Defaults for the owner to confirm

1. Expenses are drawn in rose, income stays brand purple, both at full strength.
2. When nothing is unaccounted, the cell reads 0 with "All accounted for".
3. On phone the cash flow keeps scrolling through 12 periods, with the scale pinned on the left.
