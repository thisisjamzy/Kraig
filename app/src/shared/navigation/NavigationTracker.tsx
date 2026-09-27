'use client';

// Records every route this tab visits (navHistory.ts) so back buttons can
// return to the real previous page. Renders nothing.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { recordVisit } from './navHistory';

export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) recordVisit(`${pathname}${window.location.search}`);
  }, [pathname]);
  return null;
}
