'use client';

// Priorities ("What should I pay next?") — the open expense and savings
// lines of a scope (this month, or everything open), each with its
// coverage: what the money already received pays now, what waits for
// income still expected (and which income), and what isn't covered. The
// figures use the shared definitions: available now is received income
// minus what was spent and saved, never expected income.

import { useMemo, useState } from 'react';
import { usePlansData } from '@/src/logic/plans/usePlansData';
import { coverageOf, type Coverage } from '@/src/shared/budget/coverage';
import { useMonthParam } from '@/src/shared/navigation/useMonthParam';
import { isOpen, monthKey, monthLabel, remaining, startOfDay, statusOf, urgency, type Occurrence } from '@/src/viewmodels/plans/model';
import { compareRecommended, itemsFor, sortItems, type SortMode, type View } from '@/src/viewmodels/plans/priorities';
import { isSavingsAccount } from '@/src/viewmodels/wallets';

export interface PriorityRow {
  key: string;
  o: Occurrence;
  left: number;
  coverage: Coverage | 'postponed';
  waitsFor: string | null;
  daysLate: number | null;
  status: string;
  accountName: string;
}

const STATUS_LABEL = { open: 'Open', partly: 'Partly paid', paid: 'Paid', postponed: 'Postponed', dropped: 'Dropped' };
const DAY = 86_400_000;

export function useLogic() {
  const plans = usePlansData();
  const { occurrences, today, money } = plans;
  const [month, setMonth] = useMonthParam();
  const [view, setView] = useState<View>('month');

  const accountName = useMemo(() => new Map(plans.accounts.map((a) => [a.id, a.name])), [plans.accounts]);
  const isCurrent = month === monthKey(today);
  // The scope's "today": the browsed month's own when it isn't this one.
  const asOf = useMemo(() => {
    if (isCurrent) return today;
    const [y, m] = month.split('-').map(Number);
    return month < monthKey(today) ? new Date(y, m, 0, 23, 59) : new Date(y, m - 1, 1, 9);
  }, [isCurrent, month, today]);

  const { rows, totals } = useMemo(() => {
    const scope = itemsFor(view, occurrences, asOf).filter((o) => o.kind !== 'income' && o.kind !== 'transfer');
    const ordered = [...scope].sort((a, b) => compareRecommended(a, b, asOf));
    const expected = occurrences
      .filter((o) => o.kind === 'income' && o.month === month && isOpen(o))
      .map((o) => ({ name: o.name, amount: remaining(o), due: o.due }));
    const live = ordered.filter((o) => !o.postponed);
    const result = coverageOf(live, remaining, isCurrent ? money.available.now : 0, expected);
    const byKey = new Map(result.rows.map((r) => [r.line.key, r]));
    const out: PriorityRow[] = ordered.map((o) => {
      const c = byKey.get(o.key);
      const late = o.due && startOfDay(o.due) < startOfDay(asOf) ? Math.round((startOfDay(asOf).getTime() - startOfDay(o.due).getTime()) / DAY) : null;
      return {
        key: o.key,
        o,
        left: remaining(o),
        coverage: o.postponed ? 'postponed' : (c?.coverage ?? 'not'),
        waitsFor: c?.waitsFor ?? null,
        daysLate: late,
        status: STATUS_LABEL[statusOf(o)],
        accountName: o.accountId ? (accountName.get(o.accountId) ?? '') : '',
      };
    });
    return { rows: out, totals: result };
  }, [view, occurrences, asOf, month, isCurrent, money.available.now, accountName]);

  const must = rows.filter((r) => r.o.need === 'must' && r.coverage !== 'postponed');
  const mustDue = must.reduce((s, r) => s + r.left, 0);
  const mustNow = must.filter((r) => r.coverage === 'now').reduce((s, r) => s + r.left, 0);
  const firstWait = rows.find((r) => r.coverage === 'waiting')?.waitsFor ?? null;
  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
  const summary = !rows.length
    ? 'Nothing is left to pay in this scope.'
    : mustDue > 0
      ? `${fmt(mustDue)} of must-haves ${mustDue === 1 ? 'is' : 'are'} due. ${fmt(mustNow)} can be paid now${mustNow < mustDue ? (firstWait ? `; the rest waits for ${firstWait}.` : '; the rest isn’t covered yet.') : '.'}`
      : `${fmt(totals.canPayNow)} can be paid now${totals.waiting ? `, ${fmt(totals.waiting)} waits for income` : ''}${totals.notCovered ? ` and ${fmt(totals.notCovered)} isn’t covered` : ''}.`;

  // ---- Actions ----
  const [paying, setPaying] = useState<Occurrence | null>(null);
  const [postponing, setPostponing] = useState<Occurrence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPaying(null);
      setPostponing(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }
  const walletsFor = (o: Occurrence) => plans.accounts.filter((a) => !a.archived && (o.kind === 'savings' ? isSavingsAccount(a) : !isSavingsAccount(a)));

  /** "Manual" order: saved as the items' rank. */
  async function saveOrder(list: Occurrence[]) {
    await plans.saveOrder(list);
  }

  return {
    loading: plans.loading,
    currency: plans.currency,
    today,
    month,
    setMonth,
    monthText: monthLabel(month, true),
    view,
    setView,
    rows,
    totals,
    availableNow: isCurrent ? money.available.now : 0,
    summary,
    sortWith: (mode: SortMode) => (a: PriorityRow, b: PriorityRow) => {
      const order = sortItems([a.o, b.o], mode, asOf);
      return order[0] === a.o ? -1 : 1;
    },
    urgencyOf: (o: Occurrence) => urgency(o, asOf),
    paying,
    setPaying: (o: Occurrence | null) => {
      setError(null);
      setPaying(o);
    },
    postponing,
    setPostponing: (o: Occurrence | null) => {
      setError(null);
      setPostponing(o);
    },
    walletsFor,
    pay: (o: Occurrence, amount: number, accountId: string) => run(() => plans.recordPayment(o, amount, accountId, amount >= remaining(o) - 0.5)),
    postpone: (o: Occurrence, to: Date, reason: string) => run(() => plans.postpone(o, to, reason)),
    drop: (o: Occurrence) => run(() => plans.drop(o)),
    saveOrder,
    busy,
    error,
  };
}

export type PrioritiesLogic = ReturnType<typeof useLogic>;
