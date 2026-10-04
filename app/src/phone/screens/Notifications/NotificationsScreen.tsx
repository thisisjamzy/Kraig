'use client';

// Notifications on a phone: a full-screen list in the BASELINE list style.
// Inbox, Unread and Archived as tabs; each day (Today, Yesterday, This
// week, Earlier) as its own card of rows. A row shows the severity, title,
// one line of body and when; tapping it opens its action (or marks it
// read); "..." snoozes, archives or marks it read or unread. The shared
// notifications logic does the work, the same as the web inbox.

import Link from 'next/link';
import { AlertTriangle, Archive, ArrowLeft, Bell, BellOff, CheckCheck, CheckCircle2, Circle, Clock, Info, MoreHorizontal, Settings2 } from 'lucide-react';
import { useLogic } from '@/src/logic/notifications/useLogic';
import { relativeTime, type InboxView } from '@/src/shared/notifications/inbox';
import type { NotificationSeverity, StoredNotification } from '@/src/shared/notifications/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/Notifications/NotificationsScreen.module.css';

const TABS: { id: InboxView; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'unread', label: 'Unread' },
  { id: 'archived', label: 'Archived' },
];

const SEVERITY_ICON: Record<NotificationSeverity, typeof Info> = {
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
  const tab = TABS.some((t) => t.id === v.view) ? v.view : null;

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
            ]}
          />
        }
      />

      <div className={p.tabs} role="tablist" aria-label="Notifications">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => v.setView(t.id)}>
            {t.label}
            {t.id === 'unread' && v.counts.unread > 0 ? ` (${v.counts.unread})` : ''}
          </button>
        ))}
      </div>
      {!tab && (
        <p className={styles.viewNote}>
          Showing {v.view === 'snoozed' ? 'snoozed' : 'resolved'} notifications.{' '}
          <button type="button" className={p.textButton} onClick={() => v.setView('inbox')}>
            Back to Inbox
          </button>
        </p>
      )}

      <ScreenState loading={v.loading} />

      {!v.loading && v.rows.length === 0 && (
        <div className={styles.empty}>
          <BellOff size={32} strokeWidth={1.5} />
          <p>{EMPTY[v.view]}</p>
        </div>
      )}

      {!v.loading &&
        v.groups.map(({ group, rows }) => (
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
  const open = () => {
    if (n.primaryAction) void v.runAction(n.primaryAction, n);
    else if (unread) void v.markRead(n.id);
  };
  return (
    <div className={`${p.row} ${styles.row}`} data-unread={unread || undefined}>
      <button type="button" className={styles.open} onClick={open}>
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
            {n.primaryAction ? ` · ${n.primaryAction.label}` : ''}
          </span>
        </span>
      </button>
      <ActionMenu
        ariaLabel={`Options for ${n.title}`}
        triggerClassName={styles.more}
        triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
        items={[
          unread
            ? { key: 'read', label: 'Mark read', icon: <CheckCheck size={14} strokeWidth={2} />, onSelect: () => void v.markRead(n.id) }
            : { key: 'unread', label: 'Mark unread', icon: <Bell size={14} strokeWidth={2} />, onSelect: () => void v.markRead(n.id, false) },
          { key: 'snooze', label: 'Snooze until tomorrow', icon: <Clock size={14} strokeWidth={2} />, onSelect: () => void v.snooze(n.id, 1) },
          n.archivedAt
            ? { key: 'unarchive', label: 'Move back to Inbox', icon: <Archive size={14} strokeWidth={2} />, onSelect: () => void v.unarchive(n.id) }
            : { key: 'archive', label: 'Archive', icon: <Archive size={14} strokeWidth={2} />, onSelect: () => void v.archive(n.id) },
        ]}
      />
    </div>
  );
}
