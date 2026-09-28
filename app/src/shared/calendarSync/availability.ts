// Pulled Google events in the app's conflict checks
// (src/viewmodels/scheduling.ts): an event that blocks time in Google is a
// blocked window nothing can overlap; one marked Free there is ignored.
// All-day events stay out, like the app's own date-only tasks.

import type { ScheduledTask } from '../../viewmodels/scheduling';

export interface GoogleBusySource {
  id: string;
  title: string;
  startAt: { toDate(): Date } | Date;
  endAt: { toDate(): Date } | Date;
  allDay: boolean;
  blocksTime: boolean;
}

const toDate = (v: { toDate(): Date } | Date) => (v instanceof Date ? v : v.toDate());

export const GOOGLE_ID_PREFIX = 'google:';

export function googleEventsAsScheduled(events: GoogleBusySource[]): ScheduledTask[] {
  return events
    .filter((e) => e.blocksTime && !e.allDay)
    .map((e) => ({
      id: `${GOOGLE_ID_PREFIX}${e.id}`,
      title: e.title,
      start: toDate(e.startAt),
      end: toDate(e.endAt),
      mode: 'blocked' as const,
      allDay: false,
      source: 'google' as const,
    }));
}
