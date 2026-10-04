'use client';

// Writing notifications (users/{uid}/notifications) and the household's
// notification settings (users/{uid}/settings/notifications). The runner
// writes what reconcile.ts decides; the Notifications page marks read,
// snoozes, archives and mutes. Plain batched writes: nothing here moves
// money, so no transaction is needed.

import { arrayRemove, arrayUnion, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { notificationPrefsRef, notificationRef, planSnapshotRef } from './refs';
import { toStored } from './storedDates';
import type { NotificationWrite } from '@/src/shared/notifications/reconcile';
import type { NotificationPrefs, NotificationType, PlanSnapshot } from '@/src/shared/notifications/types';

const BATCH = 400;

export async function applyNotificationWrites(uid: string, writes: NotificationWrite[]): Promise<void> {
  const db = getFirebaseFirestore();
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + BATCH)) {
      const ref = notificationRef(uid, w.id);
      if (w.op === 'delete') batch.delete(ref);
      else if (w.op === 'create') batch.set(ref, toStored(w.data) as Record<string, unknown>);
      else batch.set(ref, toStored(w.data) as Record<string, unknown>, { merge: true });
    }
    await batch.commit();
  }
}

async function patchMany(uid: string, ids: string[], patch: Record<string, unknown>) {
  if (!ids.length) return;
  const db = getFirebaseFirestore();
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + BATCH)) batch.update(notificationRef(uid, id), toStored(patch) as Record<string, unknown>);
    await batch.commit();
  }
}

export const markNotificationsRead = (uid: string, ids: string[], read = true) => patchMany(uid, ids, { readAt: read ? new Date() : null });
export const snoozeNotifications = (uid: string, ids: string[], until: Date) => patchMany(uid, ids, { snoozedUntil: until, readAt: new Date() });
export const archiveNotifications = (uid: string, ids: string[]) => patchMany(uid, ids, { archivedAt: new Date(), readAt: new Date() });
export const unarchiveNotifications = (uid: string, ids: string[]) => patchMany(uid, ids, { archivedAt: null, snoozedUntil: null });

export async function saveNotificationPrefs(uid: string, patch: Partial<NotificationPrefs>): Promise<void> {
  await setDoc(notificationPrefsRef(uid), patch, { merge: true });
}

/** Mute (or unmute) one type: nothing new of it is created. */
export async function setTypeMuted(uid: string, type: NotificationType, muted: boolean): Promise<void> {
  await setDoc(notificationPrefsRef(uid), { muted: muted ? arrayUnion(type) : arrayRemove(type) }, { merge: true });
}

export async function setTypeChannel(uid: string, type: NotificationType, channel: 'push' | 'email', on: boolean): Promise<void> {
  await updateDoc(notificationPrefsRef(uid), { [channel]: on ? arrayUnion(type) : arrayRemove(type) }).catch(() =>
    setDoc(notificationPrefsRef(uid), { [channel]: on ? [type] : [] }, { merge: true })
  );
}

/** Updates the plan snapshot (the forecast facts the runner reads); fields left out are kept. */
export async function savePlanSnapshot(uid: string, snapshot: Partial<PlanSnapshot>): Promise<void> {
  // The forecast replaces its whole field (merge would keep old array items).
  await setDoc(planSnapshotRef(uid), toStored(snapshot) as Record<string, unknown>, { mergeFields: Object.keys(snapshot) });
}
