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
  deleteGoalLineItem,
  markGoalLineItemComplete,
  archiveGoal as archiveGoalWrite,
} from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreGoal, FirestoreGoalLineItem } from '@/src/shared/firestore/types';

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
  const { data: categories, loading: categoriesLoading } = useCategories('Expense');

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
          shortfall: Math.max(0, round2(item.amount - availableFrozen)),
          hasFunds: availableFrozen >= item.amount,
        }))
        .sort((a, b) => Number(a.completed) - Number(b.completed)),
    [lineItemDocs, availableFrozen]
  );

  const totalAmount = goal?.totalAmount ?? 0;
  const amountCompleted = goal?.amountCompleted ?? 0;
  const amountRemaining = Math.max(0, round2(totalAmount - amountCompleted));
  const percent = goal && goal.lineItemCount > 0 ? Math.round((goal.completedLineItemCount / goal.lineItemCount) * 100) : 0;
  const deadline = goal?.deadline ? goal.deadline.toDate() : null;

  const [addOpen, setAddOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  function openAdd() {
    setItemName('');
    setItemDescription('');
    setItemAmount('');
    setItemError(null);
    setAddOpen(true);
  }

  async function handleAddLineItem() {
    if (!uid || savingItem) return;
    const amount = Number(itemAmount);
    if (!itemName.trim() || !(amount > 0)) return;
    setSavingItem(true);
    setItemError(null);
    try {
      await createGoalLineItem(uid, goalId, {
        name: itemName.trim(),
        description: itemDescription.trim(),
        amount,
      });
      setAddOpen(false);
    } catch (error) {
      setItemError(error instanceof Error ? error.message : 'Could not add this line item.');
    } finally {
      setSavingItem(false);
    }
  }

  async function handleDeleteLineItem(lineItemId: string) {
    if (!uid) return;
    await deleteGoalLineItem(uid, goalId, lineItemId);
  }

  const [completeItemId, setCompleteItemId] = useState<string | null>(null);
  const [completeAccountId, setCompleteAccountId] = useState('');
  const [completeCategoryId, setCompleteCategoryId] = useState('');
  const [completeDate, setCompleteDate] = useState(todayIso());
  const [completeDescription, setCompleteDescription] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  function openMarkComplete(lineItem: FirestoreGoalLineItem) {
    setCompleteItemId(lineItem.id);
    setCompleteAccountId(accounts[0]?.id ?? '');
    setCompleteCategoryId(categories[0]?.id ?? '');
    setCompleteDate(todayIso());
    setCompleteDescription(`${goal?.name ?? 'Goal'}: ${lineItem.name}`);
    setCompleteError(null);
  }

  async function handleMarkComplete() {
    if (!uid || completing || !completeItemId) return;
    const lineItem = lineItemDocs.find((item) => item.id === completeItemId);
    if (!lineItem || !completeAccountId) return;
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

  async function archiveGoal() {
    if (!uid) return;
    await archiveGoalWrite(uid, goalId);
    router.push('/goals');
  }

  function goBack() {
    router.push('/goals');
  }

  return {
    goal,
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

    addOpen,
    setAddOpen,
    openAdd,
    itemName,
    setItemName,
    itemDescription,
    setItemDescription,
    itemAmount,
    setItemAmount,
    savingItem,
    itemError,
    handleAddLineItem,
    handleDeleteLineItem,

    completeItemId,
    openMarkComplete,
    closeMarkComplete: () => setCompleteItemId(null),
    completeAccountId,
    setCompleteAccountId,
    completeCategoryId,
    setCompleteCategoryId,
    completeDate,
    setCompleteDate,
    completeDescription,
    setCompleteDescription,
    completing,
    completeError,
    handleMarkComplete,

    archiveGoal,
    goBack,
    loading: ctxLoading || goalLoading || lineItemsLoading || accountsLoading || categoriesLoading,
    error: goalError || lineItemsError,
  };
}
