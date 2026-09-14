'use client';

// The web shell's top bar — mounted alongside WebSidebar only when
// useViewportMode() isn't 'mobile'. Replaces AppHeader visually in web
// mode (AppHeader itself is untouched and keeps rendering as-is for
// mobile), reusing the exact same Notifications/Settings hrefs AppHeader
// already links to rather than re-deciding what belongs here.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, User } from 'lucide-react';
import { navMode } from '@/src/shared/config/chromeVisibility';
import styles from './WebTopBar.module.css';

const SECTION_TITLE: Record<string, string> = {
  money: 'Money',
  projects: 'Projects',
  goals: 'Goals',
};

export function WebTopBar() {
  const pathname = usePathname();
  const title = SECTION_TITLE[navMode(pathname)] ?? 'Dreda';

  return (
    <header className={styles.topBar}>
      <h1 className={styles.title}>{title}</h1>
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
