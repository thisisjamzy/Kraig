'use client';

// The household's notifications and notification settings, live. The
// sidebar, the bell, the prompt, the page and the runner all read this, so
// every badge shows the same count.

import { useMemo } from 'react';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { notificationPrefsRef, notificationsRef } from '@/src/shared/firestore/refs';
import { fromStored } from '@/src/shared/firestore/storedDates';
import { unreadCount } from '@/src/shared/notifications/inbox';
import { DEFAULT_PREFS, type NotificationPrefs, type StoredNotification } from '@/src/shared/notifications/types';
import { useFirebaseUser } from './useFirebaseUser';

export function useNotifications() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: docs, loading } = useFirestoreCollection<Record<string, unknown> & { id: string }>(useMemo(() => (uid ? notificationsRef(uid) : null), [uid]));
  const { data: prefsDoc, loading: prefsLoading } = useFirestoreDoc<Partial<NotificationPrefs>>(useMemo(() => (uid ? notificationPrefsRef(uid) : null), [uid]));
  const notifications = useMemo(
    () =>
      docs.map((d) => {
        const n = fromStored(d) as StoredNotification;
        return { ...n, id: d.id, items: n.items ?? [], secondaryActions: n.secondaryActions ?? [], expiresAt: n.expiresAt ?? null } as StoredNotification;
      }),
    [docs]
  );
  const prefs: NotificationPrefs = useMemo(() => ({ ...DEFAULT_PREFS, ...(prefsDoc ?? {}) }), [prefsDoc]);
  return { uid, notifications, prefs, loading: loading || prefsLoading };
}

/** The badge: unread and urgent, recomputed as notifications change. */
export function useUnreadCount() {
  const { notifications } = useNotifications();
  return useMemo(() => unreadCount(notifications, new Date()), [notifications]);
}
