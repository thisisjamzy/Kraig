// A time on every transaction (owner, 23 Nov 2026). Pure; tested in
// test/transactionTime.test.ts.
//
// A transaction keeps its date field exactly as before (local midnight of
// its day): day grouping, month and week ranges, budgets, accountability
// and Firestore range queries all keep using it. `occurredAt` adds the time
// and always falls on that same day.
//
// The rule:
//   - a time the user picked is used as is (timeSource 'user');
//   - no time picked: the clock time at the moment they press Save, on the
//     date they chose (timeSource 'recorded');
//   - an older record with no occurredAt: the clock time it was recorded
//     (loggedAt, or a createdAt that isn't just a copy of the date), on its
//     own date, which never moves;
//   - nothing to go on: 12:00 on its date.
// Every time is read and built in the household's time zone (Africa/Douala
// unless set), from its parts: never through toISOString or a UTC Date.

export const DEFAULT_TIME_ZONE = 'Africa/Douala';
export const NOON = 12 * 60;

export type TimeSource = 'user' | 'recorded';

/** A Firestore Timestamp or a Date. */
type Instantish = Date | { toDate(): Date } | null | undefined;
const asDate = (v: Instantish): Date | null => (v ? (v instanceof Date ? v : v.toDate()) : null);

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const formats = new Map<string, Intl.DateTimeFormat>();
function partsIn(at: Date, timeZone: string) {
  let f = formats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formats.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, s: +p.second };
}

/** The calendar day of an instant in a time zone, yyyy-mm-dd. */
export function dayIn(at: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = partsIn(at, timeZone);
  return iso(p.y, p.m, p.d);
}

/** The clock time of an instant in a time zone, in minutes after midnight. */
export function clockIn(at: Date, timeZone: string = DEFAULT_TIME_ZONE): number {
  const p = partsIn(at, timeZone);
  return p.h * 60 + p.min;
}

/** The instant of a calendar day and clock time in a time zone, built from its parts. */
export function instantIn(day: string, minutes: number, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const offset = (at: number) => {
    const p = partsIn(new Date(at), timeZone);
    return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - at) / 60_000;
  };
  let at = wall - offset(wall) * 60_000;
  at = wall - offset(at) * 60_000;
  return new Date(at);
}

/** The day a transaction's date field stands for. The field is the device's local midnight of that day. */
export function dayOfDateField(date: Date): string {
  return iso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** The date field for a day, as every create path already stores it: local midnight. */
export function dateFieldFor(day: string): Date {
  return new Date(`${day}T00:00:00`);
}

export interface TimedLike {
  date: Instantish;
  occurredAt?: Instantish;
  loggedAt?: Instantish;
  createdAt?: Instantish;
}

/** When the record was typed in, if anything says so. A createdAt that is just a copy of the date doesn't count. */
export function recordedAt(tx: TimedLike): Date | null {
  const logged = asDate(tx.loggedAt);
  if (logged) return logged;
  const created = asDate(tx.createdAt);
  const date = asDate(tx.date);
  if (created && (!date || created.getTime() !== date.getTime())) return created;
  return null;
}

/** The date and time a transaction happened: occurredAt, else its recorded clock time on its own date, else 12:00. */
export function transactionInstant(tx: TimedLike, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const occurred = asDate(tx.occurredAt);
  if (occurred) return occurred;
  const date = asDate(tx.date);
  if (!date) return new Date(NaN);
  const day = dayOfDateField(date);
  const recorded = recordedAt(tx);
  return instantIn(day, recorded ? clockIn(recorded, timeZone) : NOON, timeZone);
}

/** Its clock time, in minutes, through transactionInstant. */
export function transactionClock(tx: TimedLike, timeZone: string = DEFAULT_TIME_ZONE): number {
  return clockIn(transactionInstant(tx, timeZone), timeZone);
}

/**
 * The one write helper: a chosen day and an optional time, to what is
 * stored. No time: the clock time of `now` (the moment Save is pressed),
 * on the chosen day.
 */
export function withTransactionTime(day: string, time: number | null, now: Date, timeZone: string = DEFAULT_TIME_ZONE): { date: Date; occurredAt: Date; timeSource: TimeSource } {
  const minutes = time ?? clockIn(now, timeZone);
  return { date: dateFieldFor(day), occurredAt: instantIn(day, minutes, timeZone), timeSource: time === null ? 'recorded' : 'user' };
}

/**
 * Editing: a new day and the time field. A time set keeps or becomes the
 * user's. No time set: the original recorded clock time (rule for old
 * records), on the new day. Changing only the date keeps the stored clock.
 */
export function editedTransactionTime(
  original: TimedLike & { timeSource?: TimeSource | null },
  day: string,
  time: number | null,
  timeZone: string = DEFAULT_TIME_ZONE
): { date: Date; occurredAt: Date; timeSource: TimeSource } {
  if (time !== null) {
    const kept = transactionClock(original, timeZone);
    const unchanged = time === kept && (original.timeSource ?? 'recorded') === 'recorded';
    return { date: dateFieldFor(day), occurredAt: instantIn(day, time, timeZone), timeSource: unchanged ? 'recorded' : 'user' };
  }
  const recorded = recordedAt(original);
  return { date: dateFieldFor(day), occurredAt: instantIn(day, recorded ? clockIn(recorded, timeZone) : NOON, timeZone), timeSource: 'recorded' };
}

/** "14:30" */
export function hhmm(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** A typed time: 14:30, 1430, 2:30 pm, 9h30, 9am. Null when blank or unreadable. */
export function parseTimeText(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  if (!t) return null;
  let m = t.match(/^(\d{1,2})(?:[:h](\d{2})?)?(am|pm)?$/);
  if (!m) {
    const four = t.match(/^(\d{1,2})(\d{2})(am|pm)?$/);
    if (four) m = [four[0], four[1], four[2], four[3]] as unknown as RegExpMatchArray;
  }
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (m[3] && (h < 1 || h > 12)) return null;
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "5 Dec 2026", "14:30", "Friday 5 December 2026, 14:30": an instant in words, in the time zone. */
export function timeWords(at: Date, timeZone: string = DEFAULT_TIME_ZONE) {
  const p = partsIn(at, timeZone);
  const weekday = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  const time = hhmm(p.h * 60 + p.min);
  const short = `${p.d} ${MONTHS[p.m - 1].slice(0, 3)} ${p.y}`;
  return { short, time, shortWithTime: `${short}, ${time}`, long: `${weekday} ${p.d} ${MONTHS[p.m - 1]} ${p.y}, ${time}` };
}
