'use client';

// One notification on a phone, as its own full-screen page (opened from the
// Notifications list): the severity, title and body, every item it batches
// (each with its own action, "Mark paid" on one payment), the actions, and
// Mark unread, Snooze, Archive and Mute this type. Opening it marks it read.

import { useEffect } from 'react';
import { Archive, ArrowLeft, Bell, BellOff, Clock } from 'lucide-react';
import { useLogic } from '@/src/logic/notifications/useLogic';
import { relativeTime } from '@/src/shared/notifications/inbox';
import { TYPE_LABEL } from '@/src/shared/notifications/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { SEVERITY_ICON } from '@/src/phone/screens/Notifications/NotificationsScreen';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import list from '@/src/phone/screens/Notifications/NotificationsScreen.module.css';
import styles from '@/src/phone/screens/NotificationDetail/NotificationDetailScreen.module.css';

const money = (n: number) => Math.round(n).toLocaleString('en-US');
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function NotificationDetailScreen({ id }: { id: string }) {
  const v = useLogic();
  const goBack = useGoBack();
  const n = v.all.find((x) => x.id === id) ?? null;
  const unreadId = n && !n.readAt ? n.id : null;

  useEffect(() => {
    if (unreadId) void v.markRead(unreadId);
    // Once, when it's first seen unread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadId]);

  const back = () => goBack('/notifications');
  const Icon = n ? SEVERITY_ICON[n.severity] : Bell;

  return (
    <div className={`${p.page} ${p.detail}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={back} aria-label="Back to Notifications">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title="Notification"
      />
      <ScreenState loading={v.loading} error={!v.loading && !n ? 'This notification is gone. It may have been resolved.' : null} />

      {n && (
        <>
          <header className={styles.head}>
            <span className={list.icon} data-severity={n.severity} aria-hidden>
              <Icon size={20} strokeWidth={2} />
            </span>
            <span className={styles.headText}>
              <h1 className={styles.title}>{n.title}</h1>
              <span className={p.rowWhen}>
                {TYPE_LABEL[n.type]} · {relativeTime(n.updatedAt, v.now)}
              </span>
            </span>
          </header>
          {n.body && <p className={styles.body}>{n.body}</p>}

          {n.items.length > 0 && (
            <>
              <div className={p.sectionHead}>
                <h2>
                  {n.items.length} {n.items.length === 1 ? 'item' : 'items'}
                </h2>
              </div>
              <div className={p.rows}>
                {n.items.map((item) => (
                  <div key={item.key} className={p.row}>
                    <span className={p.rowMain}>
                      <span className={p.rowName}>{item.label}</span>
                      {item.date && <span className={p.rowNote}>{day(item.date)}</span>}
                    </span>
                    <span className={p.rowSide}>
                      {item.amount !== null && <span className={p.rowAmount}>{money(item.amount)}</span>}
                      {item.action && (
                        <button type="button" className={p.textButton} onClick={() => void v.runAction(item.action!, n)}>
                          {item.action.label}
                        </button>
                      )}
                      {/* One payment, snoozed on its own until tomorrow. */}
                      {(n.type === 'payment_overdue' || n.type === 'payment_due_soon') && item.entityType === 'line' && (
                        <button type="button" className={p.textButton} onClick={() => void v.snoozePayment(item.entityId, 1)}>
                          Snooze
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={styles.actions}>
            {n.primaryAction && (
              <button type="button" className={`${p.fillButton} ${p.bigButton}`} data-tone="blue" onClick={() => void v.runAction(n.primaryAction!, n)}>
                {n.primaryAction.label}
              </button>
            )}
            {n.secondaryActions.map((a) => (
              <button key={a.label} type="button" className={styles.secondary} onClick={() => void v.runAction(a, n)}>
                {a.label}
              </button>
            ))}
          </div>

          <div className={p.rows}>
            <button type="button" className={`${p.row} ${styles.option}`} onClick={() => void v.markRead(n.id, false).then(back)}>
              <Bell size={17} strokeWidth={2} aria-hidden /> Mark unread
            </button>
            <button type="button" className={`${p.row} ${styles.option}`} onClick={() => void v.snooze(n.id, 1).then(back)}>
              <Clock size={17} strokeWidth={2} aria-hidden /> Snooze until tomorrow
            </button>
            <button type="button" className={`${p.row} ${styles.option}`} onClick={() => void v.snooze(n.id, 7).then(back)}>
              <Clock size={17} strokeWidth={2} aria-hidden /> Snooze for a week
            </button>
            <button type="button" className={`${p.row} ${styles.option}`} onClick={() => void (n.archivedAt ? v.unarchive(n.id) : v.archive(n.id)).then(back)}>
              <Archive size={17} strokeWidth={2} aria-hidden /> {n.archivedAt ? 'Move back to Inbox' : 'Archive'}
            </button>
            <button type="button" className={`${p.row} ${styles.option}`} onClick={() => void v.mute(n.type).then(back)}>
              <BellOff size={17} strokeWidth={2} aria-hidden /> Mute {TYPE_LABEL[n.type].toLowerCase()}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
