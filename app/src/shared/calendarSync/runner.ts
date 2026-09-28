'use client';

// runCalendarSync — the one entry point every trigger calls (login,
// Calendar open, Sync now, resume, the 10-minute interval, block changes;
// see CalendarSyncRunner.tsx). It owns the rules around a sync, engine.ts
// the sync itself:
//   - guard: off when the bridge isn't configured, nobody's signed in, the
//     device is offline, or FORBIDDEN / MISCONFIGURED switched automatic
//     sync off for this session (a manual sync still tries);
//   - one at a time per tab: a call while one runs gets the same promise —
//     except a block change, which runs once more right after, since the
//     running sync may have read the tasks before that change;
//   - throttle: skipped when the last sync ended under 20 seconds ago,
//     unless manual or a block change;
//   - errors: recorded in the status store and settings/calendarSync in
//     plain language; app bugs (BAD_REQUEST, UNKNOWN_ACTION,
//     EMPTY_PUSH_REFUSED) and MISCONFIGURED also console.error. Never a
//     toast from here — the Sync now button shows its own.
//   - one console.info line per sync: reason, duration, counts. Never a
//     token, a description or an attendee.

import { getFirebaseAuth } from '../config/firebaseClient';
import { BridgeError, isBridgeConfigured, ping, push, sync } from '../calendarBridge/client';
import { executeSync, type SyncCounts, type SyncReason } from './engine';
import { userTimeZone, widenWindow, windowToBridge, defaultSyncWindow, type SyncWindow } from './blocks';
import * as io from './firestoreIO';
import { describeSyncError, getSyncStatus, setSyncStatus } from './status';

const THROTTLE_MS = 20_000;
const APP_BUG_CODES = ['BAD_REQUEST', 'UNKNOWN_ACTION', 'EMPTY_PUSH_REFUSED'];
const QUIET_CODES = ['NOT_CONFIGURED', 'NO_USER'];

export interface SyncRunResult {
  status: 'ok' | 'skipped' | 'failed';
  counts?: SyncCounts;
  error?: { code: string; message: string };
}

let inflight: Promise<SyncRunResult> | null = null;
let rerun: { window?: SyncWindow | null } | null = null;
let lastEndedAt = 0;

export function isCalendarSyncEnabled(): boolean {
  return isBridgeConfigured();
}

export function lastSyncEndedAt(): number {
  return lastEndedAt;
}

export function runCalendarSync({
  reason,
  window: range,
}: {
  reason: SyncReason;
  /** A screen's visible range — widened to at least the default window. */
  window?: SyncWindow | null;
}): Promise<SyncRunResult> {
  if (!isBridgeConfigured()) return Promise.resolve({ status: 'skipped' });
  const user = getFirebaseAuth().currentUser;
  if (!user) return Promise.resolve({ status: 'skipped' });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve({ status: 'skipped' });
  if (getSyncStatus().disabled && reason !== 'manual') return Promise.resolve({ status: 'skipped' });

  if (inflight) {
    if (reason === 'block-change') rerun = { window: range };
    return inflight;
  }
  const urgent = reason === 'manual' || reason === 'block-change';
  if (!urgent && Date.now() - lastEndedAt < THROTTLE_MS) return Promise.resolve({ status: 'skipped' });

  inflight = run(user.uid, reason, range).finally(() => {
    inflight = null;
    lastEndedAt = Date.now();
    if (rerun) {
      const next = rerun;
      rerun = null;
      void runCalendarSync({ reason: 'block-change', window: next.window });
    }
  });
  return inflight;
}

async function run(uid: string, reason: SyncReason, visible?: SyncWindow | null): Promise<SyncRunResult> {
  const started = Date.now();
  const range = widenWindow(visible ?? null);
  setSyncStatus({ running: true, manual: reason === 'manual' });
  try {
    const outcome = await executeSync(range, {
      now: () => new Date(),
      timeZone: userTimeZone,
      loadSettings: () => io.loadSettings(uid),
      loadTasks: () => io.loadTasksFromServer(uid),
      bridgeSync: (w, blocks) => sync(w, blocks),
      bridgePush: (w, blocks, opts) => push(w, blocks, opts),
      bridgePing: (w) => ping(w),
      writeTaskSync: (updates) => io.writeTaskSync(uid, updates),
      applyPull: (w, events, tz) => io.applyPull(uid, w, events, tz),
      saveState: (patch) => io.saveSuccess(uid, patch),
    });
    const c = outcome.counts;
    console.info(
      `[calendar-sync] ${reason} ok in ${Date.now() - started}ms · ${c.meetings} meetings, ${c.events} events, ` +
        `${outcome.pushed ? `${c.blocksPushed} blocks pushed` : 'pull only'}, ${c.deleted} deleted, ${c.conflicts} conflicts`
    );
    setSyncStatus({ running: false, manual: false, lastSuccessAt: Date.now(), lastError: null });
    return { status: 'ok', counts: c };
  } catch (error) {
    const code = error instanceof BridgeError ? error.code : 'INTERNAL';
    const message = describeSyncError(code);
    console.info(`[calendar-sync] ${reason} failed in ${Date.now() - started}ms · ${code}`);
    if (QUIET_CODES.includes(code)) {
      setSyncStatus({ running: false, manual: false });
      return { status: 'skipped' };
    }
    if (code === 'MISCONFIGURED' || APP_BUG_CODES.includes(code)) {
      console.error(`[calendar-sync] ${code}: ${error instanceof Error ? error.message : String(error)}`);
    } else if (!(error instanceof BridgeError)) {
      console.error('[calendar-sync] sync failed', error);
    }
    const disabled = code === 'FORBIDDEN' || code === 'MISCONFIGURED' ? code : getSyncStatus().disabled;
    setSyncStatus({ running: false, manual: false, lastError: { code, message, at: Date.now() }, disabled });
    await io.saveFailure(uid, code, message).catch(() => {});
    return { status: 'failed', error: { code, message } };
  }
}

/** "Test connection" — the calendar's name and time zone, saved too. */
export async function testCalendarConnection(): Promise<{ calendarName: string; timeZone: string }> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new BridgeError('NO_USER');
  const info = await ping(windowToBridge(defaultSyncWindow()));
  await io.saveCalendarInfo(user.uid, info.calendarName ?? null, info.timeZone ?? null).catch(() => {});
  // A working connection lifts a session's FORBIDDEN / MISCONFIGURED stop.
  setSyncStatus({ disabled: null });
  return { calendarName: info.calendarName, timeZone: info.timeZone };
}
