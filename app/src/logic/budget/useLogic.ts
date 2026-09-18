'use client';

import { useMemo, useState } from 'react';
import { query, where, orderBy, limit, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { ruleAppliesToMonth, effectiveBudgetedAmount } from '@dreda/shared-recurrence';
import { ArrowUpRight, ArrowDownLeft, PiggyBank, type LucideIcon } from 'lucide-react';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import {
  budgetRulesRef,
  budgetRuleRef,
  statsMonthlyRef,
  transactionsRef,
  transfersRef,
  settingsRef,
  goalsRef,
} from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { toDisplay, convert, round2 } from '@/src/shared/firestore/currency';
import { toRecurrenceRule, goalLineItemAppliesToMonth } from '@/src/shared/firestore/recurrence';
import { recomputeBudgetProgressForRuleCurrentMonth } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useGoalLineItemsByGoal } from '@/src/shared/hooks/useGoalLineItemsByGoal';
import { currentMonthIndex, currentYear, toAppRecurrence } from '@/src/viewmodels/budget';
import { currencyName } from '@/src/viewmodels/currencies';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { savingsTransactionFlow, savingsTransferFlow } from '@/src/viewmodels/savingsTransfers';
import { categoryAccentColor, TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import type {
  FirestoreBudgetRule,
  StatsMonthly,
  FirestoreTransaction,
  FirestoreTransfer,
  FirestoreGoal,
  BudgetLineType,
} from '@/src/shared/firestore/types';

// Same set src/logic/transactionHistory/useLogic.ts's own card list uses —
// this panel now renders with that same card, so the icon needs to match.
const TYPE_ICONS: Record<string, LucideIcon> = {
  Expense: ArrowUpRight,
  Income: ArrowDownLeft,
  Savings: PiggyBank,
};

export const BUDGET_LINE_TYPES: BudgetLineType[] = ['Expense', 'Income', 'Savings', 'Transfer'];

// PRD-BUDGET-TRANSACTIONS.md section 3.2 — the Budget screen's own preview
// is deliberately small (a busy household can log 40+ transactions in a
// month); "View all" opens the full month-scoped list instead. The "View
// all" link itself only renders when more than this many exist (see
// BudgetScreen.tsx) — no point linking to "everything" when the preview
// already shows everything.
const MONTH_TRANSACTIONS_PREVIEW_SIZE = 4;
// Same cap src/logic/transactionHistory/useLogic.ts's own month view uses —
// generous enough for a household's real monthly transaction volume.
const MONTH_ALL_TRANSACTIONS_PAGE_SIZE = 300;

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

// Add Transaction's "no budget for this category this month" prompt
// (src/logic/addTransaction/useLogic.ts) deep-links here with the month it
// was looking at (?month=0-11&year=YYYY), so tapping "Add a budget" opens
// straight on that month instead of the real current one. Read directly off
// window.location.search rather than useSearchParams() so this screen
// doesn't need a Suspense boundary — it's 'use client'-only, nothing here
// is ever server-rendered.
function monthTargetFromSearch(): { year: number; month: number } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const monthParam = params.get('month');
  const yearParam = params.get('year');
  if (monthParam === null || yearParam === null) return null;
  const month = Number(monthParam);
  const year = Number(yearParam);
  if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year)) return null;
  return { year, month };
}

export function useLogic() {
  // The month/year shown here is just which month's plan you're viewing —
  // it never touches the app's real current date after the initial load.
  // Defaults to today's month, unless a ?month=&year= deep link (from Add
  // Transaction's "Add a budget" prompt) says otherwise.
  const [monthTarget] = useState(monthTargetFromSearch);
  const [monthIndex, setMonthIndex] = useState(() => monthTarget?.month ?? currentMonthIndex());
  const [year, setYear] = useState(() => monthTarget?.year ?? currentYear());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);

  const monthStr = `${year}-${pad2(monthIndex + 1)}`;
  // Header subtitle — now that the tracking table below carries its own
  // Expenses row (projected vs. actual), the space under the month name no
  // longer needs to repeat "left to spend" there too. Only meaningful for
  // the real current month; browsing a past/future month has no "days
  // left" to show.
  const daysLeftInMonth = useMemo(() => {
    const today = new Date();
    if (year !== today.getFullYear() || monthIndex !== today.getMonth()) return null;
    const daysInThisMonth = new Date(year, monthIndex + 1, 0).getDate();
    return Math.max(0, daysInThisMonth - today.getDate());
  }, [year, monthIndex]);
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const activeBudgetRulesQuery = useMemo(
    () => (uid ? query(budgetRulesRef(uid), where('archived', '==', false)) : null),
    [uid]
  );
  const { data: rules, loading: rulesLoading, error: rulesError } =
    useFirestoreCollection<FirestoreBudgetRule>(activeBudgetRulesQuery);
  const { data: statsMonthly, loading: statsLoading } = useFirestoreDoc<StatsMonthly>(
    useMemo(() => (uid ? statsMonthlyRef(uid, monthStr) : null), [uid, monthStr])
  );
  // Every category's actual (spent/received/saved) figure is computed live
  // off this month's real transactions rather than trusted from
  // statsMonthly.perCategorySpend — that field is only as correct as every
  // increment ever applied to it, and a since-fixed sign bug (Income
  // categories were being subtracted instead of added) left already-written
  // months with a stale, wrong cumulative value that no code fix alone can
  // correct. Re-deriving from source each time is self-healing: it can never
  // drift from what the transactions themselves say, past or future.
  const monthAllTransactionsQuery = useMemo(
    () => (uid ? query(transactionsRef(uid), where('month', '==', monthStr), limit(MONTH_ALL_TRANSACTIONS_PAGE_SIZE)) : null),
    [uid, monthStr]
  );
  const { data: monthAllTransactionDocs, loading: monthAllTransactionsLoading } =
    useFirestoreCollection<FirestoreTransaction>(monthAllTransactionsQuery);
  // Savings can also move via a transfer (wallet -> savings, or any transfer
  // that happens to touch a Savings Account) — FirestoreTransfer has no
  // `month` field to filter on directly, so this is a plain date-range query
  // over this viewed month's own bounds instead.
  const monthTransfersQuery = useMemo(() => {
    if (!uid) return null;
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return query(transfersRef(uid), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)));
  }, [uid, year, monthIndex]);
  const { data: monthTransferDocs, loading: monthTransfersLoading } =
    useFirestoreCollection<FirestoreTransfer>(monthTransfersQuery);
  // A Savings Account's currentBalance is always TODAY's live total, never a
  // snapshot — so browsing a past month can't just read it directly, that
  // would show today's balance labeled as January's. Reconstructing what it
  // was at the end of that past month instead: today's live total minus
  // every savings flow (transaction + transfer) that happened strictly
  // after that month closed. For the current/a future month there's nothing
  // "after" it yet, so the live total already IS the right answer and these
  // two queries stay off.
  const isPastMonth = year < currentYear() || (year === currentYear() && monthIndex < currentMonthIndex());
  const sinceMonthEndTransactionsQuery = useMemo(() => {
    if (!uid || !isPastMonth) return null;
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return query(transactionsRef(uid), where('date', '>', Timestamp.fromDate(end)));
  }, [uid, isPastMonth, year, monthIndex]);
  const { data: sinceMonthEndTransactionDocs, loading: sinceMonthEndTransactionsLoading } =
    useFirestoreCollection<FirestoreTransaction>(sinceMonthEndTransactionsQuery);
  const sinceMonthEndTransfersQuery = useMemo(() => {
    if (!uid || !isPastMonth) return null;
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return query(transfersRef(uid), where('date', '>', Timestamp.fromDate(end)));
  }, [uid, isPastMonth, year, monthIndex]);
  const { data: sinceMonthEndTransferDocs, loading: sinceMonthEndTransfersLoading } =
    useFirestoreCollection<FirestoreTransfer>(sinceMonthEndTransfersQuery);
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: allCategories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();
  // Reconciling the app's two budgeting methods: a category's own budgeted
  // estimate is inherently "unplanned" (a household types in a rough
  // figure, nobody decided in advance exactly what each dollar is for) —
  // a goal's line items are the alternative, where each dollar has a
  // specific, named purpose. "Dedicated" is how much of this month's
  // BUDGETED estimate a goal item already claims (see dedicatedByCategory
  // below); "unplanned" is the rest. Every active goal's line items, same
  // fetch shape Home/Statistics already use for their own goal-derived
  // figures.
  const goalsQuery = useMemo(() => (uid ? query(goalsRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: goalDocs, loading: goalsLoading } = useFirestoreCollection<FirestoreGoal>(goalsQuery);
  const { itemsByGoal, loading: goalItemsLoading } = useGoalLineItemsByGoal(goalDocs);
  const goalCurrency = useMemo(() => new Map(goalDocs.map((g) => [g.id, g.currency])), [goalDocs]);
  const goalType = useMemo(() => new Map(goalDocs.map((g) => [g.id, g.type ?? 'Expense'])), [goalDocs]);

  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const accountType = useMemo(() => new Map(accounts.map((a) => [a.id, a.type])), [accounts]);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const categoryName = useMemo(() => new Map(allCategories.map((c) => [c.id, c.name])), [allCategories]);
  const categoryTransactionType = useMemo(
    () => new Map(allCategories.map((c) => [c.id, c.transactionType])),
    [allCategories]
  );
  // A rule written before FirestoreBudgetRule.type existed has no explicit
  // type — it's always Expense/Income/Savings (Transfer rules are new, they
  // always set it), so fall back to whatever type its linked category is.
  function budgetLineType(rule: FirestoreBudgetRule): BudgetLineType {
    return rule.type ?? categoryTransactionType.get(rule.categoryId) ?? 'Expense';
  }

  // Same Income-vs-Expense sign convention as writeTransactionContribution
  // (aggregation.ts): for an Income category a normal Inflow counts as
  // positive progress, the opposite of an Expense/Savings category's
  // Outflow. In base currency, matching what statsMonthly.perCategorySpend
  // used to hold, so every downstream toDisplay(ctx, ..., ctx.base) call
  // below keeps working unchanged.
  const perCategoryActualBase = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of monthAllTransactionDocs) {
      if (!t.categoryId) continue;
      const native = accountCurrency.get(t.accountId) ?? ctx.base;
      const signedAmount = t.direction === 'Inflow' ? t.amount : -t.amount;
      const contribution = t.type === 'Income' ? signedAmount : -signedAmount;
      const contributionBase = convert(contribution, native, ctx.base, ctx.rates);
      totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + contributionBase);
    }
    // A Transfer-type budget category tracks the COST of transferring (the
    // charges — moving your own money between your own accounts isn't
    // spend, same reasoning Goals' own Transfers dashboard card already
    // uses), keyed by the transfer's own `kind` — the same
    // TRANSFER_CATEGORIES string a Transfer-type budget rule's own
    // categoryId already reuses (src/logic/addBudgetCategory/useLogic.ts),
    // so this Map's keys line up with `categories` below reading
    // perCategoryActualBase.get(rule.categoryId) for either kind of rule
    // without it needing to know the difference.
    for (const t of monthTransferDocs) {
      if (!t.kind || !t.charges) continue;
      const native = accountCurrency.get(t.fromAccountId) ?? ctx.base;
      const contributionBase = convert(t.charges, native, ctx.base, ctx.rates);
      totals.set(t.kind, (totals.get(t.kind) ?? 0) + contributionBase);
    }
    return totals;
  }, [monthAllTransactionDocs, monthTransferDocs, accountCurrency, ctx]);

  // How much of THIS MONTH'S BUDGETED estimate a goal already claims —
  // every active goal's line item that applies to this month
  // (goalLineItemAppliesToMonth), regardless of whether it's actually been
  // completed/paid yet. A goal item is "dedicated" the moment it exists
  // and applies, not only once it's been settled — this is a claim on the
  // ESTIMATE, not a slice of actual spend (see this function's own header
  // comment for the full reasoning). Grouped by categoryId, which a
  // Transfer goal's own item already stores as a TRANSFER_CATEGORIES kind
  // string (same convention a Transfer-type budget rule's own categoryId
  // uses), so this Map's keys line up with ordinary category ids with no
  // special-casing needed below — only the amount picked (charges, not the
  // full amount moved, same reasoning Goals' own Transfers dashboard card
  // uses) depends on the goal's type.
  const dedicatedByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    const targetMonth = monthIndex + 1;
    for (const [goalId, items] of Object.entries(itemsByGoal)) {
      const nativeCurrency = goalCurrency.get(goalId) ?? ctx.base;
      const isTransferGoal = goalType.get(goalId) === 'Transfer';
      for (const item of items) {
        if (!item.categoryId) continue;
        const occurrence = goalLineItemAppliesToMonth(item, year, targetMonth);
        if (!occurrence) continue;
        const amount = (isTransferGoal ? (item.charges ?? 0) : item.amount) * occurrence.multiplier;
        const contributionBase = convert(amount, nativeCurrency, ctx.base, ctx.rates);
        totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + contributionBase);
      }
    }
    return totals;
  }, [itemsByGoal, goalCurrency, goalType, ctx, year, monthIndex]);

  const categories = useMemo(() => {
    const [y, m] = monthStr.split('-').map(Number);
    const fromRules = rules
      .map((rule) => {
        const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), y, m);
        if (!occurrence || rule.excludedMonths?.includes(monthStr)) return null;
        const ruleNative = rule.accountId ? accountCurrency.get(rule.accountId) ?? ctx.base : ctx.base;
        const budgeted = round2(
          toDisplay(ctx, effectiveBudgetedAmount(rule.budgetedAmount, occurrence.multiplier, rule.monthOverrides, monthStr), ruleNative)
        );
        const hasMonthOverride = Boolean(rule.monthOverrides?.[monthStr]);
        const spentBase = perCategoryActualBase.get(rule.categoryId) ?? 0;
        const spent = round2(toDisplay(ctx, spentBase, ctx.base));
        // dedicated/unplanned are a breakdown of BUDGETED (the estimate),
        // not of spent — see dedicatedByCategory's own header comment.
        const dedicatedBase = dedicatedByCategory.get(rule.categoryId) ?? 0;
        const dedicated = round2(toDisplay(ctx, dedicatedBase, ctx.base));
        const unplanned = round2(budgeted - dedicated);
        const bucket = toAppRecurrence(rule);
        return {
          id: rule.id,
          categoryId: rule.categoryId,
          type: budgetLineType(rule),
          category: categoryName.get(rule.categoryId) ?? rule.categoryId,
          description: rule.description,
          budgeted,
          spent,
          dedicated,
          unplanned,
          recurrence: bucket.recurrence,
          recurrenceMonths: bucket.recurrenceMonths,
          endMonthIndex: bucket.endMonthIndex,
          endYear: bucket.endYear,
          hasMonthOverride,
          isAutoIncluded: false,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // A goal can dedicate money to a category with no budget rule of its
    // own at all — the goal item itself IS the plan for that category, so
    // it shouldn't take a separate manual "Add budget category" step to
    // even show up here. Synthesized, never written to Firestore (no rule
    // doc exists to edit/delete — BudgetScreen.tsx hides those actions for
    // isAutoIncluded entries) — same "derive it live from goals, don't
    // persist a second copy" approach dedicatedByCategory itself already
    // takes. budgeted is exactly the dedicated amount, so unplanned is
    // always 0: the category's entire plan comes from the goal.
    const coveredCategoryIds = new Set(fromRules.map((entry) => entry.categoryId));
    const autoIncluded: typeof fromRules = [];
    for (const [categoryId, dedicatedBase] of dedicatedByCategory) {
      if (coveredCategoryIds.has(categoryId) || dedicatedBase <= 0) continue;
      const dedicated = round2(toDisplay(ctx, dedicatedBase, ctx.base));
      const spentBase = perCategoryActualBase.get(categoryId) ?? 0;
      const spent = round2(toDisplay(ctx, spentBase, ctx.base));
      const type: BudgetLineType = TRANSFER_CATEGORIES.includes(categoryId as (typeof TRANSFER_CATEGORIES)[number])
        ? 'Transfer'
        : (categoryTransactionType.get(categoryId) ?? 'Expense');
      autoIncluded.push({
        id: `auto:${categoryId}`,
        categoryId,
        type,
        category: categoryName.get(categoryId) ?? categoryId,
        description: '',
        budgeted: dedicated,
        spent,
        dedicated,
        unplanned: 0,
        recurrence: 'once',
        recurrenceMonths: undefined,
        endMonthIndex: undefined,
        endYear: undefined,
        hasMonthOverride: false,
        isAutoIncluded: true,
      });
    }

    // Highest-spent-first — which categories are actually active this
    // month matters more than an arbitrary insertion order once the list
    // is capped (PRD-BUDGET-TRANSACTIONS.md section 8, decision 2).
    return [...fromRules, ...autoIncluded].sort((a, b) => b.spent - a.spent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, monthStr, accountCurrency, categoryName, categoryTransactionType, ctx, perCategoryActualBase, dedicatedByCategory]);

  const currency = ctx.display;
  // Currency badge on the total card — same switch-and-persist write
  // Settings' own currency picker and Home's currency chip make (see
  // src/logic/home/useLogic.ts), just surfaced as a compact menu here
  // instead of a full picker modal. exchangeRates' own doc IDs are the
  // selectable codes — currencyName only supplies a human label for one.
  const { data: exchangeRates } = useExchangeRates();
  const currencyOptions = useMemo(
    () => exchangeRates.map((rate) => ({ code: rate.id, name: currencyName(rate.id) })),
    [exchangeRates]
  );
  const [currencySaving, setCurrencySaving] = useState(false);
  async function setCurrency(code: string) {
    if (currencySaving || !uid || code === currency) return;
    setCurrencySaving(true);
    try {
      await updateDoc(settingsRef(uid), { displayCurrency: code });
    } finally {
      setCurrencySaving(false);
    }
  }

  // Bottom-up, not a separately typed-in target: "how much you're planning
  // to spend/receive/save this month" is always exactly the sum of the
  // budget lines you've actually entered for that type — there's no more
  // top-down budgetPlans/{month} figure to keep in sync with that by hand.
  const expenseCategories = useMemo(() => categories.filter((entry) => entry.type === 'Expense'), [categories]);
  const incomeCategories = useMemo(() => categories.filter((entry) => entry.type === 'Income'), [categories]);
  const savingsCategories = useMemo(() => categories.filter((entry) => entry.type === 'Savings'), [categories]);
  const totalExpenseBudgeted = round2(expenseCategories.reduce((sum, entry) => sum + entry.budgeted, 0));
  const totalExpenseSpent = round2(expenseCategories.reduce((sum, entry) => sum + entry.spent, 0));
  const plannedIncome = round2(incomeCategories.reduce((sum, entry) => sum + entry.budgeted, 0));
  const plannedSavings = round2(savingsCategories.reduce((sum, entry) => sum + entry.budgeted, 0));
  // What you'd actually have left to spend after saving — if your planned
  // expenses are more than that, you're planning to overspend this month
  // even before anything is actually bought. Only worth flagging once
  // there's an actual income plan to compare against.
  const availableToSpend = plannedIncome - plannedSavings;
  const overspendAmount = round2(totalExpenseBudgeted - availableToSpend);
  const isOverspending = plannedIncome > 0 && overspendAmount > 0;
  // "Left to budget" — the headline card's own summary line. Not "left to
  // spend": it's how much of the projected income (after planned savings)
  // still has no Expense budget line claiming it at all. Floored at 0 —
  // once every dollar of projected income is accounted for (or the plan
  // overspends it), there's nothing left to budget; that overspent case is
  // isOverspending's own warning above, not a negative number here.
  const leftToBudget = Math.max(0, round2(availableToSpend - totalExpenseBudgeted));

  // Actual income for the month — derived from real transactions, never
  // typed in, and — same bottom-up shift as planned above — summed per
  // category rather than off one flat statsMonthly.totalIncome figure, so a
  // transaction against any Income category (budgeted this month or not)
  // always moves the actual total. A month with nothing logged yet just
  // reads 0/0%; there's no other way to know what actually came in.
  const incomeCategoryIds = useMemo(
    () => new Set(allCategories.filter((category) => category.transactionType === 'Income').map((c) => c.id)),
    [allCategories]
  );
  function sumPerCategory(categoryIds: Set<string>) {
    let sum = 0;
    for (const [categoryId, amount] of perCategoryActualBase) {
      if (categoryIds.has(categoryId)) sum += amount;
    }
    return sum;
  }
  // Floored at 0 — a correction/refund against an Income category can drive
  // the raw sum below zero, but "money received this month" reading negative
  // would only confuse the summary card, so it never displays as such.
  const actualIncome = Math.max(0, round2(toDisplay(ctx, sumPerCategory(incomeCategoryIds), ctx.base)));
  // Savings is account-type based now, not category based (see
  // src/viewmodels/savingsTransfers.ts). The tracking table's Savings row
  // carries two different "actual" figures side by side: this month's real
  // flow into/out of Savings Accounts (actualSavingsThisMonth, so it reads
  // the same way as Income/Expenses' own actual-this-month figure), and the
  // live compounding total across every Savings Account regardless of when
  // it was saved (cumulativeSavings) — a Savings Account's own
  // currentBalance already bakes in every transaction/transfer that ever
  // touched it, so the cumulative figure needs no query of its own.
  const actualSavingsThisMonth = round2(
    monthAllTransactionDocs.reduce(
      (sum, t) => sum + toDisplay(ctx, savingsTransactionFlow(t, accountType), accountCurrency.get(t.accountId) ?? ctx.base),
      0
    ) +
      monthTransferDocs.reduce(
        (sum, t) => sum + toDisplay(ctx, savingsTransferFlow(t, accountType), accountCurrency.get(t.fromAccountId) ?? ctx.base),
        0
      )
  );
  const liveCumulativeSavings = round2(
    accounts
      .filter(isSavingsAccount)
      .reduce((sum, account) => sum + toDisplay(ctx, account.currentBalance, account.currency), 0)
  );
  // Undo every savings flow that happened after the viewed month closed,
  // landing back on what the cumulative total actually was at that month's
  // end rather than today's.
  const savingsFlowSinceMonthEnd = isPastMonth
    ? round2(
        sinceMonthEndTransactionDocs.reduce(
          (sum, t) => sum + toDisplay(ctx, savingsTransactionFlow(t, accountType), accountCurrency.get(t.accountId) ?? ctx.base),
          0
        ) +
          sinceMonthEndTransferDocs.reduce(
            (sum, t) => sum + toDisplay(ctx, savingsTransferFlow(t, accountType), accountCurrency.get(t.fromAccountId) ?? ctx.base),
            0
          )
      )
    : 0;
  const cumulativeSavings = isPastMonth ? round2(liveCumulativeSavings - savingsFlowSinceMonthEnd) : liveCumulativeSavings;
  // A percent-of-target badge doesn't say anything useful on its own ("85%"
  // of what, in which direction?) — the tracking table's Income/Expenses
  // rows now carry the actual gap amount instead. Income: how much more or
  // less came in than was planned (positive = received more than planned).
  // Expenses: how far over the budgeted amount spending actually went
  // (positive = overspent by that much; zero or negative = at or under
  // budget).
  const incomeVariance = round2(actualIncome - plannedIncome);
  const expenseOverBudget = round2(totalExpenseSpent - totalExpenseBudgeted);

  function openMonthPicker() {
    setPickerYear(year);
    setMonthPickerOpen(true);
  }

  function chooseMonth(index: number) {
    setMonthIndex(index);
    setYear(pickerYear);
    setMonthPickerOpen(false);
  }

  // Deleting a one-off ("Once") rule removes it outright — there's no other
  // month it could still apply to. Deleting a recurring rule while viewing
  // one month only skips that month (e.g. skip a monthly subscription for
  // September without touching August or October) — see excludedMonths on
  // FirestoreBudgetRule.
  async function handleDelete(id: string) {
    if (!uid) return;
    const rule = rules.find((entry) => entry.id === id);
    if (rule && rule.frequency !== 'Once') {
      await updateDoc(budgetRuleRef(uid, id), { excludedMonths: arrayUnion(monthStr) });
    } else {
      await updateDoc(budgetRuleRef(uid, id), { archived: true });
    }
    await recomputeBudgetProgressForRuleCurrentMonth(uid, id);
  }

  // Where the "Record Transaction" button (PRD-BUDGET-TRANSACTIONS.md
  // section 3.2) sends them — Add Transaction, pre-dated into whichever
  // month this screen is showing (src/logic/addTransaction/useLogic.ts
  // reads these same two params). Always visible now (it replaced the old
  // bottom-of-page button that only showed on a non-current month — see
  // section 8, decision 1), so there's no separate visibility flag anymore.
  const retroTransactionHref = `/add-transaction?month=${monthIndex}&year=${year}`;

  // "This Month's Transactions" panel preview (PRD-BUDGET-TRANSACTIONS.md
  // section 3.2) — reuses the existing (month ASC, date DESC) index, no new
  // index needed (section 2.3).
  const monthTransactionsQuery = useMemo(
    () =>
      uid
        ? query(
            transactionsRef(uid),
            where('month', '==', monthStr),
            orderBy('date', 'desc'),
            limit(MONTH_TRANSACTIONS_PREVIEW_SIZE)
          )
        : null,
    [uid, monthStr]
  );
  const { data: monthTransactionDocs, loading: monthTransactionsLoading } =
    useFirestoreCollection<FirestoreTransaction>(monthTransactionsQuery);

  // Same card shape src/logic/transactionHistory/useLogic.ts's own list
  // uses — this panel renders with that exact same card component styling.
  const monthTransactions = useMemo(
    () =>
      monthTransactionDocs.map((transaction) => {
        const nativeCurrency = accountCurrency.get(transaction.accountId) ?? ctx.base;
        const title = categoryName.get(transaction.categoryId ?? '') ?? transaction.categoryId ?? '—';
        return {
          id: transaction.id,
          title,
          description: transaction.description,
          account: accountName.get(transaction.accountId) ?? transaction.accountId,
          amount: round2(toDisplay(ctx, transaction.amount, nativeCurrency)),
          currency: ctx.display,
          date: transaction.date.toDate().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
          icon: TYPE_ICONS[transaction.type] ?? ArrowUpRight,
          iconColor: categoryAccentColor(title),
          editHref: `/edit-transaction/${transaction.id}`,
        };
      }),
    [monthTransactionDocs, accountCurrency, accountName, categoryName, ctx]
  );
  // The preview only ever fetches MONTH_TRANSACTIONS_PREVIEW_SIZE — the real
  // total for "View all N transactions this month" comes from the same
  // statsMonthly doc the Budget screen's own totals already read.
  const monthTransactionCount = statsMonthly?.transactionCount ?? 0;
  // Month-scoped (not category-scoped) transaction list — the same
  // TransactionHistoryScreen the category drill-down uses, filtered by
  // month instead (PRD-BUDGET-TRANSACTIONS.md section 3.3).
  const viewAllMonthTransactionsHref = `/transactions?month=${monthIndex}&year=${year}`;

  return {
    monthIndex,
    year,
    daysLeftInMonth,
    retroTransactionHref,
    monthTransactions,
    monthTransactionsLoading,
    monthTransactionCount,
    viewAllMonthTransactionsHref,
    // Where "Add category" sends them — its own page (see
    // src/logic/addBudgetCategory/useLogic.ts). "Edit" on an existing line
    // sends to its own page too (src/logic/editBudgetCategory/useLogic.ts),
    // not a modal — BudgetScreen.tsx builds that href per-entry since it
    // needs the entry's own rule id.
    addBudgetCategoryHref: `/add-budget-category?month=${monthIndex}&year=${year}`,
    monthPickerOpen,
    setMonthPickerOpen,
    pickerYear,
    setPickerYear,
    categories,
    currency,
    currencyOptions,
    setCurrency,
    totalExpenseBudgeted,
    totalExpenseSpent,
    leftToBudget,
    plannedIncome,
    plannedSavings,
    actualIncome,
    actualSavingsThisMonth,
    cumulativeSavings,
    incomeVariance,
    expenseOverBudget,
    availableToSpend,
    overspendAmount,
    isOverspending,
    loading:
      authLoading ||
      rulesLoading ||
      statsLoading ||
      monthAllTransactionsLoading ||
      monthTransfersLoading ||
      sinceMonthEndTransactionsLoading ||
      sinceMonthEndTransfersLoading ||
      goalsLoading ||
      goalItemsLoading ||
      accountsLoading ||
      categoriesLoading ||
      ctxLoading,
    error: rulesError,
    openMonthPicker,
    chooseMonth,
    handleDelete,
  };
}
