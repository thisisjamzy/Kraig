'use client';

import { useEffect, useMemo, useState } from 'react';
import { query, where, orderBy, limit, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ruleAppliesToMonth, effectiveBudgetedAmount } from '@dreda/shared-recurrence';
import { ArrowUpRight, ArrowDownLeft, PiggyBank, type LucideIcon } from 'lucide-react';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { budgetRulesRef, budgetRuleRef, statsMonthlyRef, budgetPlanRef, transactionsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { toRecurrenceRule } from '@/src/shared/firestore/recurrence';
import { recomputeBudgetProgressForRuleCurrentMonth, recomputeBudgetProgressForRuleAndMonth } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { currentMonthIndex, currentYear, toFrequencyFields, type Recurrence } from '@/src/viewmodels/budget';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import { walletColor } from '@/src/viewmodels/wallets';
import type {
  FirestoreBudgetRule,
  StatsMonthly,
  FirestoreBudgetPlan,
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

  // Total budget: editable directly on the page (the original, simpler
  // pattern) — its own draft/save, independent of the config modal below.
  const [totalBudgetDraft, setTotalBudgetDraft] = useState('');
  const [totalBudgetDraftSeededFor, setTotalBudgetDraftSeededFor] = useState<string | null>(null);
  const [savingTotalBudget, setSavingTotalBudget] = useState(false);

  // Config modal: projected income + how much of it you plan to save —
  // the two figures income/savings tracking below compares against actuals.
  const [configOpen, setConfigOpen] = useState(false);
  const [projectedIncomeDraft, setProjectedIncomeDraft] = useState('');
  const [savingsMode, setSavingsMode] = useState<'fixed' | 'percent'>('fixed');
  const [savingsValueDraft, setSavingsValueDraft] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

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
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: allCategories, loading: categoriesLoading } = useCategories();
  const { data: plan, loading: planLoading } = useFirestoreDoc<FirestoreBudgetPlan>(
    useMemo(() => (uid ? budgetPlanRef(uid, monthStr) : null), [uid, monthStr])
  );
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
        const spentBase = statsMonthly?.perCategorySpend?.[rule.categoryId] ?? 0;
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
  }, [rules, monthStr, accountCurrency, categoryName, categoryTransactionType, ctx, statsMonthly]);

  const currency = ctx.display;
  const totalBudgeted = round2(categories.reduce((sum, entry) => sum + entry.budgeted, 0));
  const totalSpent = round2(categories.reduce((sum, entry) => sum + entry.spent, 0));
  // budgetPlans/{month} figures are entered directly in the display
  // currency (there's no "native" source currency to convert from the way
  // an account/transaction amount has), so read back as-is.
  const totalBudget = plan?.totalBudget ?? totalBudgeted;
  const projectedIncome = plan?.projectedIncome ?? 0;
  const plannedSavings =
    plan?.savingsMode === 'percent' ? round2((projectedIncome * (plan.savingsValue ?? 0)) / 100) : plan?.savingsValue ?? 0;
  const leftToBudget = Math.max(totalBudget - totalBudgeted, 0);
  // What you'd actually have left to spend after saving — if totalBudget
  // (what you intend to allocate) is more than that, you're planning to
  // overspend this month even before anything is actually bought.
  const availableToSpend = projectedIncome - plannedSavings;
  const overspendAmount = round2(totalBudget - availableToSpend);
  const isOverspending = plan != null && overspendAmount > 0;

  // Actual income/savings for the month — derived from real transactions,
  // never typed in. A month with nothing logged yet just reads 0/0%; there's
  // no other way to know what actually came in or got saved.
  //
  // Actual income reuses statsMonthly.totalIncome directly: only
  // Income-type transactions ever produce an Inflow (see
  // src/logic/addTransaction/useLogic.ts), so it's already exactly this.
  // Actual savings has no equivalent aggregate — perCategorySpend is a flat
  // per-category net-outflow map with no type breakdown, so this sums it
  // over whichever categories are tagged transactionType 'Savings'. That
  // also means money moved to savings currently still counts inside
  // totalExpense/totalSpent too (a real double-count the household is aware
  // of, not a bug this fixes — see the conversation that led here).
  const savingsCategoryIds = useMemo(
    () => new Set(allCategories.filter((category) => category.transactionType === 'Savings').map((c) => c.id)),
    [allCategories]
  );
  const actualSavingsBase = useMemo(() => {
    const perCategorySpend = statsMonthly?.perCategorySpend ?? {};
    return Object.entries(perCategorySpend).reduce(
      (sum, [categoryId, amount]) => (savingsCategoryIds.has(categoryId) ? sum + amount : sum),
      0
    );
  }, [statsMonthly, savingsCategoryIds]);
  const actualIncome = round2(toDisplay(ctx, statsMonthly?.totalIncome ?? 0, ctx.base));
  const actualSavings = round2(toDisplay(ctx, actualSavingsBase, ctx.base));
  const incomeProgressPercent = projectedIncome > 0 ? Math.round((actualIncome / projectedIncome) * 100) : 0;
  const savingsProgressPercent = plannedSavings > 0 ? Math.round((actualSavings / plannedSavings) * 100) : 0;

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

  // Seeds the inline total-budget field once real data arrives for the
  // month being viewed, without clobbering what the user is actively
  // typing — re-seeds when monthStr changes since it's a per-month doc.
  useEffect(() => {
    if (!planLoading && totalBudgetDraftSeededFor !== monthStr) {
      setTotalBudgetDraft(plan?.totalBudget ? String(plan.totalBudget) : '');
      setTotalBudgetDraftSeededFor(monthStr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, planLoading, monthStr]);

  async function handleSaveTotalBudget() {
    if (savingTotalBudget || !uid) return;
    setSavingTotalBudget(true);
    try {
      await setDoc(
        budgetPlanRef(uid, monthStr),
        { totalBudget: Number(totalBudgetDraft.replace(/[^0-9]/g, '')) || 0 },
        { merge: true }
      );
    } finally {
      setSavingTotalBudget(false);
    }
  }

  // Config modal: seeded from whatever's currently saved each time it
  // opens, so it can't clobber a figure the user isn't actively editing.
  function openConfig() {
    setProjectedIncomeDraft(plan?.projectedIncome ? String(plan.projectedIncome) : '');
    setSavingsMode(plan?.savingsMode ?? 'fixed');
    setSavingsValueDraft(plan?.savingsValue ? String(plan.savingsValue) : '');
    setConfigOpen(true);
  }

  async function handleSavePlan() {
    if (savingPlan || !uid) return;
    setSavingPlan(true);
    try {
      await setDoc(
        budgetPlanRef(uid, monthStr),
        {
          projectedIncome: Number(projectedIncomeDraft.replace(/[^0-9]/g, '')) || 0,
          savingsMode,
          savingsValue: Number(savingsValueDraft.replace(/[^0-9]/g, '')) || 0,
        },
        { merge: true }
      );
      setConfigOpen(false);
    } finally {
      setSavingPlan(false);
    }
  }

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
    totalBudgetDraft,
    setTotalBudgetDraft,
    savingTotalBudget,
    handleSaveTotalBudget,
    configOpen,
    setConfigOpen,
    openConfig,
    projectedIncomeDraft,
    setProjectedIncomeDraft,
    savingsMode,
    setSavingsMode,
    savingsValueDraft,
    setSavingsValueDraft,
    savingPlan,
    categories,
    currency,
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
    totalBudget,
    totalBudgeted,
    totalSpent,
    leftToBudget,
    projectedIncome,
    plannedSavings,
    actualIncome,
    actualSavings,
    incomeProgressPercent,
    savingsProgressPercent,
    availableToSpend,
    overspendAmount,
    isOverspending,
    loading:
      authLoading || rulesLoading || statsLoading || accountsLoading || categoriesLoading || planLoading || ctxLoading,
    error: rulesError,
    handleSavePlan,
    openMonthPicker,
    chooseMonth,
    openEdit,
    handleSaveEdit,
    handleDelete,
    setEditingId,
  };
}
