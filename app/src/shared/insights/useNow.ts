'use client';

// The current minute as a stable value — re-renders once a minute, and
// keeps Date.now() out of render (React Compiler purity).

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  const id = window.setInterval(callback, 30000);
  return () => window.clearInterval(id);
}
function getSnapshot() {
  return Math.floor(Date.now() / 60000);
}
function getServerSnapshot() {
  return 0;
}

/** Minutes since the epoch; multiply by 60000 for a Date. */
export function useNowMinute(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
