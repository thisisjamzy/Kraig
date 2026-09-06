'use client';

import { useMemo, useState } from 'react';
import { query, where, orderBy, limit, updateDoc, arrayUnion } from 'firebase/firestore';
import { ruleAppliesToMonth, effectiveBudgetedAmount } from '@dreda/shared-recurrence';
import { ArrowUpRight, ArrowDownLeft, PiggyBank, type LucideIcon } from 'lucide-react';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { budgetRulesRef, budgetRuleRef, statsMonthlyRef, transactionsRef, settingsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { toDisplay, convert, round2 } from '@/src/shared/firestore/currency';
import { toRecurrenceRule } from '@/src/shared/firestore/recurrence';
import { recomputeBudgetProgressForRuleCurrentMonth, recomputeBudgetProgressForRuleAndMonth } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { currentMonthIndex, currentYear, toFrequencyFields, type Recurrence } from '@/src/viewmodels/budget';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import { currencyName } from '@/src/viewmodels/currencies';
import { walletColor } from '@/src/viewmodels/wallets';
import type {
  FirestoreBudgetRule,
  StatsMonthly,
  FirestoreTransaction,
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

function toAppRecurrence(
  rule: FirestoreBudgetRule
): { recurrence: Recurrence; recurrenceMonths?: number; endMonthIndex?: number; endYear?: number } {
  if (rule.frequency === 'Once') return { recurrence: 'once' };
  if (rule.endCondition === 'After Occurrences' && rule.endOccurrences) {
    return { recurrence: 'limited', recurrenceMonths: rule.endOccurrences };
  }
  if (rule.endCondition === 'On Date' && rule.endDate) {
    const end = rule.endDate.toDate();
    return { recurrence: 'until', endMonthIndex: end.getMonth(), endYear: end.getFullYear() };
  }
  return { recurrence: 'monthly' };
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditTypeState] = useState<BudgetLineType>('Expense');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDescriptionDraft, setEditDescriptionDraft] = useState('');
  const [editAmountDraft, setEditAmountDraft] = useState('');
  const [editRecurrence, setEditRecurrenceState] = useState<Recurrence>('monthly');
  const [editRecurrenceMonths, setEditRecurrenceMonths] = useState('3');
  const [editEndMonthIndex, setEditEndMonthIndex] = useState(currentMonthIndex());
  const [editEndYear, setEditEndYear] = useState(currentYear());
  const [editEndPickerOpen, setEditEndPickerOpen] = useState(false);
  const [editEndPickerYear, setEditEndPickerYear] = useState(editEndYear);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Switching type clears whatever category was picked for the old type —
  // it almost certainly doesn't belong to the new one's option list.
  function setEditType(type: BudgetLineType) {
    setEditTypeState(type);
    setEditCategoryId('');
  }

  // Picking "until" needs a real end month to point at — seed it fresh off
  // today's month each time (openEdit re-seeds it from the rule's own
  // existing end date when there is one), rather than a stale leftover.
  function setEditRecurrence(next: Recurrence) {
    if (next === 'until' && editRecurrence !== 'until') {
      setEditEndMonthIndex(currentMonthIndex());
      setEditEndYear(currentYear());
    }
    setEditRecurrenceState(next);
  }

  function openEditEndPicker() {
    setEditEndPickerYear(editEndYear);
    setEditEndPickerOpen(true);
  }
  function chooseEditEndMonth(index: number) {
    setEditEndMonthIndex(index);
    setEditEndYear(editEndPickerYear);
    setEditEndPickerOpen(false);
  }

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
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: allCategories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  // Same color-per-account convention Home's wallet chart and
  // TransactionHistoryScreen use (src/viewmodels/wallets.ts's walletColor,
  // keyed by an account's own fixed position in the accounts list) — this
  // panel's cards use the exact same card as that screen, so need the same
  // colors.
  const accountColor = useMemo(
    () => new Map(accounts.map((account, index) => [account.id, walletColor(index)])),
    [accounts]
  );
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
    return totals;
  }, [monthAllTransactionDocs, accountCurrency, ctx]);

  const categories = useMemo(() => {
    const [y, m] = monthStr.split('-').map(Number);
    return rules
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
        const bucket = toAppRecurrence(rule);
        return {
          id: rule.id,
          categoryId: rule.categoryId,
          type: budgetLineType(rule),
          category: categoryName.get(rule.categoryId) ?? rule.categoryId,
          description: rule.description,
          budgeted,
          spent,
          recurrence: bucket.recurrence,
          recurrenceMonths: bucket.recurrenceMonths,
          endMonthIndex: bucket.endMonthIndex,
          endYear: bucket.endYear,
          hasMonthOverride,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      // Highest-spent-first — which categories are actually active this
      // month matters more than an arbitrary insertion order once the list
      // is capped (PRD-BUDGET-TRANSACTIONS.md section 8, decision 2).
      .sort((a, b) => b.spent - a.spent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, monthStr, accountCurrency, categoryName, categoryTransactionType, ctx, perCategoryActualBase]);

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

  // Actual income/savings for the month — derived from real transactions,
  // never typed in, and — same bottom-up shift as planned above — summed
  // per category rather than off one flat statsMonthly.totalIncome figure,
  // so a transaction against any Income/Savings category (budgeted this
  // month or not) always moves its type's own actual total. A month with
  // nothing logged yet just reads 0/0%; there's no other way to know what
  // actually came in or got saved.
  const incomeCategoryIds = useMemo(
    () => new Set(allCategories.filter((category) => category.transactionType === 'Income').map((c) => c.id)),
    [allCategories]
  );
  const savingsCategoryIds = useMemo(
    () => new Set(allCategories.filter((category) => category.transactionType === 'Savings').map((c) => c.id)),
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
  const actualSavings = Math.max(0, round2(toDisplay(ctx, sumPerCategory(savingsCategoryIds), ctx.base)));
  const incomeProgressPercent = plannedIncome > 0 ? Math.round((actualIncome / plannedIncome) * 100) : 0;
  const savingsProgressPercent = plannedSavings > 0 ? Math.round((actualSavings / plannedSavings) * 100) : 0;
  // Expenses row of the same tracking table — projected is just
  // totalExpenseBudgeted (already summed above), actual is
  // totalExpenseSpent. Unlike Income/Savings, going over 100% here is the
  // bad outcome (overspent), not the good one — see percentClass vs.
  // expensePercentClass in BudgetScreen.tsx.
  const expenseProgressPercent =
    totalExpenseBudgeted > 0 ? Math.round((totalExpenseSpent / totalExpenseBudgeted) * 100) : 0;

  const budgetedCategoryIds = new Set(categories.map((entry) => entry.categoryId));
  // Any category — Expense, Income, or Savings — can carry a monthly
  // budget line: an expense envelope, a projected-income figure, or a
  // savings target, all read back through the same statsBudgetProgress
  // mechanism (see aggregation.ts, which never assumes Expense-only).
  // Transfer has no categories/{id} docs at all — TRANSFER_CATEGORIES (the
  // same fixed 3-kind list Add Transaction's transfer step uses) stands in
  // for them, so you can plan out "Wallet to savings" etc. the same way.
  function categoryOptionsForType(type: BudgetLineType, keepId?: string) {
    const options: { id: string; name: string }[] =
      type === 'Transfer'
        ? TRANSFER_CATEGORIES.map((kind) => ({ id: kind, name: kind }))
        : allCategories
            .filter((category) => category.transactionType === type)
            .map((category) => ({ id: category.id, name: category.name }));
    return options.filter((option) => !budgetedCategoryIds.has(option.id) || option.id === keepId);
  }
  // Editing: same list, but also keeps whichever category this rule is
  // already assigned to (that one's "taken" by this very rule, not another).
  const editAvailableCategories = categoryOptionsForType(editType, editCategoryId);

  function openMonthPicker() {
    setPickerYear(year);
    setMonthPickerOpen(true);
  }

  function chooseMonth(index: number) {
    setMonthIndex(index);
    setYear(pickerYear);
    setMonthPickerOpen(false);
  }

  function openEdit(entry: {
    id: string;
    categoryId: string;
    type: BudgetLineType;
    description: string;
    budgeted: number;
    recurrence: Recurrence;
    recurrenceMonths?: number;
    endMonthIndex?: number;
    endYear?: number;
  }) {
    setEditingId(entry.id);
    setEditTypeState(entry.type);
    setEditCategoryId(entry.categoryId);
    setEditDescriptionDraft(entry.description);
    setEditAmountDraft(String(entry.budgeted || ''));
    // Sets the raw state directly, not the setEditRecurrence wrapper — that
    // wrapper's "reset the end month to today" side effect is only for a
    // person actively switching to 'until' in the picker, not for seeding
    // the form from a rule that may already have its own real end date.
    setEditRecurrenceState(entry.recurrence);
    setEditRecurrenceMonths(String(entry.recurrenceMonths ?? 3));
    setEditEndMonthIndex(entry.endMonthIndex ?? currentMonthIndex());
    setEditEndYear(entry.endYear ?? currentYear());
    setEditError(null);
  }

  // 'thisMonth': only the amount changes, only for monthStr (the month
  // currently being viewed, which may be in the past) — categoryId/type/
  // description/recurrence stay whatever the series already has, since
  // those describe the whole line, not one month of it. 'allMonths' is the
  // original whole-rule edit, unchanged. A 'Once' rule has no "other
  // months" to distinguish from, so the screen never offers 'thisMonth' for
  // one — always called with 'allMonths' there.
  async function handleSaveEdit(scope: 'thisMonth' | 'allMonths') {
    if (!editingId || !editCategoryId || savingEdit || !uid) return;
    const amount = Number(editAmountDraft.replace(/[^0-9]/g, ''));
    setSavingEdit(true);
    setEditError(null);
    try {
      if (scope === 'thisMonth') {
        await updateDoc(budgetRuleRef(uid, editingId), {
          [`monthOverrides.${monthStr}`]: { budgetedAmount: amount },
        });
        await recomputeBudgetProgressForRuleAndMonth(uid, editingId, monthStr);
      } else {
        await updateDoc(budgetRuleRef(uid, editingId), {
          categoryId: editCategoryId,
          type: editType,
          description: editDescriptionDraft.trim(),
          budgetedAmount: amount,
          ...toFrequencyFields(editRecurrence, editRecurrenceMonths, { monthIndex: editEndMonthIndex, year: editEndYear }),
        });
        await recomputeBudgetProgressForRuleCurrentMonth(uid, editingId);
      }
      setEditingId(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not update this budget item.');
    } finally {
      setSavingEdit(false);
    }
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

  const editingCategory = categories.find((entry) => entry.id === editingId) ?? null;
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
        return {
          id: transaction.id,
          title: categoryName.get(transaction.categoryId ?? '') ?? transaction.categoryId ?? '—',
          description: transaction.description,
          account: accountName.get(transaction.accountId) ?? transaction.accountId,
          amount: round2(toDisplay(ctx, transaction.amount, nativeCurrency)),
          currency: ctx.display,
          date: transaction.date.toDate().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
          icon: TYPE_ICONS[transaction.type] ?? ArrowUpRight,
          iconColor: accountColor.get(transaction.accountId) ?? walletColor(0),
          editHref: `/edit-transaction/${transaction.id}`,
        };
      }),
    [monthTransactionDocs, accountCurrency, accountName, accountColor, categoryName, ctx]
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
    // Where "Add category" sends them — its own page now, not a modal (see
    // src/logic/addBudgetCategory/useLogic.ts), so there's room there for
    // "can't find your category? create one" without stacking a modal on a
    // modal.
    addBudgetCategoryHref: `/add-budget-category?month=${monthIndex}&year=${year}`,
    monthPickerOpen,
    setMonthPickerOpen,
    pickerYear,
    setPickerYear,
    categories,
    currency,
    currencyOptions,
    setCurrency,
    editingCategory,
    editAvailableCategories,
    editType,
    setEditType,
    editCategoryId,
    setEditCategoryId,
    editDescriptionDraft,
    setEditDescriptionDraft,
    editAmountDraft,
    setEditAmountDraft,
    editRecurrence,
    setEditRecurrence,
    editRecurrenceMonths,
    setEditRecurrenceMonths,
    editEndMonthIndex,
    editEndYear,
    editEndPickerOpen,
    openEditEndPicker,
    closeEditEndPicker: () => setEditEndPickerOpen(false),
    editEndPickerYear,
    setEditEndPickerYear,
    chooseEditEndMonth,
    savingEdit,
    editError,
    totalExpenseBudgeted,
    totalExpenseSpent,
    leftToBudget,
    plannedIncome,
    plannedSavings,
    actualIncome,
    actualSavings,
    incomeProgressPercent,
    savingsProgressPercent,
    expenseProgressPercent,
    availableToSpend,
    overspendAmount,
    isOverspending,
    loading:
      authLoading ||
      rulesLoading ||
      statsLoading ||
      monthAllTransactionsLoading ||
      accountsLoading ||
      categoriesLoading ||
      ctxLoading,
    error: rulesError,
    openMonthPicker,
    chooseMonth,
    openEdit,
    handleSaveEdit,
    handleDelete,
    setEditingId,
  };
}
