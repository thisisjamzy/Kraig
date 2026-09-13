'use client';

// The Goals app's own Month/All-time toggle (GoalsHeader) — shared across
// its three tabs (Home, Analytics, Board), each a separate page navigated
// to via GoalsBottomNav, not tabs within one component. localStorage, not
// a URL query param: a query param would need every nav link in
// GoalsBottomNav to carry it along (and read it back reactively, which
// would need useSearchParams() — this codebase deliberately avoids that
// everywhere else, see e.g. src/logic/budget/useLogic.ts's own header
// comment). Reading/writing one shared key means whichever tab you land on
// next just picks up the same choice on its own mount, same convention
// ThemeProvider already uses for the light/dark toggle.

import { useState } from 'react';

const STORAGE_KEY = 'dreda-goals-range';

export type GoalsRange = 'month' | 'all';

function initialRange(): GoalsRange {
  if (typeof window === 'undefined') return 'month';
  return window.localStorage.getItem(STORAGE_KEY) === 'all' ? 'all' : 'month';
}

export function useGoalsRange() {
  const [range, setRangeState] = useState<GoalsRange>(initialRange);

  function setRange(next: GoalsRange) {
    setRangeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return { range, setRange };
}
