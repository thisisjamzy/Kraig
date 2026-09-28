'use client';

// Mirrored Google Calendar events (users/{uid}/calendarEvents, written by
// the sync engine — src/shared/calendarSync) starting in [from, to), live.
// A range on startAt ordered by startAt: single-field, no composite index.
// Empty whenever calendar sync isn't configured (the feature is off, so
// stale mirrors aren't shown either).

import { useMemo } from 'react';
import { orderBy, query, Timestamp, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { calendarEventsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { isCalendarSyncEnabled } from '@/src/shared/calendarSync/runner';
import type { FirestoreCalendarEvent } from '@/src/shared/firestore/types';

/** from/to as epoch ms (stable across renders), to = null for no end. */
export function useCalendarEvents(fromMs: number, toMs: number | null) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const q = useMemo(() => {
    if (!uid || !isCalendarSyncEnabled()) return null;
    const lower = where('startAt', '>=', Timestamp.fromMillis(fromMs));
    return toMs === null
      ? query(calendarEventsRef(uid), lower, orderBy('startAt'))
      : query(calendarEventsRef(uid), lower, where('startAt', '<', Timestamp.fromMillis(toMs)), orderBy('startAt'));
  }, [uid, fromMs, toMs]);
  return useFirestoreCollection<FirestoreCalendarEvent>(q);
}
