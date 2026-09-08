'use client';

// Upcoming payments now come straight from goal line items' own due dates
// (src/shared/firestore/upcomingPayments.ts's computeUpcomingPaymentsFromGoalItems)
// instead of the separate plannedPayments collection — "add an upcoming
// payment" means "add a goal line item with a due date" on Goal Detail now,
// so this screen no longer has its own create flow; it only reviews and
// confirms what's already there. plannedPayments itself (collection,
// computeUpcomingPayments, FirestorePlannedPayment) is left in place,
// simply unused, not migrated or deleted.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { goalsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { computeUpcomingPaymentsFromGoalItems, type UpcomingGoalPayment } from '@/src/shared/firestore/upcomingPayments';
import { markGoalLineItemComplete } from '@/src/shared/firestore/aggregation';
import { useGoalLineItemsByGoal } from '@/src/shared/hooks/useGoalLineItemsByGoal';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreGoal } from '@/src/shared/firestore/types';

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

  const goalsQuery = useMemo(() => (uid ? query(goalsRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: goalDocs, loading: goalsLoading, error: goalsError } = useFirestoreCollection<FirestoreGoal>(goalsQuery);
  const { itemsByGoal, loading: goalItemsLoading } = useGoalLineItemsByGoal(goalDocs);

  const { data: accounts, loading: accountsLoading } = useAccounts();
  // Frozen wallets can't receive a captured payment until unfrozen (see
  // aggregation.ts's frozen check, the enforcement point this is the UX
  // side of) — accountName below still resolves names for every account,
  // including frozen ones, for anything already captured against one.
  const payableAccounts = useMemo(() => accounts.filter((account) => !account.frozen), [accounts]);
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const [captured, setCaptured] = useState<CapturedTransaction[]>([]);
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [dueFilterPickerOpen, setDueFilterPickerOpen] = useState(false);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState<UpcomingGoalPayment | null>(null);
  const [confirmAccountId, setConfirmAccountId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const accountName = useMemo(() => {
    const map = new Map(accounts.map((account) => [account.id, account.name]));
    return (id: string | null) => (id && map.get(id)) || '';
  }, [accounts]);

  const pending = useMemo(
    () => computeUpcomingPaymentsFromGoalItems(goalDocs, itemsByGoal, accounts, categories, ctx, HORIZON_DAYS),
    [goalDocs, itemsByGoal, accounts, categories, ctx]
  );

  function chooseDueFilter(filter: DueFilter) {
    setDueFilter(filter);
    setDueFilterPickerOpen(false);
  }

  // Tapping the checkmark only opens the review step — nothing is committed
  // until the user confirms it.
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
    if (!payment || !confirmAccountId || confirming || !uid) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const now = new Date();
      await markGoalLineItemComplete(
        uid,
        payment.goalId,
        payment.id,
        payment.amount,
        {
          accountId: confirmAccountId,
          categoryId: payment.categoryId || null,
          date: now,
          description: payment.title,
          categoryType: categories.find((category) => category.id === payment.categoryId)?.transactionType === 'Savings'
            ? 'Savings'
            : 'Expense',
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

  function goToGoals() {
    router.push('/goals');
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
    goToGoals,

    loading: authLoading || goalsLoading || goalItemsLoading || accountsLoading || categoriesLoading || ctxLoading,
    error: goalsError,
  };
}
