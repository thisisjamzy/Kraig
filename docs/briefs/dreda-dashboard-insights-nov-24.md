# Claude Code brief: Money dashboard, project actions and one Insights page (24 November 2026)

Paste everything below the line into Claude Code, with the repo open at `Kraig/app`.

A copy of this brief lives in the repo at `Kraig/docs/briefs/` with the other Claude Code briefs.

What this covers: three changes requested by the owner on 24 November. (1) The Money dashboard (`/home`) gets a new layout modelled on two reference dashboards the owner shared: a strip of headline figures, a cash flow chart with income above the line and expenses below it, then a grid of six cards (budget, spending, accountability, commitments, wallets). (2) The project detail page on phone moves its row of header buttons into one menu. (3) Money Insights becomes one page: the "full breakdown" page is folded into it, the debt list becomes a debt-over-time chart, the reconciliation lists leave, and cards on the same row get the same height. Every change has a phone layout as well as web. Where the owner did not settle a detail, this brief picks a default and marks it **Default**; the defaults are repeated at the end for the owner to confirm.

---

You are working in the Dreda Next.js PWA at `Kraig/app`. Read `claude/dreda-project-handover.md` (section 3, the owner's rules) first, and `AGENTS.md` in the app (this Next.js version differs from what you know; check `node_modules/next/dist/docs/` before using a routing or rendering API).

House rules for every change:

- UK English in all copy. No em dashes anywhere: UI copy, comments, sample data, commit messages.
- Semantic tokens only. Never raw hex. Chart colours come from the existing chart and card tokens (`--color-brand-default`, `--color-card-lilac-decor`, `--color-data-*`, the wallet hues from `walletHue`/`walletSolid`).
- This is a presentation change. Use the existing view models and hooks (`src/logic/home/useLogic.ts`, `src/logic/dashboard/useMoneyDashboard.ts`, `src/viewmodels/dashboard/money.ts`, `src/shared/hooks/useAccountability.ts`). Where a figure is missing, add it to the view model as a pure, tested function, never inside a component. The one new data read is debt repayments (3.3).
- Keep the owner's Money rules: spending is a donut, never a progress bar; dashboard cards link to their detail pages; a transaction uses a real wallet or "Unaccounted money", never both.
- The app has two UI lines (`docs/UI-LINES.md`): `src/screens/*` for web and tablet, `src/phone/screens/*` under 768px, joined in `src/routes/*` by `DeviceSplit`. Shared sections live in `src/widgets/*`. Keep that split.
- Do not change the sidebar, the top bar or the bottom bar.
- Check every changed screen at 320px, 375px, 768px, 1024px and 1440px, in Light and Dark.

## Part 1: The Money dashboard (`/home`)

### 1.1 Where it is today

- Web: `src/screens/Home/HomeScreen.tsx`. Order: `BalanceCard` and `Kpis` (four tiles), `Wallets` (wallet cards in a row), `AccountabilityTile`, `CashFlow` with `Spending`, `Income` with `Budget`, `Recent` with `Bills`.
- Phone: `src/phone/screens/Home/HomeScreen.tsx`. Order: `BalanceCard`, `QuickActions`, `Wallets`, `MoneyInOut`, `AccountabilityTile`, `Spending` (bar variant), `Budget`, `Recent`.
- Sections: `src/widgets/MoneyHome/MoneyHome.tsx` and `MoneyHome.module.css`. Data: `src/logic/home/useLogic.ts` (`HomeLogic`).

### 1.2 The new layout (web and tablet, 768px and up)

Keep the page header as it is (greeting, "Here is where your money stands today.", the month pill). Then, 24px apart:

```
+------------------------------------------------------------------------+
| Row 1  Headline strip: Balance | Money in | Money out | Transfers | Saved |
+------------------------------------------------------------------------+
| Row 2  Cash flow (full width): income bars up, expense bars down       |
+------------------------+------------------------+----------------------+
| Row 3  Budget          | Spending (donut)       | Accountability       |
|        (tall, spans    +------------------------+----------------------+
|        both rows)      | Commitments            | Wallets              |
+------------------------+------------------------+----------------------+
| Row 4  Recent activity (full width)                                    |
+------------------------------------------------------------------------+
```

Row 3 is one CSS grid: three equal columns, two rows, Budget spanning both rows in the first column. All cards in a grid row stretch to the same height (`align-items: stretch`, each card `height: 100%` with its body as a flex column that grows). From 768px to 1023px, Row 3 becomes two columns: Budget and Spending on the first row, Accountability and Commitments on the second, Wallets full width on the third. Row 1 wraps to three and two cells at that width (Balance first and wider).

Remove from the web dashboard: the row of wallet cards, `AccountabilityTile`, `Income` and `Bills` as separate cards. Their content moves into the cards below; nothing is lost.

### 1.3 Row 1: the headline strip

One card with five cells divided by hairlines (`border/default`), not five floating cards. Each cell has two parts separated by a hairline:

- **Top:** a 4px by 14px colour marker and the label, with an info icon that shows a one-line tooltip; under it the figure in the Amount style (large, tabular figures) and, on the same line, the change against last month as a coloured percentage (`status/success` when good, `status/error` when bad; for Money out, up is bad).
- **Footer:** a small up or down arrow in a tinted circle, the absolute change, then "vs <last month>" in `text/muted`, for example "↑ 12,000 vs October".

The cells, in order, each linking to its detail page like today's tiles:

| Cell | Figure | Change and footer | Link |
| --- | --- | --- | --- |
| Total balance | `v.cash`, with the currency switch as a small chevron button beside the label (keep the existing popover) | Footer: "Spendable 120,000 · Savings 80,000" instead of a change, and "Safe to spend today 4,500" as a second line when `v.guide` has it | `/wallets` |
| Money in | `v.received` | `v.income.change`; footer absolute change; when income is still expected, a second footer line "of 450,000 expected" | `/transactions?type=Income` |
| Money out | `v.spending.spent` | `v.spending.change` | `/transactions?type=Expense` |
| Transfers | `v.transfers.moved` | Footer "of 50,000 planned" or "Moves between wallets" | `/transactions?type=Transfer` |
| Saved this month | `v.saved.amount` | Footer "18% of income" | `/baskets?type=Savings` |

Add the absolute month-on-month changes (`income.changeAmount`, `spending.changeAmount`, `saved.changeAmount`) to `useLogic`, computed at the same point in the month as the existing percentage changes. When there is nothing to compare with, the footer reads "Nothing to compare with October yet". The sparklines go; the change figures replace them.

The "Unaccounted for in November" line that sits in the balance card today moves to the Accountability card (1.7).

### 1.4 Row 2: Cash flow, income above the line and expenses below

Replace the paired bars in `CashFlow` with a **diverging column chart**: one column per period, income growing up from a zero line in `--color-brand-default`, expenses growing down from the same line in `--color-card-lilac-decor` (these are the colours used today, so the owner's purple cash flow rule is kept). Rounded ends on the outer edge only.

- Card header: title "Cash flow", subtitle "Money in and money out, by week" or "by month"; on the right the Week and Month switch (existing `segmented` style) and the arrow link, now pointing to `/statistics#section-cash-flow`.
- Above the chart, two figures for the range shown: "Money in +1,240,000" and "Money out -980,000", each with its legend dot, and "Net +260,000" in `status/success` or `status/error`.
- **Default** range: Week shows the last 12 weeks (Monday to Sunday, user's time zone), Month shows the last 12 months. The current period is drawn at full strength; the others at 60% until hovered, as in the reference.
- Y axis on the left with compact labels as absolute values ("50k" above and below the line, never "-50k"), light gridlines, a stronger zero line. X axis labels under the chart: "Jan" to "Dec", or "3 Nov" style for weeks.
- Tooltip on hover or tap: the period, Income, Expenses and Net, in a dark card like the reference.
- Implementation: with Recharts, feed `expense` as a negative value and put both `Bar`s on one `stackId`, with a `ReferenceLine y={0}`; or extend `DivergingColumnChart` in `src/widgets/Charts/Columns` to take two series. Change `flowFrom` and the bucketing in `useLogic` for the new ranges (add `monthBuckets` beside `weekBuckets` in `src/viewmodels/home` if needed, with tests). Same `countsInFigures` filter as today.
- Chart height 280px on web.

### 1.5 Row 3, column 1: Budget (in the place of "Content performance")

A tall card listing this month's budget lines, styled like the reference's horizontal bars:

- Header: "<Month> budget", subtitle "62% used · 7 days left", arrow link to `/budget`.
- One row per budget line (`v.budgetLines`): name on the left; on the right the amount spent, then a small chip with what is left or "Over by 4,000"; under it a full-width rounded bar, 10px high, filled to spent against planned. Fill tone: `brand` within plan, `status/warning` from 70%, `status/error` when over. Use a soft diagonal hatch on the filled part (CSS `repeating-linear-gradient` of the same token at two opacities) to echo the reference, with a solid end cap at the current position.
- Show up to eight lines sorted by share used, highest first; then "See full budget ↗" (the shared `SeeAll` widget).
- Empty: "No spending planned for November yet." with a "Plan the month" link to `/budget`.

### 1.6 Row 3, column 2 top: Spending (in the place of "Sales by platform")

- Header: "Spending", subtitle "November, against your budget", arrow link to `/statistics#section-unplanned-spending`.
- Left: the existing donut (top five categories plus "Everything else"), with the amount spent and "of 300,000" in the centre.
- Right: the legend as a list, each row a square colour key, the category name, and the amount right-aligned.
- Under both, one line with the trend sentence the card already has ("Down 12% on October, about 20,000 less so far.").
- Below 1180px the legend moves under the donut.

### 1.7 Row 3, column 3 top: Accountability (in the place of "Audience gender")

The compact version of the existing `AccountabilityCard`, built on `useAccountability`:

- Header: "Accountability", the Week and Month switch, arrow link to `/statistics#section-accountability`.
- Two figures across the top, like "Male / Female" in the reference: "Accounted for 94%" with a `status/success` key, and "Unaccounted 12,500" with a `--color-data-negative` key, both for the current period.
- Paired columns per period (last 7 weeks or last 6 months): accounted-for outflow and unaccounted amount side by side, so the share is visible at a glance; the rate under each pair in small type, coloured as in `AccountabilityCard` (90% and up good, under 75% bad).
- Footer: the existing `accountabilitySentence`, plus "Review" linking to the Unaccounted money wallet (`/wallets/${UNJUSTIFIED_WALLET_ID}`) when this month's unaccounted amount is not zero. This replaces the line that was in the balance card.

### 1.8 Row 3, column 2 bottom: Commitments (in the place of "Conversion funnel")

The owner left this open. **Default:** a funnel of this month's planned payments, which also absorbs Upcoming bills and the debt figure, so nothing that was on the old dashboard disappears.

- Header: "Commitments", subtitle "What this month's plan still needs", arrow link to `/payments`.
- Four columns stepping down, like the reference funnel, each a block of thin vertical bars in its colour with the label and figure above it:
  1. **Planned**: total planned outflow for the month (`v.spending.planned` plus planned transfers and savings), `--color-brand-default`.
  2. **Paid**: what has been paid against those lines, `status/success`.
  3. **Still to pay**: planned minus paid, `status/warning`.
  4. **Overdue**: the part of Still to pay whose due date has passed (`v.upcoming` items with `late`), `status/error`.
  Column heights are proportional to Planned; a column with zero shows a 4px stub and "None".
- Under the funnel, two short rows: "Next up: Rent, 150,000, due 1 Dec" (first of `v.upcoming`, links to it) and "Debts: 320,000 left across 3, next payment 5 Dec" (`v.debt`, links to `/debts`). Hide each row when there is nothing to show.
- Add `commitments: { planned, paid, left, overdue }` to `useLogic`, derived from the same budget items that feed `upcoming` and `committed`, with a unit test.

### 1.9 Row 3, column 3 bottom: Wallets (in the place of "Sales overview")

No wallet cards on the dashboard any more.

- Header: "Wallets", subtitle "Total 1,240,000 across 5 wallets", and a "See all wallets" button (Secondary, size Sm) linking to `/wallets`.
- One horizontal bar, 20px high, split into segments by each wallet's share of the total balance, each in its wallet colour (`walletSolid(a)`, from Package 2.1 of the 23 November brief), 4px gaps, rounded ends; a hatch on the segments as in Budget.
- Under it a grid, two columns (three from 1280px): per wallet, a colour key and the name on one line, the balance in the Amount style under it, and "28,000 committed" in `text/muted` when `committed` is above zero. Each item links to `/wallets/<id>`.
- Show the six largest wallets; when there are more, the last grid cell reads "+3 more" and links to `/wallets`. Wallets with a zero or negative balance are listed but get no bar segment. Unaccounted money is not listed here.
- No "Add wallet" tile here; adding a wallet stays on the Wallets page.

### 1.10 Row 4: Recent activity

Keep `Recent` as it is, full width, five rows. On web from 1024px, show the rows as a two-column list so the card is not a long strip.

### 1.11 Phone (under 768px)

The phone gets the same content in one column, built from the same widgets with phone variants, not a second set of components. Order, 16px apart:

1. Greeting header (unchanged, with the hide amounts button).
2. **Headline strip as a phone block:** Total balance full width (figure large, the Spendable and Savings line, Safe to spend today), then the other four cells as a 2 by 2 grid inside the same card, hairlines between them. Each cell keeps its figure, the percentage change and a one-line footer; the label may wrap to two lines, the figure never wraps (`clamp()` on its size so seven-figure amounts fit at 320px).
3. `QuickActions` (unchanged; Add stays here because the plus left the Money bottom bar).
4. **Cash flow:** the diverging chart full width, 220px high, with the Week and Month switch under the title. **Default:** the last 6 periods are visible and the chart scrolls sideways to show all 12, opening scrolled to the newest. The three figures (Money in, Money out, Net) sit above the chart in one row, wrapping to two at 320px. The tooltip opens on tap and closes on tap outside.
5. **Spending:** donut centred (180px), legend list under it.
6. **Wallets:** the share bar and a two-column grid, "See all wallets" as a full-width button at the bottom of the card.
7. **Budget:** first five lines, then "See full budget ↗".
8. **Accountability:** the two figures, then the paired columns (last 6 periods).
9. **Commitments:** the funnel with the four columns side by side (labels under the columns rather than above, figures in compact form), then the Next up and Debts rows.
10. **Recent activity.**

Remove from the phone dashboard: the wallet card carousel, `MoneyInOut` and `AccountabilityTile` (replaced by items 4 and 8). Every card on phone has 16px padding, titles one line with ellipsis, the arrow link a 44px tap target.

### 1.12 Clean up

- Delete the section components that nothing uses afterwards (`Kpis`, `Kpi`, `Spark`, `Income`, `Bills`, `MoneyInOut`, the wallet row styles) and their CSS, once no screen imports them. Check `app/dev/dashboards` first.
- Update the header comments in both Home screens and `MoneyHome.tsx` to describe the new order.

## Part 2: Project detail on phone: one menu for the actions

### 2.1 The fault

On phone, `src/phone/screens/ProjectDetail/ProjectDetailScreen.tsx` puts four `HeaderButton`s in the `TimeHeader`: Import tasks (the upload icon, which reads as Share), Archive project, Edit project and New task. With the header's own buttons that fills the toolbar.

### 2.2 What to build

1. Replace the four buttons with **one** More button (`MoreVertical`, label "Project actions") using the existing `ActionMenu` widget (`src/widgets/ActionMenu`). Menu items, each with icon and label, in this order:
   - New task (`Plus`)
   - Edit project (`Pencil`)
   - Import tasks (`Upload`)
   - Project insights (`ChartColumn`), linking to `/projects/insights/<id>` as the web menu does
   - Archive project (`Archive`), `danger`, last, after a divider; it still opens the existing confirm dialog.
2. **Default:** so New task stays one tap away, add a "New task" text button with a plus at the right of the Tasks section heading inside the page (the same `SectionHead` pattern the web uses), plus the existing "Add the first one" link in the empty state. Nothing else in the header.
3. Apply the same rule to every phone screen that puts more than two action buttons in its header. From a search today these are `phone/screens/Scope/ScopeScreen.tsx` (three) and, if they show more than two once rendered, `AllProjects` and `TasksList`. Rule: at most one primary action in the header (only where it is the page's main job) plus the More menu; everything else in the menu. List each screen you changed.
4. Web is already right (`NotionPage` `menu` prop puts settings, insights, import and archive in the top bar's "..." menu). Check it shows only New task, Add note and "..." and leave it alone.

## Part 3: One Insights page

### 3.1 Where it is today

- `/statistics` renders `InsightsPage` (`src/widgets/Dashboard/InsightsPage.tsx`): the verdict, up to three "Worth doing now" cards, "Is it getting better?", the Accountability card, then a "Want the detail?" panel with "See the full breakdown".
- `/statistics/breakdown` renders `MoneyDashboardScreen` through `DashboardPage` with the card list in `MONEY_LAYOUT` (`src/shared/dashboard/layouts.ts`) and the cards in `src/widgets/Dashboard/MoneyCards.tsx`. This is the older insights page the owner calls the "advanced" one.

### 3.2 Merge them

Make `/statistics` the only Insights page, on web and phone:

1. Order, top to bottom:
   1. Header row (sticky, as today): "Insights" on the left, the period filter on the right.
   2. Section nav, sticky under the header: Overview, Income, Trends, Cash flow, Plan and debts, Unplanned spending, Untracked money, Forecast (only sections the current period has). On phone it is a single row of chips that scrolls sideways.
   3. **Overview** section: the verdict card; the "Worth doing now" cards; the period hero and KPI tiles from `DashboardPage`; then "Is it getting better?" and Accountability side by side (6 and 6 columns). Give the Accountability card `id="section-accountability"` so the dashboard can link to it.
   4. The breakdown sections from `MONEY_LAYOUT`, with the changes in 3.3 and 3.4.
2. Remove the "Want the detail?" panel and its styles.
3. Turn `/statistics/breakdown` into a redirect to `/statistics` (keep the hash if one is given), remove it from `src/widgets/AppShell/wideRoutes.ts`, and point every link that used it at the right section of `/statistics` (`MoneyHome.tsx` today; search for others).
4. Build the merged page as one widget used by both lines (`src/screens/MoneyInsights` and `src/phone/screens/MoneyInsights`), from `InsightsPage` and the grid part of `DashboardPage`. `DashboardPage` stays for the Time dashboard; take the `breakdown` prop out once nothing passes it. `MoneyDashboardScreen` (web, phone and route) can go when the redirect is in.
5. One `useMoneyDashboard()` call feeds the whole page; do not call it twice.

### 3.3 Debts: a chart over time, not a list

Replace the `debts` card (a `StackedBarList` of each debt, paid against left) everywhere in `MONEY_LAYOUT` with a new card, `debtTrend`:

- Title "Debt over time", subtitle "What is left to repay at the end of each period".
- An area line of the total still owed at the end of each period in the range (the same buckets the `trend` card uses), in `--color-brand-default`. If any debt has `direction: 'owed'`, a second line "Owed to you" in `--color-data-positive`, and the first line is labelled "You owe". Forecast from today to the end of the range as a dashed line when payment plans exist, using the same `forecastFrom` convention as `trend`.
- Insight sentence, for example "You owe 320,000, down 80,000 since August. At your planned payments the last one is cleared in March."
- Empty: "No debts recorded." when there are none; when every debt is settled, the chart still shows their history.
- **Data.** Add a pure function `debtHistory(debts, repayments, buckets)` in `src/viewmodels/dashboard/money.ts`: for each bucket end, the sum per direction of each debt's principal (if `startDate` is on or before it) less its repayments dated on or before it, less a `settledEvent` dated on or before it, floored at zero; converted with `toDisplay`. Unit tests: a debt started mid-range, a repayment on a bucket boundary, a forgiven debt, an `owed` debt, a debt in another currency.
- Read repayments from `users/{uid}/debts/{debtId}/repayments` (`repaymentsRef`) for the debts already loaded in `useMoneyDashboard`. Use a `collectionGroup('repayments')` query scoped to the user if the rules allow it; otherwise one listener per debt, capped to non-archived debts. Add any index or rule this needs to `firestore.indexes.json` and `firestore.rules`, and say so.
- In layouts: `plan` (7) then `debtTrend` (5) in "Plan and debts"; in `all`, `box` (7) then `debtTrend` (5).
- Remove the `debts` card id from `money.ts`, `MoneyCards.tsx` and the fixtures once nothing uses it. The "Put the debts on a plan" action card in the verdict stays.

### 3.4 Remove the reconciliation lists

- Remove `recLatest` (the latest reconciliation list) and `recLog` (the reconciliation log) from every Money layout, including `day` and `week`. They stay on the Reconciliation pages (`/settings/reconciliation` and its history).
- Keep the reconciliation charts: `recEach`, `recWallet` and `recRate`. New Untracked money rows: `recEach` (8) with `recWallet` (4), then `recRate` (12). In `week`: `recEach` (12). In `day`: drop the Untracked money section.
- Remove the `recLatest` and `recLog` cards and their list components if nothing else renders them.

### 3.5 Keep as they are

The owner is happy with these; restyle only for equal heights: Income each period (`incEach`), Money in and out (`flow`), Trend (`trend`), Savings (`sav`), Where the balance went (`wf`), Where the income went (`sk`), Planned against unplanned (`plan`), Unplanned by category (`tree`) and by day (`when`), and the Forecast with its chart and table (`fc`).

### 3.6 Cards on the same row have the same height

- In `Dashboard.module.css`, change `.grid` from `align-items: start` to `align-items: stretch`.
- In `src/widgets/Charts/ChartCard` (and its CSS), make the card `height: 100%` and a flex column: header, then the chart body with `flex: 1` and `min-height: 0`, then legend and insight pinned to the bottom (`margin-top: auto`). Charts that size to their container fill the extra height; fixed-height charts sit centred in it.
- Check every layout's rows add up to 12 columns so no card sits alone beside an empty gap: after 3.3 and 3.4, list the rows of each period's layout in your report.
- The same goes for the "Worth doing now" cards and the KPI tiles: equal height within their row.

### 3.7 Phone

- One column, every card full width, 16px gaps, sections with their headings.
- The period filter stays in the sticky header row; on phone it collapses to one dropdown button that opens a sheet with both choices.
- The section nav chips sit under the header and highlight the section in view (`IntersectionObserver`).
- KPI tiles in a 2 by 2 grid. Charts at a phone height (180 to 240px) with labels thinned so none overlap at 320px; wide charts (Sankey, waterfall, forecast table, calendar heatmap) scroll sideways inside their card, never the page.
- Equal height does not apply on phone (one card per row).

## Order of work and checks

1. Part 2 (project actions), then check the phone project page and every screen changed under 2.2.3.
2. Part 3 (Insights): merge, redirect, `debtHistory` with its tests passing, layouts, equal heights. Check Month, Quarter, Year, All, Week and Day periods on web and phone.
3. Part 1 (dashboard): view model additions with tests (`changeAmount`, `monthBuckets`, `commitments`), then web, then phone.
4. Run lint, type check and tests. Then, signed in with real data, check `/home` and `/statistics` at the five widths in section rules, in Light and Dark, and confirm every arrow link and "See all" opens the right page or section.

When you are done, report: the files changed per part; the new view model fields; the Firestore query, index or rule added for repayments; the phone screens whose header buttons moved into a menu; the rows of every Money layout after the changes; and anything from the old dashboard you could not place.

## Defaults for the owner to confirm

These were not settled in the request. The brief goes ahead with them; change any before building if they are wrong.

1. The headline strip has five cells: Total balance, Money in, Money out, Transfers, Saved this month. The currency switch and "Safe to spend today" move into the balance cell.
2. Cash flow shows the last 12 weeks or the last 12 months, in today's purple (income) and lilac (expenses).
3. The "conversion funnel" slot becomes **Commitments**: Planned, Paid, Still to pay, Overdue, with the next payment and the debt total under it. It replaces the Upcoming bills card.
4. Income no longer has its own card on the dashboard: received and expected sit in the Money in cell, and the full income breakdown is on Insights.
5. Recent activity stays, as the last row.
6. The wallets card shows the six largest wallets and a "+N more" link; adding a wallet happens on the Wallets page.
7. On phone, the cash flow chart scrolls sideways through all 12 periods, opening on the newest six.
8. On the phone project page, New task moves into the menu and also sits as a text button on the Tasks heading.
9. Insights keeps the period hero and KPI tiles in its Overview section, under the verdict.
10. Debt over time shows "You owe" and, when there are any, "Owed to you" as two lines, with a dashed forecast where payment plans exist.
11. The reconciliation charts (missing and found, by wallet, untracked share) stay on Insights; only the two lists leave.
