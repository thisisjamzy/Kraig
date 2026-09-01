'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { hasAppHeader, hasBottomNav } from '@/src/shared/config/chromeVisibility';
import styles from './AppContent.module.css';

// Only reserves top/bottom clearance for the fixed AppHeader/BottomNav when
// they're actually showing on the current route — otherwise a route with
// its own back-arrow header (no fixed chrome at all) would scroll under a
// block of empty padding for chrome that was never there.
export function AppContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const className = [
    styles.content,
    hasAppHeader(pathname) ? styles.withHeader : '',
    hasBottomNav(pathname) ? styles.withBottomNav : '',
  ]
    .filter(Boolean)
    .join(' ');

  return <main className={className}>{children}</main>;
}
