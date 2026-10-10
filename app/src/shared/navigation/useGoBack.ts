'use client';

// Back-button behaviour for every screen: back to the main page of the
// feature you're in (pageTree.ts's backTargetFor), so a back never walks
// through every page you passed on the way. A feature's main page goes back
// to Home. `fallback` is only for when there's nowhere better: a form or
// Home opened directly, with no history.

import { useRouter } from 'next/navigation';
import { backTargetFor } from '@/src/shared/config/pageTree';
import { takeBackTarget } from './navHistory';

export function useGoBack() {
  const router = useRouter();
  return (fallback: string) => {
    const current = `${window.location.pathname}${window.location.search}`;
    const previous = takeBackTarget(current);
    const target = backTargetFor(current, previous?.url ?? null) ?? previous?.url ?? fallback;
    // A real browser back keeps scroll position and the history clean.
    if (previous?.isImmediate && previous.url === target) router.back();
    else router.push(target);
  };
}
