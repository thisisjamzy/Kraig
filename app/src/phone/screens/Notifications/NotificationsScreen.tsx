'use client';

// Notifications on a phone: a full-screen list in the BASELINE list style.
// A filter row (All, Money, Time, Unread); each day (Today, Yesterday, This
// week, Earlier) as its own card of rows. A row shows the severity, title,
// one line of body and when; tapping it opens the notification's own page
// (its items and actions). Swipe left to archive, right to mark it read.
// The header menu has Mark all as read, and the snoozed, resolved and
// archived ones. The shared notifications logic does the work, the same
// as the web inbox.

import Link from 'next/link';
import { AlertTriangle, Archive, ArrowLeft, Bell, BellOff, CheckCheck, CheckCircle2, Circle, Clock, Inbox, Info, MoreHorizontal, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { SwipeableListItem } from '@/src/phone/widgets/SwipeableListItem/SwipeableListItem';
import { useLogic } from '@/src/logic/notifications/useLogic';
import { relativeTime, type InboxView } from '@/src/shared/notifications/inbox';
import type { NotificationSeverity, StoredNotification } from '@/src/shared/notifications/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/Notifications/NotificationsScreen.module.css';

type Filter = 'all' | 'money' | 'time' | 'unread';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'money', label: 'Money' },
  { id: 'time', label: 'Time' },
  { id: 'unread', label: 'Unread' },
];

export const SEVERITY_ICON: Record<NotificationSeverity, typeof Info> = {
  urgent: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  positive: CheckCircle2,
};

const EMPTY: Record<InboxView, string> = {
  inbox: 'You’re all caught up.',
  unread: 'Nothing unread.',
  snoozed: 'Nothing snoozed.',
  resolved: 'Nothing resolved yet.',
  archived: 'Nothing archived.',
};

type Logic = ReturnType<typeof useLogic>;

export function NotificationsScreen() {
  const v = useLogic();
  const goBack = useGoBack();
  const [filter, setFilter] = useState<Filter>('all');
  const inbox = v.view === 'inbox' || v.view === 'unread';
  const keep = (n: StoredNotification) => (filter === 'money' || filter === 'time' ? n.module === filter : true);
  const groups = v.groups.map((g) => ({ ...g, rows: g.rows.filter(keep) })).filter((g) => g.rows.length);
  function pick(next: Filter) {
    setFilter(next);
    v.setView(next === 'unread' ? 'unread' : 'inbox');
  }

  return (
    <div className={`${p.page} ${p.detail}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={() => goBack('/home')} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title="Notifications"
        right={
          <ActionMenu
            ariaLabel="More"
            triggerClassName={p.roundButton}
            triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
            items={[
              { key: 'all-read', label: 'Mark all read', icon: <CheckCheck size={14} strokeWidth={2} />, onSelect: () => void v.markAllRead() },
              { key: 'snoozed', label: 'Snoozed', icon: <Clock size={14} strokeWidth={2} />, onSelect: () => v.setView('snoozed') },
              { key: 'resolved', label: 'Resolved', icon: <CheckCircle2 size={14} strokeWidth={2} />, onSelect: () => v.setView('resolved') },
              { key: 'archived', label: 'Archived', icon: <Archive size={14} strokeWidth={2} />, onSelect: () => v.setView('archived') },
            ]}
          />
        }
      />

      <div className={styles.filters} role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={styles.filter} aria-pressed={inbox && filter === f.id} onClick={() => pick(f.id)}>
            {f.label}
            {f.id === 'unread' && v.counts.unread > 0 ? ` ${v.counts.unread}` : ''}
          </button>
        ))}
      </div>
      {!inbox && (
        <p className={styles.viewNote}>
          Showing {v.view} notifications.{' '}
          <button type="button" className={p.textButton} onClick={() => pick('all')}>
            Back to all
          </button>
        </p>
      )}

      <ScreenState loading={v.loading} />

      {!v.loading && groups.length === 0 && (
        <div className={styles.empty}>
          <BellOff size={32} strokeWidth={1.5} />
          <p>{EMPTY[v.view]}</p>
        </div>
      )}

      {!v.loading &&
        groups.map(({ group, rows }) => (
          <section key={group}>
            <div className={p.sectionHead}>
              <h2>{group}</h2>
            </div>
            <div className={p.rows}>
              {rows.map((n) => (
                <Row key={n.id} n={n} v={v} />
              ))}
            </div>
          </section>
        ))}

      {!v.loading && (
        <Link href="/settings/notifications" className={styles.settingsLink}>
          <Settings2 size={16} strokeWidth={2} />
          Notification settings
        </Link>
      )}
    </div>
  );
}

function Row({ n, v }: { n: StoredNotification; v: Logic }) {
  const unread = !n.readAt;
  const Icon = SEVERITY_ICON[n.severity];
  return (
    <SwipeableListItem
      swipeLeft={
        n.archivedAt
          ? { label: 'Move back to Inbox', icon: <Inbox size={18} strokeWidth={2} />, tone: 'neutral', onSelect: () => void v.unarchive(n.id) }
          : { label: 'Archive', icon: <Archive size={18} strokeWidth={2} />, tone: 'neutral', onSelect: () => void v.archive(n.id) }
      }
      swipeRight={
        unread
          ? { label: 'Mark read', icon: <CheckCheck size={18} strokeWidth={2} />, tone: 'brand', onSelect: () => void v.markRead(n.id) }
          : { label: 'Mark unread', icon: <Bell size={18} strokeWidth={2} />, tone: 'brand', onSelect: () => void v.markRead(n.id, false) }
      }
    >
      <Link href={`/notifications/${encodeURIComponent(n.id)}`} className={`${p.row} ${styles.row}`} data-unread={unread || undefined}>
        <span className={styles.icon} data-severity={n.severity} aria-hidden>
          <Icon size={18} strokeWidth={2} />
        </span>
        <span className={p.rowMain}>
          <span className={styles.title}>
            {unread && <Circle size={8} fill="currentColor" strokeWidth={0} className={styles.dot} aria-label="Unread" />}
            {n.title}
          </span>
          {n.body && <span className={styles.body}>{n.body}</span>}
          <span className={p.rowWhen}>
            {relativeTime(n.updatedAt, v.now)}
            {n.items.length > 1 ? ` · ${n.items.length} items` : ''}
          </span>
        </span>
      </Link>
    </SwipeableListItem>
  );
}
