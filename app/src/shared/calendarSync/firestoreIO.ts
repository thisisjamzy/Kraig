'use client';

// The sync engine's Firestore reads and writes (engine.ts's SyncDeps), with
// the signed-in user's own session — no server, no Admin SDK. Writes go in
// batches of at most 450 (Firestore's limit is 500 per batch).

import {
  deleteField,
  getDoc,
  getDocs,
  getDocsFromServer,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  waitForPendingWrites,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../config/firebaseClient';
import {
  calendarEventRef,
  calendarEventsRef,
  calendarSyncStateRef,
  taskRef,
  tasksRef,
} from '../firestore/refs';
import type { FirestoreTask, FirestoreCalendarSyncState } from '../firestore/types';
import type { GoogleEvent } from '../calendarBridge/types';
import type { SyncWindow } from './blocks';
import { planReconcile, type EventFields } from './reconcile';
import type { SyncCounts, SyncSettings } from './engine';
import type { TaskSyncRollup } from './results';

const BATCH_SIZE = 450;

function chunks<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function loadSettings(uid: string): Promise<SyncSettings> {
  const snap = await getDoc(calendarSyncStateRef(uid)).catch(() => null);
  const data = snap?.exists() ? snap.data() : null;
  return {
    includeFree: Boolean(data?.markFreeAsBusy),
    calendarName: data?.calendarName ?? null,
    calendarTimeZone: data?.calendarTimeZone ?? null,
  };
}

/** Every live task, from the server — never the offline cache (the
 * engine's safety rule). */
export async function loadTasksFromServer(uid: string): Promise<{ tasks: FirestoreTask[]; fromServer: boolean }> {
  // A task saved a moment ago may still be on its way up — let it land
  // first (bounded, so a flaky connection can't hold the sync forever),
  // or the push would miss it.
  await Promise.race([
    waitForPendingWrites(getFirebaseFirestore()).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
  const snap = await getDocsFromServer(query(tasksRef(uid), where('archived', '==', false)));
  return {
    tasks: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
    fromServer: !snap.metadata.fromCache,
  };
}

export async function writeTaskSync(uid: string, updates: Map<string, TaskSyncRollup | null>): Promise<void> {
  const entries = [...updates.entries()];
  const valueFor = (roll: TaskSyncRollup | null) =>
    roll
      ? {
          state: roll.state,
          googleEventIds: roll.googleEventIds,
          conflicts: roll.conflicts,
          error: roll.error,
          lastSyncedAt: serverTimestamp(),
        }
      : deleteField();
  for (const part of chunks(entries)) {
    const batch = writeBatch(getFirebaseFirestore());
    for (const [taskId, roll] of part) batch.update(taskRef(uid, taskId), { googleSync: valueFor(roll) });
    try {
      await batch.commit();
    } catch {
      // One task deleted meanwhile fails the whole batch — write the rest
      // one by one, skipping what's gone.
      for (const [taskId, roll] of part) {
        await updateDoc(taskRef(uid, taskId), { googleSync: valueFor(roll) }).catch(() => {});
      }
    }
  }
}

function toDoc(fields: EventFields) {
  return {
    ...fields,
    startAt: Timestamp.fromDate(fields.startAt),
    endAt: Timestamp.fromDate(fields.endAt),
    syncedAt: serverTimestamp(),
  };
}

export async function applyPull(uid: string, window: SyncWindow, events: GoogleEvent[], calendarTimeZone: string): Promise<void> {
  const storedSnap = await getDocs(
    query(
      calendarEventsRef(uid),
      where('startAt', '>=', Timestamp.fromDate(window.from)),
      where('startAt', '<', Timestamp.fromDate(window.to))
    )
  );
  const stored = storedSnap.docs
    .filter((d) => d.data().startAt)
    .map((d) => ({ id: d.id, startAt: d.data().startAt.toDate() }));
  const plan = planReconcile(stored, events, window, calendarTimeZone);
  const writes: ((batch: ReturnType<typeof writeBatch>) => void)[] = [
    // Merge: only Google's fields — linkedTaskId, linkedProjectId and
    // notes (the app's own) are left exactly as they are.
    ...plan.upserts.map((fields) => (batch: ReturnType<typeof writeBatch>) =>
      batch.set(calendarEventRef(uid, fields.googleEventId), toDoc(fields), { merge: true })
    ),
    ...plan.deletes.map((id) => (batch: ReturnType<typeof writeBatch>) => batch.delete(calendarEventRef(uid, id))),
  ];
  for (const part of chunks(writes)) {
    const batch = writeBatch(getFirebaseFirestore());
    for (const write of part) write(batch);
    await batch.commit();
  }
}

export async function saveSuccess(
  uid: string,
  patch: { calendarName?: string | null; calendarTimeZone?: string | null; lastCounts: SyncCounts }
): Promise<void> {
  await setDoc(
    calendarSyncStateRef(uid),
    {
      ...patch,
      lastSyncAt: serverTimestamp(),
      lastSuccessAt: serverTimestamp(),
      lastError: null,
    } as Partial<FirestoreCalendarSyncState>,
    { merge: true }
  );
}

export async function saveFailure(uid: string, code: string, message: string): Promise<void> {
  await setDoc(
    calendarSyncStateRef(uid),
    { lastSyncAt: serverTimestamp(), lastError: { code, message, at: Timestamp.now() } } as Partial<FirestoreCalendarSyncState>,
    { merge: true }
  );
}

export async function saveCalendarInfo(uid: string, calendarName: string | null, calendarTimeZone: string | null) {
  await setDoc(calendarSyncStateRef(uid), { calendarName, calendarTimeZone }, { merge: true });
}

export async function setMarkFreeAsBusy(uid: string, value: boolean) {
  await setDoc(calendarSyncStateRef(uid), { markFreeAsBusy: value }, { merge: true });
}

export async function updateEventAppFields(
  uid: string,
  googleEventId: string,
  fields: { linkedTaskId?: string | null; linkedProjectId?: string | null; notes?: string }
) {
  await updateDoc(calendarEventRef(uid, googleEventId), fields);
}
