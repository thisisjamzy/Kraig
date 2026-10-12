'use client';

// Development only: the plans' pages on sample data, with the scenario kept
// in memory (no Firestore, no records).

import { useMemo, useState } from 'react';
import '@/src/styles/base/globals.css';
import { dayFrom } from '@/src/viewmodels/planner/days';
import { moneyFixture, timeFixture } from '@/src/viewmodels/planner/fixtures';
import { applyFix, emptyScenario, moneyPlan, moveTo, originalDate, setDate, setGoalMonthly, startingScenario, toggleItem, toggleSkip, type ChangeResult, type MoneyHorizon, type MoneyScenario } from '@/src/viewmodels/planner/money';
import { addTheHours, autoPlan, changeChunk, emptyTimeScenario, moveChunk, planTaskOn, removeChunk, setCapacity, timePlan, type TimeScenario } from '@/src/viewmodels/planner/time';
import type { MoneyPlanLogic } from '@/src/logic/moneyPlan/useMoneyPlan';
import type { TimePlanLogic } from '@/src/logic/timePlan/useTimePlan';
import type { Scenarios } from '@/src/logic/planner/useScenarios';
import { MoneyPlanPage } from '@/src/widgets/Planner/MoneyPlanPage';
import { TimePlanPage } from '@/src/widgets/Planner/TimePlanPage';

const store = (): Scenarios =>
  ({
    loading: false,
    scenarios: [{ id: 'main', name: 'My plan', money: emptyScenario(), time: emptyTimeScenario(), updatedAt: 0 }],
    current: { id: 'main', name: 'My plan', money: emptyScenario(), time: emptyTimeScenario(), updatedAt: 0 },
    activeId: 'main',
    isActive: true,
    pick: () => undefined,
    update: () => undefined,
    createScenario: () => undefined,
    makeActive: () => undefined,
    deleteScenario: () => undefined,
  }) as Scenarios;

function MoneyPreview({ web, horizon, change, board }: { web: boolean; horizon?: string; change: boolean; board: boolean }) {
  const input = useMemo(() => moneyFixture(), []);
  const [scenario, setScenario] = useState<MoneyScenario>(() => {
    const s = { ...emptyScenario((horizon as MoneyHorizon) || '3m', 30_000) };
    if (!change) return s;
    const r = setDate(input, s, `concert@${dayFrom(2026, 10, 31)}`, dayFrom(2026, 12, 28));
    return r.ok ? r.scenario : s;
  });
  const run = (r: ChangeResult) => r.ok && setScenario(r.scenario);
  const logic = {
    loading: false,
    currency: 'XAF',
    input,
    scenario,
    view: moneyPlan(input, scenario),
    store: store(),
    actions: {
      setHorizon: (h: MoneyHorizon) => setScenario({ ...scenario, horizon: h }),
      setBuffer: (b: number) => setScenario({ ...scenario, buffer: b }),
      setConfirmedOnly: (c: boolean) => setScenario({ ...scenario, confirmedOnly: c }),
      reset: () => setScenario(startingScenario(scenario)),
      setDate: (id: string, d: number) => run(setDate(input, scenario, id, d)),
      moveTo: (id: string, t: string) => run(moveTo(input, scenario, id, t)),
      toggleSkip: (id: string) => run(toggleSkip(input, scenario, id)),
      originalDate: (id: string) => run(originalDate(input, scenario, id)),
      toggleItem: (id: string) => run(toggleItem(input, scenario, id)),
      setGoalMonthly: (g: string, m: number) => setScenario(setGoalMonthly(input, scenario, g, m)),
      applyFix: (f: Parameters<typeof applyFix>[2]) => run(applyFix(input, scenario, f)),
    },
    recordChanges: [],
    applyToRecords: async () => undefined,
  } as unknown as MoneyPlanLogic;
  return <MoneyPlanPage logic={logic} web={web} initialView={board ? 'board' : 'list'} />;
}

function TimePreview({ web }: { web: boolean }) {
  const input = useMemo(() => timeFixture(), []);
  const [scenario, setScenario] = useState<TimeScenario>(() => autoPlan(input, emptyTimeScenario(7)));
  const logic = {
    loading: false,
    input,
    scenario,
    view: timePlan(input, scenario),
    store: store(),
    actions: {
      setHorizon: (horizon: 7 | 14) => setScenario({ ...scenario, horizon }),
      autoPlan: () => setScenario(autoPlan(input, scenario)),
      clear: () => setScenario({ ...scenario, allocations: [] }),
      resetHours: () => setScenario({ ...scenario, capacity: {} }),
      setCapacity: (d: number, h: number) => setScenario(setCapacity(input, scenario, d, h)),
      addTheHours: (f: Parameters<typeof addTheHours>[2]) => setScenario(addTheHours(input, scenario, f)),
      planTaskOn: (id: string, d: number) => setScenario(planTaskOn(input, scenario, id, d).scenario),
      moveChunk: (id: string, d: number) => setScenario(moveChunk(scenario, id, d)),
      removeChunk: (id: string) => setScenario(removeChunk(scenario, id)),
      changeChunk: (id: string, delta: number) => setScenario(changeChunk(scenario, id, delta)),
    },
    calendarBlocks: [],
    sendToCalendar: async () => undefined,
    capacityChanges: [],
    saveCapacity: async () => undefined,
  } as unknown as TimePlanLogic;
  return <TimePlanPage logic={logic} web={web} />;
}

export function PlanPreview({ which, web, horizon, change, board }: { which: 'money' | 'time'; web: boolean; horizon?: string; change: boolean; board: boolean }) {
  return which === 'money' ? <MoneyPreview web={web} horizon={horizon} change={change} board={board} /> : <TimePreview web={web} />;
}
