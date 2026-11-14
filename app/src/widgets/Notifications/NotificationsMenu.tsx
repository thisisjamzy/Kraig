'use client';

// The header's bell on tablet and web (Dreda.figcraft `Notifications / Web`):
// it opens a menu of the open notifications, newest first, each a tile, its
// title small and its body below, leading to its detail page. "Mark all
// read" clears the badge; "See all" opens the Notifications page. Snooze,
// archive and mute stay on the detail page.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, ChevronRight, ReceiptText } from 'lucide-react';
import { useNotifications, useUnreadCount } from '@/src/shared/hooks/useNotifications';
import { markNotificationsRead } from '@/src/shared/firestore/notificationWrites';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import bell from './NotificationBell.module.css';
import styles from './NotificationsMenu.module.css';

const SHOWN = 6;

function ago(d: Date, now: number) {
  const mins = Math.max(1, Math.round((now - d.getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} d ago`;
}

export function NotificationsMenu({ className, size = 20 }: { className?: string; size?: number }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [openedAt, setOpenedAt] = useState(0);
  const { uid, notifications } = useNotifications();
  const { unread, urgent } = useUnreadCount();
  const open = useMemo(
    () =>
      notifications
        .filter((n) => !n.archivedAt && !n.resolvedAt && (!n.snoozedUntil || n.snoozedUntil.getTime() <= openedAt))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [notifications, openedAt]
  );
  const label = unread ? `Notifications, ${unread} unread${urgent ? `, ${urgent} urgent` : ''}` : 'Notifications';

  return (
    <>
      <button
        type="button"
        className={`${className ?? ''} ${bell.bell}`}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        onClick={(e) => {
          setOpenedAt(Date.now());
          setAnchor(e.currentTarget);
        }}
      >
        <Bell size={size} strokeWidth={1.85} />
        {unread > 0 && (
          <span className={bell.badge} data-urgent={urgent > 0 || undefined} aria-hidden>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {anchor && (
        <Popover anchor={anchor} label="Notifications" onClose={() => setAnchor(null)}>
          <div className={styles.menu}>
            <div className={styles.head}>
              <span className={styles.title}>Notifications</span>
              {unread > 0 && uid && (
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => void markNotificationsRead(uid, open.filter((n) => !n.readAt).map((n) => n.id))}
                >
                  Mark all read
                </button>
              )}
            </div>
            {open.length === 0 ? (
              <p className={styles.empty}>Nothing needs you right now.</p>
            ) : (
              <ul className={styles.list}>
                {open.slice(0, SHOWN).map((n) => (
                  <li key={n.id}>
                    <Link href={`/notifications/${n.id}`} className={styles.row} data-unread={!n.readAt || undefined} onClick={() => setAnchor(null)}>
                      <span className={styles.icon} aria-hidden>
                        <ReceiptText size={18} strokeWidth={2} />
                      </span>
                      <span className={styles.text}>
                        <span className={styles.small}>{n.title}</span>
                        <span className={styles.body}>
                          {n.body} · {ago(n.createdAt, openedAt)}
                        </span>
                      </span>
                      <ChevronRight size={18} strokeWidth={2} aria-hidden className={styles.chevron} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.foot}>
              <span>Snooze, archive or mute a type from the detail page.</span>
              <Link href="/notifications" className={styles.link} onClick={() => setAnchor(null)}>
                See all
              </Link>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
