'use client';

// The phone's app-open prompt: a small bottom sheet with one line ("6
// updates, 2 urgent") and two buttons, View and Later. No list; the
// Notifications page has that. When to show it is decided by the shared
// NotificationPrompt.

import styles from '@/src/phone/widgets/NotificationSheet/NotificationSheet.module.css';

export function NotificationSheet({ unread, urgent, onView, onLater }: { unread: number; urgent: number; onView: () => void; onLater: () => void }) {
  const text = `${unread} ${unread === 1 ? 'update' : 'updates'}${urgent ? `, ${urgent} urgent` : ''}`;
  return (
    <div className={styles.overlay}>
      <button type="button" className={styles.backdrop} aria-label="Later" tabIndex={-1} onClick={onLater} />
      <div className={styles.sheet} role="dialog" aria-label="Unread notifications">
        <span className={styles.handle} aria-hidden />
        <p className={styles.text}>{text}</p>
        <div className={styles.buttons}>
          <button type="button" className={styles.secondary} onClick={onLater}>
            Later
          </button>
          <button type="button" className={styles.primary} onClick={onView}>
            View
          </button>
        </div>
      </div>
    </div>
  );
}
