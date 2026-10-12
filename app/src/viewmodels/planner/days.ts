// The planner's calendar: a day is a whole number (days since 1 Jan 1970),
// so plans add, compare and key days without time zones or summer time.
// Weeks start on Monday (weekday 0). Pure.

export type Day = number;

const MS = 86_400_000;
export const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The calendar day of a local date. */
export function dayOf(date: Date): Day {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS);
}

/** A day from year, month (1 to 12) and day of the month. */
export function dayFrom(y: number, m: number, d: number): Day {
  return Math.round(Date.UTC(y, m - 1, d) / MS);
}

/** Local midnight of a day. */
export function dateOf(day: Day): Date {
  const u = new Date(day * MS);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
}

export function ymd(day: Day): { y: number; m: number; d: number } {
  const u = new Date(day * MS);
  return { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate() };
}

/** Monday 0 to Sunday 6. */
export function weekdayOf(day: Day): number {
  return (new Date(day * MS).getUTCDay() + 6) % 7;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-10". */
export function monthKeyOf(day: Day): string {
  const { y, m } = ymd(day);
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** "2026-10-12", for date inputs. */
export function isoOf(day: Day): string {
  const { y, m, d } = ymd(day);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseIso(value: string): Day | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? dayFrom(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

/** "Mon 12 Oct". */
export function dayLabel(day: Day): string {
  const { m, d } = ymd(day);
  return `${WEEKDAY[weekdayOf(day)]} ${d} ${MONTH[m - 1]}`;
}

/** "12 Oct". */
export function shortDay(day: Day): string {
  const { m, d } = ymd(day);
  return `${d} ${MONTH[m - 1]}`;
}
