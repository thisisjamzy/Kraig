'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { hasAppHeader, hasBottomNav } from '@/src/shared/config/chromeVisibility';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import styles from './AppContent.module.css';

// Only reserves top/bottom clearance for the fixed AppHeader/BottomNav when
// they're actually showing on the current route — otherwise a route with
// its own back-arrow header (no fixed chrome at all) would scroll under a
// block of empty padding for chrome that was never there.
//
// `!isWeb &&` guards both checks below — isWeb is guaranteed false for
// every mobile visitor (useViewportMode's own SSR/first-paint guarantee),
// so this can only ever change output for the new web shell (WebTopBar
// isn't fixed like AppHeader is, and there's no bottom nav there at all,
// so neither clearance padding is wanted once AppShellLayout renders
// AppContent inside that shell instead).
export function AppContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isWeb = useIsWeb();

  const className = [
    styles.content,
    isWeb ? styles.contentWeb : '',
    !isWeb && hasAppHeader(pathname) ? styles.withHeader : '',
    !isWeb && hasBottomNav(pathname) ? styles.withBottomNav : '',
  ]
    .filter(Boolean)
    .join(' ');

  return <main className={className}>{children}</main>;
}
