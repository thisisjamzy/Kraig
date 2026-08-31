'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { createTransactionWithAggregation, createTransferWithAggregation } from '@/src/shared/firestore/aggregation';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';

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

export function useLogic() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('type');
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState(''); // categoryId, or a TRANSFER_CATEGORIES value for transfers
  const [description, setDescription] = useState('');
  const [amountString, setAmountString] = useState('');
  const [dateValue, setDateValue] = useState(todayIso);
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());

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
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? '';

  function selectType(key: TransactionType) {
    setType(key);
    setCategory('');
  }

  function openDatePicker() {
    const parsed = new Date(`${dateValue}T00:00:00`);
    setPickerMonth(parsed.getMonth());
    setPickerYear(parsed.getFullYear());
    setDatePickerOpen(true);
  }

  function chooseDay(day: number) {
    const iso = `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setDateValue(iso);
    setDatePickerOpen(false);
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
    fromAccount: accountName(fromAccountId),
    toAccount: accountName(toAccountId),
    date,
    dateValue,
    isExpense,
    categoriesForType,
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
    loading: accountsLoading || categoriesLoading,
    error: accountsError || categoriesError,
    submitting,
    submitError,
  };
}
