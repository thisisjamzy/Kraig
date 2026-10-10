'use client';

// Planning > Budget on a phone, minimal (Minimal.module.css), top to bottom:
//   1. the month card, laid out like Home's balance card: planned spending
//      (expenses and transfer fees, one money type) as the main figure, a
//      bar against income, then Income expected, Savings planned and Left
//      to plan (or Over income) in smaller type; Details opens the full
//      breakdown, moves between wallets included;
//   2. the baskets, grouped under Income, Expenses, Savings and Transfers
//      (empty groups hidden, each collapsible), no second row of tabs;
//   3. "+ New basket" as a quiet row at the end.
// Alerts (overdue payments, baskets over plan, items to check) are only in
// Notifications, never on this page.
// Wide screens get the Budget page instead (src/screens/BudgetMonth).

import { useMemo } from 'react';
import { basketList, monthSummary } from '@/src/logic/planning/basketList';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import { BasketGroups, BudgetCard } from '@/src/phone/screens/Planning/MinimalParts';
import m from '@/src/phone/screens/Planning/Minimal.module.css';

export function BudgetTab({ month, data }: { month: string; data: PlanningData }) {
  const groups = useMemo(() => basketList(data.budget, data.buckets, new Date()), [data.budget, data.buckets]);
  const summary = monthSummary(data.totals);

  return (
    <>
      <BudgetCard summary={summary} totals={data.totals} currency={data.ctx.display} month={month} />

      {groups.length === 0 ? (
        <div className={`${m.bleed} ${m.section}`}>
          <p className={m.empty}>Nothing planned for this month yet.</p>
        </div>
      ) : null}
      <BasketGroups groups={groups} month={month} newHref="/baskets/new" />
    </>
  );
}
