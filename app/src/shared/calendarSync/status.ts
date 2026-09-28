// The in-app Google Calendar sync status — one small store for this tab
// (running or not, the last success and error, whether automatic sync was
// switched off for this session), read by the Calendar's status line and
// Settings > Google Calendar through useCalendarSyncStatus. No Firestore
// here: CalendarSyncRunner seeds it from settings/calendarSync, runner.ts
// updates it as syncs run.

import { useSyncExternalStore } from 'react';

export type DisabledReason = 'FORBIDDEN' | 'MISCONFIGURED' | null;

export interface SyncStatus {
  running: boolean;
  /** Started by the user (Sync now) — the spinner shows for these. */
  manual: boolean;
  lastSuccessAt: number | null;
  lastError: { code: string; message: string; at: number } | null;
  disabled: DisabledReason;
  /** "Also mark free tasks as busy on Google". */
  includeFree: boolean;
}

let status: SyncStatus = {
  running: false,
  manual: false,
  lastSuccessAt: null,
  lastError: null,
  disabled: null,
  includeFree: false,
};
const listeners = new Set<() => void>();

export function getSyncStatus(): SyncStatus {
  return status;
}

export function setSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeSyncStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCalendarSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
}

/** Plain-language text for an error code — never the raw error. */
export function describeSyncError(code: string): string {
  switch (code) {
    case 'FORBIDDEN':
      return "This account isn't allowed to sync with this calendar";
    case 'MISCONFIGURED':
      return 'Calendar sync needs setup on the server';
    case 'UNAUTHENTICATED':
    case 'TOKEN_EXPIRED':
    case 'NO_USER':
      return 'Your sign-in has expired. Sign in again, then sync.';
    case 'BUSY':
      return 'Another device was syncing at the same time. Try again in a moment.';
    case 'NETWORK':
    case 'TIMEOUT':
    case 'INTERNAL':
    case 'BAD_RESPONSE':
      return "Couldn't reach Google Calendar. Check your connection and try again.";
    case 'TOO_MANY_BLOCKS':
      return 'There were too many tasks to sync at once.';
    case 'NOT_CONFIGURED':
      return 'Google Calendar sync is not configured';
    default:
      return 'Something went wrong while syncing. Try again later.';
  }
}
