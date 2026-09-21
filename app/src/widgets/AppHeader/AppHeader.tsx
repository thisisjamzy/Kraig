'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, Bell } from 'lucide-react';
import { hasAppHeader } from '@/src/shared/config/chromeVisibility';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './AppHeader.module.css';

// Shared top toolbar for every hub route in both modes — rendered once at
// the layout level, fixed in place like the bottom nav, so it never scrolls
// with the page content. Hidden on drill-down/detail routes, which use
// their own back-arrow header instead.
//
// The Money/Time mode switch that used to live here (ModeSwitch) is gone —
// switching modes is now the bottom nav's own FAB (BottomNav/
// ProjectsBottomNav), plus the existing swipe gesture
// (useSwipeModeSwitch) both hub screens already support.
export function AppHeader() {
  const pathname = usePathname();

  if (!hasAppHeader(pathname)) {
    return null;
  }

  return (
    <header className={styles.header}>
      <Logo className={styles.logo} />
      <div className={styles.actions}>
        <Link href="/notifications" className={styles.iconButton} aria-label="Notifications">
          <Bell size={18} strokeWidth={1.75} />
        </Link>
        <Link href="/settings" className={styles.iconButton} aria-label="Settings">
          <User size={18} strokeWidth={1.75} />
        </Link>
      </div>
    </header>
  );
}
