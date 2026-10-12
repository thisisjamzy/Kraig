// Applying a pull to the stored Google event mirrors — pure, tested in
// test/calendarSync.test.ts. The pull is complete for its window, so:
//   - every returned event is upserted (Google fields only — merged, so the
//     app's own linkedTaskId / linkedProjectId / notes are never touched);
//   - a stored event that STARTS inside the window but wasn't returned was
//     deleted, cancelled or declined in Google, and is removed;
//   - a stored event starting outside the window is never touched.

import type { GoogleEvent, GoogleEventTime } from '../calendarBridge/types';
import type { SyncWindow } from './blocks';
import { zonedMidnight } from './blocks';

/** The Google-owned fields of a calendarEvents doc (syncedAt is added by
 * the writer as a server timestamp). Times are Dates here; the writer
 * converts them. */
export interface EventFields {
  googleEventId: string;
  recurringEventId: string | null;
  kind: 'meeting' | 'event';
  source: 'google' | 'booking';
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  start: { dateTime: string | null; date: string | null; timeZone: string | null };
  end: { dateTime: string | null; date: string | null; timeZone: string | null };
  startAt: Date;
  endAt: Date;
  blocksTime: boolean;
  selfResponse: string | null;
  organizer: { email: string | null; name: string | null; self: boolean } | null;
  attendees: { email: string | null; name: string | null; responseStatus: string | null; optional: boolean }[];
  eventType: string | null;
  meetingLink: string | null;
  htmlLink: string | null;
  updated: string | null;
}

/** Only these keys are ever written by a pull. */
export const GOOGLE_FIELDS: (keyof EventFields)[] = [
  'googleEventId',
  'recurringEventId',
  'kind',
  'source',
  'title',
  'description',
  'location',
  'allDay',
  'start',
  'end',
  'startAt',
  'endAt',
  'blocksTime',
  'selfResponse',
  'organizer',
  'attendees',
  'eventType',
  'meetingLink',
  'htmlLink',
  'updated',
];

function s(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function rawTime(t: GoogleEventTime | undefined) {
  return { dateTime: s(t?.dateTime), date: s(t?.date), timeZone: s(t?.timeZone) };
}

function instant(t: GoogleEventTime | undefined, calendarTimeZone: string): Date | null {
  if (t?.dateTime) {
    const d = new Date(t.dateTime);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (t?.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) return zonedMidnight(t.date, calendarTimeZone);
  return null;
}

/** A pulled event as the doc fields to merge, or null when it isn't
 * stored: its times can't be read (never stored rather than stored wrong),
 * or it's one of the app's own blocks mirrored in Google (the app never
 * asks for those, see pull's includeDredaBlocks — skipped in case). */
export function toEventFields(event: GoogleEvent, calendarTimeZone: string): EventFields | null {
  const id = s(event?.googleEventId);
  if (!id || event.kind === 'dreda-block' || event.source === 'dreda') return null;
  const startAt = instant(event.start, calendarTimeZone);
  const endAt = instant(event.end, calendarTimeZone);
  if (!startAt || !endAt) return null;
  const attendees = Array.isArray(event.attendees) ? event.attendees : [];
  return {
    googleEventId: id,
    recurringEventId: s(event.recurringEventId),
    kind: event.kind === 'meeting' ? 'meeting' : 'event',
    source: event.source === 'booking' ? 'booking' : 'google',
    title: s(event.title) ?? '(No title)',
    description: s(event.description),
    location: s(event.location),
    allDay: Boolean(event.allDay) || Boolean(event.start?.date && !event.start?.dateTime),
    start: rawTime(event.start),
    end: rawTime(event.end),
    startAt,
    endAt: endAt > startAt ? endAt : startAt,
    blocksTime: event.blocksTime !== false,
    selfResponse: s(event.selfResponse),
    organizer: event.organizer
      ? { email: s(event.organizer.email), name: s(event.organizer.name), self: Boolean(event.organizer.self) }
      : null,
    attendees: attendees.map((a) => ({
      email: s(a?.email),
      name: s(a?.name),
      responseStatus: s(a?.responseStatus),
      optional: Boolean(a?.optional),
    })),
    eventType: s(event.eventType),
    meetingLink: s(event.meetingLink),
    htmlLink: s(event.htmlLink),
    updated: s(event.updated),
  };
}

export interface StoredEventRef {
  /** The doc id (calendarEventDocId of its Google id). */
  id: string;
  startAt: Date;
  /** The stored Google fields (dates as Dates), to skip unchanged events. */
  fields?: Partial<Record<keyof EventFields, unknown>>;
}

/** A value in one comparable form: dates as times, objects with sorted keys. */
function canonical(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  return v ?? null;
}

/** True when every Google field stored already matches the pull: no write needed. */
export function sameEvent(fields: EventFields, stored: StoredEventRef['fields'] | undefined): boolean {
  if (!stored) return false;
  return GOOGLE_FIELDS.every((k) => JSON.stringify(canonical(fields[k])) === JSON.stringify(canonical(stored[k])));
}

export interface ReconcilePlan {
  upserts: EventFields[];
  /** Doc ids to delete. */
  deletes: string[];
}

/** What to write so the stored mirrors match a complete pull of `window`. */
export function planReconcile(
  stored: StoredEventRef[],
  pulled: GoogleEvent[],
  window: SyncWindow,
  calendarTimeZone: string,
  docIdOf: (googleEventId: string) => string = (id) => id.replace(/\//g, '_')
): ReconcilePlan {
  const upserts: EventFields[] = [];
  const returned = new Set<string>();
  const storedById = new Map(stored.map((d) => [d.id, d]));
  for (const event of pulled) {
    // Returned at all = still live, even if this copy can't be stored.
    if (typeof event?.googleEventId === 'string' && event.googleEventId) returned.add(docIdOf(event.googleEventId));
    const fields = toEventFields(event, calendarTimeZone);
    // Unchanged since the last pull: no write (each one costs a write, and
    // a read on every screen listening to the calendar).
    if (fields && !sameEvent(fields, storedById.get(docIdOf(fields.googleEventId))?.fields)) upserts.push(fields);
  }
  const from = window.from.getTime();
  const to = window.to.getTime();
  const deletes = stored
    .filter((doc) => {
      const at = doc.startAt.getTime();
      return at >= from && at < to && !returned.has(doc.id);
    })
    .map((doc) => doc.id);
  return { upserts, deletes };
}
