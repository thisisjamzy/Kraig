// Scheduling links (Dreda v1.0 `Scheduling` 60468, phone 70131 and 70256):
// a link people book a time on, with hours per weekday (more than one range
// a day), a gap between meetings, a daily cap, where it happens and a note
// for the booker; and the bookings made on it. Pure, tested in
// test/timePages.test.ts.

import type { LabelHue } from './projects';

/** Monday first. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

export interface TimeRange {
  /** "09:00" */
  from: string;
  to: string;
}

export type Cadence = 'repeating' | 'one-off';
export const PLACES = ['Video call', 'Phone', 'In person'] as const;
export type Place = (typeof PLACES)[number];

export interface SchedLink {
  id: string;
  name: string;
  slug: string;
  minutes: number;
  place: Place;
  cadence: Cadence;
  active: boolean;
  /** Seven days, Monday first; an empty day is unavailable. */
  hours: TimeRange[][];
  gapMinutes: number;
  perDay: number;
  note: string;
  /** One-off links close after this day. */
  until: Date | null;
  /** Why it is paused ("Paused for December, resumes 5 Jan"). */
  pausedNote: string;
  hue: LabelHue;
}

export type BookingStatus = 'requested' | 'confirmed' | 'declined';

export interface Booking {
  id: string;
  linkId: string;
  name: string;
  email: string;
  note: string;
  at: Date;
  status: BookingStatus;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The booking page address, without the scheme: "dreda.app/book/intro-call". */
export function linkUrl(host: string, slug: string): string {
  return `${host}/book/${slug || 'your-link'}`;
}

/** "9:00", from "09:00". */
export function clock(t: string): string {
  const [h, m] = t.split(':');
  return `${Number(h)}:${m}`;
}

export function rangeWords(r: TimeRange): string {
  return `${clock(r.from)} to ${clock(r.to)}`;
}

/** "Mon to Fri", "Tue and Thu", "Mon, Wed, Fri", "Fri only". */
export function dayWords(days: number[]): string {
  if (!days.length) return 'no days';
  if (days.length === 1) return `${WEEKDAY_SHORT[days[0]]} only`;
  const run = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (run && days.length > 2) return `${WEEKDAY_SHORT[days[0]]} to ${WEEKDAY_SHORT[days[days.length - 1]]}`;
  if (days.length === 2) return `${WEEKDAY_SHORT[days[0]]} and ${WEEKDAY_SHORT[days[1]]}`;
  return days.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

export function openDays(link: Pick<SchedLink, 'hours'>): number[] {
  return link.hours.map((r, i) => (r.length ? i : -1)).filter((i) => i >= 0);
}

/** "Every week, Mon to Fri, 10:00 to 16:00"; "One meeting, any slot until Fri 21 Nov". */
export function whenWords(link: SchedLink): string {
  if (link.cadence === 'one-off') {
    return link.until ? `One meeting, any slot until ${link.until.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : 'One meeting, any open slot';
  }
  const days = openDays(link);
  const ranges = days.map((d) => link.hours[d].map(rangeWords).join(' and '));
  const same = ranges.every((r) => r === ranges[0]);
  return `Every week, ${dayWords(days)}${same && ranges[0] ? `, ${ranges[0]}` : ', hours vary by day'}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Bookings this week (Monday to Sunday), declined left out. */
export function bookedThisWeek(bookings: Booking[], linkId: string | null, now: Date): number {
  const from = startOfDay(now);
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
  return bookings.filter((b) => (linkId === null || b.linkId === linkId) && b.status !== 'declined' && b.at >= from && b.at < to).length;
}

/** "Thu 19 Nov, 11:00" */
export function bookingWhen(d: Date): string {
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The link's next booking that is not declined. */
export function nextBooking(bookings: Booking[], linkId: string, now: Date): Booking | null {
  return bookings.filter((b) => b.linkId === linkId && b.status !== 'declined' && b.at >= now).sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null;
}

/** A range is usable when it starts before it ends. */
export function validRange(r: TimeRange): boolean {
  return /^\d{2}:\d{2}$/.test(r.from) && /^\d{2}:\d{2}$/.test(r.to) && r.from < r.to;
}

/** Ranges on a day must not overlap. */
export function rangesClash(ranges: TimeRange[]): boolean {
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  return sorted.some((r, i) => i > 0 && r.from < sorted[i - 1].to);
}

// ---- The booker's side (Dreda v1.0 `Public booking` 60952, 61159, 61287) ----

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const pad = (n: number) => String(n).padStart(2, '0');

/** Monday first weekday index of a date. */
export function weekdayOf(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * The times a booker can pick on a day: every half hour (or the meeting's
 * length, if shorter) inside the link's ranges, where the meeting fits
 * before the range ends, not in the past, not within the gap of another
 * booking, and not once the day's cap is reached.
 */
export function daySlots(link: SchedLink, day: Date, bookings: Booking[], now: Date): Date[] {
  if (!link.active) return [];
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  if (link.until && dayStart > link.until) return [];
  const taken = bookings.filter((b) => b.linkId === link.id && b.status !== 'declined' && b.at.toDateString() === dayStart.toDateString());
  if (taken.length >= link.perDay) return [];
  const step = Math.min(30, link.minutes);
  const out: Date[] = [];
  for (const r of link.hours[weekdayOf(dayStart)] ?? []) {
    for (let m = toMin(r.from); m + link.minutes <= toMin(r.to); m += step) {
      const at = new Date(dayStart.getTime() + m * 60000);
      if (at <= now) continue;
      const clash = taken.some((b) => {
        const s = (b.at.getTime() - dayStart.getTime()) / 60000;
        return m < s + link.minutes + link.gapMinutes && s < m + link.minutes + link.gapMinutes;
      });
      if (!clash) out.push(at);
    }
  }
  return out;
}

/** "14:00" */
export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function stamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

export interface CalendarInvite {
  title: string;
  start: Date;
  end: Date;
  details: string;
  location: string;
}

/** Add-to-calendar links: Google, Outlook and an .ics file's text. */
export function inviteLinks(e: CalendarInvite): { google: string; outlook: string; ics: string } {
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
  return {
    google: `https://calendar.google.com/calendar/render?${q({ action: 'TEMPLATE', text: e.title, dates: `${stamp(e.start)}/${stamp(e.end)}`, details: e.details, location: e.location })}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${q({ subject: e.title, startdt: e.start.toISOString(), enddt: e.end.toISOString(), body: e.details, location: e.location })}`,
    ics: [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Dreda//Booking//EN',
      'BEGIN:VEVENT',
      `UID:${stamp(e.start)}-${Math.abs([...e.title].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 0))}@dreda.app`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${e.title.replace(/[,;]/g, ' ')}`,
      `DESCRIPTION:${e.details.replace(/\n/g, '\\n').replace(/[,;]/g, ' ')}`,
      `LOCATION:${e.location}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'),
  };
}
