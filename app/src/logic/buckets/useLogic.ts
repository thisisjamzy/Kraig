'use client';

// Buckets — one month's money plan at a glance: expected in against
// planned out by kind, planned vs actual so far, whether the must-haves
// are covered, what's coming in, and every bucket in its section. Trends
// over time live on the Analytics tab, so this page only browses months. Figures
// come from src/viewmodels/plans (the same model as Priorities and the
// Plans forecast); each bucket's card is Planning's own, from the same
// month budget, so it opens the same bucket details page.

import { useMemo, useState } from 'react';
import { usePlansData } from '@/src/logic/plans/usePlansData';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { bucketCard, type BucketCard } from '@/src/viewmodels/planning';
import {
  bucketSummaries,
  incomeSources,
  moneyPlan,
  mustCoverage,
  plannedVsActual,
  type Section,
} from '@/src/viewmodels/plans/overview';
import { isOpen, monthKey, monthLabel, remaining, shiftMonth } from '@/src/viewmodels/plans/model';
import { monthTotal } from '@/src/viewmodels/finance/metrics';

export const SECTIONS: Section[] = ['fixed', 'variable', 'savings', 'income'];

export function useLogic() {
  const plans = usePlansData();
  const { occurrences, today, data } = plans;
  const current = monthKey(today);
  const [month, setMonth] = useState(current);
  const { budget, loading: budgetLoading } = useMonthBudget(month);

  // The browsed month's own "today": its last day when it's past, its first when it's ahead.
  const asOf = useMemo(() => {
    if (month === current) return today;
    const [y, m] = month.split('-').map(Number);
    return month < current ? new Date(y, m, 0, 23, 59) : new Date(y, m - 1, 1, 9);
  }, [month, current, today]);

  const figures = useMemo(() => {
    const received = monthTotal(data, month, 'income');
    const spent = monthTotal(data, month, 'expense') + monthTotal(data, month, 'savings');
    const expectedStill = occurrences.filter((o) => o.kind === 'income' && o.month === month && isOpen(o)).reduce((s, o) => s + remaining(o), 0);
    const availableByMonthEnd = received - spent + expectedStill;
    return {
      plan: moneyPlan(occurrences, month),
      table: plannedVsActual(occurrences, month),
      cover: mustCoverage(occurrences, availableByMonthEnd, asOf),
      income: incomeSources(occurrences, asOf),
      summaries: bucketSummaries(occurrences, month, asOf),
    };
  }, [occurrences, data, month, asOf]);

  // Planning's bucket card for every bucket with something this month.
  const cards = useMemo(() => {
    const groups = new Map(budget.buckets.map((g) => [g.bucketId, g]));
    return figures.summaries.map((s) => {
      const group = groups.get(s.bucketId);
      const card: BucketCard = group
        ? bucketCard(group, { month, today })
        : { id: s.bucketId, name: s.name, archived: false, income: s.section === 'income', itemCount: s.itemCount, spent: s.spent, planned: s.planned, available: s.available, overflow: 0, prompt: null, items: [] };
      return { summary: s, card };
    });
  }, [figures.summaries, budget, month, today]);

  const [collapsed, setCollapsed] = useState<Section[]>([]);

  return {
    loading: plans.loading || budgetLoading,
    currency: plans.currency,
    today,
    month,
    monthText: monthLabel(month, true),
    previousMonth: () => setMonth((m) => shiftMonth(m, -1)),
    nextMonth: () => setMonth((m) => shiftMonth(m, 1)),
    isCurrent: month === current,
    ...figures,
    cards,
    collapsed,
    toggleSection: (s: Section) => setCollapsed((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s])),
  };
}

export type BucketsLogic = ReturnType<typeof useLogic>;
