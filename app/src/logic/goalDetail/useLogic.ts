'use client';

// One goal's line items — `PRD Files/prd debt n goals` section 1.3's
// checkFrozenFundsAvailable, adapted to this app's real fields: a line
// item's frozen-funds check sums every account's lockedAmount (the feature
// this PRD assumes already exists, see types.ts's FirestoreAccount header),
// converted to a single currency via CurrencyContext since wallets can hold
// different native currencies.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreDoc, useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { goalRef, goalLineItemsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { convert, round2 } from '@/src/shared/firestore/currency';
import {
  createGoalLineItem,
  updateGoalLineItem,
  deleteGoalLineItem,
  markGoalLineItemComplete,
  addGoalLineItemToBudget,
  archiveGoal as archiveGoalWrite,
  updateGoal,
  deleteGoal as deleteGoalWrite,
} from '@/src/shared/firestore/aggregation';
import { useExchangeRates } from '@/src/shared/firestore/queries';
import { currencyName } from '@/src/viewmodels/currencies';
import { categoryAccentColor } from '@/src/viewmodels/categories';
import { DEFAULT_PRIORITY, DEFAULT_NECESSITY } from '@/src/viewmodels/projects';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import type {
  FirestoreGoal,
  FirestoreGoalLineItem,
  Priority,
  GoalItemNecessity,
  Frequency,
  BudgetLineType,
} from '@/src/shared/firestore/types';

// Recurring bills/subscriptions/savings transfers don't make sense as
// Once/Daily/Weekly — a Fixed goal's own recurrence picker only offers the
// frequencies that actually describe a repeating bill.
export const FIXED_ITEM_FREQUENCIES: Frequency[] = ['Monthly', 'Quarterly', 'Yearly'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function useLogic(goalId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const goalDocRef = useMemo(() => (uid ? goalRef(uid, goalId) : null), [uid, goalId]);
  const { data: goal, loading: goalLoading, error: goalError } = useFirestoreDoc<FirestoreGoal>(goalDocRef);

  const lineItemsQuery = useMemo(() => (uid ? goalLineItemsRef(uid, goalId) : null), [uid, goalId]);
  const { data: lineItemDocs, loading: lineItemsLoading, error: lineItemsError } =
    useFirestoreCollection<FirestoreGoalLineItem>(lineItemsQuery);

  const { data: accounts, loading: accountsLoading } = useAccounts();
  // A goal has a type now (FirestoreGoal.type) — Expense, Income, or
  // Savings — that constrains which categories its own line items may
  // ever use: an Expense goal only ever offers Expense categories, and so
  // on. "Dedicated" for an Income category means the household knows
  // exactly where that money is expected to come from, the same way it
  // means "knows exactly what it's for" for an Expense category and
  // "knows exactly where it's going and when" for a Savings one. Optional
  // for back-compat with a goal written before this field existed —
  // defaults to 'Expense', same convention as `kind`.
  const goalType = goal?.type ?? 'Expense';
  const isTransferGoal = goalType === 'Transfer';
  const { data: allCategories, loading: categoriesLoading } = useCategories();
  const categories = useMemo(
    () => allCategories.filter((category) => category.transactionType === goalType),
    [allCategories, goalType]
  );
  const categoryTransactionType = useMemo(
    () => new Map(categories.map((category) => [category.id, category.transactionType])),
    [categories]
  );
  const categoryNameFallback = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (id: string | undefined | null) => (id && map.get(id)) || id || 'No category';
  }, [categories]);
  // A Transfer goal has no real category at all — its "category" picker
  // offers the same fixed TRANSFER_CATEGORIES kind strings a Transfer
  // budget rule already uses (src/logic/addBudgetCategory/useLogic.ts),
  // not a categories/{id} — reused as-is here rather than inventing a
  // second pseudo-category convention.
  const transferKindOptions = useMemo(() => TRANSFER_CATEGORIES.map((kind) => ({ id: kind, name: kind })), []);
  // What the line item form's own "category" row actually iterates —
  // real categories for every goal type except Transfer, which shows the
  // kind list instead.
  const categoryOptions = isTransferGoal ? transferKindOptions : categories;
  // A Savings-category item can only earmark a Savings Account (that's the
  // only place "savings" actually lives); an Expense- or Income-category
  // item can only earmark a spendable, non-frozen wallet — same split
  // addTransaction's own spendableAccounts already enforces for a direct
  // Expense (an expected Income deposit lands in a spendable wallet the
  // same way a real one would). A Transfer item's own two account pickers
  // don't get this treatment — same as addTransaction's own transfer flow,
  // either side can be any non-frozen account; only "not the same account
  // on both sides" is enforced (see canSaveLineItem).
  const nonFrozenAccounts = useMemo(() => accounts.filter((account) => !account.frozen), [accounts]);
  const spendableAccounts = useMemo(
    () => nonFrozenAccounts.filter((account) => !isSavingsAccount(account)),
    [nonFrozenAccounts]
  );
  const savingsAccounts = useMemo(() => nonFrozenAccounts.filter(isSavingsAccount), [nonFrozenAccounts]);
  function accountOptionsForCategory(categoryId: string) {
    if (isTransferGoal) return nonFrozenAccounts;
    return categoryTransactionType.get(categoryId) === 'Savings' ? savingsAccounts : spendableAccounts;
  }

  const currency = goal?.currency ?? ctx.display;

  // All wallets' lockedAmount, converted to the goal's own currency so it's
  // directly comparable to a lineItem.amount without a second conversion at
  // every call site.
  const availableFrozen = useMemo(
    () =>
      round2(
        accounts.reduce((sum, account) => sum + convert(account.lockedAmount ?? 0, account.currency, currency, ctx.rates), 0)
      ),
    [accounts, ctx, currency]
  );

  const lineItems = useMemo(
    () =>
      lineItemDocs
        .map((item) => ({
          ...item,
          priority: item.priority ?? DEFAULT_PRIORITY,
          necessity: item.necessity ?? DEFAULT_NECESSITY,
          shortfall: Math.max(0, round2(item.amount - availableFrozen)),
          hasFunds: availableFrozen >= item.amount,
          categoryName: categoryNameFallback(item.categoryId),
          categoryColor: categoryAccentColor(categoryNameFallback(item.categoryId)),
          dueDateObj: item.dueDate ? item.dueDate.toDate() : null,
        }))
        .sort((a, b) => Number(a.completed) - Number(b.completed)),
    [lineItemDocs, availableFrozen, categoryNameFallback]
  );

  const totalAmount = goal?.totalAmount ?? 0;
  const amountCompleted = goal?.amountCompleted ?? 0;
  const amountRemaining = Math.max(0, round2(totalAmount - amountCompleted));
  const percent = goal && goal.lineItemCount > 0 ? Math.round((goal.completedLineItemCount / goal.lineItemCount) * 100) : 0;
  const deadline = goal?.deadline ? goal.deadline.toDate() : null;

  const [addOpen, setAddOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemPriority, setItemPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [itemNecessity, setItemNecessity] = useState<GoalItemNecessity>(DEFAULT_NECESSITY);
  const [itemCategoryId, setItemCategoryIdState] = useState('');
  const [itemAccountId, setItemAccountId] = useState('');
  // Transfer goal items only — the account the amount lands in, and the
  // planned cost of the move.
  const [itemToAccountId, setItemToAccountId] = useState('');
  const [itemCharges, setItemCharges] = useState('');
  const [itemDueDate, setItemDueDate] = useState('');
  const [itemRecurrenceFrequency, setItemRecurrenceFrequency] = useState<Frequency>('Monthly');
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  // Picking a new category can invalidate the already-picked account (a
  // Savings-category item can't keep an Expense wallet selected, and vice
  // versa) — same "clear it rather than silently keep an invalid pick"
  // convention src/logic/addTransaction/useLogic.ts's chooseDate uses. A
  // Transfer item's kind pick never gates its accounts (see
  // accountOptionsForCategory), so there's nothing to invalidate there.
  function setItemCategoryId(categoryId: string) {
    setItemCategoryIdState(categoryId);
    if (isTransferGoal) return;
    const validAccountIds = new Set(accountOptionsForCategory(categoryId).map((account) => account.id));
    setItemAccountId((current) => (validAccountIds.has(current) ? current : ''));
  }

  function openAdd() {
    setEditingItemId(null);
    setItemName('');
    setItemDescription('');
    setItemAmount('');
    setItemPriority(DEFAULT_PRIORITY);
    setItemNecessity(DEFAULT_NECESSITY);
    setItemCategoryIdState(categoryOptions[0]?.id ?? '');
    setItemAccountId('');
    setItemToAccountId('');
    setItemCharges('');
    setItemDueDate('');
    setItemRecurrenceFrequency('Monthly');
    setItemError(null);
    setAddOpen(true);
  }

  function openEditItem(lineItem: FirestoreGoalLineItem) {
    setEditingItemId(lineItem.id);
    setItemName(lineItem.name);
    setItemDescription(lineItem.description);
    setItemAmount(String(lineItem.amount));
    setItemPriority(lineItem.priority ?? DEFAULT_PRIORITY);
    setItemNecessity(lineItem.necessity ?? DEFAULT_NECESSITY);
    setItemCategoryIdState(lineItem.categoryId ?? categoryOptions[0]?.id ?? '');
    setItemAccountId(lineItem.accountId ?? '');
    setItemToAccountId(lineItem.toAccountId ?? '');
    setItemCharges(lineItem.charges ? String(lineItem.charges) : '');
    setItemDueDate(lineItem.dueDate ? lineItem.dueDate.toDate().toISOString().slice(0, 10) : '');
    setItemRecurrenceFrequency(lineItem.recurrence?.frequency ?? 'Monthly');
    setItemError(null);
    setAddOpen(true);
  }

  const isFixedGoal = goal?.kind === 'Fixed';
  // A Fixed item always repeats (see handleAddLineItem's own recurrence
  // write below) — its due date IS the recurrence anchor
  // (src/shared/firestore/upcomingPayments.ts reads item.dueDate directly
  // as the RecurrenceRule's anchorDate), so without one it would never
  // appear on the Payments Calendar at all despite recurring in the
  // budget. A Variable item's due date stays optional.
  const canSaveLineItem =
    itemName.trim().length > 0 &&
    Number(itemAmount) > 0 &&
    itemCategoryId.length > 0 &&
    (!isFixedGoal || itemDueDate.length > 0) &&
    (!isTransferGoal || (itemAccountId.length > 0 && itemToAccountId.length > 0 && itemAccountId !== itemToAccountId));

  async function handleAddLineItem() {
    if (!uid || savingItem || !canSaveLineItem) return;
    const amount = Number(itemAmount);
    setSavingItem(true);
    setItemError(null);
    try {
      const input = {
        name: itemName.trim(),
        description: itemDescription.trim(),
        amount,
        priority: itemPriority,
        necessity: itemNecessity,
        categoryId: itemCategoryId,
        categoryType: (isTransferGoal ? 'Transfer' : categoryTransactionType.get(itemCategoryId) ?? 'Expense') as BudgetLineType,
        accountId: itemAccountId || null,
        toAccountId: isTransferGoal ? itemToAccountId || null : null,
        charges: isTransferGoal ? Number(itemCharges) || 0 : null,
        dueDate: itemDueDate ? new Date(`${itemDueDate}T00:00:00`) : null,
        recurrence: isFixedGoal ? { frequency: itemRecurrenceFrequency, interval: 1 } : null,
      };
      if (editingItemId) {
        await updateGoalLineItem(uid, goalId, editingItemId, input);
      } else {
        await createGoalLineItem(uid, goalId, goal?.kind ?? 'Variable', input);
      }
      setAddOpen(false);
      setEditingItemId(null);
      // Add/edit now lives on its own page (src/screens/GoalLineItemForm),
      // not a modal over this one — a successful save returns to the goal.
      router.push(`/goals/${goalId}`);
    } catch (error) {
      setItemError(error instanceof Error ? error.message : 'Could not save this line item.');
    } finally {
      setSavingItem(false);
    }
  }

  async function handleDeleteLineItem(lineItemId: string) {
    if (!uid) return;
    const existing = lineItemDocs.find((item) => item.id === lineItemId);
    await deleteGoalLineItem(uid, goalId, lineItemId, existing?.budgetRuleId);
  }

  const [addingToBudgetId, setAddingToBudgetId] = useState<string | null>(null);
  const [addToBudgetError, setAddToBudgetError] = useState<string | null>(null);

  async function handleAddToBudget(lineItemId: string) {
    if (!uid || addingToBudgetId) return;
    const lineItem = lineItemDocs.find((item) => item.id === lineItemId);
    if (!lineItem || !lineItem.categoryId) return;
    setAddingToBudgetId(lineItemId);
    setAddToBudgetError(null);
    try {
      await addGoalLineItemToBudget(
        uid,
        goalId,
        lineItemId,
        lineItem.categoryId,
        lineItem.amount,
        isTransferGoal ? 'Transfer' : categoryTransactionType.get(lineItem.categoryId) ?? 'Expense'
      );
    } catch (error) {
      setAddToBudgetError(error instanceof Error ? error.message : 'Could not add this item to the budget.');
    } finally {
      setAddingToBudgetId(null);
    }
  }

  const [completeItemId, setCompleteItemId] = useState<string | null>(null);
  const [completeAccountId, setCompleteAccountId] = useState('');
  const [completeCategoryId, setCompleteCategoryId] = useState('');
  const [completeToAccountId, setCompleteToAccountId] = useState('');
  const [completeCharges, setCompleteCharges] = useState('');
  const [completeDate, setCompleteDate] = useState(todayIso());
  const [completeDescription, setCompleteDescription] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  function openMarkComplete(lineItem: FirestoreGoalLineItem) {
    setCompleteItemId(lineItem.id);
    setCompleteAccountId(lineItem.accountId ?? accounts[0]?.id ?? '');
    setCompleteCategoryId(lineItem.categoryId ?? categoryOptions[0]?.id ?? '');
    setCompleteToAccountId(lineItem.toAccountId ?? '');
    setCompleteCharges(lineItem.charges ? String(lineItem.charges) : '');
    setCompleteDate(todayIso());
    setCompleteDescription(`${goal?.name ?? 'Goal'}: ${lineItem.name}`);
    setCompleteError(null);
  }

  async function handleMarkComplete() {
    if (!uid || completing || !completeItemId) return;
    const lineItem = lineItemDocs.find((item) => item.id === completeItemId);
    if (!lineItem || !completeAccountId) return;
    if (isTransferGoal && (!completeToAccountId || completeToAccountId === completeAccountId)) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      await markGoalLineItemComplete(
        uid,
        goalId,
        completeItemId,
        lineItem.amount,
        {
          accountId: completeAccountId,
          categoryId: completeCategoryId || null,
          date: new Date(`${completeDate}T00:00:00`),
          description: completeDescription,
          categoryType: (isTransferGoal ? 'Transfer' : categoryTransactionType.get(completeCategoryId) ?? 'Expense') as BudgetLineType,
          toAccountId: isTransferGoal ? completeToAccountId : null,
          charges: isTransferGoal ? Number(completeCharges) || 0 : null,
        },
        ctx
      );
      setCompleteItemId(null);
    } catch (error) {
      setCompleteError(error instanceof Error ? error.message : 'Could not record this payment.');
    } finally {
      setCompleting(false);
    }
  }

  const { data: exchangeRates } = useExchangeRates();
  const currencyOptions = (exchangeRates.length > 0 ? exchangeRates.map((rate) => rate.id) : [ctx.base]).map((code) => ({
    code,
    name: currencyName(code),
  }));

  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalCurrency, setGoalCurrency] = useState('');
  const [goalKind, setGoalKind] = useState<'Fixed' | 'Variable'>('Variable');
  const [goalTypeEdit, setGoalTypeEdit] = useState<'Expense' | 'Income' | 'Savings' | 'Transfer'>('Expense');
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalSaveError, setGoalSaveError] = useState<string | null>(null);

  function openGoalEdit() {
    if (!goal) return;
    setGoalName(goal.name);
    setGoalDescription(goal.description);
    setGoalDeadline(goal.deadline ? goal.deadline.toDate().toISOString().slice(0, 10) : '');
    setGoalCurrency(goal.currency);
    setGoalKind(goal.kind ?? 'Variable');
    setGoalTypeEdit(goal.type ?? 'Expense');
    setGoalSaveError(null);
    setGoalEditOpen(true);
  }

  async function handleSaveGoal() {
    if (!uid || savingGoal || !goalName.trim()) return;
    setSavingGoal(true);
    setGoalSaveError(null);
    try {
      await updateGoal(uid, goalId, {
        name: goalName.trim(),
        description: goalDescription.trim(),
        deadline: goalDeadline ? new Date(`${goalDeadline}T00:00:00`) : null,
        currency: goalCurrency || ctx.base,
        kind: goalKind,
        type: goalTypeEdit,
      });
      setGoalEditOpen(false);
    } catch (error) {
      setGoalSaveError(error instanceof Error ? error.message : 'Could not update this goal.');
    } finally {
      setSavingGoal(false);
    }
  }

  async function archiveGoal() {
    if (!uid) return;
    await archiveGoalWrite(uid, goalId);
    router.push('/goals');
  }

  async function deleteGoal() {
    if (!uid) return;
    await deleteGoalWrite(uid, goalId);
    router.push('/goals');
  }

  function goBack() {
    router.push('/goals');
  }

  return {
    goal,
    isFixedGoal,
    currency,
    lineItems,
    totalAmount,
    amountCompleted,
    amountRemaining,
    percent,
    deadline,
    availableFrozen,

    accounts,
    categories,
    categoryOptions,
    isTransferGoal,

    addOpen,
    setAddOpen,
    openAdd,
    editingItemId,
    openEditItem,
    itemName,
    setItemName,
    itemDescription,
    setItemDescription,
    itemAmount,
    setItemAmount,
    itemPriority,
    setItemPriority,
    itemNecessity,
    setItemNecessity,
    itemCategoryId,
    setItemCategoryId,
    itemAccountId,
    setItemAccountId,
    itemToAccountId,
    setItemToAccountId,
    itemCharges,
    setItemCharges,
    itemDueDate,
    setItemDueDate,
    itemRecurrenceFrequency,
    setItemRecurrenceFrequency,
    accountOptionsForCategory,
    canSaveLineItem,
    savingItem,
    itemError,
    handleAddLineItem,
    handleDeleteLineItem,
    addingToBudgetId,
    addToBudgetError,
    handleAddToBudget,

    currencyOptions,
    goalEditOpen,
    setGoalEditOpen,
    openGoalEdit,
    goalName,
    setGoalName,
    goalDescription,
    setGoalDescription,
    goalDeadline,
    setGoalDeadline,
    goalCurrency,
    setGoalCurrency,
    goalKind,
    setGoalKind,
    goalTypeEdit,
    setGoalTypeEdit,
    savingGoal,
    goalSaveError,
    handleSaveGoal,

    completeItemId,
    openMarkComplete,
    closeMarkComplete: () => setCompleteItemId(null),
    completeAccountId,
    setCompleteAccountId,
    completeCategoryId,
    setCompleteCategoryId,
    completeToAccountId,
    setCompleteToAccountId,
    completeCharges,
    setCompleteCharges,
    completeDate,
    setCompleteDate,
    completeDescription,
    setCompleteDescription,
    completing,
    completeError,
    handleMarkComplete,

    archiveGoal,
    deleteGoal,
    goBack,
    loading: ctxLoading || goalLoading || lineItemsLoading || accountsLoading || categoriesLoading,
    error: goalError || lineItemsError,
  };
}
