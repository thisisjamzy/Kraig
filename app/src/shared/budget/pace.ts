// This month's daily guide (dailyGuide.ts) from the month's budget and
// transactions: the same figures as Plan and forecast. The notification
// runner reads its status for "Day-to-day spending is off pace".

import { toDisplay, type CurrencyContext } from '@/src/shared/firestore/currency';
import type { FirestoreTransaction } from '@/src/shared/firestore/types';
import { dailyGuide, variableBudget, variableSpendByDay, type DailyGuide } from './dailyGuide';
import { monthKeyOf, type MonthBudget } from './monthBudget';
import type { MonthTotals } from './monthTotals';

export function monthPaceGuide(input: {
  budget: MonthBudget;
  totals: MonthTotals;
  transactions: Iterable<FirestoreTransaction>;
  accounts: { id: string; currency: string }[];
  ctx: CurrencyContext;
  today: Date;
}): DailyGuide | null {
  const { budget, totals, ctx, today } = input;
  const currencyOf = new Map(input.accounts.map((a) => [a.id, a.currency]));
  const expenses = [...input.transactions]
    .filter((t) => t.type === 'Expense')
    .map((t) => ({
      id: t.id,
      spend: toDisplay(ctx, t.direction === 'Outflow' ? t.amount : -t.amount, currencyOf.get(t.accountId) ?? ctx.base),
      date: t.date.toDate(),
      month: t.month ?? monthKeyOf(t.date.toDate()),
    }));
  const variable = variableBudget(budget);
  if (variable.planned <= 0) return null;
  const fixedStillDue = budget.items
    .filter((i) => !i.archived && !i.closed && ((i.type === 'Expense' && i.expenseKind !== 'variable') || i.type === 'Savings'))
    .reduce((s, i) => s + Math.max(0, i.available - i.actual), 0);
  return dailyGuide({
    today,
    variablePlanned: variable.planned,
    variableLeft: variable.left,
    spentByDay: variableSpendByDay(budget, expenses),
    availableNow: totals.availableNow,
    expectedStill: totals.income.notYetReceived,
    fixedStillDue,
  });
}
