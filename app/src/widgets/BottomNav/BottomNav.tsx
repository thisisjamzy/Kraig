'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PieChart, SlidersHorizontal, Plus } from 'lucide-react';
import { navMode } from '@/src/shared/config/chromeVisibility';
import styles from './BottomNav.module.css';

// Goals dropped from here — reachable from Home's own Quick Actions instead
// (src/screens/Home/HomeScreen.tsx) — /goals stays a MONEY_HUB_ROUTE
// (chromeVisibility.ts) so this bar still shows there, just with no tab of
// its own highlighted, same as /debts already works.
const NAV_ITEMS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/statistics', label: 'Statistics', icon: PieChart },
  { href: '/budget', label: 'Budget', icon: SlidersHorizontal },
];

// Money mode's own bottom nav — ProjectsBottomNav is Projects mode's
// equivalent, rendered instead of this one on that mode's own hub routes
// (see chromeVisibility.ts's navMode).
export function BottomNav() {
  const pathname = usePathname();

  if (navMode(pathname) !== 'money') {
    return null;
  }

  return (
    <nav className={styles.bar} aria-label="Primary">
      <div className={styles.pill}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname?.startsWith(`${href}/`);
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
        href="/add-transaction"
        className={styles.addButton}
        aria-label="Add transaction"
        aria-current={pathname?.startsWith('/add-transaction') ? 'page' : undefined}
      >
        <Plus size={24} strokeWidth={2.25} />
      </Link>
    </nav>
  );
}
