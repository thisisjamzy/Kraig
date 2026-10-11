'use client';

// The dashboards' period: Day to All time, always to date. The address
// holds it (?period=week&date=2026-09-28) so a reload keeps it; the last
// choice is remembered per dashboard (Money opens on Month, Time on Week).
// `now` ticks every minute, so a period in progress keeps up.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNowMinute } from '@/src/shared/insights/useNow';
import { buildPeriod, dateParam, DASH_KINDS, parseDateParam, periodChoices, type DashKind, type DashPeriod } from './period';

const KEY = (dashboard: string) => `dreda.dashboard.${dashboard}.period`;

export function usePeriod(dashboard: 'money' | 'time', first: Date | null) {
  const router = useRouter();
  const minute = useNowMinute();
  const now = useMemo(() => (minute ? new Date(minute * 60000) : new Date()), [minute]);
  const [kind, setKindState] = useState<DashKind>(dashboard === 'money' ? 'month' : 'week');
  const [anchor, setAnchor] = useState<Date | null>(null);

  // From the address, else the remembered choice (once, after the first paint).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('period') as DashKind | null;
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(KEY(dashboard));
    } catch {
      remembered = null;
    }
    const next = fromUrl && DASH_KINDS.includes(fromUrl) ? fromUrl : remembered && DASH_KINDS.includes(remembered as DashKind) ? (remembered as DashKind) : null;
    const date = parseDateParam(params.get('date'));
    const frame = requestAnimationFrame(() => {
      if (next) setKindState(next);
      if (date) setAnchor(date);
    });
    return () => cancelAnimationFrame(frame);
  }, [dashboard]);

  const period: DashPeriod = useMemo(() => buildPeriod(kind, anchor && anchor <= now ? anchor : now, now, first), [kind, anchor, now, first]);

  const sync = useCallback(
    (k: DashKind, a: Date | null) => {
      const params = new URLSearchParams(window.location.search);
      params.set('period', k);
      if (a && k !== 'all') params.set('date', dateParam(a));
      else params.delete('date');
      router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const setKind = useCallback(
    (k: DashKind) => {
      setKindState(k);
      setAnchor(null);
      try {
        localStorage.setItem(KEY(dashboard), k);
      } catch {
        // Not remembered on this device.
      }
      sync(k, null);
      window.scrollTo({ top: 0 });
    },
    [dashboard, sync]
  );

  /** Jump straight to a specific period (a value from `choices`). */
  const choose = useCallback(
    (value: string) => {
      const next = parseDateParam(value);
      if (!next) return;
      setAnchor(next);
      sync(kind, next);
    },
    [kind, sync]
  );

  const choices = useMemo(() => periodChoices(kind, now, first), [kind, now, first]);

  return {
    period,
    choices,
    choose,
    kind,
    setKind,
  };
}
