'use client';

// New basket and Edit basket (src/forms/BasketForm): one form, one logic.
//   Name; Type (Income, Expenses, Savings, Transfers); Kind (Expenses
//   only: Fixed or Variable); Starts | Repeats; Default paid from
//   (Expenses, Savings, Transfers); Savings only: Target amount | Target
//   date; More options: Description, Currency (the Settings currency to
//   start), Automation default for its items.
// The Impact card says what it creates ("Creates an expense basket for
// October, repeating every month. Add items next."). "Create basket"
// opens the new basket; "Create and add items" opens New basket item in
// the same peek, replacing the history entry. Editing: changing Type is
// only allowed while the basket has no items (they'd keep categories the
// new type doesn't allow).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query } from 'firebase/firestore';
import { useAccounts, useCurrencyContext, useExchangeRates } from '@/src/shared/firestore/queries';
import { createBucket, updateBucket } from '@/src/shared/firestore/aggregation';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { bucketLineItemsRef, bucketRef } from '@/src/shared/firestore/refs';
import { usePreferences } from '@/src/shared/firestore/preferences';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { currencyName } from '@/src/viewmodels/currencies';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { useFormFinish, useFormPeek } from '@/src/shared/navigation/formPeekContext';
import { formPageHref, peekAwareParams } from '@/src/shared/navigation/formPeek';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { addMonths, monthKeyOf, monthTitleOf } from '@/src/shared/budget/monthBudget';
import { useIncomeLines } from '@/src/logic/debtForm/planFields';
import type { FirestoreBucket, FirestoreBucketLineItem } from '@/src/shared/firestore/types';

export type BasketType = 'Income' | 'Expense' | 'Savings' | 'Transfer';
export const BASKET_TYPES: BasketType[] = ['Income', 'Expense', 'Savings', 'Transfer'];
export const BASKET_TYPE_LABEL: Record<BasketType, string> = { Income: 'Income', Expense: 'Expenses', Savings: 'Savings', Transfer: 'Transfers' };
const TYPE_NOUN: Record<BasketType, string> = { Income: 'an income', Expense: 'an expense', Savings: 'a savings', Transfer: 'a transfer' };

const monthWord = (month: string) => monthTitleOf(month).split(' ')[0];

export function useLogic(basketId: string | null = null) {
  const router = useRouter();
  const finish = useFormFinish();
  const peek = useFormPeek();
  const formLink = useFormLink();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();
  const { prefs } = usePreferences();
  const { data: exchangeRates } = useExchangeRates();
  const { data: accounts } = useAccounts();
  const incomeLines = useIncomeLines();
  const currencyOptions = (exchangeRates.length > 0 ? exchangeRates.map((rate) => rate.id) : [ctx.base]).map((code) => ({ code, name: currencyName(code) }));

  // Editing: the basket and whether it has items yet.
  const { data: existing, loading: basketLoading } = useFirestoreDoc<FirestoreBucket>(useMemo(() => (uid && basketId ? bucketRef(uid, basketId) : null), [uid, basketId]));
  const { data: items } = useFirestoreCollection<FirestoreBucketLineItem>(
    useMemo(() => (uid && basketId ? query(bucketLineItemsRef(uid, basketId)) : null), [uid, basketId])
  );
  const hasItems = items.length > 0;

  const thisMonth = monthKeyOf(new Date());
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // ?type= (from a type tab's "New basket") starts the form on that type.
  const [type, setTypeState] = useState<BasketType>(() => {
    if (typeof window === 'undefined') return 'Expense';
    const wanted = peekAwareParams(window.location.search).get('type');
    return wanted === 'Income' || wanted === 'Savings' || wanted === 'Transfer' ? wanted : 'Expense';
  });
  const [kind, setKind] = useState<'Fixed' | 'Variable'>('Fixed');
  const [startMonth, setStartMonth] = useState(thisMonth);
  const [repeats, setRepeats] = useState<'monthly' | 'once'>('monthly');
  const [paidFrom, setPaidFrom] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [currency, setCurrency] = useState('');
  const [automation, setAutomation] = useState<'off' | 'remind' | 'prepare' | ''>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [seeded, setSeeded] = useState<string | null>(null);
  if (existing && basketId && seeded !== basketId) {
    setSeeded(basketId);
    setName(existing.name);
    setDescription(existing.description ?? '');
    setTypeState(existing.type ?? 'Expense');
    setKind(existing.kind ?? 'Variable');
    setStartMonth(existing.startMonth ?? thisMonth);
    setRepeats(existing.repeats ?? (existing.kind === 'Fixed' ? 'monthly' : 'once'));
    setPaidFrom(existing.defaultPaidFrom ?? '');
    setTargetAmount(existing.targetAmount ? String(existing.targetAmount) : '');
    setDeadline(existing.deadline ? existing.deadline.toDate().toISOString().slice(0, 10) : '');
    setCurrency(existing.currency ?? '');
    setAutomation(existing.automationDefault ?? '');
  }

  const editing = Boolean(basketId);
  const typeLocked = editing && hasItems;
  function setType(next: BasketType) {
    if (typeLocked) return;
    setTypeState(next);
    if (next !== 'Savings') setTargetAmount('');
  }


  const months = useMemo(() => Array.from({ length: 13 }, (_, i) => addMonths(thisMonth, i - 1)), [thisMonth]);
  const monthOptions = months.map((m) => ({ value: m, label: monthTitleOf(m) }));

  const live = accounts.filter((a) => !a.archived);
  const paidFromGroups = [
    { label: 'Accounts', options: live.filter((a) => !isSavingsAccount(a)).map((a) => ({ value: `account:${a.id}`, label: a.name })) },
    { label: 'Savings', options: [{ value: 'savings', label: 'Savings' }, ...live.filter(isSavingsAccount).map((a) => ({ value: `account:${a.id}`, label: a.name }))] },
    { label: 'Income', options: [{ value: 'any_income', label: 'Any income' }, ...incomeLines.map((l) => ({ value: `income:${l.itemId}`, label: `When ${l.name} arrives` }))] },
  ];
  const showPaidFrom = type !== 'Income';
  const showKind = type === 'Expense';

  const effectiveKind: 'Fixed' | 'Variable' = type === 'Expense' ? kind : repeats === 'monthly' ? 'Fixed' : 'Variable';
  const impact = name.trim()
    ? `${editing ? 'Saves' : 'Creates'} ${TYPE_NOUN[type]} basket for ${monthWord(startMonth)}, ${repeats === 'monthly' ? 'repeating every month' : 'for that month only'}.${editing ? '' : ' Add items next.'}`
    : `Name the basket to see what ${editing ? 'changes' : 'it creates'}.`;
  const canSave = name.trim().length > 0 && (type !== 'Savings' || !targetAmount || Number(targetAmount) > 0);

  /** Saves; `addItems` then opens New basket item in its place. */
  async function save(addItems = false) {
    if (!uid || saving || !canSave) return;
    setSaving(true);
    setSaveError(null);
    const input = {
      name: name.trim(),
      description: description.trim(),
      deadline: type === 'Savings' && deadline ? new Date(`${deadline}T00:00:00`) : null,
      currency: currency || ctx.base,
      kind: effectiveKind,
      type,
      startMonth,
      repeats,
      defaultPaidFrom: showPaidFrom ? paidFrom || null : null,
      automationDefault: automation || null,
      targetAmount: type === 'Savings' && Number(targetAmount) > 0 ? Number(targetAmount) : null,
    };
    try {
      const id = basketId ?? (await createBucket(uid, input));
      if (basketId) await updateBucket(uid, basketId, input);
      if (addItems) {
        // Same peek (or page), replacing this form's history entry.
        router.replace(peek ? formLink('basket-item', { basket: id }) : formPageHref('basket-item', { basket: id }), { scroll: false });
        return;
      }
      finish(`/baskets/${id}`);
      if (peek && !basketId) router.push(`/baskets/${id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : editing ? 'Could not save this basket.' : 'Could not create this basket.');
      setSaving(false);
    }
  }

  // Back to the page the user came from (skipping forms); '/baskets' only
  // when there's no history (src/shared/navigation/useGoBack.ts).
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(basketId ? `/baskets/${basketId}` : '/baskets');
  }

  return {
    editing,
    managed: Boolean(existing?.managed),
    context: `Money · ${monthTitleOf(startMonth)}`,
    name,
    setName,
    description,
    setDescription,
    type,
    setType,
    typeLocked,
    showKind,
    kind,
    setKind,
    startMonth,
    setStartMonth,
    monthOptions,
    repeats,
    setRepeats,
    showPaidFrom,
    paidFrom,
    setPaidFrom,
    paidFromGroups,
    targetAmount,
    setTargetAmount,
    deadline,
    setDeadline,
    currency: currency || ctx.base,
    setCurrency,
    currencyOptions,
    automation: automation || prefs.automationDefault,
    setAutomation,
    impact,
    canSave,
    saving,
    saveError,
    save,
    goBack,
    loading: ctxLoading || (editing && basketLoading),
  };
}
