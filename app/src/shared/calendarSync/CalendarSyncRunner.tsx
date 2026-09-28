'use client';

// Runs Google Calendar sync on its own — mounted once in the app shell,
// renders nothing. When (reason in brackets, see runner.ts):
//   - after sign-in, or app start with a restored session, once the first
//     screen has rendered — never delaying it (login). A login sync that
//     fails for a passing reason (network, timeout, another device busy)
//     is retried after 30 seconds and again after 2 minutes;
//   - the app becoming visible again when the last sync is over 5 minutes
//     old (resume);
//   - every 10 minutes while visible, paused while hidden (interval);
//   - a pushable task created, moved, resized, retitled, deleted or
//     switched between blocked and free — debounced 2 seconds so a drag is
//     one push (block-change). Detected from the live task list itself, so
//     every write path counts, whichever screen made it;
//   - back online with a change still pending (block-change), or when no
//     sync has succeeded yet this session (resume).
// The Calendar screen adds its own (calendar-open), and Sync now (manual).
// Changes made in Google reach the app only through these syncs — the
// bridge can't notify the app.
// Also keeps the status store in step with settings/calendarSync.

import { useEffect, useMemo, useRef } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useFirestoreCollection, useFirestoreMapDoc } from '@/src/shared/firestore/hooks';
import { calendarSyncStateRef, tasksRef } from '@/src/shared/firestore/refs';
import type { FirestoreCalendarSyncState, FirestoreTask } from '@/src/shared/firestore/types';
import { useNowMinute } from '@/src/shared/insights/useNow';
import { blocksSignature, buildBlocks, defaultSyncWindow, userTimeZone } from './blocks';
import { isCalendarSyncEnabled, lastSyncEndedAt, runCalendarSync } from './runner';
import { getSyncStatus, setSyncStatus, useCalendarSyncStatus } from './status';

const LOGIN_DELAY_MS = 1500;
const LOGIN_RETRY_MS = [30_000, 120_000];
const RETRYABLE = ['NETWORK', 'TIMEOUT', 'INTERNAL', 'BAD_RESPONSE', 'BUSY'];
const RESUME_AFTER_MS = 5 * 60_000;
const INTERVAL_MS = 10 * 60_000;
const BLOCK_CHANGE_DEBOUNCE_MS = 2000;

export function CalendarSyncRunner() {
  const { user } = useFirebaseUser();
  const enabled = isCalendarSyncEnabled();
  const uid = enabled ? user?.uid : undefined;

  // ---- Status store ← settings/calendarSync ----
  const stateRef = useMemo(() => (uid ? calendarSyncStateRef(uid) : null), [uid]);
  const { data: state } = useFirestoreMapDoc<FirestoreCalendarSyncState>(stateRef);
  useEffect(() => {
    if (!state) return;
    const current = getSyncStatus();
    const docSuccess = state.lastSuccessAt?.toMillis?.() ?? null;
    const lastSuccessAt = Math.max(current.lastSuccessAt ?? 0, docSuccess ?? 0) || null;
    const docError = state.lastError?.at
      ? { code: state.lastError.code, message: state.lastError.message, at: state.lastError.at.toMillis() }
      : null;
    let lastError = [current.lastError, docError].filter(Boolean).sort((a, b) => b!.at - a!.at)[0] ?? null;
    if (lastError && lastSuccessAt && lastSuccessAt > lastError.at) lastError = null;
    setSyncStatus({ includeFree: Boolean(state.markFreeAsBusy), lastSuccessAt, lastError });
  }, [state]);

  // ---- Login / restored session ----
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = (n: number) => {
      timer = setTimeout(async () => {
        const result = await runCalendarSync({ reason: 'login' });
        if (cancelled || n >= LOGIN_RETRY_MS.length) return;
        // Skipped (offline, throttled) is picked up by the online and
        // interval triggers; only a failed attempt is retried here.
        if (result.status === 'failed' && RETRYABLE.includes(result.error?.code ?? '')) attempt(n + 1);
      }, n === 0 ? LOGIN_DELAY_MS : LOGIN_RETRY_MS[n - 1]);
    };
    attempt(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uid]);

  // ---- Resume and interval ----
  useEffect(() => {
    if (!uid) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(interval);
      interval = setInterval(() => void runCalendarSync({ reason: 'interval' }), INTERVAL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastSyncEndedAt() > RESUME_AFTER_MS) void runCalendarSync({ reason: 'resume' });
        start();
      } else {
        clearInterval(interval);
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [uid]);

  // ---- Block changes ----
  // Same query as useAllTasks, so Firestore shares the one listener.
  const tasksQuery = useMemo(() => (uid ? query(tasksRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: tasks, loading } = useFirestoreCollection<FirestoreTask>(tasksQuery);
  const { includeFree } = useCalendarSyncStatus();
  const day = Math.floor(useNowMinute() / 1440);
  const signature = useMemo(() => {
    if (loading || !uid) return null;
    const now = new Date();
    return blocksSignature(buildBlocks(tasks, defaultSyncWindow(now), { includeFree, timeZone: userTimeZone(), now }).blocks);
    // `day` re-anchors the window at midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, loading, uid, includeFree, day]);
  const baseline = useRef<{ uid: string; signature: string } | null>(null);
  // A change made while offline (a deletion carries no pending flag).
  const changedOffline = useRef(false);
  useEffect(() => {
    if (!uid || signature === null) return;
    if (!baseline.current || baseline.current.uid !== uid) {
      baseline.current = { uid, signature };
      return;
    }
    if (baseline.current.signature === signature) return;
    baseline.current = { uid, signature };
    const timer = setTimeout(() => {
      if (navigator.onLine === false) changedOffline.current = true;
      else void runCalendarSync({ reason: 'block-change' });
    }, BLOCK_CHANGE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [uid, signature]);

  // ---- Back online with a change pending ----
  const hasPending = tasks.some((t) => t.googleSync?.state === 'pending');
  useEffect(() => {
    if (!uid) return;
    const onOnline = () => {
      if (hasPending || changedOffline.current) {
        changedOffline.current = false;
        void runCalendarSync({ reason: 'block-change' });
      } else if (!getSyncStatus().lastSuccessAt || getSyncStatus().lastError) {
        // Signed in while offline, or the last sync failed.
        void runCalendarSync({ reason: 'resume' });
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [uid, hasPending]);

  return null;
}
