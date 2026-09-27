'use client';

// Records every route this tab visits (navHistory.ts) so back buttons can
// return to the real previous page, telling a browser back apart from a
// new visit. Renders nothing.

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { recordVisit } from './navHistory';

export function NavigationTracker() {
  const pathname = usePathname();
  // When the browser last moved through its own history (back/forward).
  const poppedAt = useRef(0);
  useEffect(() => {
    const onPop = () => {
      poppedAt.current = Date.now();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (!pathname) return;
    const traversal = Date.now() - poppedAt.current < 1500;
    poppedAt.current = 0;
    recordVisit(`${pathname}${window.location.search}`, traversal);
  }, [pathname]);
  return null;
}
