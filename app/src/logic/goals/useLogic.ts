'use client';

// Goals hub — its own bottom-nav tab, split from Debt (src/logic/debtsList
// is Debt's own equivalent hub now) per the "two separate pages" request:
// they used to share one Goals & Debt screen behind an in-page tab. List-
// level data only — a goal's line items live on its own detail screen
// (src/logic/goalDetail).

import { useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { goalsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, convert, round2 } from '@/src/shared/firestore/currency';
import { archiveGoal as archiveGoalWrite, deleteGoalLineItem } from '@/src/shared/firestore/aggregation';
import { useGoalLineItemsByGoal } from '@/src/shared/hooks/useGoalLineItemsByGoal';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY, DEFAULT_NECESSITY } from '@/src/viewmodels/projects';
import { categoryAccentColor } from '@/src/viewmodels/categories';
import type { FirestoreGoal } from '@/src/shared/firestore/types';

export type GoalKindFilter = 'All' | 'Fixed' | 'Variable';
export type ProportionsMode = 'priority' | 'type' | 'category';

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const goalsQuery = useMemo(() => (uid ? query(goalsRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: goalDocs, loading: goalsLoading, error: goalsError } = useFirestoreCollection<FirestoreGoal>(goalsQuery);

  const currency = ctx.display;

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
              name: item.name,
              amount: item.amount,
              currency: goal.currency,
              priority: item.priority ?? DEFAULT_PRIORITY,
              necessity: item.necessity ?? DEFAULT_NECESSITY,
              categoryName,
              categoryColor: categoryAccentColor(categoryName),
              categoryType: category?.transactionType ?? 'Expense',
              completed: item.completed,
              hasFunds: availableFrozen >= item.amount,
              dueDate: item.dueDate ? item.dueDate.toDate() : null,
              addedToBudget: Boolean(item.addedToBudget),
              budgetRuleId: item.budgetRuleId ?? null,
            };
          });
        })
        .sort((a, b) => Number(a.completed) - Number(b.completed)),
    [itemsByGoal, goalById, availableFrozenByCurrency, categoryById]
  );

  const lineItems = useMemo(
    () =>
      allLineItems
        .filter((item) => kindFilter === 'All' || item.goalKind === kindFilter)
        .filter(
          (item) =>
            !normalizedQuery ||
            item.name.toLowerCase().includes(normalizedQuery) ||
            item.goalName.toLowerCase().includes(normalizedQuery)
        ),
    [allLineItems, kindFilter, normalizedQuery]
  );

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

  async function archiveGoal(id: string) {
    if (!uid) return;
    await archiveGoalWrite(uid, id);
  }

  async function deleteLineItem(goalId: string, itemId: string, budgetRuleId?: string | null) {
    if (!uid) return;
    await deleteGoalLineItem(uid, goalId, itemId, budgetRuleId);
  }

  return {
    currency,
    goals,
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
    lineItems,
    archiveGoal,
    deleteLineItem,
    loading: ctxLoading || goalsLoading,
    lineItemsLoading,
    error: goalsError,
  };
}
