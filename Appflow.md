# Dreda app flow

What every screen in Dreda shows, what the user can do on it, and where it leads. Written from the code (`app/app/**/page.tsx` and the screens they render) as of 13 Nov 2026, to be the source for a flow diagram.

Each screen entry follows the same shape:

- **Route**: the URL.
- **Reached from**: the screens or controls that open it.
- **Shows**: what the user sees.
- **Can do**: the actions available.
- **Leads to**: where those actions go.

---

## 1. How the app is organised

### Two modes

Dreda is two apps in one, sharing an account, settings and notifications:

| Mode | What it covers | Home |
| --- | --- | --- |
| **Money** | Wallets, transactions, the monthly budget (baskets), payments, debt, insights, the money plan | `/home` |
| **Time** | Areas, sections, projects, tasks, calendar, focus board, insights, the time plan | `/projects` |

Shared by both: Notifications (`/notifications`) and Settings (`/settings`).

### Two layouts

Every screen exists in a **phone** layout (under 768 px wide) and a **web** layout (768 px and up). The screens hold the same data and actions; the navigation around them differs.

**Phone**

- **App header**: the page title, a bell (Notifications), Settings, and on some pages one page action (for example "Plan your time" on the Time home).
- **Bottom navigation**, per mode:
  - Money: Home (`/home`), Insights (`/statistics`), Budget (`/budget`), and a round button that switches to Time.
  - Time: Home (`/projects`), Calendar (`/projects/calendar`), Focus (`/projects/focus`), Insights (`/projects/insights`), and a round button that switches to Money. The Time "add" menu offers New area, New project and New task.
  - Baskets has its own: Home (`/baskets`), Priorities (`/baskets/items`), and an Add sheet (New basket, or add an item to a basket).
- **More sheet** (full height): the mode switcher, Search, Favorites, the mode's page list and Settings.
- **Swipe** sideways on a mode's home to switch modes.
- Forms open as full-screen pages.

**Web**

- **Sidebar**:
  - The workspace switcher (Money or Time, account, log out).
  - Quick actions: Search, Home, Ready to pay (with a count), and Add transaction or New task.
  - Favorites.
  - The mode's page tree.
  - Sync status, Settings and the profile.
- **Top bar**: breadcrumbs, a star to add the page to Favorites, and the page's own buttons.
- **Search palette** (Ctrl/Cmd + K): pages, baskets, recent transactions and open tasks.
- **Side peeks**: forms and records (a transaction, a task, a basket form) open in a panel beside the page instead of a new page.
- Many web pages are laid out as Notion-style "databases": properties at the top, then a table, list, cards or board you can switch between, filter, sort and search.

**Web sidebar page tree**

- Money: Wallets, Budget, Baskets (with New basket), Priorities, Payments, Transactions, Insights, Plan and forecast, Debt.
- Time: Today, Focus, Calendar, Projects (with New project), Areas, Resources, Insights, Plan your time.

### List tools used on many screens

Lists of transactions, tasks and similar records share one toolbar: **Search**, **Filter by** (with an Advanced filter of "where / and / or" rules), **Sort** (several sort rules), **Group**, and custom dates or date ranges. Phone lists also support swipe actions where noted.

---

## 2. Entry and account

### App entry
- **Route**: `/`
- **Shows** one of three things, depending on how the app was opened:
  - Opened in a browser tab: the **marketing page** ("Your Money and Time all in one place", Get started, How to install).
  - Installed on the home screen and never signed in: the **splash screen**.
  - Installed and signed in before: the user is signed out and sent through sign-in again (deliberate: a home-screen launch always asks for credentials).
- **Leads to**: Sign up, Sign in.

### Sign up
- **Route**: `/sign-up`
- **Shows**: "Welcome !", Name, Email, Password, Create account, "or continue with" Google / Apple.
- **Can do**: create an account with email and password, or continue with Google or Apple.
- **Leads to**: Onboarding. The "Already have an account? Sign in" link goes to Sign in.

### Sign in
- **Route**: `/sign-in`
- **Shows**: "Welcome back !", Email, Password (show/hide), Forgot password?, Sign in, Google / Apple.
- **Can do**: sign in, or request a password reset email ("Password reset email sent, check your inbox").
- **Leads to**: a new account goes to Onboarding; an existing account goes to Loading, then the start page. "Don't have an account? Create one" goes to Sign up.

### Onboarding (3 steps)
- **Route**: `/onboarding`. Skipped automatically if the account already has wallets.
- **Steps**:
  1. **Add your wallets**: Name, Type, Currency, Starting balance, then Add wallet. At least one wallet is required to continue.
  2. **Set up your categories**: tap a suggested category, or type a Name and pick Expense / Income / Savings, then Add category. At least one category is required.
  3. **Plan your first budgets** (optional): Month, Year, an expense category and a monthly amount, then Add budget item. These go into a basket called "Monthly expenses".
- **Can do**: Back, Continue, Finish setup, or Skip for now at any point.
- **Leads to**: Money Home.

### Loading
- **Route**: `/loading`
- **Shows**: a loader while the account loads.
- **Leads to**: the start page chosen in Settings > Preferences (separate choices for phone and web).

### Offline
- **Route**: `/~offline`
- **Shows**: "You're offline" and Try again. The last-synced Home stays readable.

### Sign-in guard
Every app screen requires a signed-in user. Without one, the app goes to Sign in.

---

## 3. Money mode

### 3.1 Money Home
- **Route**: `/home`
- **Reached from**: sign-in, the Money tab, the mode switch, the logo.

**Shows (phone)**
- **Balance card**:
  - Total Balance, with an eye button that hides every amount.
  - A currency picker with search, which changes the display currency.
  - A bar showing how far through the month it is.
  - **Unaccounted for** (or **Surplus**), which opens Reconciliation.
- **Savings** and **Spendable** totals.
- **Quick Actions**: Add New (Add transaction), History (Transactions), Baskets, Debts.
- **Wallets**: a horizontal strip of wallet cards, each showing type, name, wallet number, Available, and Required (what upcoming payments need).
- **Cashflow**: income against expense bars for the Week or the Month, with a Linear / Log switch.
- **Recent Transactions**: tap one to open it.

**Shows (web)**
- A greeting and the date.
- Tiles: Received this month, Still expected, Spendable now, Ready to pay.
- The balance block: account chips, Add transaction, Transfer, hide amounts.
- The Ready to pay block, or "Spend today" when nothing is waiting.
- Monthly Budget spent against planned.
- Cashflow, Wallets with Required bars, and Recent Transactions as a table.
- Statistics: a donut of expense or income by category.
- Upcoming Payments.

**Leads to**
- Add transaction, Transactions, Baskets, Debts.
- Wallets, and a wallet's detail page.
- A transaction's detail page.
- Payments, Ready to pay (`/budget/ready`), Reconciliation (`/settings/reconciliation`).

### 3.2 Wallets

#### Wallets list
- **Route**: `/wallets`
- **Shows**: the total across all wallets; each wallet with its balance; an Archived section.
- **Can do**: **Add wallet** with Name, Short name (up to 5 characters, used on the Home chart), Type, Currency and Starting balance.
- **Leads to**: Wallet detail; an archived wallet opens Edit wallet so it can be restored.

#### Wallet detail
- **Route**: `/wallets/[wallet]`

**Shows**
- The balance; Available when part of it is locked.
- Badges: Frozen, Not spendable, the locked amount.
- Committed this month, and Free after commitments.
- Last reconciled, and **Audit this wallet**.
- Cashflow (in and out), Spending trend, and "Where money leaves to" (a donut of transfer destinations).
- "Needed for upcoming payments (30d)": the total, and either Covered or Short by.
- The wallet's transactions, with the shared list tools.

**Can do**: Edit wallet; open a transaction; open the audit.

**Leads to**: Edit wallet, Wallet audit, transaction detail.

#### Edit wallet (form)
- **Route**: `/wallets/[wallet]/edit` (a side peek on web).
- **Fields**:
  - Name, Short name, Type. A Savings account can receive money but never pay an expense directly.
  - Starting balance (changing it shifts the current balance by the same amount).
- **More options**:
  - **Not spendable**: excluded from Home's Spendable total.
  - **Frozen**: no transactions in or out until unfrozen.
  - **Locked amount**: money set aside inside the wallet.
- **Danger zone**:
  - **Archive wallet**: move its money to another wallet, or discard it.
  - **Unarchive** an archived wallet.
- **Leads to**: back to where it was opened.

#### Wallet audit
- **Route**: `/wallets/[wallet]/audit`

**Shows**
- A window picker (presets or a custom From / To).
- **Money in and out**: Opening balance; Money in (income, transfers in); Money out (spending, transfers out, charges); reconciliation changes; Closing balance; net for the window.
- **Balance check**: what the entries add up to against the stored balance. Either "Everything adds up", or "Off by X" with a button to set the balance to the expected amount.
- **Reconcile this wallet**: enter the real balance, see the gap (missing, surplus, or matches), then Save reconciliation. Missing money goes to Unaccounted; extra money is recorded as a surplus.

**Leads to**: See the transactions (Wallet detail).

### 3.3 Transactions

#### Transactions list
- **Route**: `/transactions`
- **Reached from**: Home (History, Recent Transactions arrow), the sidebar.
- **Shows**:
  - Phone: every transaction, grouped by day, with Money in / Money out totals and the list tools.
  - Web: a month page with Month, Money in, Money out and Count, then type tabs and a Table (default), List or Cards view.
- **Can do**:
  - Add transaction (header button).
  - Search, filter, sort.
  - Select rows to delete; edit from a row's actions.
- **Leads to**: Transaction detail (a side peek on web), Add transaction.

#### Transaction detail
- **Route**: `/transactions/[id]` (a transfer opens the same page in transfer mode).

**Shows**
- The amount, signed and coloured (+ in, − out); the title.
- Date, Time (or "Not recorded"), Type.
- Category, or Kind for a transfer.
- Wallet, or From → To; "Unaccounted money" when it was spent from it.
- Basket (or "Not in a basket"), Counts toward (the month), Income subtype, Note.

**Can do**
- **Edit**.
- **Open** its basket item.
- **Assign to basket**: choose a basket item in the same category around that month. Change it, or Remove from basket.

**Leads to**: Edit transaction or Edit transfer, Planning item.

#### Add transaction (form)
- **Route**: `/add-transaction`
- **Reached from**:
  - Home's Add New, the sidebar.
  - Planning (with the month set), a basket item's "Add expense" or "Record income" (prefilled with the item).
  - A category, or a transaction template (prefilled).

**Fields**
- **Type**: Expense, Income, Savings, Transfer.
  - **Savings** is either "Moved" (wallet to savings account) or "Frozen" (locked inside a wallet).
  - **Income** is earned, other, or **borrowed**. Borrowed also creates a cash debt.
- **Category**: the budgeted categories for that month; "unplanned" shows every category.
- **Basket and item**, for an expense: pick one, create a basket on the spot, or choose "Not sure yet". The item shows what's left and how much this payment uses ("Hangouts will have 12,000 left"), with a "Pay full" shortcut.
- Amount; Date; Description.
- **Wallet**:
  - For an expense, any spendable wallet or **Unaccounted money**.
  - For a transfer, From (which can be Unaccounted money) and To (never Unaccounted money), plus Charges.
- **More options**: for income or savings, "Explains money found in a reconciliation" / "Paid from unaccounted money". It is suggested when the date is before a check done in the same month.

**Impact line**: what the save will do ("Takes 5,000 from Cash on 3 Nov for Food").

**Leads to**: back to where it was opened, usually Home.

#### Edit transaction / Edit transfer (forms)
- **Routes**: `/edit-transaction/[id]`, `/edit-transfer/[id]`
- **Edit transaction fields**: Description, Type, Category, Amount, Wallet (Unaccounted money for expenses only), Date, Basket item.
- **Edit transfer fields**: Kind, Amount, Charges, From, To, Date, Basket item.
- **Can do**: Save, or Delete (with confirmation).

### 3.4 Budget (planning the month)

#### Budget
- **Route**: `/budget` (`?month=YYYY-MM`)
- **Reached from**: the Budget tab, the sidebar.

**Shows (phone)**: a month picker ("12 days left", "Ended", "Not started yet") and three tabs:
- **Budget**:
  - A card: "Planned spending in November", the share of income, Income expected, Savings planned, and **Left to plan** (or **Over income**).
  - **Details**: actual against planned for Income, Expenses, Savings, Moved between wallets, Transfer fees, Borrowed; then Available now, By month end, Unplanned spending, Unaccounted for, and **Unhealthy spend**. Every figure has an info (i) button.
  - Basket groups (Income, Expenses, Savings, Transfers), each basket showing used / planned and a bar, then New basket.
- **Payments**: see Payments below.
- **History**: the month's transactions with the list tools.

**Shows (web)**
- Properties: Month, Status, Left to plan, Available now, Waiting for income.
- A callout about the month, with links:
  - **Review the month** (`/budget/review`).
  - **See what changed** (`/budget/migration`, after an update).
  - **Check your items** (`/budget/item-kinds`).
- Four summary blocks (Income, Expenses, Savings, Transfers).
- A database with type tabs and Table, Cards or "Needs attention" views.

**Page action**: Edit budget (Baskets), Plan new payment (pick a basket), or Add transaction.

**Leads to**: Budget basket, Baskets, New basket, Add transaction, Month review, Migration report, Item kinds, Payments.

#### Budget basket (one basket in one month)
- **Route**: `/budget/basket/[bucketId]?month=`

**Shows**
- The name and description.
- All-time totals ("See every item, all time").
- Planned / Used / Left (Expected / Received / To come for income).
- Items grouped by kind (Payments, Allowances, Set aside, Income, Moves between wallets). An allowance shows its daily pace.
- The month's transactions (See all); notes.

**Can do** (the "…" menu): Add item, Edit basket, **Close for [month]** (or Reopen), All transactions, Print, Export as PDF.

**Per item**
- Open it.
- **Pay**: Add transaction prefilled with the item.
- For income, **Add received**: amount and the wallet it was received into.
- Close the item for the month.

**Close basket sheet**: says whether it came out over plan or on plan, and asks "How did it go?" (optional) before Close basket.

**Print or export sheet**: Month, Paper (including an 80 mm receipt), and switches for Adjustments, Notes, QR code and Group items by status; then Print or Export as PDF.

**Adjustments** (cover or reallocation records): open one to edit its explanation, or **Undo** it ("The money goes back where it came from").

**Leads to**: Planning item, Add basket item, Edit basket, Add transaction, History.

#### Planning item (one item in one month)
- **Route**: `/budget/item/[bucketId]/[itemId]?month=`

**Shows**
- The name.
- Planned for the month, with "Change [month]'s amount" or "Use the usual amount".
- Planned, Spent (or Received), Left / Over / Above estimate.
- Type (Fixed or Planned), Category, Next due, Paid from, Moved.
- Status: On track; Over by X; Over, justified; or "X left over".
- Its transactions, and **Money moved** (from or to other items: covered an overspend, borrowed from next month, back to unallocated, leftover moved).

**Can do**
- Edit item.
- **Cover or justify**, when over.
- **Reallocate**, when money is left over.
- **Add expense** or **Record income**.
- **Undo** a move.
- **Skip [month]**: removes the item from this month only.
- Hide the status card.

**Leads to**: Cover, Reallocate, Add transaction, Edit basket item.

#### Cover or justify (overspend)
- **Route**: `/budget/cover`

**Shows**
- "Covered X of Y" progress.
- **Cover from other budgets**: search the budgets, enter an amount from each, Show all.
- **Explain what happened**:
  - Why it went over.
  - When it was dealt with: consciously at the time, or discovered later (with the date it was noticed).
  - Could it have been avoided.
  - A note.
- **Review**, then **Confirm**.

**Leads to**: back to the item or basket. "This budget isn't over anymore" offers Back to the basket.

#### Reallocate (leftover)
- **Route**: `/budget/reallocate`
- **Shows**:
  - Where the leftover goes: **Another basket** (then pick the item), **Savings** (pick the savings account), or **Next month**.
  - The amount: quick picks (25%, 50%, All) or typed.
  - A note.
- **Can do**: Confirm move.

#### Payments
- **Route**: `/payments` (also the Budget page's Payments tab on a phone).
- **Reached from**: Home's Upcoming Payments, the sidebar.

**Shows**
- "Spent in [month]": Payments paid, Still to pay, Overdue.
- A week strip (Previous / Next week, Show month) with dots on days that have payments.
- Payments grouped as Overdue, This week, Later this month, and Paid.

**Can do**
- Pick a day to see what's due on it.
- **Pay** a payment: Add transaction prefilled.
- **Close** a payment for the month at what's been paid.
- Open the item.
- **New**: Plan a payment (pick a basket), or Plan a debt repayment.

**Leads to**: Add transaction, Planning item, Add basket item, Plan a repayment.

#### Ready to pay
- **Route**: `/budget/ready`
- **Reached from**: Home (web), the sidebar count, notifications.
- **Shows**:
  - What the money received so far covers, grouped as Expenses, Savings and Transfers.
  - Each payment is ticked by default, with its amount and the wallet it's paid from, and flags an amount that changed.
  - "Not enough yet" and "Waiting for income" groups.
- **Can do**: untick payments, change the paying wallet, then **Confirm**. This records them all, with Undo for 10 seconds.

#### Month review
- **Route**: `/budget/review?month=`
- **Shows**: Income, Expenses, Savings and Transfers, each opening to the month's lines. Amounts and dates can be edited for this month only, and variable expenses can roll their unused amount over. The bottom bar shows the resulting Left to plan.
- **Can do**: **Confirm month**, which saves and marks the month reviewed.

#### Check your items (item kinds)
- **Route**: `/budget/item-kinds`
- **Shows**: each basket's items with the kind they were given: Payment, Allowance or Set aside.
- **Can do**: change a kind with one tap, then **Done**.

#### What changed (migration report)
- **Route**: `/budget/migration`
- **Shows**: a one-time report of what an update classified, split or corrected, grouped by kind of change; "needs attention" is open.
- **Can do**: **Got it**, which marks it read.

### 3.5 Baskets (the plan behind the budget)

A **basket** groups planned money of one type: Expense, Income, Savings or Transfer. It is **Fixed** (set bills) or **Variable** (a limit used through the month). Its **items** are the individual payments, allowances, savings or income lines.

#### Baskets
- **Route**: `/baskets`
- **Reached from**: Home's Baskets quick action, Budget's "Edit budget", the sidebar.
- **Shows**:
  - Filters: a month dropdown, the money type, and All / Fixed / Variable.
  - A summary card for that type (for example "Planned expenses in baskets · Nov": Used, Left or Over, number of baskets).
  - The baskets grouped by type.
  - On web, Cards view: each basket's items, need, actual against planned, progress, available, next due, and the one action it needs.
- **Can do**: New basket; open a basket. The "…" menu has Archived baskets, Import and Print.
- **Leads to**: Basket detail, New basket, Priorities, Archived baskets.

#### Basket detail
- **Route**: `/baskets/[id]`

**Shows**
- The basket's kind badge.
- Items done out of total (%), and the deadline.
- Each line item:
  - Due date, and spent so far of the amount.
  - Payment chips that open the payments.
  - Completed or Partial tags.
  - Sub-items (a shopping list): consumed of the amount.
  - "Possible" or "Not possible" with the current funds.

**Can do**
- The basket menu: Edit, Archive (or Unarchive), Delete.
- The item menu: Add to budget, **Record payment** or Record another payment, Edit item, Delete item.

**Record payment sheet**
- Wallet, or From and To for a transfer basket.
- Amount; Fully paid or Partially paid.
- Category, or transfer type.
- Charges, Date, Description.
- It is blocked if the wallet is frozen.

**Leads to**: Add basket item, Edit basket item, Edit transaction or transfer.

#### New / Edit basket (form)
- **Routes**: `/baskets/new`, `/baskets/[id]/edit` (a side peek on web).
- **Fields**:
  - Name, Type, Fixed or Variable.
  - Starts (month), Cadence (or a custom Repeat rule).
  - Default paid from.
  - For savings: Target amount and Target date.
  - Description, Currency.
  - Automation default: Off, Remind me, or Prepare for confirmation.
- **Can do**: Create basket, Create and add items, Save basket.

#### Add / Edit basket item (form)
- **Routes**: `/add-basket-item/[goalId]`, `/edit-basket-item/[goalId]/[itemId]`
- **Fields** (some only appear for certain item types):
  - Name; Amount (with Charges for a transfer); Currency.
  - Kind: Payment, Allowance ("Money for the period, spent bit by bit") or Set aside ("Put away toward a target").
  - For income: "Comes in as" (one date, or small amounts over the period) and Confidence (Confirmed or Expected).
  - "Paid from goal" (a savings goal).
  - Category, or Transfer type.
  - Priority.
  - Repeats: Same as basket, Doesn't repeat, Monthly, Weekly, or Custom.
  - Due day, Due date, Starts, or Expected on.
  - Available from (a day of the month); Target and By (for set-aside).
  - From and Paid from: a wallet, a savings account, any income, or "When [income line] arrives".
  - Description.
  - Automation: Off, Remind me, or Prepare it (added to Ready to pay when due).
  - Not before / Needed by.
  - Splittable (can be paid in parts).
  - A shopping list of sub-items.
- **Impact line**: "Adds 20,000 to Food every month".
- When editing an item that already has a payment this month, it asks "Also update this month's recorded payment?"

#### Priorities ("What should I pay next?")
- **Route**: `/baskets/items`

**Shows**
- A card: what's still to pay and how much of it is covered; Available, Spare (or Gap), Must haves. A chip switches between money now and by month end.
- Controls: This month / All open, and the order (Recommended, Deadline, Priority, Smallest first, Manual).
- The items grouped by due date (Overdue in red), each with its basket, due date, priority, amount, and "Covered" or "Fits in [month]", plus a line marking where the money runs out.
- On web: grouped by coverage (Can pay now, Waiting for income, Not covered), with a Table or Board view.

**Can do**
- Swipe right to **mark paid**, swipe left to **postpone** (pick a date).
- Open an item; more actions in "…".

#### Plan and forecast (money plan)
- **Route**: `/baskets/forecast`

**Shows**
- What the "locked layer" means (income and fixed costs can't be moved).
- Controls: horizon, safety buffer, **scenario** (pick, save as new, make active, delete), reset, changes.
- Six KPIs.
- "How your plan looks": the balance forecast with its lowest point, the locked-layer waterfall, money in and out by period, where the money goes, and the plan against the starting plan.
- "Adjust your plan": a List (by date) or a Board (drag a card between periods, or Move to). Each period shows Starts with, + in, − out, Ends with.
- Savings goals, the month's priorities, and the baskets.

#### Archived baskets
- **Route**: `/settings/archived-baskets` (also from Baskets' menu).
- **Can do**: open, **Restore**, or **Delete** (with confirmation).

#### Basket analytics (retired)
- **Route**: `/baskets/analytics`. It redirects to Baskets on a phone and to Insights on the web.

### 3.6 Debt

#### Debts
- **Route**: `/debts`
- **Reached from**: Home's Debts quick action, the sidebar.
- **Shows**: Total debt; a donut by priority (High, Medium, Low); the total debt trend; each debt with its priority and next payment.
- **Can do**: Add debt; open a debt; Archive (with confirmation).

#### Debt detail
- **Route**: `/debts/[id]`

**Shows**
- Type: cash debt, or record only.
- Priority, Principal, Repaid.
- **Payment plan**: amount, interval, next payment.
- Scheduled repayments (Recorded, Scheduled, or Everything left), with a warning when they add up to more than is owed.
- The repayment trend.
- Repayment history: each repayment marked "Linked to wallet" or not.

**Can do**: Edit debt, Archive, Edit plan, **Plan a repayment**, **Record repayment**; open a scheduled repayment to record it.

#### Debt forms
| Form | Route | Fields and result |
| --- | --- | --- |
| New / Edit debt | `/debts/new`, `/debts/[id]/edit` | Type (cash debt or record only), Name, Lender, Amount, Borrowed on, Received into, Priority, Payment plan, Notes; an Impact card |
| Edit payment plan | `/debts/[id]/plan` | The plan, then "Apply to this and future payments" or "Only the next payment" |
| Record repayment | `/debts/[id]/repay` | Amount, Date, Paid from, Method (Planned or Manual), Note; an Impact card |
| Plan a repayment | `/debts/[id]/schedule`, `/debts/schedule` | The debt (when opened from Payments), Date, "Set amount" or "Everything left", Paid from, Automation, Note |
| Change wallet effect | `/debts/[id]/wallet` | Step 1: cash debt or record only. Step 2: what happens to past repayments and where the money arrived. Step 3: the Impact card, then Confirm change |

Recording **borrowed income** in Add transaction also creates a cash debt.

### 3.7 Money insights
- **Route**: `/statistics`
- **Reached from**: the Insights tab, the sidebar.
- **Shows**: a period filter (Day, Week, Month, Quarter, Year, All time, then the specific period), a hero and KPI tiles, then that period's cards. Every chart has a Linear / Log switch.
- **Cards include**:
  - Money in and out; How your balance changed; Where the income went; Planned against actual.
  - Unplanned spending: when, which days, on what.
  - Untracked money and its share of spending; which wallet loses track; reconciliation log and latest reconciliation.
  - Debts paid and left; Savings; Your position ahead; projected balance.
  - Spending through the day; monthly spending by year.

### 3.8 Categories and templates (Settings > Tools)

| Screen | Route | Shows / can do |
| --- | --- | --- |
| Categories | `/categories` | Categories grouped by Expense, Income and Savings; open one; edit; new |
| Category transactions | `/budget/category/[categoryId]` | Every transaction in that category |
| New / Edit category | `/create-category`, `/categories/[category]/edit` | Name, Type, Description |
| Transaction templates | `/transaction-templates` | Saved transactions you record often; Edit, Delete, New. Using one opens Add transaction prefilled |
| New / Edit template | `/transaction-templates/new`, `/[id]/edit` | Name, Amount, Type (with the savings mode), Category or kind, Wallet (or From / To with charges), Description; Delete |

---

## 4. Time mode

### 4.1 Time home (Today)
- **Route**: `/projects`

**Shows (phone)**
- Active projects as a horizontal strip, with New project and See all projects.
- **Today's Tasks** as a checklist, with Plan today, New task and See all tasks.
- When empty: "Nothing scheduled for today."

**Shows (web)**
- A page about one date: "Saturday, 3 October", switchable to Today, Tomorrow or Yesterday.
- Properties: Tasks, Focus time, Meetings, Overdue.
- A mini month, progress and next up.
- A 7-day strip over the day timeline.
- The day's tasks as a List, Table or Board by status. Done and Cancelled are folded; date-only to-dos sit under "Anytime".

**Can do**
- Tick tasks done.
- **Plan today**: pick at least 3 pending tasks as today's priorities.
- New task, New project.
- **Plan your time** (app bar).

**Leads to**: All projects, Project detail, Tasks list, New task, Time plan.

### 4.2 Areas, sections and projects

The hierarchy is **Area → Section → Project → Task**. Tasks can also sit directly under an area.

| Screen | Route | Shows | Can do |
| --- | --- | --- | --- |
| Areas | `/areas` | Each area and its number of projects | New area; open; archive |
| Area detail | `/areas/[area]` | Sections, Projects, area-level Tasks | Edit area; New section; New project; New task |
| New / Edit area | `/areas/new`, `/areas/[area]/edit` | Name, color and the rest of the card form | Save; archive or restore (when editing) |
| Section detail | `/sections/[section]` | The section's projects | Edit section; New project |
| New / Edit section | `/sections/new`, `/sections/[section]/edit` | Area (fixed), Name and emoji, Color, Description | Save; archive |
| All projects | `/projects/all` | Each project with % done, health (On track, Watch, At risk) and dates | New project; open; delete or archive; switch to Areas |
| Project detail | `/projects/[project]` | Area, status (Ongoing, Completed, Archived), Extended / Shortened flag, Description (Read more), Tasks (filter which to show) | Edit; change status; change area; Add task; **Import tasks** |
| New / Edit project | `/projects/new`, `/projects/[project]/edit` | Name, Area, Section, Priority, Color, Timeline (start and end), Description | Create; save; change status (incl. archive); delete the project, keeping or deleting its tasks |
| Project insights | `/projects/insights/[projectId]` | Velocity, Forecast finish, Deadline, Overdue; **Burndown** (remaining, ideal, forecast, red when late); **Milestones** | New, edit or remove milestones; Mark as reached |
| Project analytics | `/projects/analytics` | Projects and tasks done on time against rescheduled | View only |

### 4.3 Tasks

#### Tasks list
- **Route**: `/tasks`. The scope comes from the link: today, this week, overdue, all, or an Insights drill-down.
- **Shows**: the tasks, with the list tools.
- **Can do**:
  - Tick tasks; New task.
  - "Move N unfinished tasks to tomorrow".
- **Leads to**: the task (form on a phone, side peek on web).

#### New / Edit task
- **Routes**: `/tasks/new`, `/tasks/[id]/edit`. Web uses the task page in a side peek (`?task=<id>`); a phone uses the form.
- **Fields**:
  - Task type: To-do, Meeting or Event.
  - Name, Date, Repeat, Starts / Ends.
  - **Availability check**: "This time is free", "You'll share this window with N free tasks", or "Conflicts with '…' 10:00 to 11:00 (Google Calendar)", with See tasks and Try tomorrow.
  - Time mode: **Blocked** or **Free** (free tasks can share a time window).
  - Project, Priority, Focus quadrant (Do first, Schedule, Delegate, Eliminate), Estimate (hours), Notes.
  - Completed.
- **Web task page**, edited in place: Status, Importance, Type, Date, Start and End, Time mode, Repeat, Project, Area, Google sync, Created; subtasks; notes; "Open in form".
- **Can do**: Add task, Save task, Delete (with confirmation).

### 4.4 Calendar
- **Route**: `/projects/calendar`

**Shows (phone)**
- A month grid (Monday first).
- **Schedule**: an hour timeline for the chosen day with its tasks. Payments due that day show as "Payment due · amount".

**Shows (web)**: one calendar of everything dated: tasks, Google Calendar events, project start and end dates, and planned payments. Views: Day, Week, Month; filters for Source, Free tasks, Project, Area, Type.

**Can do**
- Jump to today; previous or next month.
- **Add event**: New task on the chosen day.
- Sync with Google Calendar.
- Tick a task; open a task, a payment or a Google event.

**Leads to**: New task, Edit task, Calendar event, Payments.

#### Calendar event (from Google)
- **Route**: `/projects/calendar/events/[eventId]`
- **Shows** (read-only, from Google): title, time, organizer, guests and their answers, location, Join, Open in Google Calendar.
- **Can do** (Dreda's side): link it to a task or project, and add notes.

### 4.5 Focus
- **Route**: `/projects/focus`
- **Shows**:
  - Phone: every pending task on an Eisenhower board with four columns: Do first, Schedule, Delegate, Eliminate.
  - Web: properties (Scope, Overdue, Do first share of time), an overdue callout with "Show overdue", and views Matrix, List, Table, Overdue, This week.
- **Can do**:
  - Long-press and drag a card to another quadrant.
  - New task; open a task.
  - The menu: Today's tasks, All tasks, Calendar.

### 4.6 Time insights and plan

#### Time insights
- **Route**: `/projects/insights` (also reached from `/projects/analytics`).
- **Shows**: the same layout as Money insights (period filter, hero, KPIs, cards), with time cards:
  - Your day so far; When you work; Where the hours went.
  - Time by project; Hours tracked on each project; Every hour tracked, by project.
  - Planned against actual; Life balance (hours per area against weekly targets).
  - How long you stay focused; Deep work blocks by length; Split by type of work.
  - Project timeline; weekly hours by year.

#### Plan your time
- **Route**: `/projects/plan`
- **Shows**:
  - Controls: this week or two weeks, auto-plan, clear, reset hours, scenario, send to calendar, save hours.
  - Six KPIs.
  - The daily load, with deadline warnings and "Add the hours".
  - The hours waterfall, hours by project, the week board, and the deadline check.

### 4.7 Resources
- **Route**: `/resources`
- **Shows**: a placeholder page; there's no feature behind it yet.

---

## 5. Shared screens

### Notifications
- **Route**: `/notifications`
- **Reached from**: the bell in the app header.
- **Shows**:
  - Filters: All, Money, Time, Unread.
  - Cards grouped by Today, Yesterday, This week, Earlier. Each card has the severity, title, two lines of body, and when.
  - Notification settings.
- **Can do**:
  - Swipe left to archive; swipe right to mark read or unread.
  - The menu: Mark all as read, and see snoozed, resolved and archived notifications.
- **Leads to**: Notification detail, Notification settings.

### Notification detail
- **Route**: `/notifications/[id]`. Opening it marks it read.
- **Shows**: the severity, title and body; every item it groups, each with its own action (for example "Mark paid" on a payment); its actions (for example **Ready to pay**).
- **Can do**: Mark unread, Snooze, Archive, Mute this type.

### Settings
- **Route**: `/settings`. On web this opens as a dialog.
- **Shows**: My profile at the top, then grouped sections. Sign out is at the bottom.

| Group | Section | Contents |
| --- | --- | --- |
| Account | My profile | Photo, Name, Email, Sign-in methods, Change password (emailed link), Sign out, Delete account |
| | Preferences | Start page on the web, Start page on the phone, Week starts on, Date format, Time zone, Currency, Hide amounts by default |
| | Notifications | Daily summary and its time, Ask on opening the app, Push on this device, which types reach you in the app |
| | Connections | Google Calendar: status, calendar, last sync, Test connection, "Also mark free tasks as busy" |
| Money | Accounts and wallets | Default wallet, "Usable for the plan" per wallet, Add a wallet, Rename or archive (opens Wallets) |
| | Budget and forecast | Month starts on (for example payday), Safety cushion, Savings target, Automation for new items, Roll over unused amounts |
| Time | Work hours and tasks | Working hours (start and end), Daily capacity, Default task length, Time mode for new tasks |
| Data | Import and export | Import projects and tasks, Templates, Export |
| | Tools | Categories, Transaction templates, Archived baskets, Reconcile balances, Reconciliation, Audit reports, Backfill |
| (none) | About | Version, Terms of use, Privacy, Support |

### Settings tools and data screens

| Screen | Route | Shows / can do |
| --- | --- | --- |
| Reconciliation | `/settings/reconciliation` | The unaccounted balance (or surplus). **Reconcile now**: "Balances as of" a date, the real amount per wallet, then save; gaps go to Unaccounted. **Clear unaccounted balance** (or surplus), with the last time it was cleared. The list of transactions that explained part of it. Opens History |
| Reconciliation history | `/settings/reconciliation/history` | Past checks and what was logged after each. **Revert** a reconciliation: wallets go back to their balances before it, and what was logged after it is deleted |
| Reconcile balances (data check) | `/settings/reconcile` | Run a check of each wallet's stored balance against its own entries. Summary (checked, mismatches, matched, entries); warnings for balances that would go negative and for entries pointing at missing wallets; tick the corrections to apply, then **Apply (N)**; Re-run |
| Audit reports | `/settings/audit-reports` | Pick a Month, Quarter or Year, then **Generate**. Lists past reports; delete one |
| Audit report detail | `/settings/audit-reports/[reportId]` | Executive summary (red flags, net worth), Balance sheet, Cash flow, Spending habits, Budget adherence, Financial health, Baskets and debt (payoff opportunity), Appendix (totals by category, transaction log). **Export PDF** |
| Backfill | `/settings/backfill` | Spread a lump sum over past dates as separate transactions or transfers: frequency (once, daily, weekdays, weekly, monthly, quarterly), dates, amount, wallet and category. **Preview**, then Confirm. Opens Batches |
| Backfill batches | `/settings/backfill/batches` | Past backfills; delete a batch (with confirmation) |
| Import | `/settings/import` | Projects and tasks from Excel or CSV, with duplicates checked first; a report afterwards. Also a full Dreda backup restore |
| Download template | `/settings/download-template` | Pick the entities, then download one Excel file with a tab each |
| Export data | `/settings/export` | Pick what to include, then one Excel file with a sheet per entity |
| Insights settings | `/settings/insights` | Capacity, working hours, notifications and alert thresholds |
| Google Calendar | `/settings/google-calendar` | Status, last sync, what moved, Sync now, Test connection, mark free tasks as busy |
| Notification settings | `/settings/notifications` | The Notifications section on its own page |

---

## 6. Key flows (for the diagram)

Each flow is a path through the screens above. `→` is a navigation; text in brackets is an action on that screen.

### F1. First run
Marketing / Splash → Sign up → Onboarding: [add wallets] → [add categories] → [optional budget items] → [Finish setup] → Money Home

### F2. Returning user
App entry → Sign in → Loading → the start page (Money Home or Time Today)

### F3. Record an expense
Money Home → [Add New] → Add transaction: [Expense] → [category] → [basket item, or "Not sure yet"] → [amount, date, wallet] → [Save] → back to Home
- Paid from unaccounted money: choose **Unaccounted money** as the wallet; no real wallet changes.
- Later linking: Transaction detail → [Assign to basket] → pick the item.

### F4. Plan the month
Budget → [Edit budget] → Baskets → New basket → [Create and add items] → Add basket item (repeat) → Budget shows Planned spending and Left to plan → Month review → [Confirm month]

### F5. Pay what's planned
- Payments → [Pay] on a payment → Add transaction (prefilled) → Save
- Or Ready to pay → [tick payments] → [Confirm] → recorded (Undo for 10 s)
- Or Priorities → [swipe right: mark paid] / [swipe left: postpone]
- Or Basket detail → item → [Record payment]

### F6. An item goes over budget
Budget basket → Planning item: "Over by X" → [Cover or justify] → Cover: [take from other budgets] + [explain why] → [Confirm] → Planning item shows "Over, justified"
- Undo: Planning item → Money moved → [Undo]

### F7. An item has money left over
Planning item: "X left over" → [Reallocate] → Reallocate: [Another basket / Savings / Next month] → [amount] → [Confirm move]

### F8. Close the month for a basket
Budget basket → … → [Close for month] → Close sheet: [How did it go?] → [Close basket]; it can be reopened later

### F9. Balances don't match reality
- Home → [Unaccounted for] → Reconciliation → [Reconcile now: enter real balances] → the gap goes to Unaccounted
- Then explain it:
  - Add transaction: an expense paid from **Unaccounted money**, or
  - Add transaction: a **transfer from Unaccounted money** into a real wallet, or
  - Add transaction: income or savings with "Explains money found in a reconciliation", or
  - Reconciliation: [Clear unaccounted balance]
- Undo a check: Reconciliation → History → [Revert]
- Per wallet: Wallet detail → [Audit this wallet] → Balance check / Reconcile this wallet

### F10. Debt lifecycle
- Debts → [Add debt] → New debt → Debt detail → [Edit plan] / [Plan a repayment] → the repayment appears in Payments → [Record repayment] → Debt detail history
- Or Add transaction: Income, borrowed → a cash debt is created automatically

### F11. Organise work
Time home → Areas → New area → Area detail → [New section] / [New project] → Project detail → [Add task] / [Import tasks] → Task form

### F12. Plan and do the day
Time home → [Plan today: pick 3+ tasks] → Today's Tasks → [tick done] → Tasks list → [Move unfinished to tomorrow]
- Scheduling: New task → [Starts / Ends] → availability check → [Blocked or Free] → Calendar shows it; [Sync with Google Calendar]
- Prioritising: Focus → [drag between Do first / Schedule / Delegate / Eliminate]

### F13. Track progress
- Project detail → Project insights → Burndown, forecast finish, [add milestones]
- Time insights / Plan your time → [auto-plan] → [send to calendar]

### F14. Respond to a notification
Bell → Notifications → Notification detail → [item action, for example Mark paid] or [Ready to pay] → Ready to pay; or [Snooze / Archive / Mute this type]

---

## 7. Route index

| Route | Screen | Mode |
| --- | --- | --- |
| `/` | App entry (marketing or splash) | — |
| `/sign-up`, `/sign-in` | Sign up, Sign in | — |
| `/onboarding` | Onboarding | — |
| `/loading`, `/~offline` | Loading, Offline | — |
| `/home` | Money Home | Money |
| `/wallets`, `/wallets/[wallet]` | Wallets, Wallet detail | Money |
| `/wallets/[wallet]/edit`, `/wallets/[wallet]/audit` | Edit wallet, Wallet audit | Money |
| `/transactions`, `/transactions/[id]` | Transactions, Transaction detail | Money |
| `/add-transaction` | Add transaction | Money |
| `/edit-transaction/[id]`, `/edit-transfer/[id]` | Edit transaction, Edit transfer | Money |
| `/budget` | Budget | Money |
| `/budget/basket/[bucketId]` | Budget basket | Money |
| `/budget/item/[bucketId]/[itemId]` | Planning item | Money |
| `/budget/cover`, `/budget/reallocate` | Cover or justify, Reallocate | Money |
| `/budget/ready` | Ready to pay | Money |
| `/budget/review` | Month review | Money |
| `/budget/item-kinds`, `/budget/migration` | Check your items, What changed | Money |
| `/budget/category/[categoryId]` | Category transactions | Money |
| `/payments` | Payments | Money |
| `/baskets`, `/baskets/[id]` | Baskets, Basket detail | Money |
| `/baskets/new`, `/baskets/[id]/edit` | New / Edit basket | Money |
| `/add-basket-item/[goalId]`, `/edit-basket-item/[goalId]/[itemId]` | Add / Edit basket item | Money |
| `/baskets/items` | Priorities | Money |
| `/baskets/forecast` | Plan and forecast | Money |
| `/baskets/analytics` | Redirect (retired) | Money |
| `/debts`, `/debts/[id]` | Debts, Debt detail | Money |
| `/debts/new`, `/debts/[id]/edit` | New / Edit debt | Money |
| `/debts/[id]/plan`, `/debts/[id]/repay` | Edit payment plan, Record repayment | Money |
| `/debts/[id]/schedule`, `/debts/schedule` | Plan a repayment | Money |
| `/debts/[id]/wallet` | Change wallet effect | Money |
| `/statistics` | Money insights | Money |
| `/categories`, `/create-category`, `/categories/[category]/edit` | Categories, New / Edit category | Money |
| `/transaction-templates`, `/transaction-templates/new`, `/transaction-templates/[id]/edit` | Templates, New / Edit template | Money |
| `/projects` | Time home (Today) | Time |
| `/projects/all`, `/projects/[project]` | All projects, Project detail | Time |
| `/projects/new`, `/projects/[project]/edit` | New / Edit project | Time |
| `/projects/insights/[projectId]` | Project insights | Time |
| `/projects/analytics` | Project analytics | Time |
| `/projects/insights` | Time insights | Time |
| `/projects/plan` | Plan your time | Time |
| `/projects/calendar`, `/projects/calendar/events/[eventId]` | Calendar, Calendar event | Time |
| `/projects/focus` | Focus | Time |
| `/areas`, `/areas/[area]`, `/areas/new`, `/areas/[area]/edit` | Areas, Area detail, New / Edit area | Time |
| `/sections/[section]`, `/sections/new`, `/sections/[section]/edit` | Section detail, New / Edit section | Time |
| `/tasks`, `/tasks/new`, `/tasks/[id]/edit` | Tasks list, New / Edit task | Time |
| `/resources` | Resources (placeholder) | Time |
| `/notifications`, `/notifications/[id]` | Notifications, Notification detail | Shared |
| `/settings`, `/settings/[section]` | Settings, a Settings section | Shared |
| `/settings/reconciliation`, `/settings/reconciliation/history` | Reconciliation, History | Shared (Money) |
| `/settings/reconcile` | Reconcile balances (data check) | Shared (Money) |
| `/settings/audit-reports`, `/settings/audit-reports/[reportId]` | Audit reports, Report | Shared (Money) |
| `/settings/backfill`, `/settings/backfill/batches` | Backfill, Batches | Shared (Money) |
| `/settings/archived-baskets` | Archived baskets | Shared (Money) |
| `/settings/import`, `/settings/export`, `/settings/download-template` | Import, Export, Download template | Shared |
| `/settings/insights`, `/settings/google-calendar`, `/settings/notifications` | Insights, Google Calendar and Notification settings | Shared |

Developer-only pages (`/dev/dashboards`, `/dev/plans`) are left out.
