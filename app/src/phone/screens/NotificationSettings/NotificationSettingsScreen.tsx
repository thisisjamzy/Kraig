'use client';

// Settings > Notifications on a phone, in the BASELINE list style: the
// daily summary time (and allowing push on this device), then Money, Time
// and System as cards of notification types. Each type is on or off (off
// means nothing new of it is created); an "on" type can also send a push
// or an email. Same prefs and writes as the web page.

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNotifications } from '@/src/shared/hooks/useNotifications';
import { saveNotificationPrefs, setTypeChannel, setTypeMuted } from '@/src/shared/firestore/notificationWrites';
import { requestNotificationPermission, notificationPermission } from '@/src/shared/insights/notify';
import { MODULE_OF, NOTIFICATION_TYPES, TYPE_LABEL, type NotificationModule, type NotificationType } from '@/src/shared/notifications/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { showToast } from '@/src/widgets/Toast/Toast';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/NotificationSettings/NotificationSettingsScreen.module.css';

const MODULES: { id: NotificationModule; label: string }[] = [
  { id: 'money', label: 'Money' },
  { id: 'time', label: 'Time' },
  { id: 'system', label: 'System' },
];

export function NotificationSettingsScreen() {
  const { uid, prefs, loading } = useNotifications();
  const goBack = useGoBack();
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
    <div className={`${p.page} ${p.detail}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={() => goBack('/settings')} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title="Notifications"
      />

      {loading ? (
        <ScreenState loading />
      ) : (
        <>
          <div className={p.sectionHead}>
            <h2>Daily summary</h2>
          </div>
          <div className={p.rows}>
            <label className={p.row}>
              <span className={p.rowMain}>
                <span className={p.rowName}>Morning summary</span>
                <span className={p.rowNote}>When the day&apos;s summary is written</span>
              </span>
              <input
                type="time"
                className={styles.time}
                value={prefs.summaryTime}
                onChange={(e) => uid && e.target.value && void run(() => saveNotificationPrefs(uid, { summaryTime: e.target.value }))}
              />
            </label>
            {permission !== 'granted' && permission !== 'unsupported' && (
              <div className={p.row}>
                <button
                  type="button"
                  className={`${p.fillButton} ${styles.allow}`}
                  data-tone="blue"
                  onClick={async () => {
                    setPermission(await requestNotificationPermission());
                  }}
                >
                  Allow push notifications on this device
                </button>
              </div>
            )}
          </div>
          <p className={styles.note}>Email is saved as a choice for now. Sending email needs a server, which this app doesn&apos;t run.</p>

          {MODULES.map((m) => (
            <section key={m.id}>
              <div className={p.sectionHead}>
                <h2>{m.label}</h2>
              </div>
              <div className={p.rows}>
                {NOTIFICATION_TYPES.filter((t) => MODULE_OF[t] === m.id).map((t) => {
                  const on = !prefs.muted.includes(t);
                  return (
                    <div key={t} className={p.row}>
                      <span className={p.rowMain}>
                        <span className={p.rowName}>{TYPE_LABEL[t]}</span>
                        {on && (
                          <span className={styles.channels}>
                            <label>
                              <input type="checkbox" checked={prefs.push.includes(t)} onChange={(e) => toggle(t, 'push', e.target.checked)} />
                              Push
                            </label>
                            <label>
                              <input type="checkbox" checked={prefs.email.includes(t)} onChange={(e) => toggle(t, 'email', e.target.checked)} />
                              Email
                            </label>
                          </span>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        className={styles.switch}
                        checked={on}
                        onChange={(e) => toggle(t, 'on', e.target.checked)}
                        aria-label={`${TYPE_LABEL[t]}: on`}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
