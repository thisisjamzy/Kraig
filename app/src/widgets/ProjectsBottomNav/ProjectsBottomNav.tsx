'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarDays, Target, ChartNoAxesCombined, Plus, Layers, FolderKanban, ListChecks } from 'lucide-react';
import { navMode } from '@/src/shared/config/chromeVisibility';
import { Modal } from '@/src/widgets/Modal/Modal';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { overdueTasks, dueTodayTasks } from '@/src/shared/firestore/taskInsights';
import { iconTint } from '@/src/viewmodels/iconTint';
import styles from './ProjectsBottomNav.module.css';

const NAV_ITEMS = [
  { href: '/projects', label: 'Home', icon: Home },
  { href: '/projects/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/projects/focus', label: 'Focus', icon: Target },
  { href: '/projects/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
];

const CREATE_OPTIONS = [
  { href: '/areas/new', label: 'New area', icon: Layers },
  { href: '/projects/new', label: 'New project', icon: FolderKanban },
  { href: '/tasks/new', label: 'New task', icon: ListChecks },
];

// Projects mode's own bottom nav — BottomNav is Money mode's equivalent.
// The center Add button opens a sheet picking which of the three PARA
// creation flows to start, rather than jumping straight to one the way
// Money mode's Add button goes straight to Add Transaction (there, there's
// only one thing to add; here there are three).
export function ProjectsBottomNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: tasks } = useAllTasks();
  const hasNotifications = overdueTasks(tasks).length > 0 || dueTodayTasks(tasks).length > 0;

  if (navMode(pathname) !== 'projects') {
    return null;
  }

  return (
    <>
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
        <button type="button" className={styles.addButton} aria-label="Create" onClick={() => setSheetOpen(true)}>
          <Plus size={24} strokeWidth={2.25} />
        </button>
      </nav>

      {sheetOpen && (
        <Modal title="Create" onClose={() => setSheetOpen(false)}>
          <div className={styles.sheetList}>
            {CREATE_OPTIONS.map(({ href, label, icon: Icon }, index) => (
              <Link key={href} href={href} className={styles.sheetOption} onClick={() => setSheetOpen(false)}>
                <span className={styles.sheetOptionIcon} style={{ background: iconTint(index) }}>
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span className={styles.sheetOptionLabel}>{label}</span>
              </Link>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
