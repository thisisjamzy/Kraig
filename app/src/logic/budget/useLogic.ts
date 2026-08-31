'use client';

import { useEffect, useMemo, useState } from 'react';
import { query, where, setDoc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { ruleAppliesToMonth } from '@dreda/shared-recurrence';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { budgetRulesRef, budgetRuleRef, statsMonthlyRef, budgetPlanRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { toRecurrenceRule } from '@/src/shared/firestore/recurrence';
import { recomputeBudgetProgressForRuleCurrentMonth } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { currentMonthIndex, currentYear, toFrequencyFields, type Recurrence } from '@/src/viewmodels/budget';
import type { FirestoreBudgetRule, StatsMonthly, FirestoreBudgetPlan } from '@/src/shared/firestore/types';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toAppRecurrence(rule: FirestoreBudgetRule): { recurrence: Recurrence; recurrenceMonths?: number } {
  if (rule.frequency === 'Once') return { recurrence: 'once' };
  if (rule.endCondition === 'After Occurrences' && rule.endOccurrences) {
    return { recurrence: 'limited', recurrenceMonths: rule.endOccurrences };
  }
  return { recurrence: 'monthly' };
}

export function useLogic() {
  // The month/year shown here is just which month's plan you're viewing —
  // it never touches the app's real current date after the initial load.
  const [monthIndex, setMonthIndex] = useState(currentMonthIndex);
  const [year, setYear] = useState(currentYear);
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

  const [addOpen, setAddOpen] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newRecurrence, setNewRecurrence] = useState<Recurrence>('monthly');
  const [newRecurrenceMonths, setNewRecurrenceMonths] = useState('3');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDescriptionDraft, setEditDescriptionDraft] = useState('');
  const [editAmountDraft, setEditAmountDraft] = useState('');
  const [editRecurrence, setEditRecurrence] = useState<Recurrence>('monthly');
  const [editRecurrenceMonths, setEditRecurrenceMonths] = useState('3');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
  const { data: expenseCategories } = useCategories('Expense');
  const { data: plan, loading: planLoading } = useFirestoreDoc<FirestoreBudgetPlan>(
    useMemo(() => (uid ? budgetPlanRef(uid, monthStr) : null), [uid, monthStr])
  );
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const categoryName = useMemo(() => new Map(allCategories.map((c) => [c.id, c.name])), [allCategories]);

  const categories = useMemo(() => {
    const [y, m] = monthStr.split('-').map(Number);
    return rules
      .map((rule) => {
        const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), y, m);
        if (!occurrence || rule.excludedMonths?.includes(monthStr)) return null;
        const ruleNative = rule.accountId ? accountCurrency.get(rule.accountId) ?? ctx.base : ctx.base;
        const budgeted = round2(toDisplay(ctx, rule.budgetedAmount * occurrence.multiplier, ruleNative));
        const spentBase = statsMonthly?.perCategorySpend?.[rule.categoryId] ?? 0;
        const spent = round2(toDisplay(ctx, spentBase, ctx.base));
        const bucket = toAppRecurrence(rule);
        return {
          id: rule.id,
          categoryId: rule.categoryId,
          category: categoryName.get(rule.categoryId) ?? rule.categoryId,
          description: rule.description,
          budgeted,
          spent,
          recurrence: bucket.recurrence,
          recurrenceMonths: bucket.recurrenceMonths,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [rules, monthStr, accountCurrency, categoryName, ctx, statsMonthly]);

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
  const availableCategories = expenseCategories.filter((category) => !budgetedCategoryIds.has(category.id));
  // Editing: same list, but also keeps whichever category this rule is
  // already assigned to (that one's "taken" by this very rule, not another).
  const editAvailableCategories = expenseCategories.filter(
    (category) => !budgetedCategoryIds.has(category.id) || category.id === editCategoryId
  );

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

  function openAddCategory() {
    setNewCategoryId('');
    setNewDescription('');
    setNewAmount('');
    setNewRecurrence('monthly');
    setNewRecurrenceMonths('3');
    setCreateError(null);
    setAddOpen(true);
  }

  async function handleCreateCategory() {
    if (!newCategoryId || creating || !uid) return;
    setCreating(true);
    setCreateError(null);
    try {
      const id = `rule_${crypto.randomUUID().slice(0, 8)}`;
      await setDoc(budgetRuleRef(uid, id), {
        categoryId: newCategoryId,
        description: newDescription.trim(),
        budgetedAmount: Number(newAmount.replace(/[^0-9]/g, '')) || 0,
        ...toFrequencyFields(newRecurrence, newRecurrenceMonths),
        interval: 1,
        anchorDate: Timestamp.fromDate(new Date(year, monthIndex, 1)),
        endDate: null,
        accountId: null,
        tag: '',
        archived: false,
      });
      await recomputeBudgetProgressForRuleCurrentMonth(uid, id);
      setAddOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not add this category.');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(entry: {
    id: string;
    categoryId: string;
    description: string;
    budgeted: number;
    recurrence: Recurrence;
    recurrenceMonths?: number;
  }) {
    setEditingId(entry.id);
    setEditCategoryId(entry.categoryId);
    setEditDescriptionDraft(entry.description);
    setEditAmountDraft(String(entry.budgeted || ''));
    setEditRecurrence(entry.recurrence);
    setEditRecurrenceMonths(String(entry.recurrenceMonths ?? 3));
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editingId || !editCategoryId || savingEdit || !uid) return;
    const amount = Number(editAmountDraft.replace(/[^0-9]/g, ''));
    setSavingEdit(true);
    setEditError(null);
    try {
      await updateDoc(budgetRuleRef(uid, editingId), {
        categoryId: editCategoryId,
        description: editDescriptionDraft.trim(),
        budgetedAmount: amount,
        ...toFrequencyFields(editRecurrence, editRecurrenceMonths),
      });
      await recomputeBudgetProgressForRuleCurrentMonth(uid, editingId);
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

  return {
    monthIndex,
    year,
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
    availableCategories,
    addOpen,
    setAddOpen,
    newCategoryId,
    setNewCategoryId,
    newDescription,
    setNewDescription,
    newAmount,
    setNewAmount,
    newRecurrence,
    setNewRecurrence,
    newRecurrenceMonths,
    setNewRecurrenceMonths,
    creating,
    createError,
    editingCategory,
    editAvailableCategories,
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
    openAddCategory,
    handleCreateCategory,
    openEdit,
    handleSaveEdit,
    handleDelete,
    setEditingId,
  };
}
