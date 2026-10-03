// What the Time calendars draw (Today's day timeline, the Calendar's Day,
// Week and Month views): tasks, Google events, project dates and payments
// as one item shape, and the pure layout rules. Tested in
// test/timePages.test.ts.
//
//   Hours shown: from 07:00 (or the first item's hour, if earlier) to
//   20:00 (or the last item's end, if later); "Show full day" shows 00:00
//   to 24:00.
//   An item is at least MIN_MINUTES tall, so a 5-minute task is still
//   tappable; overlapping items share columns (viewmodels/dayLayout.ts).

import { layoutDay, type OverlapGroup } from './dayLayout';

export type CalKind = 'todo' | 'meeting' | 'event' | 'google' | 'project' | 'payment';

export interface CalItem {
  key: string;
  title: string;
  kind: CalKind;
  start: Date | null;
  end: Date | null;
  /** Date-only: drawn in the all-day row. */
  allDay: boolean;
  /** "YYYY-MM-DD" of the day it's on (all-day items, project dates). */
  day: string;
  /** A free task (can share its time): a dashed accent. */
  free: boolean;
  done: boolean;
  project: string | null;
  attendees: string[];
  /** A meeting (a Meeting task, or a Google event with other people). */
  meeting: boolean;
  /** A task's id (it can be dragged, resized and opened in a peek). */
  taskId: string | null;
  /** Where a non-task opens (a Google event's page, a project). */
  href: string | null;
}

export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 20;
export const MIN_MINUTES = 15;
/** Below this width a block's title stays on one line. */
export const NARROW_BLOCK_PX = 80;

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayFromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDay(iso: string, days: number): string {
  const d = dayFromIso(iso);
  return isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

export function mondayOf(iso: string): string {
  return shiftDay(iso, -((dayFromIso(iso).getDay() + 6) % 7));
}

/** Start and end in minutes from the day's midnight, clipped to the day. */
export function spanOn(item: Pick<CalItem, 'start' | 'end'>, iso: string): { startMin: number; endMin: number } | null {
  const start = item.start ?? (item.end ? new Date(item.end.getTime() - 60 * 60000) : null);
  if (!start) return null;
  const end = item.end && item.end > start ? item.end : new Date(start.getTime() + 60 * 60000);
  const dayStart = dayFromIso(iso).getTime();
  const dayEnd = dayStart + 24 * 3600000;
  if (end.getTime() <= dayStart || start.getTime() >= dayEnd) return null;
  const startMin = Math.max(0, Math.round((start.getTime() - dayStart) / 60000));
  const endMin = Math.min(24 * 60, Math.round((end.getTime() - dayStart) / 60000));
  return { startMin, endMin: Math.min(24 * 60, Math.max(endMin, startMin + MIN_MINUTES)) };
}

/** The hours a day (or week) grid shows. */
export function hourRange(spans: { startMin: number; endMin: number }[], fullDay: boolean): { first: number; last: number } {
  if (fullDay) return { first: 0, last: 24 };
  const first = Math.min(DAY_START_HOUR, ...spans.map((s) => Math.floor(s.startMin / 60)));
  const last = Math.max(DAY_END_HOUR, ...spans.map((s) => Math.ceil(s.endMin / 60)));
  return { first: Math.max(0, first), last: Math.min(24, last) };
}

export interface PlacedItem {
  item: CalItem;
  startMin: number;
  endMin: number;
  top: number;
  height: number;
  column: number;
  columnCount: number;
  groupId: string;
}

/** One day's timed items placed on a grid starting at `firstHour`. */
export function placeDay(items: CalItem[], iso: string, firstHour: number, hourHeight: number): { placed: PlacedItem[]; groups: OverlapGroup[] } {
  const timed = items
    .filter((i) => !i.allDay)
    .map((item) => {
      const span = spanOn(item, iso);
      return span ? { id: item.key, item, ...span } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const layout = layoutDay(timed, firstHour, hourHeight);
  const placed = timed.map((t) => {
    const l = layout.byId.get(t.id)!;
    return { item: t.item, startMin: t.startMin, endMin: t.endMin, top: l.top, height: l.height, column: l.column, columnCount: l.columnCount, groupId: l.groupId };
  });
  return { placed, groups: layout.groups };
}

/** Snaps minutes to the nearest step (15 by default), within the day. */
export function snapMinutes(min: number, step = 15): number {
  return Math.max(0, Math.min(24 * 60, Math.round(min / step) * step));
}

/** The all-day row: up to `max` lines per day, then "+N more". */
export function allDayLines<T>(items: T[], expanded: boolean, max = 2): { shown: T[]; more: number } {
  if (expanded || items.length <= max) return { shown: items, more: 0 };
  return { shown: items.slice(0, max), more: items.length - max };
}

/** "28 Sep to 4 Oct 2026" */
export function weekRangeLabel(iso: string): string {
  const mon = dayFromIso(mondayOf(iso));
  const sun = dayFromIso(shiftDay(mondayOf(iso), 6));
  const sameYear = mon.getFullYear() === sun.getFullYear();
  const a = mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  const b = sun.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a} to ${b}`;
}
