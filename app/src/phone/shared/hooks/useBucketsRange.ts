'use client';

// The Buckets app's own Month/All-time toggle (BucketsHeader) — shared across
// its three tabs (Home, Analytics, Board), each a separate page navigated
// to via BucketsBottomNav, not tabs within one component. localStorage, not
// a URL query param: a query param would need every nav link in
// BucketsBottomNav to carry it along (and read it back reactively, which
// would need useSearchParams() — this codebase deliberately avoids that
// everywhere else, see e.g. src/logic/budget/useLogic.ts's own header
// comment). Reading/writing one shared key means whichever tab you land on
// next just picks up the same choice on its own mount, same convention
// ThemeProvider already uses for the light/dark toggle.

import { useState } from 'react';

const STORAGE_KEY = 'dreda-buckets-range';

export type BucketsRange = 'month' | 'all';

function initialRange(): BucketsRange {
  if (typeof window === 'undefined') return 'month';
  return window.localStorage.getItem(STORAGE_KEY) === 'all' ? 'all' : 'month';
}

export function useBucketsRange() {
  const [range, setRangeState] = useState<BucketsRange>(initialRange);

  function setRange(next: BucketsRange) {
    setRangeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return { range, setRange };
}
