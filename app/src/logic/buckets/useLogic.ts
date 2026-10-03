'use client';

// Buckets — one month's buckets, by flow type: Income, Expenses, Savings
// and Transfers each listed on their own (a bucket holds one type). Every
// figure comes from the month budget and the shared totals
// (src/shared/budget/monthTotals.ts), the same ones the Budget page shows:
// "available" is money received minus spent and saved, never expected
// income. Each bucket's card is Planning's own, so it opens the same bucket
// page; the extras (its line, overdue items) come from src/viewmodels/plans.

import { useMemo, useState } from 'react';
import { usePlansData } from '@/src/logic/plans/usePlansData';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { bucketCard, type BucketCard } from '@/src/viewmodels/planning';
import { bucketSummaries, type BucketSummary } from '@/src/viewmodels/plans/overview';
import { monthKey, monthLabel, shiftMonth } from '@/src/viewmodels/plans/model';
import { FLOW_TYPES, hasNeedAndPriority, type FlowType } from '@/src/shared/budget/flow';
import { lineRows, mustHaves, type LineRow } from '@/src/logic/budgetMonth/lines';
import { useMonthParam } from '@/src/shared/navigation/useMonthParam';

export interface BucketRow {
  id: string;
  name: string;
  type: FlowType;
  card: BucketCard;
  summary: BucketSummary | null;
  itemCount: number;
  planned: number;
  actual: number;
  left: number;
  progress: number | null;
  status: string;
  statusTone: 'good' | 'bad' | 'watch' | 'neutral';
  nextDue: Date | null;
  archived: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function rowStatus(type: FlowType, card: BucketCard, lines: LineRow[]): Pick<BucketRow, 'status' | 'statusTone'> {
  if (card.prompt?.kind === 'over' || card.prompt?.kind === 'uncovered') return { status: 'Over plan', statusTone: 'bad' };
  if (lines.some((l) => l.state === 'Overdue' || l.state === 'Late')) return { status: type === 'Income' ? 'Late' : 'Overdue', statusTone: 'bad' };
  if (card.prompt?.kind === 'leftover') return { status: 'Leftover', statusTone: 'watch' };
  if (!lines.length) return { status: 'Nothing this month', statusTone: 'neutral' };
  const done = lines.every((l) => ['Received', 'Paid', 'Saved', 'Moved'].includes(l.state) || l.closed);
  if (done) return { status: type === 'Income' ? 'Received' : type === 'Savings' ? 'Saved' : type === 'Transfer' ? 'Moved' : 'Paid', statusTone: 'good' };
  return { status: type === 'Income' ? 'Expected' : 'On track', statusTone: 'neutral' };
}

export function useLogic() {
  const plans = usePlansData();
  const { occurrences, today } = plans;
  const current = monthKey(today);
  const [month, setMonth] = useMonthParam();
  const { budget, totals, buckets, accounts, ctx, loading: budgetLoading } = useMonthBudget(month);
  // ?type= (the sidebar's Goals opens Savings) picks the first tab.
  const [flow, setFlow] = useState<FlowType>(() => {
    const wanted = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('type');
    return wanted === 'Income' || wanted === 'Savings' || wanted === 'Transfer' ? wanted : 'Expense';
  });

  // The browsed month's own "today": its last day when it's past, its first when it's ahead.
  const asOf = useMemo(() => {
    if (month === current) return today;
    const [y, m] = month.split('-').map(Number);
    return month < current ? new Date(y, m, 0, 23, 59) : new Date(y, m - 1, 1, 9);
  }, [month, current, today]);

  const names = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const lines = useMemo(() => lineRows(budget, asOf, (id) => (id ? (names.get(id) ?? null) : null)), [budget, asOf, names]);

  const byType = useMemo(() => {
    const summaries = new Map(bucketSummaries(occurrences, month, asOf).map((s) => [s.bucketId, s]));
    const groups = new Map(budget.buckets.map((g) => [g.bucketId, g]));
    const out = Object.fromEntries(FLOW_TYPES.map((t) => [t, [] as BucketRow[]])) as Record<FlowType, BucketRow[]>;
    for (const bucket of buckets) {
      const group = groups.get(bucket.id);
      // Archived buckets only where something was recorded this month.
      if (bucket.archived && !group) continue;
      const type = (bucket.type ?? 'Expense') as FlowType;
      const bucketLines = lines[type].filter((l) => l.bucketId === bucket.id);
      const card: BucketCard = group
        ? bucketCard(group, { month, today: asOf })
        : { id: bucket.id, name: bucket.name, archived: Boolean(bucket.archived), income: type === 'Income', itemCount: 0, spent: 0, planned: 0, available: 0, overflow: 0, prompt: null, items: [] };
      const planned = r2(bucketLines.reduce((s, l) => s + l.available, 0));
      const actual = r2(bucketLines.reduce((s, l) => s + l.actual, 0));
      const open = bucketLines.filter((l) => l.left > 0 && !l.closed && l.due);
      out[type].push({
        id: bucket.id,
        name: bucket.name,
        type,
        card,
        summary: summaries.get(bucket.id) ?? null,
        itemCount: bucketLines.length,
        planned,
        actual,
        left: r2(planned - actual),
        progress: planned > 0 ? actual / planned : null,
        ...rowStatus(type, card, bucketLines),
        nextDue: open.length ? open.reduce((min, l) => (l.due! < min ? l.due! : min), open[0].due!) : null,
        archived: Boolean(bucket.archived),
      });
    }
    for (const type of FLOW_TYPES) out[type].sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));
    return out;
  }, [buckets, budget, lines, occurrences, month, asOf]);

  const must = mustHaves(lines.Expense.concat(lines.Savings), totals.availableNow, totals.availableByMonthEnd);

  return {
    loading: plans.loading || budgetLoading,
    currency: ctx.display,
    today,
    month,
    monthText: monthLabel(month, true),
    setMonth,
    previousMonth: () => setMonth(shiftMonth(month, -1)),
    nextMonth: () => setMonth(shiftMonth(month, 1)),
    isCurrent: month === current,
    totals,
    lines,
    must,
    flow,
    setFlow,
    byType,
    /** Need chips belong to expense and savings buckets only. */
    showsNeed: (type: FlowType) => hasNeedAndPriority(type),
  };
}

export type BucketsLogic = ReturnType<typeof useLogic>;
