'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PieChart, SlidersHorizontal, Clock } from 'lucide-react';
import { navMode } from '@/src/shared/config/chromeVisibility';
import styles from './BottomNav.module.css';

// Goals dropped from here — reachable from Home's own Quick Actions instead
// (src/screens/Home/HomeScreen.tsx) — /goals stays a MONEY_HUB_ROUTE
// (chromeVisibility.ts) so this bar still shows there, just with no tab of
// its own highlighted, same as /debts already works.
// Exported for WebSidebar (src/widgets/WebSidebar) — the web shell's nav
// rail reuses this exact list rather than re-declaring Money mode's routes,
// so mobile and web can never drift apart on what Money mode contains.
export const NAV_ITEMS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/statistics', label: 'Statistics', icon: PieChart },
  { href: '/budget', label: 'Budget', icon: SlidersHorizontal },
];

// Money mode's own bottom nav — ProjectsBottomNav is Projects mode's
// equivalent, rendered instead of this one on that mode's own hub routes
// (see chromeVisibility.ts's navMode).
//
// The end button used to be an "Add transaction" FAB; it's now the
// Money<->Time mode switch instead (the old AppHeader ModeSwitch pill's
// job, folded in here) — same spot the swipe gesture
// (useSwipeModeSwitch) already lands on. Its icon is the mode it jumps
// TO, not the one you're in, same convention ProjectsBottomNav's own
// switch button uses. Adding a transaction is still reachable from Home's
// own Quick Actions.
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
      <Link href="/projects" className={styles.fabButton} aria-label="Switch to Time mode">
        <Clock size={22} strokeWidth={2.25} />
      </Link>
    </nav>
  );
}
