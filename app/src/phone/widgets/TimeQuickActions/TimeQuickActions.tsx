'use client';

// Time's quick actions on the phone Home (like Money's Add, History,
// Baskets, Debts): one row of New task (in purple), Areas, Folders,
// Projects and Scheduling.

import Link from 'next/link';
import { Folder, Layers, LayoutGrid, Link2, Plus, type LucideIcon } from 'lucide-react';
import styles from '@/src/phone/widgets/TimeQuickActions/TimeQuickActions.module.css';

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/tasks/new', label: 'New task', icon: Plus },
  { href: '/areas', label: 'Areas', icon: LayoutGrid },
  { href: '/sections', label: 'Folders', icon: Folder },
  { href: '/projects/all', label: 'Projects', icon: Layers },
  { href: '/projects/calendar/links', label: 'Scheduling', icon: Link2 },
];

export function TimeQuickActions() {
  return (
    <nav className={styles.quick} aria-label="Quick actions">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link key={label} href={href} className={styles.item}>
          <span className={styles.icon} data-primary={href === '/tasks/new' || undefined} aria-hidden>
            <Icon size={22} strokeWidth={2} />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
