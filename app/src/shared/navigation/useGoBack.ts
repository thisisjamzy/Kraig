'use client';

// Back-button behaviour for every screen: return to the page the user came
// from, skipping create/edit forms (navHistory.ts). `fallback` is only for
// when there's no history — the page was opened directly, or the tab was
// just started.

import { useRouter } from 'next/navigation';
import { takeBackTarget } from './navHistory';

export function useGoBack() {
  const router = useRouter();
  return (fallback: string) => {
    const current = `${window.location.pathname}${window.location.search}`;
    const target = takeBackTarget(current);
    if (!target) {
      router.push(fallback);
    } else if (target.isImmediate) {
      // A real browser back keeps scroll position and the history clean.
      router.back();
    } else {
      router.push(target.url);
    }
  };
}
