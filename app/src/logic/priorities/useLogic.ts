'use client';

// Priorities ("What should I pay next?") — the open items of a view, in a
// chosen order, grouped by urgency, and where the money runs out. The
// displayed order IS the walk order: urgency sections in order, the chosen
// sort inside each ("My order" is one flat list, dragged by hand). Items
// past the line say when they'd fit, from the Plans forecast.

import { useMemo, useState } from 'react';
import { usePlansData } from '@/src/logic/plans/usePlansData';
import { useListQuery } from '@/src/shared/listQuery/useListQuery';
import { applyQuery, EMPTY_QUERY, type FieldDef, type ListQuery } from '@/src/shared/listQuery/engine';
import {
  affordabilityWalk,
  itemsFor,
  postponeSuggestions,
  sortItems,
  type SortMode,
  type View,
} from '@/src/viewmodels/plans/priorities';
import { URGENCY_LABEL, URGENCY_ORDER, remaining, statusOf, urgency, type Occurrence } from '@/src/viewmodels/plans/model';
import { capacityAfterCurrent, plansForecast } from '@/src/viewmodels/plans/forecast';
import { isSavingsAccount } from '@/src/viewmodels/wallets';

const KIND_LABEL = { fixed: 'Fixed', variable: 'Variable', savings: 'Savings', income: 'Income', transfer: 'Transfer' };
const STATUS_LABEL = { open: 'Open', partly: 'Partly paid', paid: 'Paid', postponed: 'Postponed', dropped: 'Dropped' };

export function useLogic() {
  const plans = usePlansData();
  const { occurrences, today, money } = plans;

  const [view, setView] = useState<View>('month');
  const [mode, setMode] = useState<SortMode>('recommended');
  const [includeExpected, setIncludeExpected] = useState(true);

  // ---- Filters (the shared toolbar; ordering is the chips) ----
  const fields = useMemo<FieldDef<Occurrence>[]>(() => {
    const buckets = [...new Map(occurrences.map((o) => [o.bucketId, o.bucketName])).entries()];
    const tags = [...new Set(occurrences.map((o) => o.tag).filter(Boolean))];
    return [
      { id: 'name', label: 'Name', type: 'text', get: (o) => o.name, searchable: true, sortable: false },
      { id: 'bucket', label: 'Bucket / plan', type: 'select', get: (o) => o.bucketId, options: buckets.map(([value, label]) => ({ value, label })), sortable: false },
      { id: 'need', label: 'Need', type: 'select', get: (o) => o.need, options: [{ value: 'must', label: 'Must have' }, { value: 'nice', label: 'Nice to have' }], sortable: false },
      { id: 'priority', label: 'Priority', type: 'select', get: (o) => o.priority, options: ['High', 'Medium', 'Low'].map((p) => ({ value: p, label: p })), sortable: false },
      { id: 'tag', label: 'Tag', type: 'select', get: (o) => o.tag, options: tags.map((t) => ({ value: t, label: t })), sortable: false },
      { id: 'kind', label: 'Kind', type: 'select', get: (o) => o.kind, options: (['fixed', 'savings'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] })), sortable: false },
      { id: 'urgency', label: 'Urgency', type: 'select', get: (o) => urgency(o, today), options: URGENCY_ORDER.map((u) => ({ value: u, label: URGENCY_LABEL[u] })), sortable: false },
      { id: 'status', label: 'Status', type: 'select', get: (o) => statusOf(o), options: (['open', 'partly', 'postponed'] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] })), sortable: false },
    ];
  }, [occurrences, today]);
  const list = useListQuery<Occurrence>({ listId: 'priorities', fields, defaults: EMPTY_QUERY as ListQuery });

  // ---- The list and the walk ----
  const forecast = useMemo(() => plansForecast(money.forecastInput, 12, 'expected'), [money.forecastInput]);
  const availableAmount = includeExpected ? money.available.byMonthEnd : money.available.now;
  const { ordered, walk } = useMemo(() => {
    const items = applyQuery(itemsFor(view, occurrences, today), list.query, fields, today);
    let ordered: Occurrence[];
    if (mode === 'mine') ordered = sortItems(items, 'mine', today);
    else {
      ordered = URGENCY_ORDER.flatMap((u) => sortItems(items.filter((o) => urgency(o, today) === u), mode, today));
    }
    return { ordered, walk: affordabilityWalk(ordered, availableAmount, capacityAfterCurrent(forecast)) };
  }, [view, occurrences, today, list.query, fields, mode, availableAmount, forecast]);

  const suggestions = useMemo(() => (walk.mustShort ? postponeSuggestions(walk, walk.mustShortAmount) : []), [walk]);
  const mustDue = walk.rows.filter((r) => r.item.need === 'must').reduce((s, r) => s + r.remaining, 0);

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
  const walletsFor = (o: Occurrence) => plans.accounts.filter((a) => (o.kind === 'savings' ? isSavingsAccount(a) : !isSavingsAccount(a)));

  async function move(id: string, to: number) {
    const from = ordered.findIndex((o) => o.key === id);
    if (from < 0 || to < 0 || to >= ordered.length) return;
    const next = [...ordered];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    await plans.saveOrder(next);
  }

  return {
    loading: plans.loading,
    currency: plans.currency,
    today,
    view,
    setView,
    mode,
    setMode,
    includeExpected,
    setIncludeExpected,
    available: money.available,
    fields,
    list,
    ordered,
    walk,
    mustDue,
    suggestions,
    remaining,
    // actions
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
    move,
    busy,
    error,
  };
}

export type PrioritiesLogic = ReturnType<typeof useLogic>;
