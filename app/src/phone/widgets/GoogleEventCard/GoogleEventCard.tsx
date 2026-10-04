'use client';

// A pulled Google Calendar event on the Calendar — the same card shape as
// an app task (TaskCheckRow), so the day reads as one schedule, but clearly
// Google's: a small "G" mark by the time, and no checkbox (it isn't the
// app's to complete). Meetings (other guests) get a people icon and the
// full card; plain events a quieter outline; events marked Free in Google
// are faded with a dashed outline and labelled "free" (they're ignored in
// conflict checks). Tapping opens the event's own page.

import Link from 'next/link';
import { Users } from 'lucide-react';
import { taskWhen } from '@/src/phone/widgets/TaskCheckRow/TaskCheckRow';
import { GoogleMark } from '@/src/widgets/GoogleEventCard/GoogleMark';
import styles from '@/src/phone/widgets/GoogleEventCard/GoogleEventCard.module.css';

export { GoogleMark };

export interface GoogleCardEvent {
  /** The calendarEvents doc id. */
  id: string;
  title: string;
  kind: 'meeting' | 'event';
  blocksTime: boolean;
  selfResponse: string | null;
  startTime: Date;
  dueDate: Date;
  allDay: boolean;
  /** Join link (Meet, Zoom…) — shown by Today's "Next up". */
  meetingLink?: string | null;
}

/** Tentative, or not answered yet. */
export function isUnconfirmed(selfResponse: string | null | undefined): boolean {
  return selfResponse === 'tentative' || selfResponse === 'needsAction';
}

export function eventHref(id: string) {
  return `/projects/calendar/events/${encodeURIComponent(id)}`;
}

export function GoogleEventCard({
  event,
  density,
  timeOnly = true,
  className,
  style,
}: {
  event: GoogleCardEvent;
  density?: 'line' | 'short' | 'full';
  timeOnly?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const when = taskWhen(event.startTime, event.dueDate, event.allDay, timeOnly);
  const unconfirmed = isUnconfirmed(event.selfResponse);
  return (
    <Link
      href={eventHref(event.id)}
      className={`${styles.card} ${className ?? ''}`}
      data-kind={event.kind}
      data-free={!event.blocksTime || undefined}
      data-density={density}
      style={style}
    >
      {event.kind === 'meeting' && (
        <span className={styles.icon} aria-hidden>
          <Users size={density === 'line' ? 12 : 14} strokeWidth={2.25} />
        </span>
      )}
      <span className={styles.body}>
        <span className={styles.titleRow}>
          {density === 'line' && <GoogleMark size={12} />}
          <span className={styles.title}>{event.title}</span>
        </span>
        {density !== 'line' && (
          <span className={styles.when}>
            <GoogleMark size={12} />
            <span className={styles.whenText}>{when}</span>
            {!event.blocksTime && <span className={styles.label}>free</span>}
            {unconfirmed && <span className={styles.label}>Not confirmed</span>}
          </span>
        )}
      </span>
      <span className={styles.srOnly}>
        {event.kind === 'meeting' ? 'Google Calendar meeting' : 'Google Calendar event'}
        {!event.blocksTime ? ', marked free' : ''}
        {unconfirmed ? ', not confirmed' : ''}
      </span>
    </Link>
  );
}
