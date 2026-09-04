'use client';

// PRD-BUDGET-TRANSACTIONS.md section 3.3. This screen now has two modes,
// chosen by whether `month` is present on the URL:
//   - month present: every transaction for that month, unfiltered by
//     category — the Budget screen's own "View all N transactions this
//     month" link.
//   - month absent: last CATEGORY_PAGE_SIZE transactions overall — the
//     app's own "all transactions" view (`isAllTransactionsView`), reached
//     from Home's own quick-action link.
//
// The category drill-down ("zoom into one budget item") used to be a third
// mode here, keyed off a `categoryId` query param — it now has its own
// route, src/screens/CategoryTransactions (mounted at
// /budget/category/[categoryId]), because a query-param-only mode on this
// shared page went stale on client-side navigation between two categories
// (see that screen's own useLogic.ts for why).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where, orderBy, limit } from 'firebase/firestore';
import { ArrowUpRight, ArrowDownLeft, PiggyBank, type LucideIcon } from 'lucide-react';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { transactionsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor } from '@/src/viewmodels/wallets';
import type { FirestoreTransaction } from '@/src/shared/firestore/types';

// Same set Add Transaction's type step uses (src/logic/addTransaction) —
// keyed by FirestoreTransaction.type (Title-Case), Transfer excluded since
// this screen only reads the transactions collection, never transfers.
const TYPE_ICONS: Record<string, LucideIcon> = {
  Expense: ArrowUpRight,
  Income: ArrowDownLeft,
  Savings: PiggyBank,
};

const ALL_TIME_PAGE_SIZE = 300;
const MONTH_ONLY_PAGE_SIZE = 300;

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatDate(ts: FirestoreTransaction['date']) {
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

// Read directly off window.location.search (not useSearchParams()) so this
// screen never needs a Suspense boundary — same precedent as
// src/logic/addTransaction/useLogic.ts's retroTargetFromSearch. `month` is
// 0-based, matching every other screen's own URL convention
// (src/logic/budget/useLogic.ts, src/logic/addTransaction/useLogic.ts).
function targetFromSearch(): { monthIndex: number | null; year: number | null } {
  if (typeof window === 'undefined') return { monthIndex: null, year: null };
  const params = new URLSearchParams(window.location.search);
  const monthParam = params.get('month');
  const yearParam = params.get('year');
  if (monthParam === null || yearParam === null) return { monthIndex: null, year: null };
  const monthIndex = Number(monthParam);
  const year = Number(yearParam);
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11 || !Number.isInteger(year)) {
    return { monthIndex: null, year: null };
  }
  return { monthIndex, year };
}

export function useLogic() {
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;
  const [{ monthIndex, year }] = useState(targetFromSearch);
  const hasMonth = monthIndex !== null && year !== null;
  const monthStr = hasMonth ? `${year}-${pad2(monthIndex + 1)}` : null;

  const monthOnlyQuery = useMemo(
    () => (uid && hasMonth ? query(transactionsRef(uid), where('month', '==', monthStr!), orderBy('date', 'desc'), limit(MONTH_ONLY_PAGE_SIZE)) : null),
    [uid, hasMonth, monthStr]
  );
  const allTimeQuery = useMemo(
    () => (uid && !hasMonth ? query(transactionsRef(uid), orderBy('date', 'desc'), limit(ALL_TIME_PAGE_SIZE)) : null),
    [uid, hasMonth]
  );

  const { data: monthOnlyDocs, loading: monthOnlyLoading, error: monthOnlyError } =
    useFirestoreCollection<FirestoreTransaction>(monthOnlyQuery);
  const { data: allTimeDocs, loading: allTimeLoading, error: allTimeError } =
    useFirestoreCollection<FirestoreTransaction>(allTimeQuery);

  const transactionDocs = hasMonth ? monthOnlyDocs : allTimeDocs;
  const transactionsLoading = hasMonth ? monthOnlyLoading : allTimeLoading;
  const transactionsError = hasMonth ? monthOnlyError : allTimeError;

  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  // Same color-per-account convention Home's wallet chart and Wallets use
  // (src/viewmodels/wallets.ts's walletColor, keyed by an account's own
  // fixed position in the accounts list) — every row for the same account
  // gets the same colored circle, rather than a color that just cycles by
  // row position and means nothing.
  const accountColor = useMemo(
    () => new Map(accounts.map((account, index) => [account.id, walletColor(index)])),
    [accounts]
  );
  const categoryNameFallback = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (categoryId: string | null) => (categoryId && map.get(categoryId)) || categoryId || '—';
  }, [categories]);

  const transactions = transactionDocs.map((transaction) => {
    const account = accountById.get(transaction.accountId);
    return {
      id: transaction.id,
      title: categoryNameFallback(transaction.categoryId),
      description: transaction.description,
      account: account?.name ?? transaction.accountId,
      amount: toDisplay(ctx, transaction.amount, account?.currency ?? ctx.base),
      currency: ctx.display,
      date: formatDate(transaction.date),
      icon: TYPE_ICONS[transaction.type] ?? ArrowUpRight,
      iconColor: accountColor.get(transaction.accountId) ?? walletColor(0),
    };
  });

  // Title: the month being viewed, otherwise the screen's generic default.
  const monthLabel = hasMonth
    ? new Date(year!, monthIndex!, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  function goBack() {
    router.push('/home');
  }

  function editHref(id: string) {
    return `/edit-transaction/${id}`;
  }

  return {
    transactions,
    monthLabel,
    isAllTransactionsView: !hasMonth,
    loading: authLoading || transactionsLoading || accountsLoading || categoriesLoading || ctxLoading,
    error: transactionsError,
    editHref,
    goBack,
  };
}
