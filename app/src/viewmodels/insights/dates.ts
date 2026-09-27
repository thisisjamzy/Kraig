// Date helpers for Insights — local time throughout.

import type { DateRange, RangeKind } from './types';

export const DAY_MS = 86400000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}
/** Whole calendar days from a to b. */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}
function pad(n: number) {
  return String(n).padStart(2, '0');
}
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** "HH:mm" on a given day. */
export function atTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}

/** Every day in the range, as local midnights. */
export function eachDay(range: DateRange): Date[] {
  const out: Date[] = [];
  for (let d = startOfDay(range.from); d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Today; this week (Monday to Sunday); this month; or a custom span. */
export function rangeFor(kind: RangeKind, now: Date, custom?: { from: string; to: string } | null): DateRange {
  switch (kind) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'month':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case 'custom': {
      if (custom?.from && custom?.to) {
        const a = parseDayKey(custom.from);
        const b = parseDayKey(custom.to);
        return a <= b ? { from: a, to: endOfDay(b) } : { from: b, to: endOfDay(a) };
      }
      return rangeFor('week', now);
    }
    default: {
      const monday = addDays(startOfDay(now), -((now.getDay() + 6) % 7));
      return { from: monday, to: endOfDay(addDays(monday, 6)) };
    }
  }
}

/** The span of the same length just before (for "vs last week"). */
export function previousRange(range: DateRange): DateRange {
  const days = daysBetween(range.from, range.to) + 1;
  return { from: addDays(startOfDay(range.from), -days), to: endOfDay(addDays(range.from, -1)) };
}

export function weekdayName(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

/** "Today", "Tomorrow", or the weekday — for alert headlines. */
export function relativeDayName(d: Date, now: Date): string {
  const diff = daysBetween(now, d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return weekdayName(d);
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
