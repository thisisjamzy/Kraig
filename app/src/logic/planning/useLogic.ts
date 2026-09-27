'use client';

// Planning — the Budget section's one page: three tabs (Budget, Payments,
// History) over one shared month. The month and tab live in the URL
// (?tab=&month=YYYY-MM, replaced in place, not pushed) so coming back from
// a bucket or transaction lands on the same view. Every tab reads the same
// month budget (useMonthBudget), loaded once here.

import { useState } from 'react';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { monthOf, shiftMonth } from '@/src/viewmodels/planning';

export type PlanningTab = 'budget' | 'payments' | 'history';
const TABS: PlanningTab[] = ['budget', 'payments', 'history'];

interface UrlState {
  tab: PlanningTab;
  month: string;
  bucket: string | null;
}

function fromUrl(defaultTab: PlanningTab): UrlState {
  const fallback = { tab: defaultTab, month: monthOf(new Date()), bucket: null };
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  const raw = params.get('month');
  const year = params.get('year');
  let month = fallback.month;
  if (raw && /^\d{4}-\d{2}$/.test(raw)) month = raw;
  // Older links: ?month=0-11&year=YYYY.
  else if (raw !== null && year !== null && /^\d{1,2}$/.test(raw) && /^\d{4}$/.test(year)) {
    month = `${year}-${String(Number(raw) + 1).padStart(2, '0')}`;
  }
  return {
    tab: TABS.includes(tab as PlanningTab) ? (tab as PlanningTab) : defaultTab,
    month,
    bucket: params.get('bucket'),
  };
}

function writeUrl(state: UrlState) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  if (state.tab !== 'budget') params.set('tab', state.tab);
  params.set('month', state.month);
  if (state.bucket && state.tab !== 'budget') params.set('bucket', state.bucket);
  window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
}

export function useLogic(defaultTab: PlanningTab = 'budget') {
  const [state, setState] = useState<UrlState>(() => fromUrl(defaultTab));
  function update(patch: Partial<UrlState>) {
    const next = { ...state, ...patch };
    setState(next);
    writeUrl(next);
  }

  const data = useMonthBudget(state.month);

  return {
    tab: state.tab,
    setTab: (tab: PlanningTab) => update({ tab }),
    month: state.month,
    setMonth: (month: string) => update({ month }),
    previousMonth: () => update({ month: shiftMonth(state.month, -1) }),
    nextMonth: () => update({ month: shiftMonth(state.month, 1) }),
    // A bucket filter shared by Payments and History (?bucket=).
    bucketFilter: state.bucket,
    setBucketFilter: (bucket: string | null) => update({ bucket }),
    data,
  };
}

export type PlanningData = ReturnType<typeof useMonthBudget>;
