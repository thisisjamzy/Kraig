'use client';

// The current ?query, for the wide-screen drawer's active item. Pages that
// rewrite their own query with history.replaceState (Planning's ?tab=)
// announce it with URL_EVENT, since Next.js doesn't see those changes.
// OPEN_TAB_EVENT asks a mounted Planning page to switch tab (the drawer's
// Budget / Payments / History links). Phones never use either.

import { useSyncExternalStore } from 'react';

export const URL_EVENT = 'dreda:url';
export const OPEN_TAB_EVENT = 'dreda:planning-tab';

function subscribe(onChange: () => void) {
  window.addEventListener(URL_EVENT, onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener(URL_EVENT, onChange);
    window.removeEventListener('popstate', onChange);
  };
}

export function useLocationSearch(pathname: string | null): string {
  // pathname is read so a Next.js navigation re-renders with the new query.
  void pathname;
  return useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ''
  );
}
