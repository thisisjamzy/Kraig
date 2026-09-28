'use client';

// The Calendar header's one-line sync status, under the date: "Synced 3 min
// ago", a spinner while syncing, or "Sync failed · tap to retry" in red.
// The whole line is a button (44px tall) that syncs now. Nothing at all
// when calendar sync isn't configured.

import Link from 'next/link';
import { LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { useCalendarSyncStatus } from '@/src/shared/calendarSync/status';
import { isCalendarSyncEnabled } from '@/src/shared/calendarSync/runner';
import type { SyncWindow } from '@/src/shared/calendarSync/blocks';
import { useNowMinute } from '@/src/shared/insights/useNow';
import { syncNow } from './syncNow';
import styles from './CalendarSyncStatus.module.css';

/** "just now", "3 min ago", "2 h ago", "yesterday", "4 days ago" */
export function timeAgo(at: number, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - at) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function CalendarSyncStatus({ range }: { range?: SyncWindow | null }) {
  const status = useCalendarSyncStatus();
  const minute = useNowMinute();
  if (!isCalendarSyncEnabled()) return null;
  const nowMs = Math.max(minute * 60000, status.lastSuccessAt ?? 0);
  const hint = 'Changes made in Google Calendar show up here the next time the app syncs.';

  if (status.disabled) {
    return (
      <Link href="/settings/google-calendar" className={styles.line} data-tone="error">
        <TriangleAlert size={13} strokeWidth={2.25} aria-hidden />
        {status.disabled === 'FORBIDDEN' ? 'Not allowed to sync · see settings' : 'Sync needs setup · see settings'}
      </Link>
    );
  }
  if (status.running) {
    return (
      <span className={styles.line} role="status">
        <LoaderCircle size={13} strokeWidth={2.25} className={styles.spin} aria-hidden />
        Syncing…
      </span>
    );
  }
  const failed = status.lastError && (!status.lastSuccessAt || status.lastError.at > status.lastSuccessAt);
  if (failed) {
    return (
      <button type="button" className={styles.line} data-tone="error" onClick={() => void syncNow(range)} title={status.lastError!.message}>
        <TriangleAlert size={13} strokeWidth={2.25} aria-hidden />
        Sync failed · tap to retry
      </button>
    );
  }
  return (
    <button type="button" className={styles.line} onClick={() => void syncNow(range)} title={hint} aria-label={`${status.lastSuccessAt ? `Synced ${timeAgo(status.lastSuccessAt, nowMs)}` : 'Not synced yet'}. Sync now`}>
      <RefreshCw size={12} strokeWidth={2.25} aria-hidden />
      {status.lastSuccessAt ? `Synced ${timeAgo(status.lastSuccessAt, nowMs)}` : 'Not synced yet · tap to sync'}
    </button>
  );
}
