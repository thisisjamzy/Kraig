'use client';

// Goals hub — its own bottom-nav tab, split from Debt (src/logic/debtsList
// is Debt's own equivalent hub now) per the "two separate pages" request:
// they used to share one Goals & Debt screen behind an in-page tab. List-
// level data only — a goal's line items live on its own detail screen
// (src/logic/goalDetail).

import { useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { ruleAppliesToMonth } from '@dreda/shared-recurrence';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { goalsRef, budgetRulesRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, convert, round2 } from '@/src/shared/firestore/currency';
import { toRecurrenceRule } from '@/src/shared/firestore/recurrence';
import { useGoalLineItemsByGoal } from '@/src/shared/hooks/useGoalLineItemsByGoal';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useGoalsRange } from '@/src/shared/hooks/useGoalsRange';
import { currentMonthIndex, currentYear } from '@/src/viewmodels/budget';
import { DEFAULT_PRIORITY, DEFAULT_NECESSITY } from '@/src/viewmodels/projects';
import { categoryAccentColor } from '@/src/viewmodels/categories';
import type { FirestoreGoal, FirestoreBudgetRule } from '@/src/shared/firestore/types';

export type GoalKindFilter = 'All' | 'Fixed' | 'Variable';
export type ProportionsMode = 'priority' | 'type' | 'category';

// One of the Goals dashboard's own horizontally-scrolled cards (Design/web
// reference aside — this is the mobile hero row) — matches dedicatedTotals'
// own fixedExpense/variableExpense/etc. keys below, and is what
// openBucketModal takes to say which card was tapped.
export type DedicatedBucketKey =
  | 'fixedExpense'
  | 'variableExpense'
  | 'fixedIncome'
  | 'variableIncome'
  | 'fixedSavings'
  | 'variableSavings'
  | 'transfers';

export interface DedicatedBucketItem {
  id: string;
  goalId: string;
  goalName: string;
  name: string;
  amount: number;
  currency: string;
}

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const goalsQuery = useMemo(() => (uid ? query(goalsRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: goalDocs, loading: goalsLoading, error: goalsError } = useFirestoreCollection<FirestoreGoal>(goalsQuery);

  const currency = ctx.display;

  // The Goals app's own Month/All-time toggle (GoalsHeader) — shared by
  // every one of its three tabs via the same localStorage key.
  const { range, setRange } = useGoalsRange();

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

  const [kindFilter, setKindFilter] = useState<GoalKindFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  // Same header-icon-button-reveals-a-row pattern as TransactionHistory's
  // own search — closing it clears the query rather than leaving a stale
  // filter active behind a hidden input.
  const [searchOpen, setSearchOpen] = useState(false);
  function toggleSearch() {
    if (searchOpen) setSearchQuery('');
    setSearchOpen(!searchOpen);
  }

  const allGoals = useMemo(
    () =>
      goalDocs
        .map((goal) => {
          const total = round2(toDisplay(ctx, goal.totalAmount, ctx.base));
          const completed = round2(toDisplay(ctx, goal.amountCompleted, ctx.base));
          return {
            id: goal.id,
            name: goal.name,
            kind: goal.kind ?? 'Variable',
            type: goal.type ?? 'Expense',
            total,
            completed,
            remaining: round2(Math.max(total - completed, 0)),
            lineItemCount: goal.lineItemCount,
            completedLineItemCount: goal.completedLineItemCount,
            percent:
              goal.lineItemCount > 0 ? Math.round((goal.completedLineItemCount / goal.lineItemCount) * 100) : 0,
            deadline: goal.deadline ? goal.deadline.toDate() : null,
          };
        })
        .sort((a, b) => b.percent - a.percent),
    [goalDocs, ctx]
  );

  // "Total goal" figure on the overview card — the sum across every active
  // goal regardless of the kind filter or search below, same as the
  // reference design's Current Balance card staying put while the list
  // beneath it is browsed/filtered.
  const totalGoalAmount = useMemo(() => round2(allGoals.reduce((sum, goal) => sum + goal.total, 0)), [allGoals]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const goals = useMemo(
    () =>
      allGoals
        .filter((goal) => kindFilter === 'All' || goal.kind === kindFilter)
        .filter((goal) => !normalizedQuery || goal.name.toLowerCase().includes(normalizedQuery)),
    [allGoals, kindFilter, normalizedQuery]
  );

  // Every active goal's not-yet-completed line items — the Goals page's
  // gauge card, either grouped by necessity (must have vs nice to have) or
  // by priority (high/medium/low), the user's choice. Same fan-out-per-goal
  // hook the cross-goal "All goal items" list uses (src/logic/goalItems),
  // so the two screens' numbers can never disagree.
  const { itemsByGoal, loading: lineItemsLoading } = useGoalLineItemsByGoal(goalDocs);

  const { data: accounts } = useAccounts();
  const { data: allCategories } = useCategories();
  const categoryById = useMemo(() => new Map(allCategories.map((cat) => [cat.id, cat])), [allCategories]);
  const goalById = useMemo(() => new Map(goalDocs.map((goal) => [goal.id, goal])), [goalDocs]);
  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);

  // "This month's total budget" — now the BROWSED month (year/monthIndex
  // above), not always the real current one, so the dashboard card's "% of
  // this month's budget" stays a coherent comparison against whichever
  // month's Fixed/Variable totals are actually showing. Same Expense-only
  // definition Budget's own headline "Total budget" figure uses
  // (src/logic/budget/useLogic.ts's totalExpenseBudgeted).
  const activeBudgetRulesQuery = useMemo(
    () => (uid ? query(budgetRulesRef(uid), where('archived', '==', false)) : null),
    [uid]
  );
  const { data: budgetRules } = useFirestoreCollection<FirestoreBudgetRule>(activeBudgetRulesQuery);
  function sumBudgetRulesOfType(type: 'Expense' | 'Income') {
    const month = monthIndex + 1;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const base = budgetRules
      .filter((rule) => (rule.type ?? 'Expense') === type)
      .reduce((sum, rule) => {
        const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), year, month);
        if (!occurrence || rule.excludedMonths?.includes(monthStr)) return sum;
        const native = rule.accountId ? accountCurrency.get(rule.accountId) ?? ctx.base : ctx.base;
        return sum + toDisplay(ctx, rule.budgetedAmount * occurrence.multiplier, native);
      }, 0);
    return round2(base);
  }
  const monthTotalBudget = useMemo(
    () => sumBudgetRulesOfType('Expense'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [budgetRules, accountCurrency, ctx, year, monthIndex]
  );
  // The hero card's Income-mode denominator — "% of projected income" —
  // same recurring-rule-applies-to-month math as monthTotalBudget above,
  // just over Income-type budget rules instead of Expense.
  const monthPlannedIncome = useMemo(
    () => sumBudgetRulesOfType('Income'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [budgetRules, accountCurrency, ctx, year, monthIndex]
  );

  // Same frozen-funds-availability check goalDetail/useLogic.ts runs for one
  // goal's own currency, generalized to every currency actually in use here
  // — computed once per currency rather than once per line item.
  const availableFrozenByCurrency = useMemo(() => {
    const currencies = new Set(goalDocs.map((goal) => goal.currency));
    const map = new Map<string, number>();
    for (const goalCurrency of currencies) {
      map.set(
        goalCurrency,
        round2(accounts.reduce((sum, account) => sum + convert(account.lockedAmount ?? 0, account.currency, goalCurrency, ctx.rates), 0))
      );
    }
    return map;
  }, [goalDocs, accounts, ctx.rates]);

  // Flat, cross-goal feed of line items for the "line items" section below
  // the goal cards — same shape GoalDetailScreen's own list uses (category
  // badge, possibility badge next to the amount), just carrying its parent
  // goal's name too since items from every goal are mixed together here.
  const allLineItems = useMemo(
    () =>
      Object.entries(itemsByGoal)
        .flatMap(([goalId, items]) => {
          const goal = goalById.get(goalId);
          if (!goal) return [];
          const availableFrozen = availableFrozenByCurrency.get(goal.currency) ?? 0;
          return items.map((item) => {
            const category = item.categoryId ? categoryById.get(item.categoryId) : undefined;
            const categoryName = category?.name ?? 'No category';
            return {
              id: item.id,
              goalId,
              goalName: goal.name,
              goalKind: goal.kind ?? ('Variable' as const),
              // Undefined only for a goal written before Fixed/Variable
              // existed — the badge shows "Unclassified" for that case
              // instead of silently defaulting to Variable like the filter
              // above does.
              goalKindRaw: goal.kind,
              goalType: goal.type ?? 'Expense',
              name: item.name,
              amount: item.amount,
              charges: item.charges ?? 0,
              currency: goal.currency,
              priority: item.priority ?? DEFAULT_PRIORITY,
              necessity: item.necessity ?? DEFAULT_NECESSITY,
              categoryName,
              categoryColor: categoryAccentColor(categoryName),
              categoryType: category?.transactionType ?? 'Expense',
              completed: item.completed,
              completedAt: item.completedAt ? item.completedAt.toDate() : null,
              hasFunds: availableFrozen >= item.amount,
              dueDate: item.dueDate ? item.dueDate.toDate() : null,
              recurrence: item.recurrence ?? null,
              addedToBudget: Boolean(item.addedToBudget),
              budgetRuleId: item.budgetRuleId ?? null,
            };
          });
        })
        .sort((a, b) => Number(a.completed) - Number(b.completed)),
    [itemsByGoal, goalById, availableFrozenByCurrency, categoryById]
  );

  // The Goals app's own dashboard cards. In "month" mode every bucket is a
  // PLANNED/committed total for the browsed month (year/monthIndex above)
  // — every relevant line item whose own recurrence (Fixed) or due date
  // (Variable, or a Fixed item with none set) lands in that month, counted
  // regardless of whether it's actually been marked complete yet, same
  // "does this recurring thing land in this month" check Budget's own
  // monthTotalBudget already runs for budget rules (ruleAppliesToMonth).
  // Split by BOTH kind (Fixed/Variable) AND the parent goal's own type
  // (Expense/Income/Savings) — these used to only split by kind, silently
  // adding an Income goal's items into the same bucket as an Expense
  // goal's, which is exactly the "everything is mixed up" complaint.
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
    // tapping a dashboard card (GoalsScreen.tsx's openBucketModal) can list
    // exactly what's summed into it, not just the total.
    const itemsByBucket: Record<DedicatedBucketKey, DedicatedBucketItem[]> = {
      fixedExpense: [],
      variableExpense: [],
      fixedIncome: [],
      variableIncome: [],
      fixedSavings: [],
      variableSavings: [],
      transfers: [],
    };

    function bucketFor(kind: 'Fixed' | 'Variable', type: string): Exclude<DedicatedBucketKey, 'transfers'> {
      if (type === 'Income') return kind === 'Fixed' ? 'fixedIncome' : 'variableIncome';
      if (type === 'Savings') return kind === 'Fixed' ? 'fixedSavings' : 'variableSavings';
      // Expense, and the Fixed/Variable-only fallback for a goal written
      // before FirestoreGoal.type existed (allLineItems already defaults
      // goalType to 'Expense' for those).
      return kind === 'Fixed' ? 'fixedExpense' : 'variableExpense';
    }

    function addByKindAndType(
      kind: 'Fixed' | 'Variable',
      type: string,
      amount: number,
      item: { id: string; goalId: string; goalName: string; name: string }
    ) {
      const bucket = bucketFor(kind, type);
      if (bucket === 'fixedIncome') fixedIncome += amount;
      else if (bucket === 'variableIncome') variableIncome += amount;
      else if (bucket === 'fixedSavings') fixedSavings += amount;
      else if (bucket === 'variableSavings') variableSavings += amount;
      else if (bucket === 'fixedExpense') fixedExpense += amount;
      else variableExpense += amount;
      itemsByBucket[bucket].push({ ...item, amount: round2(amount), currency });
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
        if (item.goalType === 'Transfer') {
          const chargeAmount = toDisplay(ctx, item.charges * occurrence.multiplier, item.currency);
          transfersCost += chargeAmount;
          transfersOccurrences += occurrence.multiplier;
          itemsByBucket.transfers.push({
            id: item.id,
            goalId: item.goalId,
            goalName: item.goalName,
            name: item.name,
            amount: round2(chargeAmount),
            currency,
          });
          continue;
        }
        const amount = toDisplay(ctx, item.amount * occurrence.multiplier, item.currency);
        addByKindAndType(item.goalKind, item.goalType, amount, item);
      }
    } else {
      for (const item of allLineItems) {
        if (!item.completed) continue;
        if (item.goalType === 'Transfer') {
          const chargeAmount = toDisplay(ctx, item.charges, item.currency);
          transfersCost += chargeAmount;
          transfersOccurrences += 1;
          itemsByBucket.transfers.push({
            id: item.id,
            goalId: item.goalId,
            goalName: item.goalName,
            name: item.name,
            amount: round2(chargeAmount),
            currency,
          });
          continue;
        }
        const amount = toDisplay(ctx, item.amount, item.currency);
        addByKindAndType(item.goalKind, item.goalType, amount, item);
      }
    }

    const fixed = round2(fixedExpense + fixedIncome + fixedSavings);
    const variable = round2(variableExpense + variableIncome + variableSavings);
    const dedicatedExpense = round2(fixedExpense + variableExpense);
    const dedicatedIncome = round2(fixedIncome + variableIncome);
    return {
      // Kept for GoalsAnalyticsScreen's own Fixed-vs-Variable donut, which
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
      itemsByBucket,
    };
  }, [allLineItems, range, ctx, monthTotalBudget, monthPlannedIncome, year, monthIndex, currency]);

  const [openBucketKey, setOpenBucketKey] = useState<DedicatedBucketKey | null>(null);
  function openBucketModal(bucket: DedicatedBucketKey) {
    setOpenBucketKey(bucket);
  }
  function closeBucketModal() {
    setOpenBucketKey(null);
  }
  const openBucketItems = openBucketKey ? dedicatedTotals.itemsByBucket[openBucketKey] : [];

  // Analytics' own trend chart — always the last 6 real calendar months
  // regardless of the Month/All-time toggle (same "a trend needs more than
  // one bucket to mean anything" reasoning src/screens/CategoryTransactions
  // uses for its own always-full-year chart) — every completed item's
  // amount, bucketed by the month it was actually completed in.
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

  // Overview donut's segments — always over every active goal's incomplete
  // items (unaffected by kindFilter/search, same "global summary" reasoning
  // as totalGoalAmount above), grouped by whichever axis the user picked.
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
    goals,
    allGoalsCount: allGoals.length,
    kindFilter,
    setKindFilter,
    searchQuery,
    setSearchQuery,
    searchOpen,
    toggleSearch,
    totalGoalAmount,
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
    openBucketKey,
    openBucketModal,
    closeBucketModal,
    openBucketItems,
    monthTotalBudget,
    monthPlannedIncome,
    loading: ctxLoading || goalsLoading,
    lineItemsLoading,
    error: goalsError,
  };
}
