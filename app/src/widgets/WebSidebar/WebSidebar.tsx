'use client';

// The web shell's persistent left nav rail — mounted by app/(mobile)/
// layout.tsx only when useViewportMode() isn't 'mobile' (AppShellLayout's
// own header comment explains why that guarantees zero mobile impact).
// Mobile keeps its three separate mode-scoped bottom navs (BottomNav,
// ProjectsBottomNav, GoalsBottomNav) because a phone screen can only ever
// show one mode's tab bar at a time; a sidebar has room to show every
// mode's destinations at once, so this reuses each of those three bars'
// own NAV_ITEMS list (never re-declares the routes) and lays them out as
// three labeled groups, same grouping language as this project's own
// reference dashboards (Design/web/web2.jpg, web7.jpg).
//
// 'tablet' (640-1023px) collapses to icon-only with a native title
// tooltip; 'desktop' (1024px+) shows full icon+label — same two-tier
// collapse the reference dashboards use (Design/web/web7.jpg, web8.jpg).

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings } from 'lucide-react';
import { useViewportMode } from '@/src/shared/hooks/useViewportMode';
import { NAV_ITEMS as MONEY_NAV_ITEMS } from '@/src/widgets/BottomNav/BottomNav';
import { NAV_ITEMS as PROJECTS_NAV_ITEMS } from '@/src/widgets/ProjectsBottomNav/ProjectsBottomNav';
import { NAV_ITEMS as GOALS_NAV_ITEMS } from '@/src/widgets/GoalsBottomNav/GoalsBottomNav';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './WebSidebar.module.css';

const GROUPS = [
  { label: 'Money', items: MONEY_NAV_ITEMS },
  { label: 'Projects', items: PROJECTS_NAV_ITEMS },
  { label: 'Goals', items: GOALS_NAV_ITEMS },
];

export function WebSidebar() {
  const pathname = usePathname();
  const mode = useViewportMode();
  const compact = mode === 'tablet';

  return (
    <nav className={`${styles.sidebar} ${compact ? styles.sidebarCompact : ''}`} aria-label="Primary">
      <div className={styles.logoRow}>
        <Logo height={22} />
      </div>

      <div className={styles.groups}>
        {GROUPS.map((group) => (
          <div key={group.label} className={styles.group}>
            {!compact && <span className={styles.groupLabel}>{group.label}</span>}
            {group.items.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname?.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={compact ? label : undefined}
                >
                  <Icon size={18} strokeWidth={2} />
                  {!compact && <span className={styles.itemLabel}>{label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <Link
        href="/settings"
        className={`${styles.item} ${styles.settingsItem} ${pathname?.startsWith('/settings') ? styles.itemActive : ''}`}
        aria-current={pathname?.startsWith('/settings') ? 'page' : undefined}
        title={compact ? 'Settings' : undefined}
      >
        <Settings size={18} strokeWidth={2} />
        {!compact && <span className={styles.itemLabel}>Settings</span>}
      </Link>
    </nav>
  );
}
