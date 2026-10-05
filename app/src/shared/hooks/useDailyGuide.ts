'use client';

// The daily spending guide for the current month (src/shared/budget/
// dailyGuide.ts), from a month's budget data: today's allowance, what was
// spent today and what's left of it, the week and the projection. Used by
// Money Home and the phone's Plan screen. Null when nothing variable is
// planned this month.

import { useMemo } from 'react';
import { toDisplay } from '@/src/shared/firestore/currency';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { dailyGuide, variableBudget, variableSpendByDay, type DailyGuide } from '@/src/shared/budget/dailyGuide';
import type { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';

export function useDailyGuide(cur: ReturnType<typeof useMonthBudget>, now: Date): DailyGuide | null {
  return useMemo(() => {
    const v = variableBudget(cur.budget);
    if (v.planned <= 0) return null;
    const currencyOf = new Map(cur.accounts.map((a) => [a.id, a.currency]));
    const display = (amount: number, accountId: string | null | undefined) =>
      toDisplay(cur.ctx, amount, (accountId && currencyOf.get(accountId)) || cur.ctx.base);
    const expenses = [...cur.transactionsById.values()]
      .filter((x) => x.type === 'Expense')
      .map((x) => ({
        id: x.id,
        spend: display(x.direction === 'Outflow' ? x.amount : -x.amount, x.accountId),
        date: x.date.toDate(),
        month: x.month ?? monthKeyOf(x.date.toDate()),
      }));
    const fixedStillDue = cur.budget.items
      .filter((i) => !i.archived && !i.closed && ((i.type === 'Expense' && i.expenseKind !== 'variable') || i.type === 'Savings'))
      .reduce((s, i) => s + Math.max(0, i.available - i.actual), 0);
    return dailyGuide({
      today: now,
      variablePlanned: v.planned,
      variableLeft: v.left,
      spentByDay: variableSpendByDay(cur.budget, expenses),
      availableNow: cur.totals.availableNow,
      expectedStill: cur.totals.income.notYetReceived,
      fixedStillDue,
    });
  }, [cur.budget, cur.transactionsById, cur.accounts, cur.ctx, cur.totals, now]);
}
