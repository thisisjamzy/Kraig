'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where } from 'firebase/firestore';
import { ruleAppliesToMonth } from '@dreda/shared-recurrence';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { budgetRulesRef } from '@/src/shared/firestore/refs';
import { toRecurrenceRule } from '@/src/shared/firestore/recurrence';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { createTransactionWithAggregation, createTransferWithAggregation } from '@/src/shared/firestore/aggregation';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import type { FirestoreBudgetRule } from '@/src/shared/firestore/types';

export type TransactionType = 'expense' | 'income' | 'transfer' | 'savings';
export type Step = 'type' | 'category' | 'details' | 'review';

const STEP_ORDER: Step[] = ['type', 'category', 'details', 'review'];

// TransactionType (this screen's lowercase keys) -> categories collection's
// transactionType (Title-Case, see PRD-FIREBASE.md section 5). Transfer has
// no entry: it isn't a categorized type, it uses TRANSFER_CATEGORIES (a
// Transfers.kind value) as its "category" step instead.
const CATEGORY_TYPE: Partial<Record<TransactionType, 'Expense' | 'Income' | 'Savings'>> = {
  expense: 'Expense',
  income: 'Income',
  savings: 'Savings',
};

export const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'clear'] as const;

export function formatDisplayDate(iso: string) {
  const parsed = new Date(`${iso}T00:00:00`);
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = parsed.toLocaleString('en-US', { month: 'short' });
  return `${day} - ${month} - ${parsed.getFullYear()}`;
}

export function formatMoney(amountString: string) {
  return Number(amountString || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

// The Budget screen's "record a retrospective transaction" button
// (src/logic/budget/useLogic.ts) deep-links here with the month it was
// looking at (?month=0-11&year=YYYY) so a transaction you forgot to log
// back then lands in the right month by default, rather than today's date.
// Read directly off window.location.search (not useSearchParams()) so this
// screen never needs a Suspense boundary — it's 'use client'-only anyway,
// nothing here is ever server-rendered.
function retroTargetFromSearch(): { year: number; month: number } | null {
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
  const router = useRouter();
  const [retroTarget] = useState(retroTargetFromSearch);
  const [step, setStep] = useState<Step>('type');
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState(''); // categoryId, or a TRANSFER_CATEGORIES value for transfers
  const [showUnplanned, setShowUnplanned] = useState(false);
  const [description, setDescription] = useState('');
  const [amountString, setAmountString] = useState('');
  // Only meaningful for a transfer — a wire fee, mobile-money charge, etc.
  // deducted from the source wallet on top of the transferred amount (see
  // aggregation.ts's createTransferWithAggregation). Optional, defaults to
  // 0 for a free transfer.
  const [chargesString, setChargesString] = useState('');
  const [dateValue, setDateValue] = useState(() =>
    retroTarget ? `${retroTarget.year}-${pad2(retroTarget.month + 1)}-01` : todayIso()
  );
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => retroTarget?.month ?? new Date().getMonth());
  const [pickerYear, setPickerYear] = useState(() => retroTarget?.year ?? new Date().getFullYear());

  const [accountPickerFor, setAccountPickerFor] = useState<'from' | 'to' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: allAccounts, loading: accountsLoading, error: accountsError } = useAccounts();
  // Frozen wallets can't be a source or destination for anything until
  // unfrozen (see aggregation.ts's frozen checks, the enforcement point this
  // filter is just the UX side of).
  const accounts = allAccounts.filter((account) => !account.frozen);
  const isTransfer = type === 'transfer';
  const { data: fetchedCategories, loading: categoriesLoading, error: categoriesError } = useCategories(
    isTransfer ? undefined : CATEGORY_TYPE[type]
  );
  const { ctx } = useCurrencyContext();

  // Which categories actually have a budget line for the month `dateValue`
  // falls in — same rule-expansion Budget screen itself uses
  // (src/logic/budget/useLogic.ts) so "has a budget this month" means the
  // same thing in both places. Recomputed off dateValue, not "today", so
  // changing the date (including via the Budget screen's retrospective
  // link above) re-filters against the right month.
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const activeBudgetRulesQuery = useMemo(
    () => (uid ? query(budgetRulesRef(uid), where('archived', '==', false)) : null),
    [uid]
  );
  const { data: budgetRules, loading: budgetRulesLoading } =
    useFirestoreCollection<FirestoreBudgetRule>(activeBudgetRulesQuery);
  const [dateYear, dateMonth] = dateValue.split('-').map(Number);
  const dateMonthKey = `${dateYear}-${pad2(dateMonth)}`;
  const budgetedCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rule of budgetRules) {
      const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), dateYear, dateMonth);
      if (!occurrence || rule.excludedMonths?.includes(dateMonthKey)) continue;
      ids.add(rule.categoryId);
    }
    return ids;
  }, [budgetRules, dateYear, dateMonth, dateMonthKey]);

  // Default both account pickers once accounts load, distinct accounts for from/to.
  useEffect(() => {
    if (accounts.length === 0) return;
    setFromAccountId((current) => current || accounts[0].id);
    setToAccountId((current) => current || accounts[Math.min(1, accounts.length - 1)].id);
  }, [accounts]);

  const isExpense = type === 'expense';
  const date = formatDisplayDate(dateValue);
  const categoriesForType = isTransfer
    ? TRANSFER_CATEGORIES.map((kind) => ({ id: kind, name: kind }))
    : fetchedCategories.map((cat) => ({ id: cat.id, name: cat.name }));
  // A Transfer-type budget rule's categoryId is one of these same
  // TRANSFER_CATEGORIES strings (see src/logic/budget/useLogic.ts's
  // categoryOptionsForType), so the same budget filter applies uniformly to
  // expense/income/savings/transfer — planning "Wallet to savings" works
  // the same way as budgeting a Groceries envelope.
  const budgetedCategoriesForType = categoriesForType.filter((option) => budgetedCategoryIds.has(option.id));
  const hasBudgetedCategories = budgetedCategoriesForType.length > 0;
  // Shown list: budgeted-only by default. When nothing's budgeted this
  // month, that's an empty list — the screen shows the "add a budget /
  // record as unplanned" prompt instead — until the user explicitly opts
  // into unplanned mode, which reveals every category of this type.
  const categoryOptions = showUnplanned ? categoriesForType : budgetedCategoriesForType;
  // Where "add a budget" sends them — the Budget screen for the exact month
  // this transaction is dated in (monthIndex there is 0-based, same as
  // dateMonth - 1 here).
  const budgetHref = `/budget?month=${dateMonth - 1}&year=${dateYear}`;
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? '';

  function selectType(key: TransactionType) {
    setType(key);
    setCategory('');
    setShowUnplanned(false);
    setChargesString('');
  }

  function openDatePicker() {
    const parsed = new Date(`${dateValue}T00:00:00`);
    setPickerMonth(parsed.getMonth());
    setPickerYear(parsed.getFullYear());
    setDatePickerOpen(true);
  }

  // Does `categoryId` still have a budget line in (year, month)? Used below
  // to catch the date moving to a month where the already-picked category
  // no longer has one — computed inline against the picked date rather than
  // via an effect on budgetedCategoryIds (which is memoized off the OLD
  // dateValue at the moment the date actually changes).
  function categoryBudgetedFor(categoryId: string, year: number, month: number) {
    const monthKey = `${year}-${pad2(month)}`;
    return budgetRules.some((rule) => {
      if (rule.categoryId !== categoryId) return false;
      if (rule.excludedMonths?.includes(monthKey)) return false;
      return ruleAppliesToMonth(toRecurrenceRule(rule), year, month) != null;
    });
  }

  function chooseDay(day: number) {
    const iso = `${pickerYear}-${pad2(pickerMonth + 1)}-${pad2(day)}`;
    setDateValue(iso);
    setDatePickerOpen(false);
    // Don't silently keep an out-of-budget selection across a date change —
    // clear it and send the user back to re-pick, same as if they'd never
    // chosen one. Unplanned mode is exempt: it opted out of the budget
    // filter entirely.
    if (!showUnplanned && category && !categoryBudgetedFor(category, pickerYear, pickerMonth + 1)) {
      setCategory('');
      setStep((current) => (current === 'details' || current === 'review' ? 'category' : current));
    }
  }

  function shiftPickerMonth(delta: number) {
    let nextMonth = pickerMonth + delta;
    let nextYear = pickerYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setPickerMonth(nextMonth);
    setPickerYear(nextYear);
  }

  function chooseAccount(id: string) {
    if (accountPickerFor === 'from') setFromAccountId(id);
    else if (accountPickerFor === 'to') setToAccountId(id);
    setAccountPickerFor(null);
  }

  function pressKey(key: (typeof KEYPAD_KEYS)[number]) {
    if (key === 'clear') {
      setAmountString((current) => current.slice(0, -1));
      return;
    }
    if (key === '.') {
      setAmountString((current) => {
        if (current.includes('.')) return current;
        return current.length === 0 ? '0.' : `${current}.`;
      });
      return;
    }
    setAmountString((current) => {
      if (current === '0') return key;
      if (current.length >= 12) return current;
      return current + key;
    });
  }

  function goBack() {
    if (step === 'type') {
      router.push('/home');
      return;
    }
    setStep(STEP_ORDER[STEP_ORDER.indexOf(step) - 1]);
  }

  function goNext() {
    const nextIndex = STEP_ORDER.indexOf(step) + 1;
    if (nextIndex < STEP_ORDER.length) {
      setStep(STEP_ORDER[nextIndex]);
    }
  }

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    // The document id itself is the idempotency key (PRD-FIREBASE.md
    // section 7) — set() to transactions/{clientId} or transfers/{clientId}
    // directly, no separate ClientID field or retry-scan needed the way the
    // old Sheet's findFirstEmptyRow_ approach required.
    const clientId = crypto.randomUUID();
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!uid) {
      setSubmitError('Not signed in.');
      setSubmitting(false);
      return;
    }
    const date = new Date(`${dateValue}T00:00:00`);

    try {
      if (isTransfer) {
        await createTransferWithAggregation({
          id: clientId,
          date,
          description,
          fromAccountId,
          toAccountId,
          amount: Number(amountString),
          charges: Number(chargesString) || 0,
          kind: category,
          createdBy: uid,
        });
      } else {
        const direction = type === 'income' ? 'Inflow' : 'Outflow';
        await createTransactionWithAggregation(
          {
            id: clientId,
            date,
            type: CATEGORY_TYPE[type]!,
            description,
            accountId: fromAccountId,
            categoryId: category,
            amount: Number(amountString),
            direction,
            createdBy: uid,
          },
          ctx
        );
      }
      router.push('/home');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not save this transaction.');
      setSubmitting(false);
    }
  }

  const canContinue =
    (step === 'type' && Boolean(type)) ||
    (step === 'category' && category.length > 0 && description.trim().length > 0) ||
    (step === 'details' &&
      Number(amountString) > 0 &&
      fromAccountId.length > 0 &&
      (!isTransfer || (toAccountId.length > 0 && toAccountId !== fromAccountId))) ||
    (step === 'review' && !submitting);

  const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();

  return {
    step,
    type,
    category,
    setCategory,
    description,
    setDescription,
    amountString,
    chargesString,
    setChargesString,
    fromAccount: accountName(fromAccountId),
    toAccount: accountName(toAccountId),
    date,
    dateValue,
    isExpense,
    categoriesForType: categoryOptions,
    hasBudgetedCategories,
    showUnplanned,
    setShowUnplanned,
    budgetHref,
    accounts,
    datePickerOpen,
    setDatePickerOpen,
    pickerMonth,
    pickerYear,
    accountPickerFor,
    setAccountPickerFor,
    fromAccountId,
    toAccountId,
    daysInMonth,
    canContinue,
    selectType,
    openDatePicker,
    chooseDay,
    shiftPickerMonth,
    chooseAccount,
    pressKey,
    goBack,
    goNext,
    handleConfirm,
    loading: accountsLoading || categoriesLoading || budgetRulesLoading,
    error: accountsError || categoriesError,
    submitting,
    submitError,
  };
}
