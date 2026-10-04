'use client';

// One bucket's line items — `PRD Files/prd debt n goals` section 1.3's
// checkFrozenFundsAvailable, adapted to this app's real fields: a line
// item's frozen-funds check sums every account's lockedAmount (the feature
// this PRD assumes already exists, see types.ts's FirestoreAccount header),
// converted to a single currency via CurrencyContext since wallets can hold
// different native currencies.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nextOccurrenceOnOrAfter } from '@dreda/shared-recurrence';
import { useFirestoreDoc, useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketRef, bucketLineItemsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { convert, round2 } from '@/src/shared/firestore/currency';
import {
  createBucketLineItem,
  updateBucketLineItem,
  deleteBucketLineItem,
  recordBucketLineItemPayment,
  archiveBucket as archiveBucketWrite,
  restoreBucket as restoreBucketWrite,
  updateBucket,
  deleteBucket as deleteBucketWrite,
  toggleBucketLineItemSubItem,
} from '@/src/shared/firestore/aggregation';
import { useExchangeRates } from '@/src/shared/firestore/queries';
import { currencyName } from '@/src/viewmodels/currencies';
import { categoryAccentColor } from '@/src/viewmodels/categories';
import { DEFAULT_PRIORITY, DEFAULT_NECESSITY } from '@/src/viewmodels/projects';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import type {
  FirestoreBucket,
  FirestoreBucketLineItem,
  Priority,
  BucketItemNecessity,
  Frequency,
  BudgetLineType,
  BucketLineItemSubItem,
  ItemAutomation,
} from '@/src/shared/firestore/types';
import { scheduleItem } from '@/src/shared/firestore/bucketBudget';
import { useBucketProgress } from '@/src/shared/hooks/useBucketProgress';
import { isItemClosed } from '@/src/shared/budget/bucketProgress';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

// Recurring bills/subscriptions/savings transfers don't make sense as
// Once/Daily/Weekly — a Fixed bucket's own recurrence picker only offers the
// frequencies that actually describe a repeating bill.
export const FIXED_ITEM_FREQUENCIES: Frequency[] = ['Monthly', 'Quarterly', 'Yearly'];

/** The basket item form's Repeats: the common choices, or Custom (any frequency, every N). */
export type ItemRepeat = 'none' | 'Monthly' | 'Weekly' | 'Custom';
export const CUSTOM_FREQUENCIES: Frequency[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];

function toIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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

  const bucketDocRef = useMemo(() => (uid ? bucketRef(uid, goalId) : null), [uid, goalId]);
  const { data: bucket, loading: bucketLoading, error: bucketError } = useFirestoreDoc<FirestoreBucket>(bucketDocRef);

  const lineItemsQuery = useMemo(() => (uid ? bucketLineItemsRef(uid, goalId) : null), [uid, goalId]);
  const { data: lineItemDocs, loading: lineItemsLoading, error: lineItemsError } =
    useFirestoreCollection<FirestoreBucketLineItem>(lineItemsQuery);

  // Spend per item and the bucket's own progress — one derivation shared
  // with the Buckets list and the Budget screen (src/shared/budget/
  // bucketProgress.ts), never the stored actualAmount/amountCompleted
  // copies (see that file's header for why those disagreed).
  const { month: thisMonth, monthData: monthBudget, itemSpend, progressByBucket, loading: progressLoading } =
    useBucketProgress();
  const progress = progressByBucket.get(goalId) ?? null;

  const { data: accounts, loading: accountsLoading } = useAccounts();
  // A bucket has a type now (FirestoreBucket.type) — Expense, Income, or
  // Savings — that constrains which categories its own line items may
  // ever use: an Expense bucket only ever offers Expense categories, and so
  // on. "Dedicated" for an Income category means the household knows
  // exactly where that money is expected to come from, the same way it
  // means "knows exactly what it's for" for an Expense category and
  // "knows exactly where it's going and when" for a Savings one. Optional
  // for back-compat with a bucket written before this field existed —
  // defaults to 'Expense', same convention as `kind`.
  const bucketType = bucket?.type ?? 'Expense';
  const isTransferBucket = bucketType === 'Transfer';
  // Need and priority belong to expenses and savings only.
  const hasNeed = bucketType === 'Expense' || bucketType === 'Savings';
  const { data: allCategories, loading: categoriesLoading } = useCategories();
  const categories = useMemo(
    () => allCategories.filter((category) => category.transactionType === bucketType),
    [allCategories, bucketType]
  );
  const categoryTransactionType = useMemo(
    () => new Map(categories.map((category) => [category.id, category.transactionType])),
    [categories]
  );
  const categoryNameFallback = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (id: string | undefined | null) => (id && map.get(id)) || id || 'No category';
  }, [categories]);
  // A Transfer bucket has no real category at all — its "category" picker
  // offers the same fixed TRANSFER_CATEGORIES kind strings a Transfer
  // budget rule already uses (src/logic/addBudgetCategory/useLogic.ts),
  // not a categories/{id} — reused as-is here rather than inventing a
  // second pseudo-category convention.
  const transferKindOptions = useMemo(() => TRANSFER_CATEGORIES.map((kind) => ({ id: kind, name: kind })), []);
  // What the line item form's own "category" row actually iterates —
  // real categories for every bucket type except Transfer, which shows the
  // kind list instead.
  const categoryOptions = isTransferBucket ? transferKindOptions : categories;
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
    if (isTransferBucket) return nonFrozenAccounts;
    return categoryTransactionType.get(categoryId) === 'Savings' ? savingsAccounts : spendableAccounts;
  }

  const currency = bucket?.currency ?? ctx.display;

  // All wallets' lockedAmount, converted to the bucket's own currency so it's
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
        .map((item) => {
          const closed = isItemClosed(item, bucket?.kind);
          const spent = itemSpend.get(item.id)?.total ?? 0;
          return {
          ...item,
          // A recurring item is never closed for good — a stale `completed`
          // written by pre-v2 code is ignored (isItemClosed).
          completed: closed,
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
            item.dueDate && !closed
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
          // when there's no checklist, so Bucket Detail can tell "no
          // sub-items" apart from "sub-items, none ticked yet."
          subItems: item.subItems ?? [],
          subItemsConsumed: round2((item.subItems ?? []).filter((s) => s.completed).reduce((sum, s) => sum + s.amount, 0)),
          subItemsRemaining: round2(
            item.amount - (item.subItems ?? []).filter((s) => s.completed).reduce((sum, s) => sum + s.amount, 0)
          ),
          // Every payment recorded against this item, for the "go to the
          // transaction" chips (BucketDetailScreen.tsx).
          displayPayments: item.payments ?? [],
          // Real money recorded against this item, all months, from
          // bucketProgress.ts's buildItemSpend (explicit links + legacy
          // payments). Only shown for a one-off (Planned) item — a recurring
          // item's status is per month, the "this month" row.
          spentAmount: round2(spent),
          displaySpentAmount: round2(spent),
          remainingAmount: Math.max(0, round2(item.amount - spent)),
          // Some real money recorded, but the item isn't closed yet — an
          // expense being paid off across more than one transaction.
          isPartial: !closed && spent > 0,
          };
        })
        .sort((a, b) => Number(a.completed) - Number(b.completed)),
    [lineItemDocs, availableFrozen, categoryNameFallback, bucket?.kind, itemSpend]
  );

  // The progress card: a Fixed bucket's figures are this month's, a
  // Planned bucket's are its whole plan (BucketProgress.scope).
  const amountCompleted = progress?.spent ?? 0;
  const amountRemaining = Math.max(0, round2((progress?.planned ?? 0) - amountCompleted));
  const percent = progress?.percent ?? 0;
  const deadline = bucket?.deadline ? bucket.deadline.toDate() : null;

  const [addOpen, setAddOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemPriority, setItemPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [itemNecessity, setItemNecessity] = useState<BucketItemNecessity>(DEFAULT_NECESSITY);
  const [itemCategoryId, setItemCategoryIdState] = useState('');
  const [itemAccountId, setItemAccountId] = useState('');
  // Transfer bucket items only — the account the amount lands in, and the
  // planned cost of the move.
  const [itemToAccountId, setItemToAccountId] = useState('');
  const [itemCharges, setItemCharges] = useState('');
  const [itemDueDate, setItemDueDate] = useState('');
  const [itemRecurrenceFrequency, setItemRecurrenceFrequency] = useState<Frequency>('Monthly');
  // The item's own shopping-list checklist — edited locally here and only
  // ever written to Firestore as part of this whole form's Save (see
  // CreateBucketLineItemInput.subItems's header), same as every other field
  // on this form. Ticking one off afterward from Bucket Detail instead goes
  // through toggleSubItemLive below, a live write independent of this form.
  const [itemSubItems, setItemSubItems] = useState<BucketLineItemSubItem[]>([]);
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  // The form standard's fields (docs/UI-PLATFORM-RULES.md, New basket item):
  // Repeats, Paid from, and under More options the automation, Not before,
  // Needed by and Splittable.
  const [itemRepeat, setItemRepeat] = useState<ItemRepeat>('none');
  const [itemCustomFrequency, setItemCustomFrequency] = useState<Frequency>('Quarterly');
  const [itemInterval, setItemInterval] = useState(1);
  const [itemPaidFrom, setItemPaidFrom] = useState('');
  const [itemAutomationMode, setItemAutomationMode] = useState<ItemAutomation['mode']>('off');
  const [itemNotBefore, setItemNotBefore] = useState('');
  const [itemNeededBy, setItemNeededBy] = useState('');
  const [itemSplittable, setItemSplittable] = useState(false);

  // Paid from: one of the household's accounts (savings wallets last), any
  // income, or one specific income line (its arrival pays this item).
  const incomeLineOptions = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    for (const b of monthBudget.buckets) {
      if ((b.type ?? 'Expense') !== 'Income' || b.archived) continue;
      for (const item of monthBudget.itemsByBucket[b.id] ?? []) out.push({ id: item.id, name: item.name });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [monthBudget.buckets, monthBudget.itemsByBucket]);

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

  // Ticking a sub-item off directly from Bucket Detail's own line item row
  // (no need to open the edit form for that) — a live write via
  // toggleBucketLineItemSubItem, independent of this form's own draft state.
  async function toggleSubItemLive(lineItemId: string, subItemId: string) {
    if (!uid) return;
    await toggleBucketLineItemSubItem(uid, goalId, lineItemId, subItemId);
  }

  // Picking a new category can invalidate the already-picked account (a
  // Savings-category item can't keep an Expense wallet selected, and vice
  // versa) — same "clear it rather than silently keep an invalid pick"
  // convention src/logic/addTransaction/useLogic.ts's chooseDate uses. A
  // Transfer item's kind pick never gates its accounts (see
  // accountOptionsForCategory), so there's nothing to invalidate there.
  function setItemCategoryId(categoryId: string) {
    setItemCategoryIdState(categoryId);
    if (isTransferBucket) return;
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
    setItemRepeat(bucket?.kind === 'Fixed' ? 'Monthly' : 'none');
    setItemCustomFrequency('Quarterly');
    setItemInterval(1);
    setItemPaidFrom('');
    setItemAutomationMode('off');
    setItemNotBefore('');
    setItemNeededBy('');
    setItemSplittable(false);
    setItemError(null);
    setAddOpen(true);
  }

  function openEditItem(lineItem: FirestoreBucketLineItem) {
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
    const freq = lineItem.recurrence?.frequency;
    const interval = lineItem.recurrence?.interval ?? 1;
    setItemRepeat(
      !freq || freq === 'Once' ? 'none' : (freq === 'Monthly' || freq === 'Weekly') && interval === 1 ? freq : 'Custom'
    );
    setItemCustomFrequency(freq && freq !== 'Once' ? freq : 'Quarterly');
    setItemInterval(interval);
    const a = lineItem.automation;
    setItemPaidFrom(
      a?.trigger === 'income' && a.incomeItemId
        ? `income:${a.incomeItemId}`
        : a?.trigger === 'any_income'
          ? 'any_income'
          : lineItem.accountId
            ? `account:${lineItem.accountId}`
            : ''
    );
    setItemAutomationMode(a?.mode ?? 'off');
    setItemNotBefore(lineItem.notBefore ? toIso(lineItem.notBefore.toDate()) : '');
    setItemNeededBy(lineItem.neededBy ? toIso(lineItem.neededBy.toDate()) : '');
    setItemSplittable(Boolean(lineItem.splittable));
    setItemError(null);
    setAddOpen(true);
  }

  const isFixedBucket = bucket?.kind === 'Fixed';
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
    (!isFixedBucket || itemDueDate.length > 0) &&
    (!isTransferBucket || (itemAccountId.length > 0 && itemToAccountId.length > 0 && itemAccountId !== itemToAccountId));

  /** The recurrence the form's Repeats stands for (null: doesn't repeat). */
  function recurrenceFromForm(): { frequency: Frequency; interval: number } | null {
    if (itemRepeat === 'none') return null;
    if (itemRepeat === 'Custom') return { frequency: itemCustomFrequency, interval: Math.max(1, Math.round(itemInterval) || 1) };
    return { frequency: itemRepeat, interval: 1 };
  }

  /**
   * Saves the item. `onDone` replaces the default exit (the basket's page,
   * replacing the form's history entry), e.g. closing a side peek.
   */
  async function handleAddLineItem(onDone?: () => void) {
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
        categoryType: (isTransferBucket ? 'Transfer' : categoryTransactionType.get(itemCategoryId) ?? 'Expense') as BudgetLineType,
        accountId: itemAccountId || null,
        toAccountId: isTransferBucket ? itemToAccountId || null : null,
        charges: isTransferBucket ? Number(itemCharges) || 0 : null,
        dueDate: itemDueDate ? new Date(`${itemDueDate}T00:00:00`) : null,
        recurrence: recurrenceFromForm(),
        subItems: itemSubItems,
        ...(isTransferBucket
          ? {}
          : {
              accountId: itemPaidFrom.startsWith('account:') ? itemPaidFrom.slice(8) : null,
              automation: {
                mode: itemAutomationMode,
                trigger: itemPaidFrom === 'any_income' ? 'any_income' : itemPaidFrom.startsWith('income:') ? 'income' : 'due',
                incomeItemId: itemPaidFrom.startsWith('income:') ? itemPaidFrom.slice(7) : null,
              } satisfies ItemAutomation,
            }),
        notBefore: itemNotBefore ? new Date(`${itemNotBefore}T00:00:00`) : null,
        neededBy: itemNeededBy ? new Date(`${itemNeededBy}T00:00:00`) : null,
        splittable: itemSplittable,
      };
      if (editingItemId) {
        await updateBucketLineItem(uid, goalId, editingItemId, input);
      } else {
        await createBucketLineItem(uid, goalId, bucket?.kind ?? 'Variable', input);
      }
      setAddOpen(false);
      setEditingItemId(null);
      // Add/edit lives on its own page (or a side peek on wide screens): a
      // successful save returns to the basket and never back into the form.
      if (onDone) onDone();
      else router.replace(`/baskets/${goalId}`);
    } catch (error) {
      setItemError(error instanceof Error ? error.message : 'Could not save this line item.');
    } finally {
      setSavingItem(false);
    }
  }

  async function handleDeleteLineItem(lineItemId: string) {
    if (!uid) return;
    setItemActionError(null);
    try {
      await deleteBucketLineItem(uid, goalId, lineItemId);
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : 'Could not delete this item.');
    }
  }

  // This month's view of every item (planned vs spent, moves in/out) —
  // the same derived budget the Budget screen shows, so a recurring item's
  // status is per month rather than the cumulative `completed`/payments
  // figures below (PRD-BUDGETS-V2.md section 6.3).
  const [openItemMonthId, setOpenItemMonthId] = useState<string | null>(null);

  const [addingToBudgetId, setAddingToBudgetId] = useState<string | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);

  async function handleAddToBudget(lineItemId: string) {
    if (!uid || addingToBudgetId) return;
    const lineItem = lineItemDocs.find((item) => item.id === lineItemId);
    if (!lineItem || !lineItem.categoryId) return;
    setAddingToBudgetId(lineItemId);
    setItemActionError(null);
    try {
      // PRD-BUDGETS-V2.md — a Planned item joins a month's budget by being
      // scheduled into it (its dueDate), not by bumping a category rule.
      await scheduleItem(uid, goalId, lineItemId, thisMonth);
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : 'Could not add this item to the budget.');
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
  // to the ledger (recordBucketLineItemPayment's paymentAmount) and folded
  // into the line item's own running actualAmount, not the plan itself.
  const [completeAmount, setCompleteAmount] = useState('');
  // Whether THIS payment closes the item — false leaves it "partial" (see
  // FirestoreBucketLineItem.completed's own header) so another payment can
  // still be recorded against it later, for an expense that isn't settled
  // in one shot.
  const [completeFullyPaid, setCompleteFullyPaid] = useState(true);
  const [completeDate, setCompleteDate] = useState(todayIso());
  const [completeDescription, setCompleteDescription] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  function openRecordPayment(lineItem: FirestoreBucketLineItem) {
    setCompleteItemId(lineItem.id);
    setCompleteAccountId(lineItem.accountId ?? accounts[0]?.id ?? '');
    setCompleteCategoryId(lineItem.categoryId ?? categoryOptions[0]?.id ?? '');
    setCompleteToAccountId(lineItem.toAccountId ?? '');
    setCompleteCharges(lineItem.charges ? String(lineItem.charges) : '');
    setCompleteAmount(String(Math.max(0, round2(lineItem.amount - (itemSpend.get(lineItem.id)?.total ?? 0)))));
    setCompleteFullyPaid(true);
    setCompleteDate(todayIso());
    setCompleteDescription(`${bucket?.name ?? 'Basket'}: ${lineItem.name}`);
    setCompleteError(null);
  }

  async function handleRecordPayment() {
    if (!uid || completing || !completeItemId) return;
    const lineItem = lineItemDocs.find((item) => item.id === completeItemId);
    const paymentAmount = Number(completeAmount);
    if (!lineItem || !completeAccountId || !(paymentAmount > 0)) return;
    if (isTransferBucket && (!completeToAccountId || completeToAccountId === completeAccountId)) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      await recordBucketLineItemPayment(
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
          categoryType: (isTransferBucket ? 'Transfer' : categoryTransactionType.get(completeCategoryId) ?? 'Expense') as BudgetLineType,
          toAccountId: isTransferBucket ? completeToAccountId : null,
          charges: isTransferBucket ? Number(completeCharges) || 0 : null,
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

  const [bucketEditOpen, setBucketEditOpen] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [bucketDescription, setBucketDescription] = useState('');
  const [bucketDeadline, setBucketDeadline] = useState('');
  const [bucketCurrency, setBucketCurrency] = useState('');
  const [bucketKind, setBucketKind] = useState<'Fixed' | 'Variable'>('Variable');
  const [bucketTypeEdit, setBucketTypeEdit] = useState<'Expense' | 'Income' | 'Savings' | 'Transfer'>('Expense');
  const [savingBucket, setSavingBucket] = useState(false);
  const [bucketSaveError, setBucketSaveError] = useState<string | null>(null);

  function openBucketEdit() {
    if (!bucket) return;
    setBucketName(bucket.name);
    setBucketDescription(bucket.description);
    setBucketDeadline(bucket.deadline ? bucket.deadline.toDate().toISOString().slice(0, 10) : '');
    setBucketCurrency(bucket.currency);
    setBucketKind(bucket.kind ?? 'Variable');
    setBucketTypeEdit(bucket.type ?? 'Expense');
    setBucketSaveError(null);
    setBucketEditOpen(true);
  }

  async function handleSaveBucket() {
    if (!uid || savingBucket || !bucketName.trim()) return;
    setSavingBucket(true);
    setBucketSaveError(null);
    try {
      await updateBucket(uid, goalId, {
        name: bucketName.trim(),
        description: bucketDescription.trim(),
        deadline: bucketDeadline ? new Date(`${bucketDeadline}T00:00:00`) : null,
        currency: bucketCurrency || ctx.base,
        kind: bucketKind,
        type: bucketTypeEdit,
      });
      setBucketEditOpen(false);
    } catch (error) {
      setBucketSaveError(error instanceof Error ? error.message : 'Could not update this basket.');
    } finally {
      setSavingBucket(false);
    }
  }

  async function unarchiveBucket() {
    if (!uid) return;
    await restoreBucketWrite(uid, goalId);
  }

  async function archiveBucket() {
    if (!uid) return;
    await archiveBucketWrite(uid, goalId);
    router.push('/baskets');
  }

  async function deleteBucket() {
    if (!uid) return;
    setItemActionError(null);
    try {
      await deleteBucketWrite(uid, goalId);
      router.push('/baskets');
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : 'Could not delete this basket.');
    }
  }

  // Back to the page the user came from (skipping forms); '/baskets' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/baskets');
  }

  return {
    itemRepeat,
    setItemRepeat,
    itemCustomFrequency,
    setItemCustomFrequency,
    itemInterval,
    setItemInterval,
    itemPaidFrom,
    setItemPaidFrom,
    itemAutomationMode,
    setItemAutomationMode,
    itemNotBefore,
    setItemNotBefore,
    itemNeededBy,
    setItemNeededBy,
    itemSplittable,
    setItemSplittable,
    incomeLineOptions,
    spendableAccounts,
    savingsAccounts,
    archived: Boolean(bucket?.archived),
    unarchiveBucket,
    bucket,
    isFixedBucket,
    currency,
    lineItems,
    totalAmount: progress?.planned ?? 0,
    amountCompleted,
    progress,
    amountRemaining,
    percent,
    deadline,
    availableFrozen,

    accounts,
    categories,
    categoryOptions,
    hasNeed,
    isTransferBucket,

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
    itemActionError,
    handleAddToBudget,
    thisMonth,
    monthBudget,
    openItemMonthId,
    setOpenItemMonthId,

    currencyOptions,
    bucketEditOpen,
    setBucketEditOpen,
    openBucketEdit,
    bucketName,
    setBucketName,
    bucketDescription,
    setBucketDescription,
    bucketDeadline,
    setBucketDeadline,
    bucketCurrency,
    setBucketCurrency,
    bucketKind,
    setBucketKind,
    bucketTypeEdit,
    setBucketTypeEdit,
    savingBucket,
    bucketSaveError,
    handleSaveBucket,

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

    archiveBucket,
    deleteBucket,
    goBack,
    loading: ctxLoading || bucketLoading || lineItemsLoading || accountsLoading || categoriesLoading || progressLoading,
    error: bucketError || lineItemsError,
  };
}
