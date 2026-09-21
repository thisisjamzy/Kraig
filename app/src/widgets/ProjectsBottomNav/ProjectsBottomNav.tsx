'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarDays, Target, ChartNoAxesCombined, Wallet, Layers, FolderKanban, ListChecks } from 'lucide-react';
import { navMode } from '@/src/shared/config/chromeVisibility';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { overdueTasks, dueTodayTasks } from '@/src/shared/firestore/taskInsights';
import styles from './ProjectsBottomNav.module.css';

// Exported for WebSidebar (src/widgets/WebSidebar) — reused verbatim so
// mobile and web can never drift apart on what Projects mode contains.
export const NAV_ITEMS = [
  { href: '/projects', label: 'Home', icon: Home },
  { href: '/projects/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/projects/focus', label: 'Focus', icon: Target },
  { href: '/projects/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
];

// Still exported for WebTopBar (src/widgets/WebTopBar) — its own "+" button
// still opens this exact three-way creation sheet in Projects mode. Mobile
// no longer has an equivalent entry point now that this bar's own end
// button is the mode switch instead (see ProjectsBottomNav below).
export const CREATE_OPTIONS = [
  { href: '/areas/new', label: 'New area', icon: Layers },
  { href: '/projects/new', label: 'New project', icon: FolderKanban },
  { href: '/tasks/new', label: 'New task', icon: ListChecks },
];

// Projects mode's own bottom nav — BottomNav is Money mode's equivalent.
// The end button used to open the three-way create sheet above; it's now
// the Money<->Time mode switch instead (the old AppHeader ModeSwitch
// pill's job, folded in here), same spot the swipe gesture
// (useSwipeModeSwitch) already lands on. Its icon is the mode it jumps TO,
// not the one you're in — mirrors BottomNav's own switch button.
export function ProjectsBottomNav() {
  const pathname = usePathname();
  const { data: tasks } = useAllTasks();
  const hasNotifications = overdueTasks(tasks).length > 0 || dueTodayTasks(tasks).length > 0;

  if (navMode(pathname) !== 'projects') {
    return null;
  }

  return (
    <nav className={styles.bar} aria-label="Primary">
      <div className={styles.pill}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={2} />
              {href === '/projects/analytics' && hasNotifications && <span className={styles.badge} />}
              <span className={styles.srLabel}>{label}</span>
            </Link>
          );
        })}
      </div>
      <Link href="/home" className={styles.fabButton} aria-label="Switch to Money mode">
        <Wallet size={22} strokeWidth={2.25} />
      </Link>
    </nav>
  );
}
