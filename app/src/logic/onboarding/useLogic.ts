'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setDoc, Timestamp } from 'firebase/firestore';
import { useAccounts, useCategories, useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { accountRef, categoryRef, budgetRuleRef } from '@/src/shared/firestore/refs';
import { recomputeBudgetProgressForRuleCurrentMonth } from '@/src/shared/firestore/aggregation';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor, ACCOUNT_TYPES } from '@/src/viewmodels/wallets';
import { currencyName } from '@/src/viewmodels/currencies';
import { CATEGORY_PRESETS } from '@/src/viewmodels/categories';

export type OnboardingStep = 'wallets' | 'categories' | 'budget';
const STEP_ORDER: OnboardingStep[] = ['wallets', 'categories', 'budget'];

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function useLogic() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>('wallets');
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories } = useCategories();
  const { data: exchangeRates } = useExchangeRates();
  const { ctx } = useCurrencyContext();

  // If this account already has wallets, onboarding was already completed
  // (or this uid pre-dates onboarding entirely) — skip straight to /home
  // instead of walking through setup again. Checked once, right after the
  // first real load, so adding a wallet DURING this wizard doesn't bounce
  // the user out of their own in-progress setup.
  const [checkedExisting, setCheckedExisting] = useState(false);
  useEffect(() => {
    if (accountsLoading || checkedExisting) return;
    setCheckedExisting(true);
    if (accounts.length > 0) router.replace('/home');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsLoading, checkedExisting]);

  // --- Step 1: wallets --------------------------------------------------

  const [walletName, setWalletName] = useState('');
  const [walletType, setWalletType] = useState<(typeof ACCOUNT_TYPES)[number]>(ACCOUNT_TYPES[0]);
  const [walletCurrency, setWalletCurrency] = useState('');
  const [walletStartingBalance, setWalletStartingBalance] = useState('');
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const currencyOptions = (exchangeRates.length > 0 ? exchangeRates.map((rate) => rate.id) : [ctx.base]).map(
    (code) => ({ code, name: currencyName(code) })
  );

  useEffect(() => {
    if (!walletCurrency && ctx.base) setWalletCurrency(ctx.base);
  }, [ctx.base, walletCurrency]);
  const wallets = accounts.map((account, index) => ({
    id: account.id,
    name: account.name,
    amount: toDisplay(ctx, account.currentBalance, account.currency),
    currency: account.currency,
    color: walletColor(index),
  }));

  async function createWallet() {
    if (!walletName.trim() || creatingWallet || !uid) return;
    setCreatingWallet(true);
    setWalletError(null);
    try {
      const startingBalance = Number(walletStartingBalance.replace(/[^0-9.]/g, '')) || 0;
      await setDoc(accountRef(uid, crypto.randomUUID()), {
        name: walletName.trim(),
        type: walletType,
        currency: walletCurrency || ctx.base || currencyOptions[0]?.code || '',
        startingBalance,
        currentBalance: startingBalance,
        notes: '',
        archived: false,
        notSpendable: false,
        frozen: false,
      });
      setWalletName('');
      setWalletStartingBalance('');
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Could not create this wallet.');
    } finally {
      setCreatingWallet(false);
    }
  }

  // --- Step 2: categories -------------------------------------------------

  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<'Expense' | 'Income' | 'Savings'>('Expense');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const existingCategoryNames = new Set(categories.map((c) => c.name.toLowerCase()));
  const availablePresets = CATEGORY_PRESETS.filter((p) => !existingCategoryNames.has(p.name.toLowerCase()));

  async function createCategory(name?: string, transactionType?: 'Expense' | 'Income' | 'Savings') {
    const finalName = (name ?? categoryName).trim();
    const finalType = transactionType ?? categoryType;
    if (!finalName || creatingCategory || !uid) return;
    setCreatingCategory(true);
    setCategoryError(null);
    try {
      await setDoc(categoryRef(uid, crypto.randomUUID()), {
        name: finalName,
        transactionType: finalType,
        group: null,
        notes: '',
        archived: false,
      });
      setCategoryName('');
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Could not create this category.');
    } finally {
      setCreatingCategory(false);
    }
  }

  // --- Step 3: budget items -----------------------------------------------

  const expenseCategories = categories.filter((c) => c.transactionType === 'Expense');

  const now = useMemo(() => new Date(), []);
  const [budgetMonthIndex, setBudgetMonthIndex] = useState(() => now.getMonth());
  const [budgetYear, setBudgetYear] = useState(() => now.getFullYear());
  const budgetYearOptions = [budgetYear - 1, budgetYear, budgetYear + 1, budgetYear + 2];

  const [budgetCategoryId, setBudgetCategoryId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [creatingBudget, setCreatingBudget] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [createdBudgetCount, setCreatedBudgetCount] = useState(0);

  async function createBudgetItem() {
    if (!budgetCategoryId || !budgetAmount || creatingBudget || !uid) return;
    setCreatingBudget(true);
    setBudgetError(null);
    try {
      const id = `rule_${crypto.randomUUID().slice(0, 8)}`;
      await setDoc(budgetRuleRef(uid, id), {
        categoryId: budgetCategoryId,
        description: '',
        budgetedAmount: Number(budgetAmount.replace(/[^0-9]/g, '')) || 0,
        frequency: 'Monthly',
        interval: 1,
        anchorDate: Timestamp.fromDate(new Date(budgetYear, budgetMonthIndex, 1)),
        endCondition: 'Never',
        endOccurrences: null,
        endDate: null,
        accountId: null,
        tag: '',
        archived: false,
      });
      await recomputeBudgetProgressForRuleCurrentMonth(uid, id);
      setBudgetCategoryId('');
      setBudgetAmount('');
      setCreatedBudgetCount((n) => n + 1);
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : 'Could not create this budget item.');
    } finally {
      setCreatingBudget(false);
    }
  }

  // --- Navigation -----------------------------------------------------

  function goNext() {
    const nextIndex = STEP_ORDER.indexOf(step) + 1;
    if (nextIndex < STEP_ORDER.length) {
      setStep(STEP_ORDER[nextIndex]);
    } else {
      finish();
    }
  }

  function goBack() {
    const prevIndex = STEP_ORDER.indexOf(step) - 1;
    if (prevIndex >= 0) setStep(STEP_ORDER[prevIndex]);
  }

  function finish() {
    router.replace('/home');
  }

  const canContinue = step === 'wallets' ? wallets.length > 0 : step === 'categories' ? categories.length > 0 : true;

  return {
    step,
    stepIndex: STEP_ORDER.indexOf(step),
    stepCount: STEP_ORDER.length,
    goNext,
    goBack,
    finish,
    canContinue,

    // wallets
    wallets,
    walletName,
    setWalletName,
    walletType,
    setWalletType,
    walletCurrency,
    setWalletCurrency,
    walletStartingBalance,
    setWalletStartingBalance,
    accountTypes: ACCOUNT_TYPES,
    currencyOptions,
    creatingWallet,
    walletError,
    createWallet,

    // categories
    categories,
    categoryName,
    setCategoryName,
    categoryType,
    setCategoryType,
    creatingCategory,
    categoryError,
    createCategory,
    availablePresets,

    // budget
    expenseCategories,
    budgetMonthIndex,
    setBudgetMonthIndex,
    budgetYear,
    setBudgetYear,
    budgetYearOptions,
    budgetCategoryId,
    setBudgetCategoryId,
    budgetAmount,
    setBudgetAmount,
    creatingBudget,
    budgetError,
    createBudgetItem,
    createdBudgetCount,
  };
}
