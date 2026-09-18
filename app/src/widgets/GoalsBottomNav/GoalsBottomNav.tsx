'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ChartNoAxesCombined, ListOrdered, Plus } from 'lucide-react';
import { navMode } from '@/src/shared/config/chromeVisibility';
import styles from './GoalsBottomNav.module.css';

// Exported for WebSidebar (src/widgets/WebSidebar) — reused verbatim so
// mobile and web can never drift apart on what Goals mode contains.
export const NAV_ITEMS = [
  { href: '/goals', label: 'Home', icon: Home },
  { href: '/goals/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { href: '/goals/items', label: 'Board', icon: ListOrdered },
];

// Goals mode's own bottom nav — BottomNav (Money) and ProjectsBottomNav
// (Projects) are its siblings, each rendered only on its own mode's hub
// routes (chromeVisibility.ts's navMode). Same three-in-a-pill-plus-a-
// separate-add-button shape as both of those: a goal has exactly one thing
// to create, same as a transaction does for Money, so the add button links
// straight to /goals/new rather than opening a picker sheet the way
// Projects' three-way create does.
export function GoalsBottomNav() {
  const pathname = usePathname();

  if (navMode(pathname) !== 'goals') {
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
              <span className={styles.srLabel}>{label}</span>
            </Link>
          );
        })}
      </div>
      <Link
        href="/goals/new"
        className={styles.addButton}
        aria-label="Add goal"
        aria-current={pathname?.startsWith('/goals/new') ? 'page' : undefined}
      >
        <Plus size={24} strokeWidth={2.25} />
      </Link>
    </nav>
  );
}
