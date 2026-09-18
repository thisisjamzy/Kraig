'use client';

// One goal's line items — `PRD Files/prd debt n goals` section 1.3's
// checkFrozenFundsAvailable, adapted to this app's real fields: a line
// item's frozen-funds check sums every account's lockedAmount (the feature
// this PRD assumes already exists, see types.ts's FirestoreAccount header),
// converted to a single currency via CurrencyContext since wallets can hold
// different native currencies.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDoc, updateDoc } from 'firebase/firestore';
import { nextOccurrenceOnOrAfter } from '@dreda/shared-recurrence';
import { useFirestoreDoc, useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { goalRef, goalLineItemsRef, goalLineItemRef, transactionRef, transferRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { convert, round2 } from '@/src/shared/firestore/currency';
import {
  createGoalLineItem,
  updateGoalLineItem,
  deleteGoalLineItem,
  recordGoalLineItemPayment,
  addGoalLineItemToBudget,
  archiveGoal as archiveGoalWrite,
  updateGoal,
  deleteGoal as deleteGoalWrite,
  toggleGoalLineItemSubItem,
  recalcGoalTotals,
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
  GoalLineItemSubItem,
} from '@/src/shared/firestore/types';

// Recurring bills/subscriptions/savings transfers don't make sense as
// Once/Daily/Weekly — a Fixed goal's own recurrence picker only offers the
// frequencies that actually describe a repeating bill.
export const FIXED_ITEM_FREQUENCIES: Frequency[] = ['Monthly', 'Quarterly', 'Yearly'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Generous enough that nextOccurrenceOnOrAfter always finds a real
// occurrence even for a Yearly item (same reasoning as
// src/shared/firestore/upcomingPayments.ts's own `until` horizon).
const NEXT_OCCURRENCE_HORIZON = new Date(Date.now() + 3 * 365 * 24 * 3600 * 1000);

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

  // A line item completed before `actualAmount` existed (or before this
  // feature at all) has no real spend figure stored on it — but its
  // expenseId/transferId already points at the real transaction/transfer
  // that WAS recorded, so the actual amount is knowable, not just
  // assumable. This fetches that linked doc's own `amount` for exactly
  // those items and writes it back onto the line item as `actualAmount`
  // (a one-time, idempotent self-heal). No local state to track "already
  // fetched" — writing actualAmount makes the live lineItemDocs listener
  // deliver a new snapshot with it already set, which is what actually
  // drops that item out of `needsBackfill` on the next run; this effect
  // otherwise only reruns when lineItemDocs itself changes, so it can't
  // double-fire against the same stale snapshot in the meantime.
  useEffect(() => {
    if (!uid) return;
    const needsBackfill = lineItemDocs.filter(
      (item) => item.completed && item.actualAmount == null && (item.expenseId || item.transferId)
    );
    if (needsBackfill.length === 0) return;
    (async () => {
      const results = await Promise.all(
        needsBackfill.map(async (item) => {
          try {
            const realAmount = item.transferId
              ? (await getDoc(transferRef(uid, item.transferId))).data()?.amount
              : (await getDoc(transactionRef(uid, item.expenseId!))).data()?.amount;
            if (realAmount == null) return false;
            await updateDoc(goalLineItemRef(uid, goalId, item.id), { actualAmount: realAmount });
            return true;
          } catch {
            // Best-effort — a failed lookup just leaves this item without
            // a backed-up actualAmount; the display still falls back to
            // the plan same as before this ran.
            return false;
          }
        })
      );
      // The goal's own amountCompleted was last computed against whatever
      // actualAmount each line item had at the time (see
      // recordGoalLineItemPayment) — a backfill patches actualAmount
      // directly, bypassing that recompute, so without this the goal-level
      // total and the line item's own now-correct figure fall out of sync
      // (exactly the "line item says 70k, main card says 100k" mismatch).
      if (results.some(Boolean)) {
        await recalcGoalTotals(uid, goalId);
      }
    })();
  }, [uid, lineItemDocs, goalId]);

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
          // A recurring (Fixed) item's own dueDate is just its recurrence
          // ANCHOR (day-of-month/quarter/year), not a real date to show —
          // once that anchor slips into the past (which it does almost
          // immediately after creation) this rolls it forward to the next
          // real occurrence on or after today, same
          // nextOccurrenceOnOrAfter call src/shared/firestore/
          // upcomingPayments.ts already uses for Home/Payments Calendar.
          // A completed item keeps showing its plain stored date (that IS
          // the date it was paid) rather than a confusing future date next
          // to its own "Done" badge.
          dueDateObj:
            item.dueDate && !item.completed
              ? nextOccurrenceOnOrAfter(
                  {
                    frequency: item.recurrence?.frequency ?? 'Once',
                    interval: item.recurrence?.interval ?? 1,
                    anchorDate: item.dueDate.toDate(),
                    endCondition: 'Never',
                  },
                  new Date(),
                  NEXT_OCCURRENCE_HORIZON
                ) ?? item.dueDate.toDate()
              : (item.dueDate?.toDate() ?? null),
          // Sub-item rollup — consumed is what's actually been ticked off
          // the shopping list so far, against this item's own `amount` as
          // the budget cap (can go negative once over it). Absent entirely
          // when there's no checklist, so Goal Detail can tell "no
          // sub-items" apart from "sub-items, none ticked yet."
          subItems: item.subItems ?? [],
          subItemsConsumed: round2((item.subItems ?? []).filter((s) => s.completed).reduce((sum, s) => sum + s.amount, 0)),
          subItemsRemaining: round2(
            item.amount - (item.subItems ?? []).filter((s) => s.completed).reduce((sum, s) => sum + s.amount, 0)
          ),
          // Every payment recorded against this item, for the progress bar
          // and "go to the transaction" links (GoalDetailScreen.tsx). A
          // line item completed before `payments` existed has none stored
          // — synthesize its one legacy payment from expenseId/transferId
          // + actualAmount so it still shows a working link and a correct
          // spent figure instead of looking untouched.
          displayPayments:
            item.payments && item.payments.length > 0
              ? item.payments
              : item.completed && (item.expenseId || item.transferId)
                ? [
                    {
                      id: (item.transferId || item.expenseId) as string,
                      kind: (item.transferId ? 'transfer' : 'expense') as 'expense' | 'transfer',
                      amount: item.actualAmount ?? item.amount,
                    },
                  ]
                : [],
          // How much has actually been paid toward this item so far —
          // 0 for one with no payments at all yet (never falls back to the
          // planned `amount`, unlike displaySpentAmount below), so
          // isPartial and the "is there anything to show at all" check
          // below both stay honest about whether any real money has been
          // recorded.
          spentAmount: round2(item.actualAmount ?? 0),
          // What the progress bar itself fills/labels against — a
          // completed item that predates actualAmount (or was completed
          // before this feature existed at all) has no real figure to
          // show, so this falls back to the planned `amount` (a full,
          // 100% bar) rather than rendering a bar that looks like nothing
          // was ever paid on an item that's actually done.
          displaySpentAmount: round2(item.completed ? (item.actualAmount ?? item.amount) : (item.actualAmount ?? 0)),
          remainingAmount: Math.max(0, round2(item.amount - (item.actualAmount ?? 0))),
          // Some real money recorded, but the item isn't closed yet — an
          // expense being paid off across more than one transaction.
          isPartial: !item.completed && (item.actualAmount ?? 0) > 0,
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
  // The item's own shopping-list checklist — edited locally here and only
  // ever written to Firestore as part of this whole form's Save (see
  // CreateGoalLineItemInput.subItems's header), same as every other field
  // on this form. Ticking one off afterward from Goal Detail instead goes
  // through toggleSubItemLive below, a live write independent of this form.
  const [itemSubItems, setItemSubItems] = useState<GoalLineItemSubItem[]>([]);
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  function addSubItem(name: string, amount: number) {
    if (!name.trim() || !(amount > 0)) return;
    setItemSubItems((current) => [
      ...current,
      { id: crypto.randomUUID(), name: name.trim(), amount, completed: false },
    ]);
  }

  function removeSubItem(subItemId: string) {
    setItemSubItems((current) => current.filter((subItem) => subItem.id !== subItemId));
  }

  function toggleSubItemDraft(subItemId: string) {
    setItemSubItems((current) =>
      current.map((subItem) => (subItem.id === subItemId ? { ...subItem, completed: !subItem.completed } : subItem))
    );
  }

  // Ticking a sub-item off directly from Goal Detail's own line item row
  // (no need to open the edit form for that) — a live write via
  // toggleGoalLineItemSubItem, independent of this form's own draft state.
  async function toggleSubItemLive(lineItemId: string, subItemId: string) {
    if (!uid) return;
    await toggleGoalLineItemSubItem(uid, goalId, lineItemId, subItemId);
  }

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
    setItemSubItems([]);
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
    setItemSubItems(lineItem.subItems ?? []);
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
        subItems: itemSubItems,
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
  // Defaults to whatever's still owed on the item (its full planned
  // amount, minus any earlier partial payments) but is independently
  // editable — real spend is very often more or less than what was
  // budgeted, and this ONE payment's amount is what actually gets written
  // to the ledger (recordGoalLineItemPayment's paymentAmount) and folded
  // into the line item's own running actualAmount, not the plan itself.
  const [completeAmount, setCompleteAmount] = useState('');
  // Whether THIS payment closes the item — false leaves it "partial" (see
  // FirestoreGoalLineItem.completed's own header) so another payment can
  // still be recorded against it later, for an expense that isn't settled
  // in one shot.
  const [completeFullyPaid, setCompleteFullyPaid] = useState(true);
  const [completeDate, setCompleteDate] = useState(todayIso());
  const [completeDescription, setCompleteDescription] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  function openRecordPayment(lineItem: FirestoreGoalLineItem) {
    setCompleteItemId(lineItem.id);
    setCompleteAccountId(lineItem.accountId ?? accounts[0]?.id ?? '');
    setCompleteCategoryId(lineItem.categoryId ?? categoryOptions[0]?.id ?? '');
    setCompleteToAccountId(lineItem.toAccountId ?? '');
    setCompleteCharges(lineItem.charges ? String(lineItem.charges) : '');
    setCompleteAmount(String(Math.max(0, round2(lineItem.amount - (lineItem.actualAmount ?? 0)))));
    setCompleteFullyPaid(true);
    setCompleteDate(todayIso());
    setCompleteDescription(`${goal?.name ?? 'Goal'}: ${lineItem.name}`);
    setCompleteError(null);
  }

  async function handleRecordPayment() {
    if (!uid || completing || !completeItemId) return;
    const lineItem = lineItemDocs.find((item) => item.id === completeItemId);
    const paymentAmount = Number(completeAmount);
    if (!lineItem || !completeAccountId || !(paymentAmount > 0)) return;
    if (isTransferGoal && (!completeToAccountId || completeToAccountId === completeAccountId)) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      await recordGoalLineItemPayment(
        uid,
        goalId,
        completeItemId,
        paymentAmount,
        completeFullyPaid,
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
    itemSubItems,
    addSubItem,
    removeSubItem,
    toggleSubItemDraft,
    toggleSubItemLive,
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
    openRecordPayment,
    closeRecordPayment: () => setCompleteItemId(null),
    completeAccountId,
    setCompleteAccountId,
    completeCategoryId,
    setCompleteCategoryId,
    completeToAccountId,
    setCompleteToAccountId,
    completeCharges,
    setCompleteCharges,
    completeAmount,
    setCompleteAmount,
    completeFullyPaid,
    setCompleteFullyPaid,
    completeDate,
    setCompleteDate,
    completeDescription,
    setCompleteDescription,
    completing,
    completeError,
    handleRecordPayment,

    archiveGoal,
    deleteGoal,
    goBack,
    loading: ctxLoading || goalLoading || lineItemsLoading || accountsLoading || categoriesLoading,
    error: goalError || lineItemsError,
  };
}
