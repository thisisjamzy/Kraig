'use client';

// Saved plans (scenarios) for the money and time plans, in one settings
// document (users/{uid}/settings/planner): each scenario keeps only the
// user's changes (src/viewmodels/planner). One is ACTIVE: the plan the rest
// of the app reads. The page edits the one picked (the active one unless
// another is chosen); every change saves straight away. Past dates drop out
// on read: overrides of occurrences before today, allocations before today.

import { useCallback, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { emptyScenario, type MoneyScenario } from '@/src/viewmodels/planner/money';
import { emptyTimeScenario, type TimeScenario } from '@/src/viewmodels/planner/time';
import { isoOf, type Day } from '@/src/viewmodels/planner/days';

export interface StoredScenario {
  id: string;
  name: string;
  money: MoneyScenario;
  time: TimeScenario;
  updatedAt: number;
}

interface PlannerDoc {
  scenarios?: StoredScenario[];
  activeId?: string | null;
}

const MAIN = 'main';

const fresh = (id: string, name: string): StoredScenario => ({ id, name, money: emptyScenario('3m', 0), time: emptyTimeScenario(7), updatedAt: Date.now() });

/** Drops what is in the past, and fills fields an older save didn't have. */
function tidy(s: StoredScenario, today: Day): StoredScenario {
  const overrides = Object.fromEntries(
    Object.entries(s.money?.overrides ?? {}).filter(([id]) => {
      const base = id.slice(id.lastIndexOf('@') + 1);
      return base === 'none' || Number(base) >= today;
    })
  );
  const todayIso = isoOf(today);
  return {
    ...s,
    money: { ...emptyScenario(), ...s.money, overrides, disabled: s.money?.disabled ?? [], goalMonthly: s.money?.goalMonthly ?? {} },
    time: {
      ...emptyTimeScenario(),
      ...s.time,
      capacity: Object.fromEntries(Object.entries(s.time?.capacity ?? {}).filter(([iso]) => iso >= todayIso)),
      allocations: (s.time?.allocations ?? []).filter((a) => a.day >= today),
    },
  };
}

export function useScenarios(today: Day) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const ref = useMemo(() => (uid ? doc(getFirebaseFirestore(), 'users', uid, 'settings', 'planner') : null), [uid]);
  const { data, loading } = useFirestoreDoc<PlannerDoc>(ref);
  // What this page has changed but the listener hasn't echoed yet.
  const [local, setLocal] = useState<PlannerDoc | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const stored = local ?? data;
  const scenarios = useMemo(() => {
    const list = (stored?.scenarios ?? []).map((s) => tidy(s, today));
    return list.length ? list : [fresh(MAIN, 'My plan')];
  }, [stored, today]);
  const activeId = stored?.activeId && scenarios.some((s) => s.id === stored.activeId) ? stored.activeId : scenarios[0].id;
  const current = scenarios.find((s) => s.id === (pickedId ?? activeId)) ?? scenarios[0];

  const write = useCallback(
    (next: PlannerDoc) => {
      setLocal(next);
      if (ref) void setDoc(ref, next).then(() => setLocal((cur) => (cur === next ? null : cur)));
    },
    [ref]
  );

  const update = useCallback(
    (patch: Partial<Pick<StoredScenario, 'money' | 'time' | 'name'>>) => {
      const list = scenarios.map((s) => (s.id === current.id ? { ...s, ...patch, updatedAt: Date.now() } : s));
      write({ scenarios: list, activeId });
    },
    [scenarios, current.id, activeId, write]
  );

  const createScenario = useCallback(
    (name: string, copy: boolean) => {
      const id = `s${Date.now().toString(36)}`;
      const base = copy ? { ...current, id, name, updatedAt: Date.now() } : { ...fresh(id, name), money: { ...emptyScenario(current.money.horizon, current.money.buffer) } };
      write({ scenarios: [...scenarios, base], activeId });
      setPickedId(id);
    },
    [current, scenarios, activeId, write]
  );

  const makeActive = useCallback(() => write({ scenarios, activeId: current.id }), [scenarios, current.id, write]);

  const deleteScenario = useCallback(() => {
    if (scenarios.length < 2) return;
    const list = scenarios.filter((s) => s.id !== current.id);
    write({ scenarios: list, activeId: activeId === current.id ? list[0].id : activeId });
    setPickedId(null);
  }, [scenarios, current.id, activeId, write]);

  return {
    loading,
    scenarios,
    current,
    activeId,
    isActive: current.id === activeId,
    pick: setPickedId,
    update,
    createScenario,
    makeActive,
    deleteScenario,
  };
}

export type Scenarios = ReturnType<typeof useScenarios>;
