'use client';

// The phone's bottom bar, the same for Money and Time (owner, 18 Nov 2026,
// from Dreda v1.0 `Phone tab bar` 67410): a dark floating pill of round
// tabs, the current one a purple pill with its label; an optional action
// circle at the end of the pill (Money's Add transaction); and beside the
// pill the lime mode button that switches to the other module.

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import styles from '@/src/phone/widgets/TabBar/TabBar.module.css';

export interface Tab {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

export function TabBar({
  label,
  tabs,
  active,
  action,
  fab,
}: {
  label: string;
  tabs: Tab[];
  active: string | null;
  action?: { href: string; label: string; icon: LucideIcon };
  fab: { href: string; label: string; icon: LucideIcon };
}) {
  const Fab = fab.icon;
  return (
    <nav className={styles.bar} aria-label={label}>
      <div className={styles.pill}>
        {tabs.map(({ id, href, label: name, icon: Icon }) => {
          const on = active === id;
          return (
            <Link key={id} href={href} className={styles.item} data-active={on || undefined} aria-current={on ? 'page' : undefined} aria-label={name}>
              <Icon size={20} strokeWidth={2} aria-hidden />
              <span className={styles.label}>{name}</span>
            </Link>
          );
        })}
        {action && (
          <Link href={action.href} className={styles.item} aria-label={action.label} title={action.label}>
            <action.icon size={20} strokeWidth={2.25} aria-hidden />
          </Link>
        )}
      </div>
      <Link href={fab.href} className={styles.fab} aria-label={fab.label} title={fab.label}>
        <Fab size={22} strokeWidth={2.25} aria-hidden />
      </Link>
    </nav>
  );
}
