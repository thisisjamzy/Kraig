'use client';

// Finance Insights (Money mode) — the range the page shows (remembered),
// what it's compared against, the forecast's options, the section layout
// (collapsed / order, remembered per device), and every section's figures
// from src/viewmodels/finance (pure), recomputed only when the data or a
// choice changes.

import { useEffect, useMemo, useState } from 'react';
import { useFinanceData } from './useFinanceData';
import { classifySpending } from '@/src/viewmodels/finance/classify';
import {
  bucketAdherence,
  cashFlow,
  change,
  dailyHabits,
  incomeBySource,
  overspendLog,
  planAccuracy,
  rangeTotals,
  safeToSpend,
  spendingPace,
} from '@/src/viewmodels/finance/metrics';
import { moneyFlow, unplannedInsights } from '@/src/viewmodels/finance/breakdowns';
import { forecast, guidance, type Scenario } from '@/src/viewmodels/finance/forecast';
import { alerts } from '@/src/viewmodels/finance/insights';
import { incomeConsistency, incomeExpenseTrend, keyCashFlow, keyWindow, savingsTrend } from '@/src/viewmodels/finance/keyCharts';
import {
  comparisonPeriod,
  granularityFor,
  monthKey,
  periodFor,
  periodLabel,
  shiftPeriod,
  type CompareTo,
  type Period,
  type RangeKind,
} from '@/src/viewmodels/finance/ranges';

// Savings now lives in the Key charts (chart 4), not a section of its own.
export const SECTION_IDS = ['attention', 'snapshot', 'keycharts', 'cashflow', 'plan', 'unplanned', 'forecast', 'money', 'income', 'habits'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

const RANGE_KEY = 'dreda.financeInsights.range';
const LAYOUT_KEY = 'dreda.financeInsights.layout';

interface Stored {
  kind: RangeKind;
  compareTo: CompareTo;
  custom?: { start: string; end: string };
}

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked — the choice just isn't remembered.
  }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function useLogic() {
  const fin = useFinanceData();
  const { data, currency } = fin;

  // ---- Range ----
  // Read straight from storage: this screen only ever renders in the
  // browser (AuthGuard holds it back until auth resolves), so there's no
  // server render for a restored value to disagree with.
  const [stored] = useState(() => readStored<Stored>(RANGE_KEY));
  const [kind, setKindState] = useState<RangeKind>(stored?.kind ?? 'month');
  const [compareTo, setCompareToState] = useState<CompareTo>(stored?.compareTo ?? 'previous');
  const [custom, setCustom] = useState(() => {
    if (stored?.custom) return stored.custom;
    const end = new Date();
    return { start: iso(new Date(end.getFullYear(), end.getMonth() - 2, 1)), end: iso(end) };
  });
  const [anchor, setAnchor] = useState(() => new Date());
  useEffect(() => {
    writeStored(RANGE_KEY, { kind, compareTo, custom });
  }, [kind, compareTo, custom]);

  const period: Period = useMemo(() => {
    if (kind === 'custom') return periodFor('custom', anchor, { start: fromIso(custom.start), end: fromIso(custom.end) });
    if (kind === 'all') {
      const start = data.firstMonth ? fromIso(`${data.firstMonth}-01`) : new Date(data.today.getFullYear(), 0, 1);
      return periodFor('all', anchor, { start, end: data.today });
    }
    return periodFor(kind, anchor);
  }, [kind, anchor, custom, data.firstMonth, data.today]);
  const comparison = useMemo(() => comparisonPeriod(period, compareTo), [period, compareTo]);
  const canStep = kind !== 'all';

  function setKind(next: RangeKind) {
    setKindState(next);
    setAnchor(new Date());
  }
  function step(delta: -1 | 1) {
    if (!canStep) return;
    if (kind === 'custom') {
      const next = shiftPeriod(period, delta);
      setCustom({ start: iso(next.start), end: iso(next.end) });
      return;
    }
    setAnchor(shiftPeriod(period, delta).start);
  }

  // ---- Forecast options ----
  const [horizon, setHorizon] = useState(3);
  const [scenario, setScenario] = useState<Scenario>('expected');
  const [includeSavings, setIncludeSavings] = useState(false);

  // ---- Layout ----
  const [layout, setLayout] = useState<{ order: SectionId[]; collapsed: SectionId[] }>(() => {
    const saved = readStored<{ order: SectionId[]; collapsed: SectionId[] }>(LAYOUT_KEY);
    if (!saved) return { order: [...SECTION_IDS], collapsed: [] };
    // Drop sections that no longer exist; slot new ones in after the
    // section they follow by default.
    const order = saved.order.filter((id) => (SECTION_IDS as readonly string[]).includes(id));
    SECTION_IDS.forEach((id, i) => {
      if (order.includes(id)) return;
      const after = i > 0 ? order.indexOf(SECTION_IDS[i - 1]) : -1;
      order.splice(after + 1, 0, id);
    });
    return { order, collapsed: (saved.collapsed ?? []).filter((id) => order.includes(id)) };
  });
  function saveLayout(next: typeof layout) {
    setLayout(next);
    writeStored(LAYOUT_KEY, next);
  }
  function toggleCollapsed(id: SectionId) {
    const collapsed = layout.collapsed.includes(id) ? layout.collapsed.filter((x) => x !== id) : [...layout.collapsed, id];
    saveLayout({ ...layout, collapsed });
  }
  function move(id: SectionId, delta: -1 | 1) {
    const order = [...layout.order];
    const i = order.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveLayout({ ...layout, order });
  }

  // ---- Figures ----
  const splits = useMemo(() => classifySpending(data.txs, data), [data]);
  const granularity = granularityFor(period);
  const totals = useMemo(() => rangeTotals(data, period, splits), [data, period, splits]);
  const previous = useMemo(() => rangeTotals(data, comparison, splits), [data, comparison, splits]);
  const safe = useMemo(() => safeToSpend(data), [data]);
  const flow = useMemo(() => cashFlow(data, period, splits), [data, period, splits]);
  // Pace: the month in view, or the current month in longer views.
  const paceMonth = kind === 'month' ? monthKey(period.start) : monthKey(data.today);
  const pace = useMemo(() => spendingPace(data, paceMonth), [data, paceMonth]);
  const buckets = useMemo(() => bucketAdherence(data, period), [data, period]);
  const accuracy = useMemo(() => planAccuracy(data, period), [data, period]);
  const log = useMemo(() => overspendLog(data, period), [data, period]);
  const unplanned = useMemo(() => unplannedInsights(data, period, splits), [data, period, splits]);
  const unplannedPrevious = previous.unplanned;
  const projection = useMemo(() => forecast(data, splits, { horizon, scenario, includeSavings }), [data, splits, horizon, scenario, includeSavings]);
  const advice = useMemo(() => guidance(data, projection, currency), [data, projection, currency]);
  const money = useMemo(() => moneyFlow(data, period, fin.bucketName), [data, period, fin.bucketName]);
  const income = useMemo(() => incomeBySource(data, period), [data, period]);
  // Key charts: a trend window ending at the selected period.
  const [smooth, setSmooth] = useState(false);
  const keyWin = useMemo(() => keyWindow(data, period), [data, period]);
  const keyCharts = useMemo(
    () => ({
      income: incomeConsistency(data, keyWin),
      flow: keyCashFlow(data, keyWin),
      trend: incomeExpenseTrend(data, keyWin, smooth),
      savings: savingsTrend(data, keyWin),
    }),
    [data, keyWin, smooth]
  );
  const habits = useMemo(() => dailyHabits(data, period, splits), [data, period, splits]);
  const current = monthKey(data.today);
  const unassignedCount = useMemo(
    () => data.txs.filter((t) => t.kind === 'expense' && t.month === current && !t.link && t.amount > 0).length,
    [data, current]
  );
  const attention = useMemo(
    () => alerts({ data, currency, totals, forecast: projection, pace: spendingPace(data, current), log, unassignedCount }),
    [data, currency, totals, projection, current, log, unassignedCount]
  );

  const changes = {
    income: change(totals.income, previous.income),
    expense: change(totals.expense, previous.expense),
    net: change(totals.net, previous.net),
    savingsRate: totals.savingsRate !== null && previous.savingsRate !== null ? totals.savingsRate - previous.savingsRate : null,
    unplanned: change(totals.unplanned, previous.unplanned),
    adherence: totals.adherence !== null && previous.adherence !== null ? totals.adherence - previous.adherence : null,
  };

  // Where "see details" goes: the History tab for the month in view.
  const historyMonth = kind === 'day' || kind === 'week' || kind === 'month' ? monthKey(period.start) : current;
  const historyHref = (extra = '') => `/transactions?month=${historyMonth}${extra}`;

  return {
    loading: fin.loading,
    currency,
    data,
    // range
    kind,
    setKind,
    period,
    periodLabel: periodLabel(period),
    comparisonLabel: periodLabel(comparison),
    compareTo,
    setCompareTo: setCompareToState,
    custom,
    setCustom,
    step,
    canStep,
    canStepForward: canStep && shiftPeriod(period, 1).start <= data.today,
    granularity,
    // layout
    layout,
    toggleCollapsed,
    move,
    // sections
    attention,
    totals,
    previous,
    changes,
    safe,
    flow,
    pace,
    showPace: kind === 'month' || period.end >= data.today,
    buckets,
    accuracy,
    showAccuracy: kind === 'quarter' || kind === 'year' || kind === 'all' || (kind === 'custom' && accuracy.length > 2),
    log,
    unplanned,
    unplannedPrevious,
    projection,
    advice,
    horizon,
    setHorizon,
    scenario,
    setScenario,
    includeSavings,
    setIncludeSavings,
    money,
    income,
    keyWindow: keyWin,
    keyCharts,
    smooth,
    setSmooth,
    habits,
    showHabits: kind === 'week' || kind === 'month',
    historyHref,
    bucketHref: (bucketId: string) => `/budget/bucket/${bucketId}?month=${historyMonth}`,
    budgetHref: `/budget?month=${historyMonth}`,
    setSavingsTarget: fin.setSavingsTarget,
    addForecastItem: fin.addForecastItem,
    removeForecastItem: fin.removeForecastItem,
  };
}

export type FinanceInsights = ReturnType<typeof useLogic>;
