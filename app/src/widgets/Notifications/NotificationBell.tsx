'use client';

// The bell with the unread count, in the top bar, the phone header and a
// page's compact header. The same count as the sidebar's Notifications row
// (useUnreadCount), so the badges always agree.

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useUnreadCount } from '@/src/shared/hooks/useNotifications';
import styles from './NotificationBell.module.css';

export function NotificationBell({ className, size = 18 }: { className?: string; size?: number }) {
  const { unread, urgent } = useUnreadCount();
  const label = unread ? `Notifications, ${unread} unread${urgent ? `, ${urgent} urgent` : ''}` : 'Notifications';
  return (
    <Link href="/notifications" className={`${className ?? ''} ${styles.bell}`} aria-label={label} title={label}>
      <Bell size={size} strokeWidth={1.85} />
      {unread > 0 && (
        <span className={styles.badge} data-urgent={urgent > 0 || undefined} aria-hidden>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

/** The count alone, for the sidebar row. */
export function NotificationCount({ className }: { className?: string }) {
  const { unread } = useUnreadCount();
  return unread ? <span className={className}>{unread > 99 ? '99+' : unread}</span> : null;
}
