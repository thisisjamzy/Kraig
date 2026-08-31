'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { plannedPaymentsRef, plannedPaymentRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { computeUpcomingPayments, type UpcomingPayment } from '@/src/shared/firestore/upcomingPayments';
import { createTransactionWithAggregation } from '@/src/shared/firestore/aggregation';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestorePlannedPayment, Frequency } from '@/src/shared/firestore/types';

// Every choice a planned payment's repeat cycle can be — Once plus every
// Frequency the recurrence engine understands (packages/shared-recurrence).
// Paired with a numeric interval ("every N days/weeks/...") in the create
// form, this covers "daily", "weekly", "biweekly" (Weekly + interval 2),
// "bimonthly" (Monthly + interval 2), and similar custom cycles — it does
// NOT cover a true "N times per week" pattern (e.g. Mon+Thu), which would
// need day-of-week selection, a bigger feature the recurrence engine
// doesn't model at all yet.
export const FREQUENCY_OPTIONS: { key: Frequency; label: string; unitLabel: string; unitLabelPlural: string }[] = [
  { key: 'Once', label: 'Once', unitLabel: '', unitLabelPlural: '' },
  { key: 'Daily', label: 'Daily', unitLabel: 'day', unitLabelPlural: 'days' },
  { key: 'Weekly', label: 'Weekly', unitLabel: 'week', unitLabelPlural: 'weeks' },
  { key: 'Monthly', label: 'Monthly', unitLabel: 'month', unitLabelPlural: 'months' },
  { key: 'Quarterly', label: 'Quarterly', unitLabel: 'quarter', unitLabelPlural: 'quarters' },
  { key: 'Yearly', label: 'Yearly', unitLabel: 'year', unitLabelPlural: 'years' },
];

// The upcoming-payments list only ever shows this many rows inline — anything
// past it is reachable through "View all" instead of growing the page.
export const MAX_VISIBLE_PAYMENTS = 5;

export type DueFilter = 'all' | 'thisWeek' | 'nextWeek' | 'twoWeeks';

export const DUE_FILTERS: { key: DueFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'nextWeek', label: 'Next week' },
  { key: 'twoWeeks', label: 'In 2 weeks' },
];

export interface CapturedTransaction {
  id: string;
  title: string;
  account: string;
  amount: number;
  currency: string;
  capturedAt: string;
}

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function dayDiff(iso: string) {
  const due = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

// Rolling windows rather than calendar weeks — "this week" is the next 7
// days (including anything already overdue), then the 7 days after that,
// then the 7 after that.
function matchesDueFilter(iso: string, filter: DueFilter) {
  if (filter === 'all') return true;
  const diff = dayDiff(iso);
  if (filter === 'thisWeek') return diff <= 6;
  if (filter === 'nextWeek') return diff >= 7 && diff <= 13;
  return diff >= 14 && diff <= 20;
}

export function dueLabel(iso: string) {
  const diff = dayDiff(iso);
  if (diff < 0) return `Overdue by ${Math.abs(diff)}d`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due in ${diff}d`;
}

export function isOverdue(iso: string) {
  return dayDiff(iso) < 0;
}

export function formatDueDate(iso: string) {
  const parsed = new Date(`${iso}T00:00:00`);
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = parsed.toLocaleString('en-US', { month: 'short' });
  return `${day} ${month}`;
}

export function formatToday() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = today.toLocaleString('en-US', { month: 'short' });
  return `${day} ${month} ${today.getFullYear()}`;
}

const HORIZON_DAYS = 90;

export function useLogic() {
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;
  const activePlannedPaymentsQuery = useMemo(
    () => (uid ? query(plannedPaymentsRef(uid), where('archived', '==', false)) : null),
    [uid]
  );
  const {
    data: plannedPayments,
    loading: plannedPaymentsLoading,
    error: plannedPaymentsError,
  } = useFirestoreCollection<FirestorePlannedPayment>(activePlannedPaymentsQuery);
  const { data: accounts, loading: accountsLoading } = useAccounts();
  // Frozen wallets can't receive a captured payment until unfrozen (see
  // aggregation.ts's frozen check, the enforcement point this is the UX
  // side of) — accountName below still resolves names for every account,
  // including frozen ones, for anything already captured against one.
  const payableAccounts = useMemo(() => accounts.filter((account) => !account.frozen), [accounts]);
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { data: expenseCategories } = useCategories('Expense');
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const [captured, setCaptured] = useState<CapturedTransaction[]>([]);
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [dueFilterPickerOpen, setDueFilterPickerOpen] = useState(false);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState<UpcomingPayment | null>(null);
  const [confirmAccountId, setConfirmAccountId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [newFrequency, setNewFrequency] = useState<Frequency>('Monthly');
  const [newInterval, setNewInterval] = useState('1');
  const [newEndAfterOccurrences, setNewEndAfterOccurrences] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());

  const accountName = useMemo(() => {
    const map = new Map(accounts.map((account) => [account.id, account.name]));
    return (id: string | null) => (id && map.get(id)) || '';
  }, [accounts]);

  const pending = useMemo(
    () => computeUpcomingPayments(plannedPayments, accounts, categories, ctx, HORIZON_DAYS),
    [plannedPayments, accounts, categories, ctx]
  );

  function openAddPayment() {
    setNewCategoryId('');
    setNewDescription('');
    setNewAmount('');
    setNewDueDate('');
    setNewAccountId('');
    setNewFrequency('Monthly');
    setNewInterval('1');
    setNewEndAfterOccurrences('');
    setCreateError(null);
    setAddOpen(true);
  }

  // Mirrors src/logic/addTransaction/useLogic.ts's date picker exactly —
  // same month-stepper + day-grid interaction, reused here for the due-date
  // field so both pickers behave identically.
  function openDatePicker() {
    const base = newDueDate ? new Date(`${newDueDate}T00:00:00`) : new Date();
    setPickerMonth(base.getMonth());
    setPickerYear(base.getFullYear());
    setDatePickerOpen(true);
  }

  function chooseDueDay(day: number) {
    const iso = `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setNewDueDate(iso);
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

  const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();

  async function handleCreatePayment() {
    if (!newCategoryId || !newDescription.trim() || !newAmount || !newDueDate || creating || !uid) return;
    setCreating(true);
    setCreateError(null);
    try {
      const id = crypto.randomUUID();
      const endOccurrences = Number(newEndAfterOccurrences.replace(/[^0-9]/g, '')) || 0;
      await setDoc(plannedPaymentRef(uid, id), {
        categoryId: newCategoryId,
        description: newDescription.trim(),
        amount: Number(newAmount.replace(/[^0-9]/g, '')) || 0,
        frequency: newFrequency,
        interval: Math.max(1, Number(newInterval.replace(/[^0-9]/g, '')) || 1),
        anchorDate: Timestamp.fromDate(new Date(`${newDueDate}T00:00:00`)),
        endCondition: endOccurrences > 0 ? 'After Occurrences' : 'Never',
        endOccurrences: endOccurrences > 0 ? endOccurrences : null,
        endDate: null,
        accountId: newAccountId || null,
        archived: false,
      });
      setAddOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not add this planned payment.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeletePayment(id: string) {
    if (!uid) return;
    await updateDoc(plannedPaymentRef(uid, id), { archived: true });
  }

  function chooseDueFilter(filter: DueFilter) {
    setDueFilter(filter);
    setDueFilterPickerOpen(false);
  }

  // Tapping the checkmark only opens the review step — nothing is committed
  // (or removed from the calendar) until the user confirms it.
  function openConfirmPayment(id: string) {
    const payment = pending.find((entry) => entry.id === id);
    if (!payment) return;
    setConfirmingPayment(payment);
    setConfirmAccountId(payment.accountId ?? payableAccounts[0]?.id ?? '');
    setConfirmError(null);
  }

  function cancelConfirmPayment() {
    setConfirmingPayment(null);
  }

  async function confirmPayment() {
    const payment = confirmingPayment;
    if (!payment || !confirmAccountId || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const uid = getFirebaseAuth().currentUser?.uid;
      if (!uid) throw new Error('Not signed in.');
      const clientId = crypto.randomUUID();
      const now = new Date();
      // Matches sheets/Code.gs's upcomingBudgetPayments_ (and the pre-existing
      // Budget screen quirk): the rule's amount is already display-currency
      // converted here and stored as-is, same as before this migration.
      await createTransactionWithAggregation(
        {
          id: clientId,
          date: now,
          type: 'Expense',
          description: payment.title,
          accountId: confirmAccountId,
          categoryId: payment.categoryId,
          amount: payment.amount,
          direction: 'Outflow',
          createdBy: uid,
        },
        ctx
      );
      setCaptured((current) => [
        {
          id: payment.id,
          title: payment.title,
          account: accountName(confirmAccountId),
          amount: payment.amount,
          currency: payment.currency,
          capturedAt: now.toISOString(),
        },
        ...current,
      ]);
      setConfirmingPayment(null);
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : 'Could not record this payment.');
    } finally {
      setConfirming(false);
    }
  }

  function goBack() {
    router.push('/home');
  }

  const filteredPending = pending.filter((payment) => matchesDueFilter(payment.dueDate, dueFilter));
  const visiblePending = filteredPending.slice(0, MAX_VISIBLE_PAYMENTS);
  const hasMorePending = filteredPending.length > MAX_VISIBLE_PAYMENTS;

  return {
    filteredPending,
    visiblePending,
    hasMorePending,
    dueFilter,
    setDueFilter,
    dueFilterPickerOpen,
    setDueFilterPickerOpen,
    chooseDueFilter,
    viewAllOpen,
    setViewAllOpen,
    captured,
    confirmingPayment,
    confirmAccountId,
    setConfirmAccountId,
    accounts: payableAccounts,
    confirming,
    confirmError,
    openConfirmPayment,
    cancelConfirmPayment,
    confirmPayment,
    goBack,

    addOpen,
    setAddOpen,
    openAddPayment,
    expenseCategories,
    newCategoryId,
    setNewCategoryId,
    newDescription,
    setNewDescription,
    newAmount,
    setNewAmount,
    newDueDate,
    newAccountId,
    setNewAccountId,
    newFrequency,
    setNewFrequency,
    newInterval,
    setNewInterval,
    newEndAfterOccurrences,
    setNewEndAfterOccurrences,
    creating,
    createError,
    handleCreatePayment,
    handleDeletePayment,

    datePickerOpen,
    setDatePickerOpen,
    openDatePicker,
    chooseDueDay,
    shiftPickerMonth,
    pickerMonth,
    pickerYear,
    daysInMonth,

    loading: authLoading || plannedPaymentsLoading || accountsLoading || categoriesLoading || ctxLoading,
    error: plannedPaymentsError,
  };
}
