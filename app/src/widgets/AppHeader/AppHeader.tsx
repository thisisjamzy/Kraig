'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User } from 'lucide-react';
import { hasAppHeader } from '@/src/shared/config/chromeVisibility';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './AppHeader.module.css';

// Shared top toolbar for the root tab screens (Home, Statistics, Budget) —
// rendered once at the layout level, fixed in place like BottomNav, so it
// never scrolls with the page content. Hidden on drill-down/detail routes,
// which use their own back-arrow header instead.
export function AppHeader() {
  const pathname = usePathname();

  if (!hasAppHeader(pathname)) {
    return null;
  }

  return (
    <header className={styles.header}>
      <Logo className={styles.logo} />
      <Link href="/settings" className={styles.profileButton} aria-label="Settings">
        <User size={18} strokeWidth={1.75} />
      </Link>
    </header>
  );
}
