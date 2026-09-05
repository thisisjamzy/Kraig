'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, Bell } from 'lucide-react';
import { hasAppHeader, navMode } from '@/src/shared/config/chromeVisibility';
import { ModeSwitch } from '@/src/widgets/ModeSwitch/ModeSwitch';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './AppHeader.module.css';

// Shared top toolbar for every hub route in both modes — rendered once at
// the layout level, fixed in place like the bottom nav, so it never scrolls
// with the page content. Hidden on drill-down/detail routes, which use
// their own back-arrow header instead. The Money/Time switch lives here,
// centered between the logo and the profile/notifications buttons (not in
// either hub screen's own body), so it's always reachable without costing
// either screen its own vertical space. Both right-side icons are direct
// links now, not a context menu — Calendar used to live behind the profile
// icon's menu here too, but it's reachable from Projects mode directly, so
// this toolbar only ever needs Settings and Notifications.
export function AppHeader() {
  const pathname = usePathname();
  const mode = navMode(pathname);

  if (!hasAppHeader(pathname)) {
    return null;
  }

  return (
    <header className={styles.header}>
      <Logo className={styles.logo} />
      <ModeSwitch active={mode === 'projects' ? 'projects' : 'money'} />
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
