'use client';

// Planning settings (Dreda v1.0 65750, phone 70572): task types with their
// time blocks, deep work limits and scheduling rules.
//
// Kept in this session for now: extending `settings/taskTypes` and adding
// `settings/planning` waits on the owner (BUILD-KIT section 7.2 and 7.3).
// When they are approved, this hook is where they are read and saved; the
// screens do not change. Plan my day keeps its own defaults until then.

import { useState, useSyncExternalStore } from 'react';
import { DEFAULT_PLANNING, type DeepWorkLimits, type PlanningSettings, type SchedulingRules, type TypeSetting } from '@/src/viewmodels/planning-settings';

let state: PlanningSettings = DEFAULT_PLANNING;
const listeners = new Set<() => void>();
const set = (next: PlanningSettings) => {
  state = next;
  listeners.forEach((l) => l());
};
const store = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
};

export const DEEP_CHOICES: Record<keyof Omit<DeepWorkLimits, 'protect'>, number[]> = {
  minMinutes: [0, 60, 90, 120, 180],
  maxMinutes: [120, 180, 240, 300, 360],
  longestMinutes: [60, 90, 120, 150, 180],
  breakMinutes: [0, 5, 10, 15, 30],
};

export function useLogic() {
  const settings = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [editing, setEditing] = useState<TypeSetting | null>(null);
  const [isNew, setIsNew] = useState(false);

  function saveType(t: TypeSetting): string | null {
    if (!t.type.trim()) return 'Give the type a name.';
    if (!t.days.length && !t.sharesWith) return 'Pick at least one day.';
    if (!(t.from < t.to)) return 'The block has to end after it starts.';
    const exists = settings.types.some((x) => x.type.toLowerCase() === t.type.trim().toLowerCase());
    if (isNew && exists) return 'That type already exists.';
    const clean = { ...t, type: t.type.trim() };
    set({ ...settings, types: isNew ? [...settings.types, clean] : settings.types.map((x) => (x.type === editing?.type ? clean : x)) });
    setEditing(null);
    return null;
  }

  return {
    settings,
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    setAuto: (type: string, auto: boolean) => set({ ...settings, types: settings.types.map((t) => (t.type === type ? { ...t, auto } : t)) }),
    setDeep: <K extends keyof DeepWorkLimits>(key: K, value: DeepWorkLimits[K]) => set({ ...settings, deep: { ...settings.deep, [key]: value } }),
    setRule: (key: keyof SchedulingRules, value: boolean) => set({ ...settings, rules: { ...settings.rules, [key]: value } }),
    editing,
    isNew,
    edit: (t: TypeSetting) => {
      setIsNew(false);
      setEditing(t);
    },
    add: () => {
      setIsNew(true);
      setEditing({ type: '', days: [0, 1, 2, 3, 4], from: '09:00', to: '10:00', average: 15, perDay: 4, auto: true });
    },
    cancel: () => setEditing(null),
    saveType,
    removeType: (type: string) => {
      set({ ...settings, types: settings.types.filter((t) => t.type !== type) });
      setEditing(null);
    },
  };
}

export type PlanningLogic = ReturnType<typeof useLogic>;
