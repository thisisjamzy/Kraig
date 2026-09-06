'use client';

// A standalone page (not a modal) for adding a budget line to a given
// month's Budget screen (src/logic/budget/useLogic.ts's "Add category"
// button links here) — moved out of the modal specifically so there's room
// for the "can't find your category? create one" flow below: a modal
// stacked on top of a modal was cramped, and losing the in-progress budget
// line just to go create a category elsewhere was worse.
//
// The line's own start month defaults to whichever month the Budget screen
// was browsing (?month=&year=), but is independently editable here — a
// household can deliberately backdate a recurring budget line's anchor into
// a past month (so browsing back shows it there too, same as a backdated
// transaction already could) or schedule one to start in the future,
// without first navigating the Budget screen itself to that month. An
// "until" recurrence choice similarly lets an end month/year be picked
// directly, on top of the existing "for a few months" (raw occurrence
// count) and "every month" (never-ending) choices.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { ruleAppliesToMonth } from '@dreda/shared-recurrence';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { budgetRulesRef, budgetRuleRef, categoryRef } from '@/src/shared/firestore/refs';
import { toRecurrenceRule } from '@/src/shared/firestore/recurrence';
import {
  recomputeBudgetProgressForRuleCurrentMonth,
  recomputeBudgetProgressForRuleAndMonth,
} from '@/src/shared/firestore/aggregation';
import { useCategories } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { currentMonthIndex, currentYear, toFrequencyFields, type Recurrence } from '@/src/viewmodels/budget';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import type { FirestoreBudgetRule, BudgetLineType } from '@/src/shared/firestore/types';

export const BUDGET_LINE_TYPES: BudgetLineType[] = ['Expense', 'Income', 'Savings', 'Transfer'];
// A brand new category can only ever be Expense/Income/Savings — Transfer
// has no categories/{id} docs at all (TRANSFER_CATEGORIES is a fixed
// 3-value enum, see src/logic/budget/useLogic.ts's categoryOptionsForType).
export const CATEGORY_CREATE_TYPES: Exclude<BudgetLineType, 'Transfer'>[] = ['Expense', 'Income', 'Savings'];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function monthTargetFromSearch(): { year: number; month: number } {
  const fallback = { year: currentYear(), month: currentMonthIndex() };
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  const monthParam = params.get('month');
  const yearParam = params.get('year');
  if (monthParam === null || yearParam === null) return fallback;
  const month = Number(monthParam);
  const year = Number(yearParam);
  if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year)) return fallback;
  return { year, month };
}

export function useLogic() {
  const router = useRouter();
  // Where "cancel"/"save" send you back to — the month the Budget screen
  // was actually showing, fixed at mount. Independent of the start-month
  // picker below, which is free to point somewhere else entirely.
  const [{ year: viewingYear, month: viewingMonthIndex }] = useState(monthTargetFromSearch);
  const budgetHref = `/budget?month=${viewingMonthIndex}&year=${viewingYear}`;

  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  // --- Start month (anchorDate) — defaults to the viewed month, editable ---

  const [startMonthIndex, setStartMonthIndex] = useState(viewingMonthIndex);
  const [startYear, setStartYear] = useState(viewingYear);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [startPickerYear, setStartPickerYear] = useState(startYear);

  function openStartPicker() {
    setStartPickerYear(startYear);
    setStartPickerOpen(true);
  }
  function chooseStartMonth(index: number) {
    setStartMonthIndex(index);
    setStartYear(startPickerYear);
    setStartPickerOpen(false);
    // categoryOptions is scoped to the start month (see budgetedCategoryIds
    // below) — a category picked while viewing one month may no longer be
    // valid for another, so clear it rather than let a stale selection slip
    // through to handleSave.
    setCategoryId('');
  }

  const monthStr = `${startYear}-${pad2(startMonthIndex + 1)}`;

  // --- End month ("until" recurrence only) — defaults to the start month ---

  const [endMonthIndex, setEndMonthIndex] = useState(viewingMonthIndex);
  const [endYear, setEndYear] = useState(viewingYear);
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const [endPickerYear, setEndPickerYear] = useState(endYear);

  function openEndPicker() {
    setEndPickerYear(endYear);
    setEndPickerOpen(true);
  }
  function chooseEndMonth(index: number) {
    setEndMonthIndex(index);
    setEndYear(endPickerYear);
    setEndPickerOpen(false);
  }

  const activeBudgetRulesQuery = useMemo(
    () => (uid ? query(budgetRulesRef(uid), where('archived', '==', false)) : null),
    [uid]
  );
  const { data: rules, loading: rulesLoading } =
    useFirestoreCollection<FirestoreBudgetRule>(activeBudgetRulesQuery);
  const { data: allCategories, loading: categoriesLoading } = useCategories();

  // Scoped to the chosen START month, not the month the Budget screen
  // happened to be viewing — moving the start month elsewhere should
  // immediately reflect that month's own already-budgeted categories.
  const budgetedCategoryIds = useMemo(() => {
    const [y, m] = monthStr.split('-').map(Number);
    const ids = new Set<string>();
    for (const rule of rules) {
      const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), y, m);
      if (!occurrence || rule.excludedMonths?.includes(monthStr)) continue;
      ids.add(rule.categoryId);
    }
    return ids;
  }, [rules, monthStr]);

  const [type, setTypeState] = useState<BudgetLineType>('Expense');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [recurrence, setRecurrenceState] = useState<Recurrence>('monthly');
  const [recurrenceMonths, setRecurrenceMonths] = useState('3');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Picking "until" needs a real end month to point at — seed it fresh off
  // the current start month each time, rather than whatever stale value it
  // last held from an earlier "until" selection.
  function setRecurrence(next: Recurrence) {
    if (next === 'until' && recurrence !== 'until') {
      setEndMonthIndex(startMonthIndex);
      setEndYear(startYear);
    }
    setRecurrenceState(next);
  }

  function setType(next: BudgetLineType) {
    setTypeState(next);
    setCategoryId('');
    setShowCreateCategory(false);
  }

  const categoryOptions = useMemo(() => {
    const options: { id: string; name: string }[] =
      type === 'Transfer'
        ? TRANSFER_CATEGORIES.map((kind) => ({ id: kind, name: kind }))
        : allCategories
            .filter((category) => category.transactionType === type)
            .map((category) => ({ id: category.id, name: category.name }));
    return options.filter((option) => !budgetedCategoryIds.has(option.id));
  }, [type, allCategories, budgetedCategoryIds]);

  // --- "Can't find your category? Create one" ------------------------

  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<Exclude<BudgetLineType, 'Transfer'>>('Expense');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(null);

  function openCreateCategory() {
    setNewCategoryName('');
    setNewCategoryType(type === 'Transfer' ? 'Expense' : type);
    setNewCategoryDescription('');
    setCreateCategoryError(null);
    setShowCreateCategory(true);
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim() || creatingCategory || !uid) return;
    setCreatingCategory(true);
    setCreateCategoryError(null);
    try {
      const id = crypto.randomUUID();
      await setDoc(categoryRef(uid, id), {
        name: newCategoryName.trim(),
        transactionType: newCategoryType,
        group: null,
        notes: newCategoryDescription.trim(),
        archived: false,
      });
      // The new category needs to be selectable as this budget line's type
      // too, not just exist — a category created as Income while the
      // budget-line type selector is still on Expense would otherwise be
      // invisible in categoryOptions above (which is filtered by `type`).
      setTypeState(newCategoryType);
      setCategoryId(id);
      setShowCreateCategory(false);
    } catch (error) {
      setCreateCategoryError(error instanceof Error ? error.message : 'Could not create this category.');
    } finally {
      setCreatingCategory(false);
    }
  }

  // --- Save the budget line --------------------------------------------

  async function handleSave() {
    if (!categoryId || saving || !uid) return;
    setSaving(true);
    setSaveError(null);
    try {
      // A category can't carry two active budgets covering the same
      // month — categoryOptions above already excludes one from the
      // picker, but a category chosen before changing the start month (or
      // any other path that slips past that filter) shouldn't leave the two
      // rules coexisting and double-counting this category's budgeted
      // total. Silently archive whichever rule already covers it here; the
      // new one takes over.
      const overriddenRule = rules.find((rule) => {
        if (rule.categoryId !== categoryId) return false;
        const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), startYear, startMonthIndex + 1);
        return Boolean(occurrence) && !rule.excludedMonths?.includes(monthStr);
      });
      if (overriddenRule) {
        await updateDoc(budgetRuleRef(uid, overriddenRule.id), { archived: true });
        await recomputeBudgetProgressForRuleAndMonth(uid, overriddenRule.id, monthStr);
        await recomputeBudgetProgressForRuleCurrentMonth(uid, overriddenRule.id);
      }
      const id = `rule_${crypto.randomUUID().slice(0, 8)}`;
      await setDoc(budgetRuleRef(uid, id), {
        categoryId,
        type,
        description: description.trim(),
        budgetedAmount: Number(amount.replace(/[^0-9]/g, '')) || 0,
        ...toFrequencyFields(recurrence, recurrenceMonths, { monthIndex: endMonthIndex, year: endYear }),
        interval: 1,
        anchorDate: Timestamp.fromDate(new Date(startYear, startMonthIndex, 1)),
        accountId: null,
        tag: '',
        archived: false,
      });
      // Populates the anchor month's own statsBudgetProgress snapshot right
      // away — the current-month-only recompute below would otherwise never
      // touch a past (or not-yet-current) start month at all, leaving the
      // Audit Report's trailing-months read with a gap for it (the live
      // Budget/Home screens don't need this — they compute a rule's figure
      // straight off ruleAppliesToMonth on every render, anchor-agnostic).
      await recomputeBudgetProgressForRuleAndMonth(uid, id, monthStr);
      await recomputeBudgetProgressForRuleCurrentMonth(uid, id);
      router.push(budgetHref);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not add this category.');
      setSaving(false);
    }
  }

  function goBack() {
    router.push(budgetHref);
  }

  return {
    budgetHref,
    goBack,

    startMonthIndex,
    startYear,
    startPickerOpen,
    openStartPicker,
    closeStartPicker: () => setStartPickerOpen(false),
    startPickerYear,
    setStartPickerYear,
    chooseStartMonth,

    endMonthIndex,
    endYear,
    endPickerOpen,
    openEndPicker,
    closeEndPicker: () => setEndPickerOpen(false),
    endPickerYear,
    setEndPickerYear,
    chooseEndMonth,

    type,
    setType,
    categoryId,
    setCategoryId,
    categoryOptions,
    description,
    setDescription,
    amount,
    setAmount,
    recurrence,
    setRecurrence,
    recurrenceMonths,
    setRecurrenceMonths,
    saving,
    saveError,
    handleSave,

    showCreateCategory,
    openCreateCategory,
    closeCreateCategory: () => setShowCreateCategory(false),
    newCategoryName,
    setNewCategoryName,
    newCategoryType,
    setNewCategoryType,
    newCategoryDescription,
    setNewCategoryDescription,
    creatingCategory,
    createCategoryError,
    handleCreateCategory,

    loading: authLoading || rulesLoading || categoriesLoading,
  };
}
