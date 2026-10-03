'use client';

// The top bar's breadcrumb ("Money / Budget / October 2026"). A page sets
// it with useBreadcrumb while it's mounted; the top bar shows it in place
// of the plain page title. Wide screens only — on a phone nothing reads it.

import { useEffect, useSyncExternalStore } from 'react';

export interface Crumb {
  label: string;
  href?: string;
}

let current: Crumb[] | null = null;
const listeners = new Set<() => void>();

function set(next: Crumb[] | null) {
  current = next;
  listeners.forEach((l) => l());
}

export function useBreadcrumb(crumbs: Crumb[] | null) {
  const key = crumbs ? JSON.stringify(crumbs) : '';
  useEffect(() => {
    if (!key) return;
    set(JSON.parse(key) as Crumb[]);
    return () => set(null);
  }, [key]);
}

export function useCurrentBreadcrumb(): Crumb[] | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null
  );
}
