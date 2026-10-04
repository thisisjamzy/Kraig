'use client';

// Plans forecast — "Where are my plans heading?". Every card reads the same
// forecast (src/viewmodels/plans/forecast.ts) for the chosen horizon and
// scenario, with any what-if changes (postpone or drop an item, add an
// expected income or expense) applied on top; "Apply changes" writes the
// moves and drops to the items, "Reset" discards them.

import { useMemo, useState } from 'react';
import { usePlansData } from '@/src/logic/plans/usePlansData';
import {
  NO_WHAT_IF,
  affordStatus,
  applyWhatIf,
  effectiveMonth,
  hasWhatIf,
  planSchedule,
  plansForecast,
  plansGuidance,
  scheduleStatus,
  type Scenario,
  type WhatIf,
} from '@/src/viewmodels/plans/forecast';
import { isOpen, monthKey, relevant, remaining, type Occurrence } from '@/src/viewmodels/plans/model';

export function useLogic() {
  const plans = usePlansData();
  const { money, occurrences, today, currency } = plans;
  const [horizon, setHorizon] = useState(6);
  const [scenario, setScenario] = useState<Scenario>('expected');
  const [whatIf, setWhatIf] = useState<WhatIf>(NO_WHAT_IF);

  const input = money.forecastInput;
  const forecast = useMemo(() => plansForecast(input, horizon, scenario, whatIf), [input, horizon, scenario, whatIf]);
  const baseline = useMemo(() => plansForecast(input, horizon, scenario), [input, horizon, scenario]);
  const schedule = useMemo(() => planSchedule(input, scenario, whatIf), [input, scenario, whatIf]);
  const adjusted = useMemo(() => applyWhatIf(occurrences, whatIf), [occurrences, whatIf]);
  const tips = useMemo(() => plansGuidance(forecast, adjusted, today, currency), [forecast, adjusted, today, currency]);

  const current = monthKey(today);
  const lastMonth = forecast.months[forecast.months.length - 1]?.month ?? current;
  // Open plan items in the horizon, biggest first (C3's list).
  const upcoming = useMemo(
    () =>
      adjusted
        .filter((o) => o.inPlan && o.kind !== 'income' && isOpen(o) && relevant(o, today) && effectiveMonth(o, current) <= lastMonth)
        .sort((a, b) => remaining(b) - remaining(a)),
    [adjusted, today, current, lastMonth]
  );
  // What the what-if controls can change: any open item with a date.
  const changeable = useMemo(
    () =>
      occurrences
        .filter((o) => o.kind !== 'income' && o.kind !== 'variable' && isOpen(o) && relevant(o, today) && !o.recurring)
        .sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0)),
    [occurrences, today]
  );

  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function apply() {
    setApplying(true);
    setError(null);
    try {
      for (const [key, date] of Object.entries(whatIf.moves)) {
        const o = occurrences.find((x) => x.key === key);
        if (o) await plans.postpone(o, date, 'Planned in forecast');
      }
      for (const key of whatIf.drops) {
        const o = occurrences.find((x) => x.key === key);
        if (o) await plans.drop(o);
      }
      setWhatIf(NO_WHAT_IF);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply those changes.');
    } finally {
      setApplying(false);
    }
  }

  const [savingPlan, setSavingPlan] = useState(false);
  const [savedPlan, setSavedPlan] = useState(false);
  async function createSavingsPlan() {
    setSavingPlan(true);
    setError(null);
    try {
      await plans.createSavingsPlan(schedule.filter((r) => r.remaining > 0).map((r) => ({ name: r.name, amount: r.setAside })));
      setSavedPlan(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the savings plan.');
    } finally {
      setSavingPlan(false);
    }
  }

  return {
    loading: plans.loading,
    currency,
    today,
    horizon,
    setHorizon,
    scenario,
    setScenario,
    forecast,
    baseline,
    schedule,
    affordStatus: affordStatus(forecast),
    scheduleStatus: scheduleStatus(schedule),
    upcoming,
    tips,
    // what-if
    whatIf,
    whatIfActive: hasWhatIf(whatIf),
    changeable,
    nameOf: (key: string) => occurrences.find((o) => o.key === key)?.name ?? 'Item',
    postponeItem: (o: Occurrence, date: Date) => setWhatIf((w) => ({ ...w, moves: { ...w.moves, [o.key]: date } })),
    dropItem: (o: Occurrence) => setWhatIf((w) => ({ ...w, drops: [...new Set([...w.drops, o.key])] })),
    addExtra: (x: Omit<WhatIf['extras'][number], 'id'>) => setWhatIf((w) => ({ ...w, extras: [...w.extras, { ...x, id: crypto.randomUUID() }] })),
    removeChange: (kind: 'move' | 'drop' | 'extra', id: string) =>
      setWhatIf((w) => {
        if (kind === 'move') {
          const moves = { ...w.moves };
          delete moves[id];
          return { ...w, moves };
        }
        if (kind === 'drop') return { ...w, drops: w.drops.filter((k) => k !== id) };
        return { ...w, extras: w.extras.filter((x) => x.id !== id) };
      }),
    reset: () => setWhatIf(NO_WHAT_IF),
    apply,
    applying,
    createSavingsPlan,
    savingPlan,
    savedPlan,
    error,
  };
}

export type PlansForecastLogic = ReturnType<typeof useLogic>;
