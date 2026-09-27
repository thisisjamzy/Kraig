'use client';

// Buckets hub — its own bottom-nav tab, split from Debt (src/logic/debtsList
// is Debt's own equivalent hub now) per the "two separate pages" request:
// they used to share one Buckets & Debt screen behind an in-page tab. List-
// level data only — a bucket's line items live on its own detail screen
// (src/logic/bucketDetail).

import { useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { ruleAppliesToMonth } from '@dreda/shared-recurrence';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, convert, round2 } from '@/src/shared/firestore/currency';
import { useBucketLineItemsByBucket } from '@/src/shared/hooks/useBucketLineItemsByBucket';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useBucketProgress } from '@/src/shared/hooks/useBucketProgress';
import { isItemClosed } from '@/src/shared/budget/bucketProgress';
import { useBucketsRange } from '@/src/shared/hooks/useBucketsRange';
import { currentMonthIndex, currentYear } from '@/src/viewmodels/budget';
import { DEFAULT_PRIORITY, DEFAULT_NECESSITY } from '@/src/viewmodels/projects';
import { categoryAccentColor } from '@/src/viewmodels/categories';
import type { FirestoreBucket } from '@/src/shared/firestore/types';
import { bucketCard, type BucketCard } from '@/src/viewmodels/planning';

export type BucketKindFilter = 'All' | 'Fixed' | 'Variable';
export type ProportionsMode = 'priority' | 'type' | 'category';

// One of the Buckets dashboard's own horizontally-scrolled cards (Design/web
// reference aside — this is the mobile hero row) — matches dedicatedTotals'
// own fixedExpense/variableExpense/etc. keys below, and is what
// openGroupModal takes to say which card was tapped.
export type DedicatedGroupKey =
  | 'fixedExpense'
  | 'variableExpense'
  | 'fixedIncome'
  | 'variableIncome'
  | 'fixedSavings'
  | 'variableSavings'
  | 'transfers';

export interface DedicatedGroupItem {
  id: string;
  goalId: string;
  bucketName: string;
  name: string;
  amount: number;
  currency: string;
}

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const bucketsQuery = useMemo(() => (uid ? query(bucketsRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: bucketDocs, loading: bucketsLoading, error: bucketsError } = useFirestoreCollection<FirestoreBucket>(bucketsQuery);

  const currency = ctx.display;

  // The Buckets app's own Month/All-time toggle (BucketsHeader) — shared by
  // every one of its three tabs via the same localStorage key.
  const { range, setRange } = useBucketsRange();

  // Which specific month "month" mode shows — same shape as Budget's own
  // month picker (src/logic/budget/useLogic.ts's monthIndex/year/
  // pickerYear/openMonthPicker/chooseMonth), so Fixed/Variable can be
  // browsed to any month instead of being pinned to whichever one is
  // real right now.
  const [monthIndex, setMonthIndex] = useState(currentMonthIndex());
  const [year, setYear] = useState(currentYear());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);

  function openMonthPicker() {
    setPickerYear(year);
    setMonthPickerOpen(true);
  }

  function chooseMonth(index: number) {
    setMonthIndex(index);
    setYear(pickerYear);
    setMonthPickerOpen(false);
  }

  const [kindFilter, setKindFilter] = useState<BucketKindFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  // Same header-icon-button-reveals-a-row pattern as TransactionHistory's
  // own search — closing it clears the query rather than leaving a stale
  // filter active behind a hidden input.
  const [searchOpen, setSearchOpen] = useState(false);
  function toggleSearch() {
    if (searchOpen) setSearchQuery('');
    setSearchOpen(!searchOpen);
  }

  // Progress comes from src/shared/budget/bucketProgress.ts — the same
  // derivation Bucket Detail and the Budget screen use — never the stored
  // totalAmount/amountCompleted, which only counted fully-closed items. A
  // Fixed bucket shows this month; a Planned one its whole plan.
  const { progressByBucket, loading: progressLoading } = useBucketProgress();
  const allBuckets = useMemo(
    () =>
      bucketDocs
        .map((bucket) => {
          const progress = progressByBucket.get(bucket.id);
          return {
            id: bucket.id,
            name: bucket.name,
            kind: bucket.kind ?? 'Variable',
            type: bucket.type ?? 'Expense',
            total: progress?.planned ?? 0,
            completed: progress?.spent ?? 0,
            remaining: round2(Math.max((progress?.planned ?? 0) - (progress?.spent ?? 0), 0)),
            scope: progress?.scope ?? 'total',
            lineItemCount: progress?.itemCount ?? 0,
            completedLineItemCount: progress?.doneCount ?? 0,
            percent: progress?.percent ?? 0,
            deadline: bucket.deadline ? bucket.deadline.toDate() : null,
          };
        })
        .sort((a, b) => b.percent - a.percent),
    [bucketDocs, progressByBucket]
  );

  // "Total bucket" figure on the overview card — the sum across every active
  // bucket regardless of the kind filter or search below, same as the
  // reference design's Current Balance card staying put while the list
  // beneath it is browsed/filtered.
  const totalBucketAmount = useMemo(() => round2(allBuckets.reduce((sum, bucket) => sum + bucket.total, 0)), [allBuckets]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const buckets = useMemo(
    () =>
      allBuckets
        .filter((bucket) => kindFilter === 'All' || bucket.kind === kindFilter)
        .filter((bucket) => !normalizedQuery || bucket.name.toLowerCase().includes(normalizedQuery)),
    [allBuckets, kindFilter, normalizedQuery]
  );

  // Every active bucket's not-yet-completed line items — the Buckets page's
  // gauge card, either grouped by necessity (must have vs nice to have) or
  // by priority (high/medium/low), the user's choice. Same fan-out-per-bucket
  // hook the cross-bucket "All bucket items" list uses (src/logic/bucketItems),
  // so the two screens' numbers can never disagree.
  const { itemsByBucket, loading: lineItemsLoading } = useBucketLineItemsByBucket(bucketDocs);

  const { data: accounts } = useAccounts();
  const { data: allCategories } = useCategories();
  const categoryById = useMemo(() => new Map(allCategories.map((cat) => [cat.id, cat])), [allCategories]);
  const bucketById = useMemo(() => new Map(bucketDocs.map((bucket) => [bucket.id, bucket])), [bucketDocs]);

  // "This month's total budget" — now the BROWSED month (year/monthIndex
  // above), not always the real current one, so the dashboard card's "% of
  // this month's budget" stays a coherent comparison against whichever
  // month's Fixed/Variable totals are actually showing. Same Expense-only
  // definition Budget's own headline "Total budget" figure uses
  // (src/logic/budget/useLogic.ts's totalExpenseBudgeted).
  // PRD-BUDGETS-V2.md — the viewed month's derived budget (bucket items
  // that apply to it), the same figures the Budget screen shows.
  const viewedMonthStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const { budget: viewedMonthBudget } = useMonthBudget(viewedMonthStr);
  const monthTotalBudget = useMemo(
    () =>
      round2(
        viewedMonthBudget.items.filter((entry) => entry.type === 'Expense').reduce((sum, entry) => sum + entry.planned, 0)
      ),
    [viewedMonthBudget]
  );
  // The hero card's Income-mode denominator — "% of projected income".
  const monthPlannedIncome = viewedMonthBudget.plannedIncome;

  // The list's cards — Planning's own bucket card for the viewed month, so
  // this page and the Budget tab show (and open) exactly the same thing. A
  // bucket with nothing planned that month still gets an empty card.
  const cards = useMemo(() => {
    const today = new Date();
    const groups = new Map(viewedMonthBudget.buckets.map((g) => [g.bucketId, g]));
    return buckets.map((b): BucketCard => {
      const group = groups.get(b.id);
      if (group) return bucketCard(group, { month: viewedMonthStr, today });
      return {
        id: b.id,
        name: b.name,
        archived: false,
        income: b.type === 'Income',
        itemCount: 0,
        spent: 0,
        planned: 0,
        available: 0,
        overflow: 0,
        prompt: null,
        items: [],
      };
    });
  }, [buckets, viewedMonthBudget, viewedMonthStr]);


  // Same frozen-funds-availability check bucketDetail/useLogic.ts runs for one
  // bucket's own currency, generalized to every currency actually in use here
  // — computed once per currency rather than once per line item.
  const availableFrozenByCurrency = useMemo(() => {
    const currencies = new Set(bucketDocs.map((bucket) => bucket.currency));
    const map = new Map<string, number>();
    for (const bucketCurrency of currencies) {
      map.set(
        bucketCurrency,
        round2(accounts.reduce((sum, account) => sum + convert(account.lockedAmount ?? 0, account.currency, bucketCurrency, ctx.rates), 0))
      );
    }
    return map;
  }, [bucketDocs, accounts, ctx.rates]);

  // Flat, cross-bucket feed of line items for the "line items" section below
  // the bucket cards — same shape BucketDetailScreen's own list uses (category
  // badge, possibility badge next to the amount), just carrying its parent
  // bucket's name too since items from every bucket are mixed together here.
  const allLineItems = useMemo(
    () =>
      Object.entries(itemsByBucket)
        .flatMap(([goalId, items]) => {
          const bucket = bucketById.get(goalId);
          if (!bucket) return [];
          const availableFrozen = availableFrozenByCurrency.get(bucket.currency) ?? 0;
          return items.map((item) => {
            const category = item.categoryId ? categoryById.get(item.categoryId) : undefined;
            const categoryName = category?.name ?? 'No category';
            return {
              id: item.id,
              goalId,
              bucketName: bucket.name,
              bucketKind: bucket.kind ?? ('Variable' as const),
              // Undefined only for a bucket written before Fixed/Variable
              // existed — the badge shows "Unclassified" for that case
              // instead of silently defaulting to Variable like the filter
              // above does.
              bucketKindRaw: bucket.kind,
              bucketType: bucket.type ?? 'Expense',
              name: item.name,
              amount: item.amount,
              charges: item.charges ?? 0,
              currency: bucket.currency,
              priority: item.priority ?? DEFAULT_PRIORITY,
              necessity: item.necessity ?? DEFAULT_NECESSITY,
              categoryName,
              categoryColor: categoryAccentColor(categoryName),
              categoryType: category?.transactionType ?? 'Expense',
              // Only a one-off item is ever done for good (isItemClosed).
              completed: isItemClosed(item, bucket.kind),
              completedAt: item.completedAt ? item.completedAt.toDate() : null,
              hasFunds: availableFrozen >= item.amount,
              dueDate: item.dueDate ? item.dueDate.toDate() : null,
              recurrence: item.recurrence ?? null,
            };
          });
        })
        .sort((a, b) => Number(a.completed) - Number(b.completed)),
    [itemsByBucket, bucketById, availableFrozenByCurrency, categoryById]
  );

  // The Buckets app's own dashboard cards. In "month" mode every group is a
  // PLANNED/committed total for the browsed month (year/monthIndex above)
  // — every relevant line item whose own recurrence (Fixed) or due date
  // (Variable, or a Fixed item with none set) lands in that month, counted
  // regardless of whether it's actually been marked complete yet, same
  // "does this recurring thing land in this month" check Budget's own
  // monthTotalBudget already runs for budget rules (ruleAppliesToMonth).
  // Split by BOTH kind (Fixed/Variable) AND the parent bucket's own type
  // (Expense/Income/Savings) — these used to only split by kind, silently
  // adding an Income bucket's items into the same group as an Expense
  // bucket's, which is exactly the "everything is mixed up" complaint.
  // Transfers keeps its own "cost of transferring" meaning (charges, not
  // the amount moved — moving your own money isn't spend), now alongside
  // the average charge per applicable transfer this month. "All-time" mode
  // is unchanged: a plain sum of every completed item's own amount/
  // charges, no month filtering at all.
  const dedicatedTotals = useMemo(() => {
    let fixedExpense = 0;
    let variableExpense = 0;
    let fixedIncome = 0;
    let variableIncome = 0;
    let fixedSavings = 0;
    let variableSavings = 0;
    let transfersCost = 0;
    let transfersOccurrences = 0;
    // Every real line item behind each of the 6 numbers above, in the same
    // display currency/amount already scaled for the browsed month — so
    // tapping a dashboard card (BucketsScreen.tsx's openGroupModal) can list
    // exactly what's summed into it, not just the total.
    const itemsByGroup: Record<DedicatedGroupKey, DedicatedGroupItem[]> = {
      fixedExpense: [],
      variableExpense: [],
      fixedIncome: [],
      variableIncome: [],
      fixedSavings: [],
      variableSavings: [],
      transfers: [],
    };

    function groupFor(kind: 'Fixed' | 'Variable', type: string): Exclude<DedicatedGroupKey, 'transfers'> {
      if (type === 'Income') return kind === 'Fixed' ? 'fixedIncome' : 'variableIncome';
      if (type === 'Savings') return kind === 'Fixed' ? 'fixedSavings' : 'variableSavings';
      // Expense, and the Fixed/Variable-only fallback for a bucket written
      // before FirestoreBucket.type existed (allLineItems already defaults
      // bucketType to 'Expense' for those).
      return kind === 'Fixed' ? 'fixedExpense' : 'variableExpense';
    }

    function addByKindAndType(
      kind: 'Fixed' | 'Variable',
      type: string,
      amount: number,
      item: { id: string; goalId: string; bucketName: string; name: string }
    ) {
      const group = groupFor(kind, type);
      if (group === 'fixedIncome') fixedIncome += amount;
      else if (group === 'variableIncome') variableIncome += amount;
      else if (group === 'fixedSavings') fixedSavings += amount;
      else if (group === 'variableSavings') variableSavings += amount;
      else if (group === 'fixedExpense') fixedExpense += amount;
      else variableExpense += amount;
      itemsByGroup[group].push({ ...item, amount: round2(amount), currency });
    }

    if (range === 'month') {
      const targetMonth = monthIndex + 1;
      for (const item of allLineItems) {
        if (!item.dueDate) continue;
        const occurrence = ruleAppliesToMonth(
          {
            frequency: item.recurrence?.frequency ?? 'Once',
            interval: item.recurrence?.interval ?? 1,
            anchorDate: item.dueDate,
            endCondition: 'Never',
          },
          year,
          targetMonth
        );
        if (!occurrence) continue;
        if (item.bucketType === 'Transfer') {
          const chargeAmount = toDisplay(ctx, item.charges * occurrence.multiplier, item.currency);
          transfersCost += chargeAmount;
          transfersOccurrences += occurrence.multiplier;
          itemsByGroup.transfers.push({
            id: item.id,
            goalId: item.goalId,
            bucketName: item.bucketName,
            name: item.name,
            amount: round2(chargeAmount),
            currency,
          });
          continue;
        }
        const amount = toDisplay(ctx, item.amount * occurrence.multiplier, item.currency);
        addByKindAndType(item.bucketKind, item.bucketType, amount, item);
      }
    } else {
      for (const item of allLineItems) {
        if (!item.completed) continue;
        if (item.bucketType === 'Transfer') {
          const chargeAmount = toDisplay(ctx, item.charges, item.currency);
          transfersCost += chargeAmount;
          transfersOccurrences += 1;
          itemsByGroup.transfers.push({
            id: item.id,
            goalId: item.goalId,
            bucketName: item.bucketName,
            name: item.name,
            amount: round2(chargeAmount),
            currency,
          });
          continue;
        }
        const amount = toDisplay(ctx, item.amount, item.currency);
        addByKindAndType(item.bucketKind, item.bucketType, amount, item);
      }
    }

    const fixed = round2(fixedExpense + fixedIncome + fixedSavings);
    const variable = round2(variableExpense + variableIncome + variableSavings);
    const dedicatedExpense = round2(fixedExpense + variableExpense);
    const dedicatedIncome = round2(fixedIncome + variableIncome);
    return {
      // Kept for BucketsAnalyticsScreen's own Fixed-vs-Variable donut, which
      // deliberately sums across every type — unchanged meaning.
      dedicated: round2(fixed + variable),
      fixed,
      variable,
      fixedExpense: round2(fixedExpense),
      variableExpense: round2(variableExpense),
      fixedIncome: round2(fixedIncome),
      variableIncome: round2(variableIncome),
      fixedSavings: round2(fixedSavings),
      variableSavings: round2(variableSavings),
      dedicatedExpense,
      dedicatedIncome,
      transfersCost: round2(transfersCost),
      transfersAverageCharge: transfersOccurrences > 0 ? round2(transfersCost / transfersOccurrences) : 0,
      percentOfMonthBudget: monthTotalBudget > 0 ? Math.round((dedicatedExpense / monthTotalBudget) * 100) : 0,
      percentOfProjectedIncome: monthPlannedIncome > 0 ? Math.round((dedicatedIncome / monthPlannedIncome) * 100) : 0,
      itemsByGroup,
    };
  }, [allLineItems, range, ctx, monthTotalBudget, monthPlannedIncome, year, monthIndex, currency]);

  const [openGroupKey, setOpenGroupKey] = useState<DedicatedGroupKey | null>(null);
  function openGroupModal(group: DedicatedGroupKey) {
    setOpenGroupKey(group);
  }
  function closeGroupModal() {
    setOpenGroupKey(null);
  }
  const openGroupItems = openGroupKey ? dedicatedTotals.itemsByGroup[openGroupKey] : [];

  // Analytics' own trend chart — always the last 6 real calendar months
  // regardless of the Month/All-time toggle (same "a trend needs more than
  // one group to mean anything" reasoning src/screens/CategoryTransactions
  // uses for its own always-full-year chart) — every completed item's
  // amount, grouped by the month it was actually completed in.
  const dedicatedTrend = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'short' }) };
    });
    return months.map(({ year, month, label }) => {
      const value = allLineItems.reduce((sum, item) => {
        if (!item.completed || !item.completedAt) return sum;
        if (item.completedAt.getFullYear() !== year || item.completedAt.getMonth() !== month) return sum;
        return sum + toDisplay(ctx, item.amount, item.currency);
      }, 0);
      return { label, value: round2(value) };
    });
  }, [allLineItems, ctx]);

  const [proportionsMode, setProportionsMode] = useState<ProportionsMode>('priority');

  // Overview donut's segments — always over every active bucket's incomplete
  // items (unaffected by kindFilter/search, same "global summary" reasoning
  // as totalBucketAmount above), grouped by whichever axis the user picked.
  const proportionsBreakdown = useMemo(() => {
    const groups = new Map<string, { label: string; color: string; amount: number }>();
    for (const item of allLineItems) {
      if (item.completed) continue;
      const amount = toDisplay(ctx, item.amount, item.currency);
      let key: string;
      let label: string;
      let color: string;
      if (proportionsMode === 'priority') {
        key = item.priority;
        label = item.priority;
        color = item.priority === 'High' ? 'var(--color-danger)' : item.priority === 'Medium' ? '#e8a33d' : 'var(--color-brand)';
      } else if (proportionsMode === 'type') {
        key = item.categoryType;
        label = item.categoryType;
        color = item.categoryType === 'Savings' ? 'var(--color-brand)' : '#e8a33d';
      } else {
        key = item.categoryName;
        label = item.categoryName;
        color = item.categoryColor;
      }
      const existing = groups.get(key);
      if (existing) existing.amount += amount;
      else groups.set(key, { label, color, amount });
    }
    return Array.from(groups.values())
      .map((group) => ({ ...group, amount: round2(group.amount) }))
      .sort((a, b) => b.amount - a.amount);
  }, [allLineItems, proportionsMode, ctx]);

  return {
    currency,
    buckets,
    cards,
    viewedMonth: viewedMonthStr,
    allBucketsCount: allBuckets.length,
    kindFilter,
    setKindFilter,
    searchQuery,
    setSearchQuery,
    searchOpen,
    toggleSearch,
    totalBucketAmount,
    proportionsMode,
    setProportionsMode,
    proportionsBreakdown,
    range,
    setRange,
    monthIndex,
    year,
    pickerYear,
    setPickerYear,
    monthPickerOpen,
    setMonthPickerOpen,
    openMonthPicker,
    chooseMonth,
    dedicatedTotals,
    dedicatedTrend,
    openGroupKey,
    openGroupModal,
    closeGroupModal,
    openGroupItems,
    monthTotalBudget,
    monthPlannedIncome,
    loading: ctxLoading || bucketsLoading || progressLoading,
    lineItemsLoading,
    error: bucketsError,
  };
}
