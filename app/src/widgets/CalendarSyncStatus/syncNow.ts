'use client';

// "Sync now" (and "tap to retry"): a manual sync with one small toast for
// the result — at most one, success or failure. Automatic syncs never toast.

import { runCalendarSync, type SyncRunResult } from '@/src/shared/calendarSync/runner';
import type { SyncWindow } from '@/src/shared/calendarSync/blocks';
import { showToast } from '@/src/widgets/Toast/Toast';

export async function syncNow(range?: SyncWindow | null): Promise<SyncRunResult> {
  const result = await runCalendarSync({ reason: 'manual', window: range });
  if (result.status === 'ok') showToast('Synced with Google Calendar');
  else if (result.status === 'failed') showToast(result.error?.message ?? 'Sync failed');
  else if (typeof navigator !== 'undefined' && navigator.onLine === false) showToast("You're offline, sync will run when you're back");
  return result;
}
