'use client';

// Settings > Notifications: each type on or off (off means nothing new of
// it is created; existing ones stay until resolved), which types also send
// a push or an email, and the time of the daily summary.

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/src/shared/hooks/useNotifications';
import { saveNotificationPrefs, setTypeChannel, setTypeMuted } from '@/src/shared/firestore/notificationWrites';
import { requestNotificationPermission, notificationPermission } from '@/src/shared/insights/notify';
import { MODULE_OF, NOTIFICATION_TYPES, TYPE_LABEL, type NotificationModule, type NotificationType } from '@/src/shared/notifications/types';
import { Block, NotionPage } from '@/src/widgets/Database/NotionPage';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { showToast } from '@/src/widgets/Toast/Toast';
import styles from './NotificationSettingsScreen.module.css';

const MODULES: { id: NotificationModule; label: string }[] = [
  { id: 'money', label: 'Money' },
  { id: 'time', label: 'Time' },
  { id: 'system', label: 'System' },
];

export function NotificationSettingsScreen() {
  const { uid, prefs, loading } = useNotifications();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  // Read after the first paint (the server can't know it).
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPermission(notificationPermission()));
    return () => cancelAnimationFrame(frame);
  }, []);

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'Could not save that.');
    }
  }
  const toggle = (type: NotificationType, what: 'on' | 'push' | 'email', on: boolean) =>
    uid && run(() => (what === 'on' ? setTypeMuted(uid, type, !on) : setTypeChannel(uid, type, what, on)));

  return (
    <NotionPage
      title="Notifications"
      icon={<Bell strokeWidth={1.75} />}
      kind="Settings"
      crumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Notifications' }]}
      properties={[
        { id: 'off', label: 'Types turned off', display: String(prefs.muted.length) },
        { id: 'push', label: 'Push', display: permission === 'granted' ? `${prefs.push.length} types` : permission === 'unsupported' ? 'Not supported here' : 'Not allowed yet' },
        { id: 'time', label: 'Daily summary', display: prefs.summaryTime },
      ]}
    >
      {loading ? (
        <ScreenState loading />
      ) : (
        <>
          <Block title="Daily summary">
            <div className={styles.row}>
              <label htmlFor="summaryTime">Time of the morning summary</label>
              <input
                id="summaryTime"
                type="time"
                value={prefs.summaryTime}
                onChange={(e) => uid && e.target.value && void run(() => saveNotificationPrefs(uid, { summaryTime: e.target.value }))}
              />
            </div>
            {permission !== 'granted' && permission !== 'unsupported' && (
              <button
                type="button"
                className={styles.allow}
                onClick={async () => {
                  setPermission(await requestNotificationPermission());
                }}
              >
                Allow push notifications on this device
              </button>
            )}
            <p className={styles.note}>Email is saved as a choice for now. Sending email needs a server, which this app doesn&apos;t run.</p>
          </Block>
          {MODULES.map((m) => (
            <Block key={m.id} title={m.label}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>On</th>
                    <th>Push</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTIFICATION_TYPES.filter((t) => MODULE_OF[t] === m.id).map((t) => {
                    const on = !prefs.muted.includes(t);
                    return (
                      <tr key={t}>
                        <td>{TYPE_LABEL[t]}</td>
                        <td>
                          <input type="checkbox" checked={on} onChange={(e) => toggle(t, 'on', e.target.checked)} aria-label={`${TYPE_LABEL[t]}: on`} />
                        </td>
                        <td>
                          <input type="checkbox" disabled={!on} checked={prefs.push.includes(t)} onChange={(e) => toggle(t, 'push', e.target.checked)} aria-label={`${TYPE_LABEL[t]}: push`} />
                        </td>
                        <td>
                          <input type="checkbox" disabled={!on} checked={prefs.email.includes(t)} onChange={(e) => toggle(t, 'email', e.target.checked)} aria-label={`${TYPE_LABEL[t]}: email`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Block>
          ))}
        </>
      )}
    </NotionPage>
  );
}
