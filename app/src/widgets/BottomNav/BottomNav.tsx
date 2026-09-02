'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PieChart, SlidersHorizontal, Target, Plus } from 'lucide-react';
import { hasBottomNav } from '@/src/shared/config/chromeVisibility';
import styles from './BottomNav.module.css';

const NAV_ITEMS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/statistics', label: 'Statistics', icon: PieChart },
  { href: '/budget', label: 'Budget', icon: SlidersHorizontal },
  { href: '/goals', label: 'Goals & Debt', icon: Target },
];

export function BottomNav() {
  const pathname = usePathname();

  // Full-screen detail flows in the mockups (no tab bar, just a back arrow).
  if (!hasBottomNav(pathname)) {
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
