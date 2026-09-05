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
import { query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { ArrowUpRight, ArrowDownLeft, PiggyBank, ArrowLeftRight, type LucideIcon } from 'lucide-react';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { transactionsRef, transfersRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor } from '@/src/viewmodels/wallets';
import type { FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';

// Same set Add Transaction's type step uses (src/logic/addTransaction) —
// keyed by FirestoreTransaction.type (Title-Case).
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

// PRD-AUDIT-RECONCILIATION.md section 1.4's "Manage backfill batches"
// screen deep-links here with ?backfillBatch=<id> — a third mode, mutually
// exclusive with the month view above, showing exactly (and only) the
// transactions that one spread created.
function backfillBatchFromSearch(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('backfillBatch');
}

// FirestoreTransaction.type values this screen ever sees (mirrors
// TYPE_ICONS' keys), plus 'Transfer' (a FirestoreTransfer, a separate
// collection with no `type` field of its own) and 'All' for "no type filter
// applied".
export type TransactionTypeFilter = 'All' | 'Expense' | 'Income' | 'Savings' | 'Transfer';
export const TYPE_FILTERS: TransactionTypeFilter[] = ['All', 'Expense', 'Income', 'Savings', 'Transfer'];

export function useLogic() {
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;
  const [{ monthIndex, year }] = useState(targetFromSearch);
  const [backfillBatchId] = useState(backfillBatchFromSearch);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('All');
  const [accountFilter, setAccountFilter] = useState<string>('All');
  const hasMonth = monthIndex !== null && year !== null && !backfillBatchId;
  const monthStr = hasMonth ? `${year}-${pad2(monthIndex + 1)}` : null;

  const monthOnlyQuery = useMemo(
    () => (uid && hasMonth ? query(transactionsRef(uid), where('month', '==', monthStr!), orderBy('date', 'desc'), limit(MONTH_ONLY_PAGE_SIZE)) : null),
    [uid, hasMonth, monthStr]
  );
  const allTimeQuery = useMemo(
    () => (uid && !hasMonth && !backfillBatchId ? query(transactionsRef(uid), orderBy('date', 'desc'), limit(ALL_TIME_PAGE_SIZE)) : null),
    [uid, hasMonth, backfillBatchId]
  );
  const backfillBatchQuery = useMemo(
    () => (uid && backfillBatchId ? query(transactionsRef(uid), where('backfillBatchId', '==', backfillBatchId), orderBy('date', 'desc')) : null),
    [uid, backfillBatchId]
  );

  const { data: monthOnlyDocs, loading: monthOnlyLoading, error: monthOnlyError } =
    useFirestoreCollection<FirestoreTransaction>(monthOnlyQuery);
  const { data: allTimeDocs, loading: allTimeLoading, error: allTimeError } =
    useFirestoreCollection<FirestoreTransaction>(allTimeQuery);
  const { data: backfillBatchDocs, loading: backfillBatchLoading, error: backfillBatchError } =
    useFirestoreCollection<FirestoreTransaction>(backfillBatchQuery);

  const transactionDocs = backfillBatchId ? backfillBatchDocs : hasMonth ? monthOnlyDocs : allTimeDocs;
  const transactionsLoading = backfillBatchId ? backfillBatchLoading : hasMonth ? monthOnlyLoading : allTimeLoading;
  const transactionsError = backfillBatchId ? backfillBatchError : hasMonth ? monthOnlyError : allTimeError;

  // FirestoreTransfer has no `month` string field the way FirestoreTransaction
  // does (see types.ts) — the month-view query below uses a plain date range
  // instead, same shape src/logic/walletDetail/useLogic.ts already uses for
  // its own transfer queries.
  const monthOnlyTransfersQuery = useMemo(() => {
    if (!uid || !hasMonth) return null;
    const monthStart = Timestamp.fromDate(new Date(year!, monthIndex!, 1));
    const monthEnd = Timestamp.fromDate(new Date(year!, monthIndex! + 1, 1));
    return query(
      transfersRef(uid),
      where('date', '>=', monthStart),
      where('date', '<', monthEnd),
      orderBy('date', 'desc'),
      limit(MONTH_ONLY_PAGE_SIZE)
    );
  }, [uid, hasMonth, year, monthIndex]);
  // A backfill batch (PRD-AUDIT-RECONCILIATION.md section 1) never includes
  // transfers — only createBackfillSpread's plain transactions or the
  // Unjustified-wallet explain path's transaction half get tagged with a
  // backfillBatchId, never the paired transfer — so batch mode skips this
  // query entirely rather than fetching transfers it will never show.
  const allTimeTransfersQuery = useMemo(
    () => (uid && !hasMonth && !backfillBatchId ? query(transfersRef(uid), orderBy('date', 'desc'), limit(ALL_TIME_PAGE_SIZE)) : null),
    [uid, hasMonth, backfillBatchId]
  );

  const { data: monthOnlyTransferDocs, loading: monthOnlyTransfersLoading, error: monthOnlyTransfersError } =
    useFirestoreCollection<FirestoreTransfer>(monthOnlyTransfersQuery);
  const { data: allTimeTransferDocs, loading: allTimeTransfersLoading, error: allTimeTransfersError } =
    useFirestoreCollection<FirestoreTransfer>(allTimeTransfersQuery);

  const transferDocs = hasMonth ? monthOnlyTransferDocs : allTimeTransferDocs;
  const transfersLoading = hasMonth ? monthOnlyTransfersLoading : allTimeTransfersLoading;
  const transfersError = hasMonth ? monthOnlyTransfersError : allTimeTransfersError;

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

  // Filter first (type/account, on the raw docs — cheap field checks), THEN
  // map to the display shape, so the search step below only ever scans rows
  // already narrowed by the two dropdowns. Transfers are a separate
  // collection with no `type` of their own (see FirestoreTransfer) — the
  // 'Transfer' filter value selects them exclusively, any other specific
  // type excludes them, and 'All' includes both alongside every
  // transaction type.
  const typeFilteredTransactions =
    typeFilter === 'Transfer'
      ? []
      : transactionDocs.filter((transaction) => typeFilter === 'All' || transaction.type === typeFilter);
  const accountAndTypeFilteredTransactions = typeFilteredTransactions.filter(
    (transaction) => accountFilter === 'All' || transaction.accountId === accountFilter
  );

  const typeFilteredTransfers = typeFilter === 'All' || typeFilter === 'Transfer' ? transferDocs : [];
  const accountAndTypeFilteredTransfers = typeFilteredTransfers.filter(
    (transfer) =>
      accountFilter === 'All' || transfer.fromAccountId === accountFilter || transfer.toAccountId === accountFilter
  );

  const mappedTransactions = accountAndTypeFilteredTransactions.map((transaction) => {
    const account = accountById.get(transaction.accountId);
    return {
      id: transaction.id,
      kind: 'transaction' as const,
      title: categoryNameFallback(transaction.categoryId),
      description: transaction.description,
      account: account?.name ?? transaction.accountId,
      amount: toDisplay(ctx, transaction.amount, account?.currency ?? ctx.base),
      currency: ctx.display,
      date: formatDate(transaction.date),
      sortMs: transaction.date.toMillis(),
      icon: TYPE_ICONS[transaction.type] ?? ArrowUpRight,
      iconColor: accountColor.get(transaction.accountId) ?? walletColor(0),
      // PRD-AUDIT-RECONCILIATION.md section 3 — a small origin tag so a row
      // that looks unfamiliar (a transfer nobody remembers, a January
      // entry logged in September) is legible rather than confusing.
      // isHistoricBackfill takes precedence in the rare case both were
      // ever true at once (a backfilled occurrence that also explained the
      // gap), since "Backfilled" is the more informative label there.
      origin: transaction.isHistoricBackfill
        ? ('backfill' as const)
        : transaction.isUnjustifiedAdjustment
          ? ('reconciliation' as const)
          : null,
    };
  });

  const mappedTransfers = accountAndTypeFilteredTransfers.map((transfer) => {
    const fromAccount = accountById.get(transfer.fromAccountId);
    const toAccount = accountById.get(transfer.toAccountId);
    const fromName = fromAccount?.name ?? transfer.fromAccountId;
    const toName = toAccount?.name ?? transfer.toAccountId;
    return {
      id: transfer.id,
      kind: 'transfer' as const,
      title: transfer.kind || 'Transfer',
      description: transfer.description || transfer.notes || `${fromName} → ${toName}`,
      account: `${fromName} → ${toName}`,
      // Native currency, same as a transaction row — transfers between two
      // accounts in different currencies aren't a case aggregation.ts's
      // createTransferWithAggregation actually converts (see its own
      // header), so this doesn't invent a conversion here either.
      amount: transfer.amount,
      currency: fromAccount?.currency ?? ctx.display,
      date: formatDate(transfer.date),
      sortMs: transfer.date.toMillis(),
      icon: ArrowLeftRight,
      iconColor: accountColor.get(transfer.fromAccountId) ?? walletColor(0),
      // The reconciliation-paired transfer's own tag lives on its matching
      // transaction row instead (see mappedTransactions above) — PRD-
      // AUDIT-RECONCILIATION.md section 3 only asks that the transaction
      // side be legible, not both halves independently.
      origin: null as 'backfill' | 'reconciliation' | null,
    };
  });

  const allTransactions = [...mappedTransactions, ...mappedTransfers].sort((a, b) => b.sortMs - a.sortMs);

  // Client-side, over whatever page the queries above already fetched —
  // this is a substring match Firestore itself can't do natively, and the
  // page sizes here (ALL_TIME_PAGE_SIZE/MONTH_ONLY_PAGE_SIZE, 300 rows each)
  // are small enough that scanning them in the browser is instant.
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const transactions = normalizedQuery
    ? allTransactions.filter((transaction) =>
        [transaction.title, transaction.description, transaction.account].some((field) =>
          field.toLowerCase().includes(normalizedQuery)
        )
      )
    : allTransactions;

  const hasActiveFilters = typeFilter !== 'All' || accountFilter !== 'All';
  const isFiltered = hasActiveFilters || normalizedQuery.length > 0;

  function clearFilters() {
    setTypeFilter('All');
    setAccountFilter('All');
    setSearchQuery('');
  }

  function toggleSearch() {
    // Closing the search field also drops whatever was typed — reopening it
    // should start blank, not silently re-apply a stale query the person
    // can no longer see.
    if (searchOpen) setSearchQuery('');
    setSearchOpen(!searchOpen);
  }

  function toggleFilter() {
    setFilterOpen((open) => !open);
  }

  // Title: the month being viewed, the batch's own title, or the screen's
  // generic default.
  const monthLabel = backfillBatchId
    ? (transactionDocs[0]?.description ?? 'Backfilled transactions')
    : hasMonth
      ? new Date(year!, monthIndex!, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : null;

  function goBack() {
    router.push(backfillBatchId ? '/settings/backfill/batches' : '/home');
  }

  function editHref(id: string) {
    return `/edit-transaction/${id}`;
  }

  return {
    transactions,
    isFiltered,
    monthLabel,
    isAllTransactionsView: !hasMonth && !backfillBatchId,
    loading: authLoading || transactionsLoading || transfersLoading || accountsLoading || categoriesLoading || ctxLoading,
    error: transactionsError || transfersError,
    editHref,
    goBack,

    searchOpen,
    toggleSearch,
    searchQuery,
    setSearchQuery,

    filterOpen,
    toggleFilter,
    typeFilter,
    setTypeFilter,
    accountFilter,
    setAccountFilter,
    accounts,
    hasActiveFilters,
    clearFilters,
  };
}
