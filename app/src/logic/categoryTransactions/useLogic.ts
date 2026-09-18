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
import { ruleAppliesToMonth } from '@dreda/shared-recurrence';
import { ArrowUpRight, ArrowDownLeft, PiggyBank, type LucideIcon } from 'lucide-react';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { transactionsRef, budgetRulesRef, categoryRef, goalsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, convert, round2 } from '@/src/shared/firestore/currency';
import { toRecurrenceRule, goalLineItemAppliesToMonth } from '@/src/shared/firestore/recurrence';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useGoalLineItemsByGoal } from '@/src/shared/hooks/useGoalLineItemsByGoal';
import { categoryAccentColor } from '@/src/viewmodels/categories';
import type { FirestoreTransaction, FirestoreBudgetRule, FirestoreGoal, FirestoreCategory } from '@/src/shared/firestore/types';

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

  // Budgeted/spent/remaining card — the specific month this screen was
  // opened for, always shown regardless of which time-range filter the
  // transaction list below is set to. The exact same shape
  // src/logic/budget/useLogic.ts's own `categories` entry computes, so the
  // number shown here always agrees with the Budget screen.
  const showSummaryCard = hasMonth;
  const activeBudgetRulesQuery = useMemo(
    () => (uid && showSummaryCard ? query(budgetRulesRef(uid), where('archived', '==', false)) : null),
    [uid, showSummaryCard]
  );
  const { data: budgetRules, loading: budgetRulesLoading } =
    useFirestoreCollection<FirestoreBudgetRule>(activeBudgetRulesQuery);
  // Reconciling the app's two budgeting methods, same as Budget's own
  // screen (src/logic/budget/useLogic.ts's own header comment carries the
  // full reasoning): this category's budgeted estimate is "unplanned"
  // until a goal's line item claims part of it — "dedicated" is how much
  // of the estimate a goal item already claims for this month, regardless
  // of whether it's been completed/paid yet.
  const goalsQuery = useMemo(
    () => (uid && showSummaryCard ? query(goalsRef(uid), where('archived', '==', false)) : null),
    [uid, showSummaryCard]
  );
  const { data: goalDocs, loading: goalsLoading } = useFirestoreCollection<FirestoreGoal>(goalsQuery);
  const { itemsByGoal, loading: goalItemsLoading } = useGoalLineItemsByGoal(goalDocs);
  const goalCurrency = useMemo(() => new Map(goalDocs.map((g) => [g.id, g.currency])), [goalDocs]);
  const goalType = useMemo(() => new Map(goalDocs.map((g) => [g.id, g.type ?? 'Expense'])), [goalDocs]);
  // Same computation as budget/useLogic.ts's own dedicatedByCategory,
  // scoped down to this one categoryId since that's all this screen ever
  // needs — a scalar, not a Map.
  const dedicatedBase = useMemo(() => {
    if (!hasMonth) return 0;
    const targetMonth = monthIndex! + 1;
    let sum = 0;
    for (const [goalId, items] of Object.entries(itemsByGoal)) {
      const nativeCurrency = goalCurrency.get(goalId) ?? ctx.base;
      const isTransferGoal = goalType.get(goalId) === 'Transfer';
      for (const item of items) {
        if (item.categoryId !== categoryId) continue;
        const occurrence = goalLineItemAppliesToMonth(item, year!, targetMonth);
        if (!occurrence) continue;
        const amount = (isTransferGoal ? (item.charges ?? 0) : item.amount) * occurrence.multiplier;
        sum += convert(amount, nativeCurrency, ctx.base, ctx.rates);
      }
    }
    return sum;
  }, [hasMonth, itemsByGoal, goalCurrency, goalType, categoryId, year, monthIndex, ctx]);

  // categoryDocs is this whole category's history (capped, all months) —
  // narrowed down to just the exact month this screen was opened for, same
  // set the dedicated/spent split below both draw from so they can never
  // disagree with each other.
  const monthCategoryDocs = useMemo(() => {
    if (!hasMonth) return [];
    return categoryDocs.filter((t) => {
      const d = t.date.toDate();
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    });
  }, [categoryDocs, hasMonth, year, monthIndex]);

  // Same Income-vs-Expense sign convention as budget/useLogic.ts's own
  // perCategoryActualBase — an Expense/Savings Outflow counts as positive
  // "spent", the opposite of an Income category's Inflow.
  function contributionFor(t: FirestoreTransaction) {
    const native = accountById.get(t.accountId)?.currency ?? ctx.base;
    const signedAmount = t.direction === 'Inflow' ? t.amount : -t.amount;
    const contribution = t.type === 'Income' ? signedAmount : -signedAmount;
    return toDisplay(ctx, contribution, native);
  }

  const summary = useMemo(() => {
    if (!showSummaryCard || !monthStr) return null;
    const budgetedBase = budgetRules
      .filter((rule) => rule.categoryId === categoryId)
      .reduce((sum, rule) => {
        const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), year!, monthIndex! + 1);
        if (!occurrence || rule.excludedMonths?.includes(monthStr)) return sum;
        const ruleNative = rule.accountId ? accountCurrency.get(rule.accountId) ?? ctx.base : ctx.base;
        return sum + toDisplay(ctx, rule.budgetedAmount * occurrence.multiplier, ruleNative);
      }, 0);
    const spent = round2(monthCategoryDocs.reduce((sum, t) => sum + contributionFor(t), 0));
    // dedicated/unplanned are a breakdown of BUDGETED (the estimate), not
    // of spent — see dedicatedBase's own header comment.
    const dedicated = round2(toDisplay(ctx, dedicatedBase, ctx.base));
    // No budget rule at all for this category this month (budgetedBase is
    // 0) but a goal still dedicates money to it — same auto-include
    // src/logic/budget/useLogic.ts's own `categories` list applies, so
    // this screen's own summary agrees with what the Budget list shows
    // instead of reading "$0 budgeted" for a category that's actually
    // fully planned via a goal.
    const budgeted = budgetedBase > 0 ? round2(budgetedBase) : dedicated;
    return { budgeted, spent, dedicated, unplanned: round2(budgeted - dedicated), remaining: round2(budgeted - spent) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSummaryCard, monthStr, budgetRules, categoryId, year, monthIndex, accountCurrency, ctx, monthCategoryDocs, dedicatedBase]);

  // Budget-vs-spend chart — only for the free-ranging Settings entry point
  // (no month in the URL). Opened from a Budget category row, this screen
  // is locked to that one month, so a multi-month trend has no place here.
  // When shown, it always covers the full calendar year this screen was
  // opened for (the URL's own `year`, falling back to the current year),
  // Jan through Dec, independent of the time-range filter — the filter only
  // scopes the transaction list. Needs every rule ever written for this
  // category, not just the currently active ones (an archived rule still
  // explains a past month's budgeted figure). Both budgeted and spent are
  // computed synchronously from data already fetched above
  // (allRulesForCategory, categoryDocs) — no extra reads needed.
  const allRulesForCategoryQuery = useMemo(
    () => (uid && !hasMonth ? query(budgetRulesRef(uid), where('categoryId', '==', categoryId)) : null),
    [uid, categoryId, hasMonth]
  );
  const { data: allRulesForCategory } = useFirestoreCollection<FirestoreBudgetRule>(allRulesForCategoryQuery);

  const chart = useMemo<ChartMonth[]>(() => {
    if (hasMonth) return [];
    return Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
      const ms = `${refYear}-${pad2(m)}`;
      let budgetedBase = 0;
      for (const rule of allRulesForCategory) {
        const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), refYear, m);
        if (!occurrence || rule.excludedMonths?.includes(ms)) continue;
        const ruleNative = rule.accountId ? accountCurrency.get(rule.accountId) ?? ctx.base : ctx.base;
        budgetedBase += toDisplay(ctx, rule.budgetedAmount * occurrence.multiplier, ruleNative);
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
        budgeted: round2(budgetedBase),
        spent: round2(spentBase),
      };
    });
  }, [hasMonth, refYear, allRulesForCategory, categoryDocs, accountCurrency, ctx]);

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
      (showSummaryCard && (budgetRulesLoading || goalsLoading || goalItemsLoading)),
    error: transactionsError,
    editHref,
    goBack,
  };
}
