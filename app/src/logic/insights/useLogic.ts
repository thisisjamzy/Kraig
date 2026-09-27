'use client';

// The Insights screen: a range (today / week / month / custom, default
// week, remembered per device), everything computed for it
// (src/viewmodels/insights/compute.ts, cached per range), and where each
// tap goes — every chart bar or point opens the filtered task list behind
// it (src/logic/tasksList's drill-down parameters).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeCached, useInsightsSources } from '@/src/shared/insights/useInsightsData';
import { dayKey } from '@/src/viewmodels/insights/dates';
import type { RangeKind } from '@/src/viewmodels/insights/types';
import type { Quadrant } from '@/src/shared/firestore/types';

const RANGE_KEY = 'dreda.insightsRange';

export function useLogic() {
  const router = useRouter();
  const sources = useInsightsSources();

  const [kind, setKindState] = useState<RangeKind>('week');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(RANGE_KEY);
    } catch {
      saved = null;
    }
    if (saved !== 'today' && saved !== 'month') return;
    const frame = requestAnimationFrame(() => setKindState(saved as RangeKind));
    return () => cancelAnimationFrame(frame);
  }, []);
  function setKind(next: RangeKind) {
    setKindState(next);
    if (next === 'custom' && !custom) {
      const to = new Date();
      const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 13);
      setCustom({ from: dayKey(from), to: dayKey(to) });
    }
    try {
      if (next !== 'custom') localStorage.setItem(RANGE_KEY, next);
    } catch {
      // Storage blocked — the choice just won't stick.
    }
  }

  const key = kind === 'custom' ? `custom|${custom?.from}|${custom?.to}` : kind;
  const result =
    sources.loading || !sources.uid
      ? null
      : computeCached(key, sources.taskDocs, sources.projectDocs, sources.settings, sources.minute, kind, kind === 'custom' ? custom : null);

  /** The task list behind a chart: one day or the whole range, narrowed. */
  function openTasks(filters: {
    date?: Date;
    status?: 'done' | 'pending' | 'cancelled';
    quadrant?: Quadrant;
    hour?: number;
    title?: string;
  }) {
    if (!result) return;
    const params = new URLSearchParams();
    if (filters.date) params.set('date', dayKey(filters.date));
    else {
      params.set('from', dayKey(result.range.from));
      params.set('to', dayKey(result.range.to));
    }
    if (filters.status) params.set('status', filters.status);
    if (filters.quadrant) params.set('quadrant', filters.quadrant);
    if (filters.hour !== undefined) params.set('hour', String(filters.hour));
    if (filters.title) params.set('title', filters.title);
    router.push(`/tasks?${params.toString()}`);
  }
  function open(href: string) {
    router.push(href);
  }

  return {
    kind,
    setKind,
    custom,
    setCustom,
    result,
    settings: sources.settings,
    openTasks,
    open,
    loading: sources.loading,
  };
}
