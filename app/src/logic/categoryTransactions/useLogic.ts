'use client';

// The Budget screen's category "zoom" — its own route
// (/budget/category/[categoryId]) rather than a mode of the general
// TransactionHistoryScreen (src/logic/transactionHistory/useLogic.ts). It
// used to be one of that screen's three modes, keyed off a `categoryId`
// query param read once via a useState lazy initializer — but Next.js only
// remounts a page (re-running that initializer) when the URL PATHNAME
// changes, not when only its query string does. Clicking a second budget
// item while the first one's page was still mounted (same `/transactions`
// pathname, different `?categoryId=`) left the screen showing the first
// category's stale data until a manual refresh. Making categoryId a route
// segment fixes this structurally: navigating between two categories is a
// pathname change, so Next.js always remounts fresh.
//
// `month`/`year` stay query params (read off window.location.search in a
// lazy initializer, same precedent as src/logic/addTransaction/useLogic.ts)
// — the only entry point here is the Budget screen's own category row,
// which always passes both categoryId and month/year together, so revisiting
// this route for a *different* category always goes through a pathname
// change first. The one path that could still latch onto a stale month/year
// (clicking the same category again from a different month without leaving
// this route in between) isn't reachable from anywhere in the app today.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where, orderBy, limit } from 'firebase/firestore';
import { ArrowUpRight, ArrowDownLeft, PiggyBank, type LucideIcon } from 'lucide-react';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transactionsRef, categoryRef, bucketsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { itemOccurrence } from '@/src/shared/budget/monthBudget';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useBucketLineItemsByBucket } from '@/src/shared/hooks/useBucketLineItemsByBucket';
import { categoryAccentColor } from '@/src/viewmodels/categories';
import type { FirestoreTransaction, FirestoreBucket, FirestoreCategory } from '@/src/shared/firestore/types';

const TYPE_ICONS: Record<string, LucideIcon> = {
  Expense: ArrowUpRight,
  Income: ArrowDownLeft,
  Savings: PiggyBank,
};

// This category's whole history, capped — generous enough for years of
// normal use without an unbounded read.
const CATEGORY_PAGE_SIZE = 300;

export type TimeRange = 'week' | 'month' | 'quarter' | 'year' | 'all';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatDate(ts: FirestoreTransaction['date']) {
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function monthTargetFromSearch(): { monthIndex: number | null; year: number | null } {
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

// This screen is reachable from Budget's own category row (no returnTo —
// defaults to /budget) and, since Settings > Categories links here too, from
// there via an explicit ?returnTo so "back" lands wherever the person came
// from rather than always assuming Budget.
function returnToFromSearch(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('returnTo');
}

// The date window a time-range filter covers. `week` is always the rolling
// last 7 real days; `month`/`quarter`/`year` anchor off the month this
// screen was opened for when there is one, falling back to today's own
// month otherwise.
function rangeForPreset(preset: TimeRange, refYear: number, refMonthIndex: number): { start: Date | null; end: Date | null } {
  if (preset === 'all') return { start: null, end: null };
  const today = new Date();
  if (preset === 'week') {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 0, 0, 0, 0);
    return { start, end };
  }
  if (preset === 'month') {
    return { start: new Date(refYear, refMonthIndex, 1), end: new Date(refYear, refMonthIndex + 1, 0, 23, 59, 59, 999) };
  }
  if (preset === 'quarter') {
    const quarterStart = Math.floor(refMonthIndex / 3) * 3;
    return { start: new Date(refYear, quarterStart, 1), end: new Date(refYear, quarterStart + 3, 0, 23, 59, 59, 999) };
  }
  return { start: new Date(refYear, 0, 1), end: new Date(refYear, 11, 31, 23, 59, 59, 999) };
}

export interface ChartMonth {
  monthStr: string;
  label: string;
  budgeted: number;
  spent: number;
}

export function useLogic(categoryId: string) {
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;
  const [{ monthIndex, year }] = useState(monthTargetFromSearch);
  const [returnTo] = useState(returnToFromSearch);
  const hasMonth = monthIndex !== null && year !== null;
  const monthStr = hasMonth ? `${year}-${pad2(monthIndex + 1)}` : null;
  // Opened from a Budget category row (hasMonth): locked to that single
  // month — no range picker, no multi-month trend — so the numbers shown
  // can never drift from the exact month the person tapped into. Opened
  // from Settings > Categories (no month in the URL): the original
  // free-ranging browse-by-time-range view, since there's no specific
  // month to lock to.
  const [timeRange, setTimeRange] = useState<TimeRange>('month');

  const categoryQuery = useMemo(
    () =>
      uid ? query(transactionsRef(uid), where('categoryId', '==', categoryId), orderBy('date', 'desc'), limit(CATEGORY_PAGE_SIZE)) : null,
    [uid, categoryId]
  );
  const { data: categoryDocs, loading: transactionsLoading, error: transactionsError } =
    useFirestoreCollection<FirestoreTransaction>(categoryQuery);

  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const categoryNameFallback = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (id: string | null) => (id && map.get(id)) || id || '—';
  }, [categories]);

  // The filter's own reference month: the URL's month/year when this
  // screen was opened for one, otherwise today's.
  const today = new Date();
  const refYear = hasMonth ? year! : today.getFullYear();
  const refMonthIndex = hasMonth ? monthIndex! : today.getMonth();
  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => rangeForPreset(timeRange, refYear, refMonthIndex),
    [timeRange, refYear, refMonthIndex]
  );

  const transactions = categoryDocs
    .filter((transaction) => {
      if (rangeStart && rangeEnd) {
        const d = transaction.date.toDate();
        if (d < rangeStart || d > rangeEnd) return false;
      }
      return true;
    })
    .map((transaction) => {
      const account = accountById.get(transaction.accountId);
      const title = categoryNameFallback(transaction.categoryId);
      return {
        id: transaction.id,
        title,
        description: transaction.description,
        account: account?.name ?? transaction.accountId,
        amount: toDisplay(ctx, transaction.amount, account?.currency ?? ctx.base),
        currency: ctx.display,
        date: formatDate(transaction.date),
        icon: TYPE_ICONS[transaction.type] ?? ArrowUpRight,
        iconColor: categoryAccentColor(title),
      };
    });

  // Section 2.4 — this screen's own header/summary needs the category's real
  // name (and archived state) even if it's since been archived, so it reads
  // the doc directly instead of the archived-excluded useCategories() list
  // every other consumer uses.
  const categoryDocRef = useMemo(() => (uid ? categoryRef(uid, categoryId) : null), [uid, categoryId]);
  const { data: category, loading: categoryLoading } = useFirestoreDoc<FirestoreCategory>(categoryDocRef);
  const categoryName = category?.name ?? categoryNameFallback(categoryId);

  // Planned/spent/remaining card — the specific month this screen was
  // opened for, always shown regardless of which time-range filter the
  // transaction list below is set to. Read straight off the same derived
  // month budget the Budget screen renders (PRD-BUDGETS-V2.md section 5),
  // so the two can never disagree. "Dedicated" is spend linked to this
  // category's bucket items; "unplanned" is category-only spend.
  const showSummaryCard = hasMonth;
  const { budget: monthBudget, loading: monthBudgetLoading } = useMonthBudget(showSummaryCard ? monthStr : null);
  const summary = useMemo(() => {
    if (!showSummaryCard || !monthStr) return null;
    const group = monthBudget.categories.find((entry) => entry.categoryId === categoryId);
    if (!group) return { budgeted: 0, spent: 0, dedicated: 0, unplanned: 0, remaining: 0 };
    return {
      budgeted: group.available,
      spent: group.actual,
      dedicated: round2(group.actual - group.unplanned),
      unplanned: group.unplanned,
      remaining: group.remaining,
    };
  }, [showSummaryCard, monthStr, monthBudget, categoryId]);

  // Budget-vs-spend chart — only for the free-ranging Settings entry point
  // (no month in the URL). Opened from a Budget category row, this screen
  // is locked to that one month, so a multi-month trend has no place here.
  // When shown, it always covers the full calendar year this screen was
  // opened for (the URL's own `year`, falling back to the current year),
  // Jan through Dec, independent of the time-range filter — the filter only
  // scopes the transaction list. "Budgeted" per month is the planned amount
  // of every bucket item in this category that applies to that month.
  const bucketsQuery = useMemo(
    () => (uid && !hasMonth ? query(bucketsRef(uid), where('archived', '==', false)) : null),
    [uid, hasMonth]
  );
  const { data: bucketDocs } = useFirestoreCollection<FirestoreBucket>(bucketsQuery);
  const { itemsByBucket } = useBucketLineItemsByBucket(bucketDocs);
  const bucketCurrency = useMemo(() => new Map(bucketDocs.map((g) => [g.id, g.currency])), [bucketDocs]);

  const chart = useMemo<ChartMonth[]>(() => {
    if (hasMonth) return [];
    return Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
      const ms = `${refYear}-${pad2(m)}`;
      let budgeted = 0;
      for (const [goalId, items] of Object.entries(itemsByBucket)) {
        for (const item of items) {
          if (item.categoryId !== categoryId) continue;
          const occurrence = itemOccurrence(item, ms);
          if (occurrence) budgeted += toDisplay(ctx, occurrence.planned, bucketCurrency.get(goalId) ?? ctx.base);
        }
      }
      let spentBase = 0;
      for (const doc of categoryDocs) {
        const d = doc.date.toDate();
        if (d.getFullYear() !== refYear || d.getMonth() + 1 !== m) continue;
        const native = accountCurrency.get(doc.accountId) ?? ctx.base;
        // Same Income-vs-Expense sign convention as
        // writeTransactionContribution (aggregation.ts): for an Income
        // category the normal Inflow transaction should count as positive
        // progress, the opposite of an Expense category's Outflow.
        const signedAmount = doc.direction === 'Inflow' ? doc.amount : -doc.amount;
        const contribution = doc.type === 'Income' ? signedAmount : -signedAmount;
        spentBase += toDisplay(ctx, contribution, native);
      }
      return {
        monthStr: ms,
        label: new Date(refYear, m - 1, 1).toLocaleDateString('en-US', { month: 'short' }),
        budgeted: round2(budgeted),
        spent: round2(spentBase),
      };
    });
  }, [hasMonth, refYear, itemsByBucket, bucketCurrency, categoryId, categoryDocs, accountCurrency, ctx]);

  // Add Transaction — pre-fills this category, and lands in the month this
  // screen was opened for when there is one.
  const addTransactionHref = `/add-transaction?categoryId=${categoryId}${hasMonth ? `&month=${monthIndex}&year=${year}` : ''}`;

  function goBack() {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    router.push(hasMonth ? `/budget?month=${monthIndex}&year=${year}` : '/budget');
  }

  function editHref(id: string) {
    return `/edit-transaction/${id}`;
  }

  return {
    transactions,
    categoryName,
    categoryArchived: category?.archived ?? false,
    summary,
    lockedToMonth: hasMonth,
    timeRange,
    setTimeRange,
    chart,
    currency: ctx.display,
    addTransactionHref,
    loading:
      authLoading ||
      transactionsLoading ||
      accountsLoading ||
      categoriesLoading ||
      ctxLoading ||
      categoryLoading ||
      (showSummaryCard && monthBudgetLoading),
    error: transactionsError,
    editHref,
    goBack,
  };
}
