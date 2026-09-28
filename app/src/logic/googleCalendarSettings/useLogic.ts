'use client';

// Settings > Google Calendar — the sync's status (settings/calendarSync plus
// this tab's live status), Sync now, Test connection, and the one setting.

import { useMemo, useState } from 'react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useFirestoreMapDoc } from '@/src/shared/firestore/hooks';
import { calendarSyncStateRef } from '@/src/shared/firestore/refs';
import type { FirestoreCalendarSyncState } from '@/src/shared/firestore/types';
import { isCalendarSyncEnabled, testCalendarConnection } from '@/src/shared/calendarSync/runner';
import { setMarkFreeAsBusy } from '@/src/shared/calendarSync/firestoreIO';
import { describeSyncError, setSyncStatus, useCalendarSyncStatus } from '@/src/shared/calendarSync/status';
import { BridgeError } from '@/src/shared/calendarBridge/client';
import { syncNow } from '@/src/widgets/CalendarSyncStatus/syncNow';
import { useNowMinute } from '@/src/shared/insights/useNow';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export type ConnectionState = 'syncing' | 'not-configured' | 'not-allowed' | 'needs-setup';

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const configured = isCalendarSyncEnabled();
  const ref = useMemo(() => (uid && configured ? calendarSyncStateRef(uid) : null), [uid, configured]);
  const { data: state, loading } = useFirestoreMapDoc<FirestoreCalendarSyncState>(ref);
  const status = useCalendarSyncStatus();
  const minute = useNowMinute();

  const errorCode = status.disabled ?? status.lastError?.code ?? null;
  const connection: ConnectionState = !configured
    ? 'not-configured'
    : errorCode === 'FORBIDDEN'
      ? 'not-allowed'
      : errorCode === 'MISCONFIGURED'
        ? 'needs-setup'
        : 'syncing';

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const info = await testCalendarConnection();
      setTestResult({ ok: true, text: `Connected to ${info.calendarName} (${info.timeZone})` });
    } catch (error) {
      const code = error instanceof BridgeError ? error.code : 'INTERNAL';
      if (code === 'FORBIDDEN' || code === 'MISCONFIGURED') setSyncStatus({ disabled: code });
      setTestResult({ ok: false, text: describeSyncError(code) });
    } finally {
      setTesting(false);
    }
  }

  async function toggleMarkFree(value: boolean) {
    if (!uid) return;
    setSyncStatus({ includeFree: value });
    await setMarkFreeAsBusy(uid, value);
  }

  const navigateBack = useGoBack();

  return {
    configured,
    connection,
    calendarName: state?.calendarName ?? null,
    calendarTimeZone: state?.calendarTimeZone ?? null,
    lastSuccessAt: status.lastSuccessAt ?? state?.lastSuccessAt?.toMillis?.() ?? null,
    lastError: status.lastError,
    counts: state?.lastCounts ?? null,
    running: status.running,
    nowMs: minute * 60000,
    markFreeAsBusy: status.includeFree,
    toggleMarkFree,
    syncNow: () => void syncNow(),
    testConnection,
    testing,
    testResult,
    loading: configured && Boolean(uid) && loading,
    goBack: () => navigateBack('/settings'),
  };
}
