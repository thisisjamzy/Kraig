'use client';

import { useEffect, useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { categoryRef, bucketsRef, transactionTemplateRef, unjustifiedWalletRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { itemCurrencyOf, toDisplay } from '@/src/shared/firestore/currency';
import { createDebt, createTransferWithAggregation, recordBucketLineItemPayment } from '@/src/shared/firestore/aggregation';
import { inferIncomeSubtype, type IncomeSubtype } from '@/src/shared/budget/flow';
import { recordHistoricEntry } from '@/src/shared/firestore/unaccountedBalance';
import { useBucketLineItemsByBucket } from '@/src/shared/hooks/useBucketLineItemsByBucket';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { basketItemFormFields, recordHint } from '@/src/shared/budget/itemKinds';
import { addMonths, itemOccurrence, monthLabel } from '@/src/shared/budget/monthBudget';
import { TRANSFER_CATEGORIES } from '@/src/viewmodels/categories';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import type {
  FirestoreCategory,
  FirestoreAccount,
  FirestoreBucket,
  FirestoreTransactionTemplate,
} from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { useFormFinish } from '@/src/shared/navigation/formPeekContext';
import { peekAwareParams } from '@/src/shared/navigation/formPeek';
import { usePreferences } from '@/src/shared/firestore/preferences';

export type TransactionType = 'expense' | 'income' | 'transfer' | 'savings';
export type Step = 'type' | 'category' | 'details' | 'review';
// Savings-only sub-choice — "moved" behaves like a Transfer (kind hardcoded
// to 'Wallet to savings'), "frozen" behaves like today's plain Savings
// entry plus isFrozenSavings: true. Shown inline at the top of the
// 'category' step rather than as its own STEP_ORDER entry.
export type SavingsMode = 'moved' | 'frozen';

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

// The inverse of CATEGORY_TYPE — a deep-linked category's own
// transactionType (PRD-BUDGET-TRANSACTIONS.md section 3.4) tells this
// screen which TransactionType tab it belongs under.
const TRANSACTION_TYPE_FOR_CATEGORY: Record<'Expense' | 'Income' | 'Savings', TransactionType> = {
  Expense: 'expense',
  Income: 'income',
  Savings: 'savings',
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
  const params = peekAwareParams(window.location.search);
  const monthParam = params.get('month');
  const yearParam = params.get('year');
  if (monthParam === null || yearParam === null) return null;
  const month = Number(monthParam);
  const year = Number(yearParam);
  if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year)) return null;
  return { year, month };
}

// PRD-BUDGET-TRANSACTIONS.md section 3.4 — a category row on the Budget
// screen (or its month transaction panel) deep-links here with
// ?categoryId=... so this flow can open straight on the 'details' step
// with that category (and its type) already selected.
// ?type=income|expense|transfer|savings opens on that type (Home's
// "Transfer" and "Record income").
function typeFromSearch(): TransactionType {
  if (typeof window === 'undefined') return 'expense';
  const t = peekAwareParams(window.location.search).get('type');
  return t === 'income' || t === 'transfer' || t === 'savings' ? t : 'expense';
}

function categoryIdFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return peekAwareParams(window.location.search).get('categoryId') ?? '';
}

// src/screens/TransactionTemplates's own "apply" action deep-links here with
// ?templateId=... — same shape as categoryIdFromSearch above, jumping
// straight to the 'details' step with every one of the template's fields
// already applied (see the prefill effect below) rather than making the
// person re-pick a type/category they already chose once when they saved
// the template.
function templateIdFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return peekAwareParams(window.location.search).get('templateId') ?? '';
}

// The bucket item month sheet's "Record payment" (src/screens/
// BucketItemMonth) deep-links here with ?bucketItem=bucketId:itemId:yyyy-MM
// — that exact occurrence gets pre-linked once items load.
// "Mark as paid" also passes the amount still due (&amount=), suggested in
// the Amount field and editable. Nothing else ever fills the amount in.
function amountFromSearch(): string {
  if (typeof window === 'undefined') return '';
  const raw = peekAwareParams(window.location.search).get('amount');
  return raw && Number(raw) > 0 ? String(Number(raw)) : '';
}

// A basket page's "Add expense to this basket" (?basket=): the basket is
// chosen, the item and the amount are left to the user.
function basketFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return peekAwareParams(window.location.search).get('basket') ?? '';
}

function bucketItemFromSearch(): { bucketId: string; itemId: string; month: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = peekAwareParams(window.location.search).get('bucketItem');
  const [bucketId, itemId, month] = raw?.split(':') ?? [];
  if (!bucketId || !itemId || !/^\d{4}-\d{2}$/.test(month ?? '')) return null;
  return { bucketId, itemId, month };
}

export function useLogic() {
  const finish = useFormFinish();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [retroTarget] = useState(retroTargetFromSearch);
  const [prefillCategoryId] = useState(categoryIdFromSearch);
  const [prefillTemplateId] = useState(templateIdFromSearch);
  const [prefillBucketItem] = useState(bucketItemFromSearch);
  const [prefillAmount] = useState(amountFromSearch);
  const [step, setStep] = useState<Step>(() => (prefillCategoryId || prefillTemplateId ? 'details' : 'type'));
  const [type, setType] = useState<TransactionType>(typeFromSearch);
  const [savingsMode, setSavingsModeState] = useState<SavingsMode>('moved');
  // Income: earned, other, or borrowed (debt financing). Suggested from the
  // description and category until the household picks one.
  const [chosenIncomeSubtype, setIncomeSubtype] = useState<IncomeSubtype | null>(null);
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

  const [accountPickerFor, setAccountPickerFor] = useState<'from' | 'to' | null>(null);
  // The default wallet (Settings > Accounts and wallets), chosen once it loads.
  const { prefs } = usePreferences();
  const [defaultApplied, setDefaultApplied] = useState(false);
  if (!defaultApplied && prefs.defaultAccountId) {
    setDefaultApplied(true);
    if (!fromAccountId) setFromAccountId(prefs.defaultAccountId);
  }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // PRD-AUDIT-RECONCILIATION.md section 2.5 — "this explains part of my
  // unaccounted balance", shown only for a historic-dated (non-today),
  // non-transfer entry while the Unjustified wallet actually has a
  // nonzero balance to explain. Reset whenever the date or type changes
  // away from where the toggle would even apply, so a leftover checked
  // state can't silently apply to an unrelated entry.
  const [explainsUnjustifiedBalance, setExplainsUnjustifiedBalance] = useState(false);
  const unjustifiedWalletDocRef = useMemo(() => (uid ? unjustifiedWalletRef(uid) : null), [uid]);
  const { data: unjustifiedWallet } = useFirestoreDoc<FirestoreAccount>(unjustifiedWalletDocRef);
  const unjustifiedBalance = unjustifiedWallet?.currentBalance ?? 0;

  // Fetch the deep-linked category itself (not the budgeted-only list below —
  // it may not even have a budget line this month, section 3.4's own edge
  // case) so its real transactionType/name can drive the prefill.
  const prefillCategoryRef = useMemo(
    () => (uid && prefillCategoryId ? categoryRef(uid, prefillCategoryId) : null),
    [uid, prefillCategoryId]
  );
  const { data: prefillCategory, loading: prefillCategoryLoading } =
    useFirestoreDoc<FirestoreCategory>(prefillCategoryRef);
  const [prefillApplied, setPrefillApplied] = useState(false);

  useEffect(() => {
    if (!prefillCategoryId || prefillApplied || !prefillCategory) return;
    setType(TRANSACTION_TYPE_FOR_CATEGORY[prefillCategory.transactionType]);
    setCategory(prefillCategoryId);
    setPrefillApplied(true);
  }, [prefillCategoryId, prefillApplied, prefillCategory]);

  const templateDocRef = useMemo(
    () => (uid && prefillTemplateId ? transactionTemplateRef(uid, prefillTemplateId) : null),
    [uid, prefillTemplateId]
  );
  const { data: prefillTemplate, loading: prefillTemplateLoading } =
    useFirestoreDoc<FirestoreTransactionTemplate>(templateDocRef);
  const [templateApplied, setTemplateApplied] = useState(false);

  // Applies every field a saved template carries, straight into this
  // screen's own state — deliberately NOT going through selectType/
  // chooseSavingsMode (those reset category/charges/etc. right back out
  // again, since they're built for a person actively switching type by
  // hand, not a one-shot prefill). savingsMode only matters when the
  // template itself is type 'savings'; harmless to set unconditionally.
  useEffect(() => {
    if (!prefillTemplateId || templateApplied || !prefillTemplate) return;
    setType(prefillTemplate.type);
    setSavingsModeState(prefillTemplate.savingsMode ?? 'moved');
    setCategory(prefillTemplate.categoryId);
    setDescription(prefillTemplate.description);
    if (prefillTemplate.amount != null) setAmountString(String(prefillTemplate.amount));
    if (prefillTemplate.accountId) setFromAccountId(prefillTemplate.accountId);
    if (prefillTemplate.toAccountId) setToAccountId(prefillTemplate.toAccountId);
    if (prefillTemplate.charges != null) setChargesString(String(prefillTemplate.charges));
    setTemplateApplied(true);
  }, [prefillTemplateId, templateApplied, prefillTemplate]);

  const { data: allAccounts, loading: accountsLoading, error: accountsError } = useAccounts();
  // Frozen wallets can't be a source or destination for anything until
  // unfrozen (see aggregation.ts's frozen checks, the enforcement point this
  // filter is just the UX side of).
  const accounts = allAccounts.filter((account) => !account.frozen);
  // A Savings Account can always receive money (Income, Savings, or either
  // side of a Transfer — that's how money becomes savings, or how it moves
  // back out to a spendable wallet), but it can never fund a direct Expense.
  // Used below to keep it out of that one picker specifically.
  const spendableAccounts = accounts.filter((account) => !isSavingsAccount(account));
  const isTransfer = type === 'transfer';
  // "Moved" savings never touches a Savings envelope category — it's a
  // plain wallet-to-wallet move with a hardcoded kind — so it behaves like
  // a transfer everywhere the category/account UI branches on isTransfer.
  const isSavingsMoved = type === 'savings' && savingsMode === 'moved';
  const isSavingsFrozen = type === 'savings' && savingsMode === 'frozen';
  const isTransferLike = isTransfer || isSavingsMoved;
  const { data: fetchedCategories, loading: categoriesLoading, error: categoriesError } = useCategories(
    isTransfer ? undefined : CATEGORY_TYPE[type]
  );
  const { ctx } = useCurrencyContext();
  // Unfiltered — a ?bucketItem= deep link needs its item's category type
  // before this screen has switched to that type.
  const { data: fetchedCategoriesAll } = useCategories();

  // Which categories actually have a budget for the month `dateValue` falls
  // in — PRD-BUDGETS-V2.md: a category is budgeted when a bucket item in it
  // applies to that month, same as the Budget screen's own category list.
  // Recomputed off dateValue, not "today", so changing the date (including
  // via the Budget screen's retrospective link above) re-filters against
  // the right month.
  const { data: activeBuckets } = useFirestoreCollection<FirestoreBucket>(
    useMemo(() => (uid ? query(bucketsRef(uid), where('archived', '==', false)) : null), [uid])
  );
  const { itemsByBucket, loading: bucketItemsLoading } = useBucketLineItemsByBucket(activeBuckets);
  const bucketById = useMemo(() => new Map(activeBuckets.map((bucket) => [bucket.id, bucket])), [activeBuckets]);
  const [dateYear, dateMonth] = dateValue.split('-').map(Number);
  const dateMonthKey = `${dateYear}-${pad2(dateMonth)}`;
  const budgetedCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of Object.values(itemsByBucket).flat()) {
      if (item.categoryId && itemOccurrence(item, dateMonthKey, bucketById.get(item.goalId))) ids.add(item.categoryId);
    }
    return ids;
  }, [dateMonthKey, itemsByBucket, bucketById]);

  // Default both account pickers once accounts load, distinct accounts for
  // from/to. fromAccountId defaults to a spendable one — the initial type
  // is 'expense', and a Savings Account can't fund that.
  useEffect(() => {
    if (accounts.length === 0) return;
    setFromAccountId((current) => current || spendableAccounts[0]?.id || accounts[0].id);
    setToAccountId((current) => current || accounts[Math.min(1, accounts.length - 1)].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  // A Savings Account can never fund a direct Expense — if the type just
  // switched to 'expense' (or accounts reloaded) while one happened to be
  // selected, fall back to the first spendable account rather than letting
  // a "blocked" account silently pay for something.
  useEffect(() => {
    if (type !== 'expense') return;
    const current = accounts.find((account) => account.id === fromAccountId);
    if (current && isSavingsAccount(current)) {
      setFromAccountId(spendableAccounts[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, fromAccountId, accounts]);

  const isExpense = type === 'expense';
  const date = formatDisplayDate(dateValue);
  const categoriesForType = isTransfer
    ? TRANSFER_CATEGORIES.map((kind) => ({ id: kind, name: kind }))
    : isSavingsMoved
      ? [] // hardcoded to 'Wallet to savings' below — no picker to show
      : fetchedCategories.map((cat) => ({ id: cat.id, name: cat.name }));
  // A Transfer-type budget rule's categoryId is one of these same
  // TRANSFER_CATEGORIES strings (see src/logic/budget/useLogic.ts's
  // categoryOptionsForType), so the same budget filter applies uniformly to
  // expense/income/savings/transfer — planning "Wallet to savings" works
  // the same way as budgeting a Groceries envelope. "Moved" savings has no
  // envelope of its own to budget, so it skips this filter and the
  // budgeted/unplanned dance entirely.
  // `category` itself is a raw categoryId (or, for a transfer/moved-savings,
  // already a display label — TRANSFER_CATEGORIES/'Wallet to savings' use
  // the same string as both id and name) — the review step must never show
  // that raw id to the user, only the resolved category name.
  const categoryName = categoriesForType.find((option) => option.id === category)?.name ?? category;
  const incomeSubtype: IncomeSubtype = chosenIncomeSubtype ?? inferIncomeSubtype(description, categoryName);
  const budgetedCategoriesForType = categoriesForType.filter((option) => budgetedCategoryIds.has(option.id));

  // Recording an Expense, Income, or Savings can be linked to an incomplete
  // bucket line item instead of a plain transaction — submitting then calls
  // recordBucketLineItemPayment (bucketDetail's own "record payment" write) so
  // the item's payment status updates too, rather than creating an
  // unlinked transaction. Not offered for a transfer (a bucket item is never
  // Transfer-flavored) and only against items whose own category is one of
  // THIS type's categories (fetchedCategories is already filtered to
  // CATEGORY_TYPE[type]), so a Savings pick never lists an Expense item or
  // vice versa.
  const [linkedBucketItemId, setLinkedBucketItemIdState] = useState('');
  // The basket picked first ('' none yet, 'unsure' for "Not sure yet":
  // recorded without a basket), then one of its items.
  const [basketChoice, setBasketChoice] = useState(basketFromSearch);
  function setLinkedBucketItemId(id: string) {
    setLinkedBucketItemIdState(id);
    if (!id) setBasketChoice((current) => (current === 'unsure' ? current : ''));
  }
  const bucketNameById = useMemo(() => new Map(activeBuckets.map((bucket) => [bucket.id, bucket.name])), [activeBuckets]);
  const bucketKindById = useMemo(() => new Map(activeBuckets.map((bucket) => [bucket.id, bucket.kind ?? 'Variable'])), [activeBuckets]);
  const bucketTypeById = useMemo(() => new Map(activeBuckets.map((bucket) => [bucket.id, bucket.type ?? 'Expense'])), [activeBuckets]);
  // One option per item OCCURRENCE, not per item (PRD-BUDGETS-V2.md
  // section 4.3): a Fixed item has one every month, so it can never be
  // "completed" away — the old per-item `completed` flag hid rent forever
  // after the first payment. Occurrences from the month before and after
  // the transaction's date are offered too, for a late or early payment,
  // labelled with their month. A closed Planned item is done for good.
  const linkableBucketItems = useMemo(() => {
    // A Transfer bucket's items (categoryId = a TRANSFER_CATEGORIES kind)
    // are only offered for a transfer; every other bucket's only for its
    // own category type, via fetchedCategories.
    const isTransferType = type === 'transfer';
    const fetchedCategoryIds = new Set<string>(isTransferType ? TRANSFER_CATEGORIES : fetchedCategories.map((cat) => cat.id));
    const months = [dateMonthKey, addMonths(dateMonthKey, -1), addMonths(dateMonthKey, 1)];
    return Object.values(itemsByBucket)
      .flat()
      .filter((item) => (bucketTypeById.get(item.goalId) === 'Transfer') === isTransferType)
      .filter((item) => item.categoryId && fetchedCategoryIds.has(item.categoryId))
      .filter((item) => bucketKindById.get(item.goalId) === 'Fixed' || !item.completed)
      .flatMap((item) =>
        months.flatMap((occurrenceMonth) => {
          const occurrence = itemOccurrence(item, occurrenceMonth, bucketById.get(item.goalId));
          if (!occurrence) return [];
          const bucketName = bucketNameById.get(item.goalId) ?? 'Basket';
          return [{
            id: `${item.id}@${occurrenceMonth}`,
            itemId: item.id,
            goalId: item.goalId,
            occurrenceMonth,
            bucketName: occurrenceMonth === dateMonthKey ? bucketName : `${bucketName} · ${monthLabel(occurrenceMonth)}`,
            name: item.name,
            // Display currency: an item may be in its own (24 USD).
            amount: toDisplay(ctx, occurrence.planned, itemCurrencyOf(item, bucketById.get(item.goalId), ctx.base)),
            categoryId: item.categoryId!,
            accountId: item.accountId,
            toAccountId: item.toAccountId ?? null,
            charges: item.charges ?? null,
            isFixed: bucketKindById.get(item.goalId) === 'Fixed',
            isTransfer: isTransferType,
          }];
        })
      );
  }, [type, itemsByBucket, fetchedCategories, bucketById, bucketNameById, bucketKindById, bucketTypeById, dateMonthKey, ctx]);
  const linkedBucketItem = linkableBucketItems.find((item) => item.id === linkedBucketItemId) ?? null;
  // A linked Expense/Income/Savings item is settled as a direct write against
  // its own accountId (see handleConfirm below) even when savingsMode still
  // defaults to 'moved' — never treat it as transfer-shaped once linked, or
  // the details step would wrongly show a from/to account pair. A linked
  // Transfer item stays a transfer.
  const isEffectivelyTransferLike = isTransferLike && (!linkedBucketItem || linkedBucketItem.isTransfer);

  // Picking a basket item never fills in the amount: the amount is what
  // was actually spent, typed by the user (a Payment offers its full due
  // amount as a chip, filled only when tapped).
  function selectLinkedBucketItem(id: string) {
    const item = linkableBucketItems.find((entry) => entry.id === id);
    if (!item) return;
    setLinkedBucketItemIdState(id);
    setBasketChoice(item.goalId);
    const fields = basketItemFormFields(item);
    setCategory(fields.category);
    setDescription(fields.description);
    if (fields.fromAccountId) setFromAccountId(fields.fromAccountId);
    if (fields.toAccountId) setToAccountId(fields.toAccountId);
    if (fields.charges !== undefined) setChargesString(fields.charges);
  }

  function clearLinkedBucketItem() {
    setLinkedBucketItemId('');
  }

  // Basket, then item.
  const basketOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of linkableBucketItems) if (!seen.has(item.goalId)) seen.set(item.goalId, bucketNameById.get(item.goalId) ?? 'Basket');
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  }, [linkableBucketItems, bucketNameById]);
  function chooseBasket(id: string) {
    setBasketChoice(id);
    if (id !== 'unsure') setShowUnplanned(false);
    const current = linkableBucketItems.find((entry) => entry.id === linkedBucketItemId);
    if (!current || current.goalId !== id) {
      setLinkedBucketItemIdState('');
      // The only item in the basket is the obvious pick (amount still empty).
      const inBasket = linkableBucketItems.filter((entry) => entry.goalId === id && entry.occurrenceMonth === dateMonthKey);
      if (inBasket.length === 1) selectLinkedBucketItem(inBasket[0].id);
    }
  }
  const itemOptions = linkableBucketItems
    .filter((entry) => entry.goalId === basketChoice)
    .map((entry) => ({ value: entry.id, label: entry.occurrenceMonth === dateMonthKey ? entry.name : `${entry.name} · ${monthLabel(entry.occurrenceMonth)}` }));

  // What's left on the chosen item this month (the shared month budget).
  const monthData = useMonthBudget(type === 'transfer' ? null : dateMonthKey);
  const linkedEntry = linkedBucketItem ? monthData.budget.itemsByKey.get(linkedBucketItem.id) ?? null : null;
  const hint = linkedEntry ? recordHint(linkedEntry, linkedBucketItem!.bucketName.split(' · ')[0]) : null;
  const amountTyped = Number(amountString) || 0;
  // Only a Payment offers "Pay the full 12,000 due".
  const payFull = hint?.payFull ?? null;

  // ?bucketItem= deep link: switch to the item's own type and month, then
  // pre-link that occurrence once it shows up in linkableBucketItems.
  const [bucketItemApplied, setBucketItemApplied] = useState(false);
  const prefillItem = prefillBucketItem
    ? itemsByBucket[prefillBucketItem.bucketId]?.find((item) => item.id === prefillBucketItem.itemId)
    : undefined;
  const prefillItemType: 'Expense' | 'Income' | 'Savings' | 'Transfer' | undefined = prefillBucketItem &&
    bucketTypeById.get(prefillBucketItem.bucketId) === 'Transfer'
    ? 'Transfer'
    : prefillItem?.categoryId
      ? fetchedCategoriesAll.find((cat) => cat.id === prefillItem.categoryId)?.transactionType
      : undefined;
  useEffect(() => {
    if (!prefillBucketItem || bucketItemApplied || !prefillItemType) return;
    const wantedType = prefillItemType === 'Transfer' ? 'transfer' : TRANSACTION_TYPE_FOR_CATEGORY[prefillItemType];
    if (type !== wantedType) {
      setType(wantedType);
      if (wantedType === 'savings') setSavingsModeState('frozen');
      return;
    }
    const [year, month] = prefillBucketItem.month.split('-').map(Number);
    const today = new Date();
    if (dateMonthKey !== prefillBucketItem.month) {
      const day = year === today.getFullYear() && month === today.getMonth() + 1 ? today.getDate() : 1;
      setDateValue(`${year}-${pad2(month)}-${pad2(day)}`);
      return;
    }
    const key = `${prefillBucketItem.itemId}@${prefillBucketItem.month}`;
    if (!linkableBucketItems.some((item) => item.id === key)) return;
    selectLinkedBucketItem(key);
    if (prefillAmount) setAmountString(prefillAmount);
    setStep('details');
    setBucketItemApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillBucketItem, bucketItemApplied, prefillItemType, type, dateMonthKey, linkableBucketItems]);

  // Picking a different category by hand after linking means the user
  // changed their mind about which item this is for — unlink rather than
  // silently keep completing the old item under a mismatched category.
  function chooseCategory(id: string) {
    setCategory(id);
    if (linkedBucketItemId) setLinkedBucketItemId('');
  }
  const hasBudgetedCategories = isSavingsMoved || budgetedCategoriesForType.length > 0;
  // Unplanned: recorded outside this month's budget, so every category of
  // this type is offered. On when asked for ("Record as unplanned" or the
  // basket "Not sure yet"), and always when nothing of this type is planned
  // this month, so an unplanned expense or transfer can always be saved.
  const recordingUnplanned = !isSavingsMoved && !linkedBucketItemId && (showUnplanned || basketChoice === 'unsure' || !hasBudgetedCategories);
  // Shown list: this month's budgeted categories, or every one when unplanned.
  const categoryOptions = isSavingsMoved ? [] : recordingUnplanned ? categoriesForType : budgetedCategoriesForType;
  function setUnplanned(on: boolean) {
    setShowUnplanned(on);
    if (on) {
      setLinkedBucketItemIdState('');
      setBasketChoice('unsure');
    } else {
      if (basketChoice === 'unsure') setBasketChoice('');
      // Back to the budget: a category it doesn't plan has to be picked again.
      if (category && !budgetedCategoryIds.has(category)) setCategory('');
    }
  }
  // Where "plan it" sends them — budgets are built from bucket items now
  // (PRD-BUDGETS-V2.md), so that's Buckets, not the Budget screen.
  const budgetHref = '/baskets';
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? '';

  function selectType(key: TransactionType) {
    setType(key);
    setSavingsModeState('moved');
    setCategory(key === 'savings' ? 'Wallet to savings' : '');
    setShowUnplanned(false);
    setChargesString('');
    setExplainsUnjustifiedBalance(false);
    setLinkedBucketItemId('');
    setBasketChoice('');
  }

  function chooseSavingsMode(mode: SavingsMode) {
    setSavingsModeState(mode);
    setCategory(mode === 'moved' ? 'Wallet to savings' : '');
    setShowUnplanned(false);
    setExplainsUnjustifiedBalance(false);
    setLinkedBucketItemId('');
  }

  // Does `categoryId` still have a budget line in (year, month)? Used below
  // to catch the date moving to a month where the already-picked category
  // no longer has one — computed inline against the picked date rather than
  // via an effect on budgetedCategoryIds (which is memoized off the OLD
  // dateValue at the moment the date actually changes).
  function categoryBudgetedFor(categoryId: string, year: number, month: number) {
    const monthKey = `${year}-${pad2(month)}`;
    return Object.values(itemsByBucket)
      .flat()
      .some((item) => item.categoryId === categoryId && itemOccurrence(item, monthKey, bucketById.get(item.goalId)) != null);
  }

  function chooseDate(iso: string) {
    setDateValue(iso);
    if (iso === todayIso()) setExplainsUnjustifiedBalance(false);
    // Don't silently keep an out-of-budget selection across a date change —
    // clear it and send the user back to re-pick, same as if they'd never
    // chosen one. Unplanned mode is exempt: it opted out of the budget
    // filter entirely.
    const [isoYear, isoMonth] = iso.split('-').map(Number);
    if (!linkedBucketItemId && !recordingUnplanned && category && !categoryBudgetedFor(category, isoYear, isoMonth)) {
      setCategory('');
      setStep((current) => (current === 'details' || current === 'review' ? 'category' : current));
    }
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

  // Leaving the flow returns to where the user came from (useGoBack).
  const navigateBack = useGoBack();
  function goBack() {
    if (step === 'type') {
      navigateBack('/home');
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

  // Section 2.5's visibility condition — shown only for a historic-dated,
  // non-transfer entry while there's actually something to explain, AND
  // only for whichever direction would actually shrink the gap rather than
  // widen it: a positive gap (section 2.1) means an unrecorded EXPENSE
  // happened somewhere, so only an outflow-shaped entry (expense or
  // savings) can explain it; a negative gap means an unrecorded INCOME,
  // so only an income entry applies. Offering the toggle on the wrong
  // direction would let a well-meaning check make the gap worse instead
  // of closing it.
  const canExplainUnjustifiedBalance =
    !isEffectivelyTransferLike &&
    !linkedBucketItem &&
    dateValue !== todayIso() &&
    unjustifiedBalance !== 0 &&
    (unjustifiedBalance > 0 ? type === 'expense' || type === 'savings' : type === 'income');

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
      if (type === 'income' && incomeSubtype === 'debt_financing') {
        // Borrowed money is income for this month, and a cash debt to pay
        // back: createDebt credits the wallet with this income (tagged as
        // debt financing and linked to the new debt) in one transaction.
        const account = accounts.find((a) => a.id === fromAccountId);
        await createDebt(
          uid,
          {
            name: description.trim() || categoryName || 'Loan',
            description: '',
            debtType: 'cash',
            accountId: fromAccountId,
            principalAmount: Number(amountString),
            currency: account?.currency ?? ctx.base,
            priority: 'medium',
            startDate: date,
            notes: 'Recorded as income (debt financing).',
            credit: {
              transactionId: clientId,
              categoryId: category || linkedBucketItem?.categoryId || null,
              description,
              bucketItem: linkedBucketItem
                ? { bucketId: linkedBucketItem.goalId, itemId: linkedBucketItem.itemId, month: linkedBucketItem.occurrenceMonth ?? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
                : null,
            },
          },
          ctx
        );
      } else if (linkedBucketItem) {
        // A Fixed item's occurrence never closes the item (the write path
        // ignores fullyPaid for Fixed buckets); a Planned item closes once
        // what's paid covers its planned amount. A Transfer item records a
        // real transfer (recordBucketLineItemPayment's Transfer branch).
        await recordBucketLineItemPayment(
          uid,
          linkedBucketItem.goalId,
          linkedBucketItem.itemId,
          Number(amountString),
          // Fully paid only when this clears what's still due on the line
          // this month (what was paid before counts), never on a part.
          Number(amountString) >= (linkedEntry ? Math.max(0, linkedEntry.available - linkedEntry.actual) : linkedBucketItem.amount) - 0.5,
          {
            occurrenceMonth: linkedBucketItem.occurrenceMonth,
            accountId: fromAccountId,
            categoryId: category || linkedBucketItem.categoryId,
            date,
            description,
            categoryType: linkedBucketItem.isTransfer
              ? 'Transfer'
              : type === 'savings'
                ? 'Savings'
                : type === 'income'
                  ? 'Income'
                  : 'Expense',
            toAccountId: linkedBucketItem.isTransfer ? toAccountId : null,
            charges: linkedBucketItem.isTransfer ? Number(chargesString) || 0 : null,
            incomeSubtype: type === 'income' ? incomeSubtype : null,
          },
          ctx
        );
      } else if (isTransfer) {
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
      } else if (isSavingsMoved) {
        await createTransferWithAggregation({
          id: clientId,
          date,
          description,
          fromAccountId,
          toAccountId,
          amount: Number(amountString),
          charges: 0,
          kind: 'Wallet to savings',
          createdBy: uid,
        });
      } else {
        const direction = type === 'income' ? 'Inflow' : 'Outflow';
        await recordHistoricEntry(
          {
            date,
            type: CATEGORY_TYPE[type]!,
            description,
            accountId: fromAccountId,
            categoryId: category,
            amount: Number(amountString),
            direction,
            createdBy: uid,
            isFrozenSavings: isSavingsFrozen || undefined,
            incomeSubtype: type === 'income' ? incomeSubtype : null,
          },
          canExplainUnjustifiedBalance && explainsUnjustifiedBalance,
          ctx
        );
      }
      finish('/home');
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
      (!isEffectivelyTransferLike || (toAccountId.length > 0 && toAccountId !== fromAccountId))) ||
    (step === 'review' && !submitting);

  // The one-page form (the form standard): every field at once, so it can
  // save as soon as all of them are valid, whatever step the wizard is on.
  // Expenses go to a basket and an item, or explicitly "Not sure yet".
  const needsBasket = type === 'expense' && basketOptions.length > 0;
  const basketDone = !needsBasket || basketChoice === 'unsure' || Boolean(linkedBucketItem);
  const canSave =
    !submitting &&
    basketDone &&
    category.length > 0 &&
    description.trim().length > 0 &&
    Number(amountString) > 0 &&
    fromAccountId.length > 0 &&
    (!isEffectivelyTransferLike || (toAccountId.length > 0 && toAccountId !== fromAccountId));

  function setAmount(text: string) {
    const clean = text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 12);
    setAmountString(clean);
  }

  return {
    /** Leave the form (the one-page form has no steps to go back through). */
    close: () => navigateBack('/home'),
    canSave,
    setAmount,
    setFromAccountId,
    setToAccountId,
    step,
    type,
    incomeSubtype,
    setIncomeSubtype,
    savingsMode,
    chooseSavingsMode,
    isTransferLike: isEffectivelyTransferLike,
    category,
    categoryName,
    setCategory: chooseCategory,
    linkableBucketItems,
    linkedBucketItem,
    basketOptions,
    basketChoice,
    chooseBasket,
    itemOptions,
    needsBasket,
    /** "Leisure · Hangouts: 22,000 left of 30,000" */
    itemHelper: hint?.helper ?? (linkedBucketItem ? `${linkedBucketItem.bucketName} · ${linkedBucketItem.name}: ${formatMoney(String(linkedBucketItem.amount))} planned` : null),
    payFull,
    usePayFull: () => payFull && setAmountString(String(payFull)),
    /** "Hangouts will have 12,000 left." */
    itemImpact: hint ? hint.impact(amountTyped) : null,
    selectLinkedBucketItem,
    clearLinkedBucketItem,
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
    setShowUnplanned: setUnplanned,
    /** Recorded outside this month's budget: every category is offered. */
    recordingUnplanned,
    budgetHref,
    accounts,
    spendableAccounts,
    accountPickerFor,
    setAccountPickerFor,
    fromAccountId,
    toAccountId,
    canExplainUnjustifiedBalance,
    explainsUnjustifiedBalance,
    setExplainsUnjustifiedBalance,
    unjustifiedBalance,
    canContinue,
    selectType,
    chooseDate,
    chooseAccount,
    pressKey,
    goBack,
    goNext,
    handleConfirm,
    loading:
      accountsLoading ||
      categoriesLoading ||
      bucketItemsLoading ||
      (Boolean(prefillCategoryId) && (prefillCategoryLoading || !prefillApplied)) ||
      (Boolean(prefillTemplateId) && (prefillTemplateLoading || !templateApplied)),
    error: accountsError || categoriesError,
    submitting,
    submitError,
  };
}
