'use client';

// A standalone page (not a modal) for editing an existing budget line —
// moved out of a Modal stacked on top of the Budget screen for the same
// reason src/logic/addBudgetCategory/useLogic.ts already is: more room to
// work with, and a real back button instead of a dismissible overlay.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where, updateDoc } from 'firebase/firestore';
import { ruleAppliesToMonth } from '@dreda/shared-recurrence';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { budgetRulesRef, budgetRuleRef } from '@/src/shared/firestore/refs';
import { toRecurrenceRule } from '@/src/shared/firestore/recurrence';
import {
  recomputeBudgetProgressForRuleCurrentMonth,
  recomputeBudgetProgressForRuleAndMonth,
} from '@/src/shared/firestore/aggregation';
import { useCategories } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import {
  currentMonthIndex,
  currentYear,
  toAppRecurrence,
  toFrequencyFields,
  type Recurrence,
} from '@/src/viewmodels/budget';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import type { FirestoreBudgetRule, BudgetLineType } from '@/src/shared/firestore/types';

export const BUDGET_LINE_TYPES: BudgetLineType[] = ['Expense', 'Income', 'Savings', 'Transfer'];

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

export function useLogic(ruleId: string) {
  const router = useRouter();

  // Which month the Budget screen was viewing when "Edit" was tapped —
  // "save for this month only" applies to this month specifically, and
  // "back"/"save" both return here.
  const [{ year: viewingYear, month: viewingMonthIndex }] = useState(monthTargetFromSearch);
  const budgetHref = `/budget?month=${viewingMonthIndex}&year=${viewingYear}`;
  const monthStr = `${viewingYear}-${pad2(viewingMonthIndex + 1)}`;

  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const activeBudgetRulesQuery = useMemo(
    () => (uid ? query(budgetRulesRef(uid), where('archived', '==', false)) : null),
    [uid]
  );
  const { data: rules, loading: rulesLoading } = useFirestoreCollection<FirestoreBudgetRule>(activeBudgetRulesQuery);
  const { data: allCategories, loading: categoriesLoading } = useCategories();
  const categoryTransactionType = useMemo(
    () => new Map(allCategories.map((c) => [c.id, c.transactionType])),
    [allCategories]
  );

  const initialLoading = authLoading || rulesLoading || categoriesLoading;
  const rule = useMemo(() => rules.find((r) => r.id === ruleId) ?? null, [rules, ruleId]);
  // Only meaningful once the rules collection has actually loaded — before
  // that, "not found yet" and "doesn't exist" look the same.
  const notFound = !initialLoading && !rule;
  const hasMonthOverride = Boolean(rule?.monthOverrides?.[monthStr]);

  // Every other active rule's claim on a category for the viewed month —
  // excluding this rule's own claim, so its current category stays
  // selectable in the picker below.
  const budgetedCategoryIds = useMemo(() => {
    const [y, m] = monthStr.split('-').map(Number);
    const ids = new Set<string>();
    for (const r of rules) {
      if (r.id === ruleId) continue;
      const occurrence = ruleAppliesToMonth(toRecurrenceRule(r), y, m);
      if (!occurrence || r.excludedMonths?.includes(monthStr)) continue;
      ids.add(r.categoryId);
    }
    return ids;
  }, [rules, monthStr, ruleId]);

  const [type, setTypeState] = useState<BudgetLineType>('Expense');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [recurrence, setRecurrenceState] = useState<Recurrence>('monthly');
  const [recurrenceMonths, setRecurrenceMonths] = useState('3');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // --- End month ("until" recurrence only) ---------------------------

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

  function setType(next: BudgetLineType) {
    setTypeState(next);
    setCategoryId('');
  }

  // Picking "until" needs a real end month to point at — seed it fresh off
  // today's month each time a person actively switches to it, rather than
  // whatever stale value it last held.
  function setRecurrence(next: Recurrence) {
    if (next === 'until' && recurrence !== 'until') {
      setEndMonthIndex(currentMonthIndex());
      setEndYear(currentYear());
    }
    setRecurrenceState(next);
  }

  // Seeds the form once the rule itself has loaded — never re-seeds after
  // that, so it doesn't clobber in-progress edits if the rules collection
  // happens to re-fetch.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!rule || seeded) return;
    setTypeState(rule.type ?? categoryTransactionType.get(rule.categoryId) ?? 'Expense');
    setCategoryId(rule.categoryId);
    setDescription(rule.description);
    setAmount(String(rule.budgetedAmount || ''));
    const bucket = toAppRecurrence(rule);
    setRecurrenceState(bucket.recurrence);
    setRecurrenceMonths(String(bucket.recurrenceMonths ?? 3));
    setEndMonthIndex(bucket.endMonthIndex ?? currentMonthIndex());
    setEndYear(bucket.endYear ?? currentYear());
    setSeeded(true);
  }, [rule, seeded, categoryTransactionType]);

  const categoryOptions = useMemo(() => {
    const options: { id: string; name: string }[] =
      type === 'Transfer'
        ? TRANSFER_CATEGORIES.map((kind) => ({ id: kind, name: kind }))
        : allCategories
            .filter((category) => category.transactionType === type)
            .map((category) => ({ id: category.id, name: category.name }));
    return options.filter((option) => !budgetedCategoryIds.has(option.id) || option.id === categoryId);
  }, [type, allCategories, budgetedCategoryIds, categoryId]);

  function goBack() {
    router.push(budgetHref);
  }

  // 'thisMonth': only the amount changes, only for monthStr (the month
  // Budget was viewing, which may be in the past) — categoryId/type/
  // description/recurrence stay whatever the series already has, since
  // those describe the whole line, not one month of it. 'allMonths' is the
  // full-rule edit. A 'Once' rule has no "other months" to distinguish
  // from, so the screen never offers 'thisMonth' for one.
  async function handleSave(scope: 'thisMonth' | 'allMonths') {
    if (!rule || !categoryId || saving || !uid) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (scope === 'thisMonth') {
        await updateDoc(budgetRuleRef(uid, rule.id), {
          [`monthOverrides.${monthStr}`]: { budgetedAmount: Number(amount.replace(/[^0-9]/g, '')) || 0 },
        });
        await recomputeBudgetProgressForRuleAndMonth(uid, rule.id, monthStr);
      } else {
        await updateDoc(budgetRuleRef(uid, rule.id), {
          categoryId,
          type,
          description: description.trim(),
          budgetedAmount: Number(amount.replace(/[^0-9]/g, '')) || 0,
          ...toFrequencyFields(recurrence, recurrenceMonths, { monthIndex: endMonthIndex, year: endYear }),
        });
        await recomputeBudgetProgressForRuleCurrentMonth(uid, rule.id);
      }
      router.push(budgetHref);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update this budget item.');
      setSaving(false);
    }
  }

  return {
    goBack,
    budgetHref,

    // A 'Once' rule has no other month to distinguish "this month only"
    // from — the screen only ever offers the single full-rule save button
    // for one.
    isOnce: rule?.frequency === 'Once',
    hasMonthOverride,

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

    endMonthIndex,
    endYear,
    endPickerOpen,
    openEndPicker,
    closeEndPicker: () => setEndPickerOpen(false),
    endPickerYear,
    setEndPickerYear,
    chooseEndMonth,

    saving,
    saveError,
    handleSave,

    loading: initialLoading || (!notFound && !seeded),
    notFound,
  };
}
