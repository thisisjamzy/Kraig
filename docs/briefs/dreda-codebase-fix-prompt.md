# Claude Code prompt: pull the redesigned screens into the app

Paste everything below the line into Claude Code, with the repo open at `Kraig/app`.

What this fixes, and why it is worth reading first: most of these screens were already designed, or are now. The app does not render the designs. Several faults are one line of CSS or one reused component, not missing design work.

---

You are working in the Dreda Next.js app at `Kraig/app`. The design file is `Design-System/Dreda.figcraft`; the written specs are in `claude/dreda-handoff.md`, `claude/dreda-time-module.md` and `claude/dreda-forecast-design.md`. Tokens live in `Design-System/tokens.css` and `tokens.tailwind.css`.

House rules that apply to every change below:

- UK English in all copy. No em dashes anywhere, including comments and sample data.
- Use semantic tokens only (`color/bg/*`, `color/text/*`, `color/money/*`, `color/data/*`). Never raw hex.
- Do not add business logic, Firebase config or API routes. These are presentation changes. Keep the existing view models and hooks (`spendSplit`, `useUnaccountedWallet`, `planning.ts`, `viewmodels/plans/*`).
- A transaction uses either a real wallet or the "Unaccounted money" wallet, never both.
- Forms use the stacked style: label above the control.
- Work through the tasks in order and run the app after each one.

## Task 1: Edit transaction renders as unstyled text

**Files**: `src/screens/EditTransaction/EditTransactionScreen.tsx`, `src/screens/EditTransaction/EditTransactionScreen.module.css`, `src/widgets/FormFrame/FormFrame.tsx`, `src/widgets/FormFrame/FormFrame.module.css`

**The fault.** In `FormFrame.module.css` the `.input` class is:

```
.input { width: 100%; min-width: 0; padding: 0; border: none; background: none; ... font-size: 20px; }
```

With no border, no background and no padding, every field on web renders as bare 20px text. The screen reads as a list of labels and values, not a form. On top of that the screen renders as a centred sheet on a grey scrim, and the delete control sits in `.dangerCard`, a bordered red box below the save button and outside the panel.

**The target.** Figcraft frame `Transactions / Web / Edit transaction`, panel `Form panel / Edit transaction`. It is deliberately identical in structure to the existing `Transactions / Web / Add transaction` panel, which is already designed and which the app should also be using. Build one panel component and use it for both.

**What to build.**

1. On web, render the form as a right-hand panel over a scrim, not a centred sheet: fixed to the right edge, full height, white, its own scroll, with the page visible behind it. The phone layout stays a full screen and keeps its sticky submit bar.
2. Panel header: close (X) on the left, title centred, templates icon on the right.
3. Type selector directly under the header: Expense, Income, Transfer, Savings, each with its direction arrow, as the existing `Type selector` component. Keep all four on Edit even though the app only supports changing between Expense, Income and Savings. Where Transfer is not reachable, disable that segment and explain why on hover. Do not render a three-segment control on Edit and a four-segment control on Add; the control must not change shape between the two screens.
4. Amount hero card: the caption "How much?", the amount in the mono Amount style at 44px, a currency chip, and a helper line reading "<wallet> has <available> XAF available".
5. Below it, grouped `Form row`s. Each row is an icon tile, a small label, the value, and a chevron; tapping it opens the matching picker. Groups are separated by 16px of space, with a hairline between rows inside a group:
   - Details: Description, From wallet, Category, Budget item
   - When: Date, Time
   - More: Fees, and the "This explains part of my unaccounted balance" toggle row
   Basket comes before basket item wherever both appear.
6. Impact callout above the footer: a sunken card, 3px brand bar down the left edge, the overline "IMPACT", then the sentence the screen already computes. Keep the existing wording logic.
7. Footer, pinned to the bottom of the panel: "Delete" as an outlined button on the left, "Save changes" as the primary button filling the rest. Delete opens the existing confirm dialog. Remove `.dangerCard` and the inline confirm block entirely. A destructive action belongs in the footer with a confirm, not in a red box bolted under the form.
8. Field chrome: give `.input` a real control. 52px high, `bg/sunken`, 1px `border/subtle`, 14px radius, 16px horizontal padding, body text. Keep the 20px size for the amount only. Check every other screen that uses `FormFrame` after this change, because they all inherit it.

## Task 2: Wallet detail has tabs that do not belong

**Files**: `src/screens/WalletDetail/WalletDetailScreen.tsx`, `src/screens/WalletDetail/WalletDetailScreen.module.css`

**The fault.** The screen drives three views, Overview, Transactions and Audit, with `TypeTabs` from `src/widgets/Database/TypeTabs`. `TypeTabs` is the transactions list type filter, the control that reads All, Expenses, Income, Transfers, Savings. It is a filter doing a navigation job, which is why the row looks bolted on. The Transactions tab also duplicates content, because a Transactions section already renders further down the same page.

**The target.** Figcraft frame `Wallet detail / Web`, which no longer has a tabs row.

**What to build.**

1. Delete the `tabsRow` element and the `TypeTabs` usage, and delete the `tab` state and the `Tab` type. Everything that was behind Overview now renders unconditionally.
2. Page order: title row, the four figure tiles, the untracked alert, Balance over time, the two usage cards, upcoming payments or its all-clear state, then the Transactions section, then a new Balance checks card.
3. Move "Check the balance" out of the old tabs row and into the title row actions, beside "Count this wallet".
4. Add the Balance checks card at the end of the page, which is what replaces the Audit tab. White card, 16px radius, 1px `border/subtle`, 24px padding. Head: "Balance checks" with an "Open the audit" link on the right. Then one line of help text, then a row per check: date in a 70px column, the result sentence filling the middle, and a status word on the right. A matched check sits on `status/success/bg` with the status in `status/success/fg`; an explained or short check sits on `status/warning/bg` with the status in `status/warning/fg`. Close with the line explaining what counting a wallet does.
5. `WalletAuditScreen` stops being embedded here. It keeps its own route, reached from the "Open the audit" link and from "Show those months" in the untracked alert.

## Task 3: The item side peek breaks its own text

**Files**: `src/widgets/Database/PropertiesBlock.tsx`, `src/widgets/Database/PropertiesGrid.module.css`, `src/widgets/Database/SidePeek.tsx`

**The fault.** `PropertiesBlock` chooses its column count from a global device class:

```
const columns = layout === 'list' ? 1 : deviceClass === 'large' ? 4 : deviceClass === 'expanded' ? 3 : 2;
```

The side peek is about 560px wide, but on a large screen the block still renders four columns inside it, so each tile is roughly 130px and values break mid-word. "November 2026" becomes "Novembe" and "r 2026"; "AIMS Equivalence" breaks across three lines. The tiles also use `border-radius: 0`, which is why they do not look like anything else in the product.

**The target.** Figcraft frame `Basket / Web / Item panel`, panel `Side peek / Item`. Properties are stacked rows, not tiles.

**What to build.**

1. Column count must come from the container, not the viewport. Either pass an explicit `columns` prop from each caller, or wrap the block in a container query. A side peek always gets one column.
2. In one-column mode render a property as a row, not a tile: an 18px icon, the label in `text/tertiary` in a fixed 110px column, then the value filling the remaining width, with a hairline between rows and no border or fill on the row itself.
3. Never break a value mid-word. Set `overflow-wrap: normal` and let long values wrap at spaces or truncate with a tooltip.
4. Where tiles are still right, on a full-width page, give them the system radius rather than 0.
5. The peek above the properties keeps its order: type chip, item name, "spent of planned" in the mono Amount style, the status callout with its actions, then the primary actions, then the properties, then payments this month.

## Task 4: The calendar event page shows a clipped watermark

**Files**: `src/screens/CalendarEventDetail/CalendarEventDetailScreen.tsx`, `src/widgets/CardForm/CardForm.tsx`, `src/widgets/CardForm/CardForm.module.css`

**The fault.** The screen wraps itself in `CardFormPage`, which renders `<h1 className={styles.watermark}>{title}</h1>` at 60px as, in its own comment, a "big faint watermark title". In the event panel that heading is clipped at the top of the scroll area, so the page opens with a half-cut grey word "Meeting". The screen is also read-only content rendered in a form layout, so every value sits under a form label, guests appear as raw email addresses with no avatars, and Join is a full-width purple bar the width of the page.

**The target.** Figcraft frame `Calendar / Web / Event open`, panel `Side peek / Event`.

**What to build.**

1. Stop using `CardFormPage` for this screen. A read-only record is a side peek, not a form. Either remove the watermark from `CardFormPage` entirely, or leave it and give the event screen its own panel.
2. Panel, 440 wide, over a scrim, with a bar carrying close on the left and expand and more on the right.
3. Body order: a type chip ("MEETING" on `status/info/bg`) with "from Google Calendar" beside it; the title at H3 with no label above it, because a title does not need to be told it is a title; a sunken When card with the date, the time range and the duration, and the line "The title and time are set in Google Calendar."
4. Actions: "Join the call" as the primary button filling the row, "Open in Google" as an outlined button beside it. Not a full-bleed bar.
5. People: an overline "PEOPLE · 7", then one row per guest with a 32px `Avatar/Person` (use `Avatar/Stranger` for guests who are not in People), the display name, their organisation or role underneath, and their answer as a quiet word on the right, "Going" in `status/success/fg` and "No reply" in `text/tertiary`. Never render a raw email address as the name. Where the Google payload has no display name, derive one from the address and keep the address in the subtitle.
6. Cap the list at three and add "Show the other N guests".

## Task 5: The calendar needs colour

**Files**: the week and day grid components under `src/screens` and `src/widgets` that render calendar events

**The fault.** Events are near enough all one colour, so the week reads flat and nothing tells you at a glance which part of your life a block belongs to.

**The target.** Figcraft frame `Calendar / Web / Week`.

**What to build.** Colour an event by the calendar or project it belongs to, not by its type. Each event is a tinted fill with a 3px bar down its left edge in the solid of the same colour, 10px radius, no full border:

| Belongs to | Fill | Bar |
| --- | --- | --- |
| Work and project blocks | `brand/subtle` | `brand/default` |
| Meetings and money work | `status/info/bg` | `status/info/solid` |
| House and property | `status/warning/bg` | `status/warning/solid` |
| Personal and admin | `status/success/bg` | `status/success/solid` |
| Happening now | `accent/subtle` | `accent/fg` |

A single-side stroke needs all four side weights set with the unused sides at 0, or the whole box draws. Today's column keeps a `brand/subtle` tint at 45% behind everything.

## Task 6: Plan and forecast

**Files**: `src/widgets/Planner/MoneyPlanPage.tsx`, `src/logic/plansForecast/usePlanModel.ts`, `src/shared/config/pageTree.ts`

Read `claude/dreda-forecast-design.md` first. It sets out the six questions the page has to answer and why the current one fails. The target frame is `Plan and forecast / Web`.

**Keep the engine.** `src/viewmodels/plans/engine.ts` already produces everything the new page needs: a daily running balance, monthly totals by type, each month's lowest point and date, cushion breaches, free money per month, the daily flexible allowance, three scenarios and a low-confidence flag. Do not rewrite it. This is a presentation change.

**What to build.**

1. Delete the intro paragraph and the control bar from the top of the page. The horizon segmented control moves to the header row; buffer, confirmed-income and reset move into a settings popover on that row.
2. Replace the six KPI tiles with the verdict band: full width, `#111827`, 20px radius. Overline "WHERE YOU STAND" in the accent, then one H2 sentence built from the engine: covered until a date, or short on a date. Under it the qualifier naming the lowest point, its date and whether it breaches the cushion. On the right, two raised tiles: "Safe to spend today" from the daily allowance, and "Free this month".
3. Balance chart: keep `BalanceForecast` but add the cautious-to-optimistic band, the dashed cushion line, the lowest point marked with its figure and date, month labels, and a generated sentence under the chart naming the payment that causes the dip.
4. New section, "What is locked, and what is yours to move": a stacked bar of fixed, variable, savings and free, then a row per band with a dot and the figure, each label carrying "locked" or "yours to plan".
5. New section, "At risk": one card per payment with no money behind it, tinted by severity, carrying the name, the amount, the reason in words and two or three concrete actions. Derive these from the engine's cushion breaches and from items with no basket behind them.
6. New section, "Can you get there, and by when": one row per goal with progress, the date wanted, a verdict pill and, where it is late, the monthly figure that would fix it.
7. "What if" moves to the bottom as a chip row. Selecting a chip redraws the chart. Keep "Apply to my records" as the only thing that writes.
8. Turn the page back on in `pageTree.ts` and remove the note saying it is off until redesigned.

## When you are done

Run the app and check these against the Figcraft frames named above:

- `/edit-transaction/<id>` against `Transactions / Web / Edit transaction`
- `/add-transaction` against `Transactions / Web / Add transaction`
- `/wallets/<wallet>` against `Wallet detail / Web`
- `/budget/basket/<id>` with an item open against `Basket / Web / Item panel`
- `/projects/calendar/events/<id>` against `Calendar / Web / Event open`
- `/projects/calendar` against `Calendar / Web / Week`
- the plan and forecast route against `Plan and forecast / Web`

Then tell me which other screens still render `widgets/Database` or `CardFormPage` where a designed component exists, because that is the pattern behind most of these faults.
