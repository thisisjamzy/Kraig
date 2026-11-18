// The figures and words of Time v1.0's Today, Tasks and Calendar (Dreda
// v1.0 frames 54460, 53712, 54090 and their phone frames): free time in the
// working day, what is still to plan, how late a task is, and the free
// slots a task fits. Pure, so it can be tested (test/timePages.test.ts).
//
// The working day is 16 hours, 6:00 to 22:00 (the owner's target, 18 Nov
// 2026), until Planning settings lets a person set their own. A task with no length of its own
// (date only, or no date) counts as DEFAULT_TASK_MINUTES when it is placed.

import type { TaskRow, TaskRowStatus } from './taskRow';
import type { TaskStatus } from '@/src/shared/firestore/types';

export const WORKDAY = { startMin: 6 * 60, endMin: 22 * 60 };
export const DEFAULT_TASK_MINUTES = 60;
const DAY = 86_400_000;

export interface Span {
  startMin: number;
  endMin: number;
}

/** "15 min", "1 h", "1 h 30 min". */
export function durationText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** "9:00", "14:30". */
export function clockText(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function minuteText(min: number): string {
  return `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, '0')}`;
}

/** "9:00 to 11:00". */
export function rangeText(start: Date, end: Date | null): string {
  return end && end > start ? `${clockText(start)} to ${clockText(end)}` : clockText(start);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

/** "Yesterday", "3 days late"; null when it is not late by a day. */
export function lateText(date: Date | null, now: Date): string | null {
  if (!date) return null;
  const days = daysBetween(date, now);
  if (days <= 0) return null;
  return days === 1 ? 'Yesterday' : `${days} days late`;
}

/** "Today", "Tomorrow", "Wed 18 Nov". */
export function dayText(date: Date, now: Date): string {
  const days = daysBetween(now, date);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** ISO 8601 week number ("Week 47"). */
export function weekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

/** What the Tasks table's Status column says. A pending task whose block is
 * under way reads In progress; Stuck reads Waiting. */
export function statusText(row: { rawStatus: TaskStatus; status: TaskRowStatus; start: Date | null; end: Date | null; allDay: boolean }, now: Date): string {
  if (row.status === 'Done') return 'Done';
  if (row.status === 'Cancelled') return 'Cancelled';
  if (row.rawStatus === 'Stuck') return 'Waiting';
  if (row.rawStatus === 'In Review') return 'In review';
  if (!row.allDay && row.start && row.end && row.start <= now && row.end > now) return 'In progress';
  return 'To do';
}

/** Has a time block of its own (drawn on the hour grid). */
export function isBlocked(row: Pick<TaskRow, 'allDay' | 'start' | 'end'>): boolean {
  return !row.allDay && Boolean(row.start || row.end);
}

/** Still to plan: pending, no time block (a date-only or undated task). */
export function isToPlan(row: Pick<TaskRow, 'status' | 'allDay' | 'start' | 'end'>): boolean {
  return row.status === 'Pending' && !isBlocked(row);
}

/** Busy time on a day, merged, in minutes from midnight. */
export function busySpans(items: { start: Date | null; end: Date | null; allDay: boolean; free?: boolean; done?: boolean }[], day: Date): Span[] {
  const from = startOfDay(day).getTime();
  const spans: Span[] = [];
  for (const i of items) {
    if (i.allDay || i.free || !(i.start || i.end)) continue;
    const start = i.start ?? new Date(i.end!.getTime() - 60 * 60000);
    const end = i.end && i.end > start ? i.end : new Date(start.getTime() + 60 * 60000);
    const s = Math.max(0, Math.round((start.getTime() - from) / 60000));
    const e = Math.min(24 * 60, Math.round((end.getTime() - from) / 60000));
    if (e > s) spans.push({ startMin: s, endMin: e });
  }
  spans.sort((a, b) => a.startMin - b.startMin);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.startMin <= last.endMin) last.endMin = Math.max(last.endMin, s.endMin);
    else merged.push({ ...s });
  }
  return merged;
}

/** The gaps between busy spans inside [from, to). */
export function freeGaps(busy: Span[], from = WORKDAY.startMin, to = WORKDAY.endMin): Span[] {
  const gaps: Span[] = [];
  let at = from;
  for (const b of busy) {
    if (b.endMin <= at) continue;
    if (b.startMin >= to) break;
    if (b.startMin > at) gaps.push({ startMin: at, endMin: Math.min(b.startMin, to) });
    at = Math.max(at, b.endMin);
  }
  if (at < to) gaps.push({ startMin: at, endMin: to });
  return gaps;
}

export function freeMinutes(busy: Span[], from = WORKDAY.startMin, to = WORKDAY.endMin): number {
  return freeGaps(busy, from, to).reduce((s, g) => s + g.endMin - g.startMin, 0);
}

/** Rounds up to the next quarter hour. */
export function nextQuarter(min: number): number {
  return Math.ceil(min / 15) * 15;
}

export interface SlotOption extends Span {
  iso: string;
  /** "Today", "Wed 18 Nov, first thing" */
  note: string;
}

/** Up to `count` free slots of `length` minutes: the first fit in each gap,
 * day by day. `days` lists each day's busy spans and the minute to start
 * looking from (now, on today). */
export function slotOptions(length: number, days: { iso: string; date: Date; busy: Span[]; from: number; after?: (min: number) => string | null }[], now: Date, count = 3): SlotOption[] {
  const out: SlotOption[] = [];
  for (const d of days) {
    const from = Math.max(WORKDAY.startMin, nextQuarter(d.from));
    for (const g of freeGaps(d.busy, from, WORKDAY.endMin)) {
      if (g.endMin - g.startMin < length) continue;
      const after = g.startMin === WORKDAY.startMin ? 'first thing' : (d.after?.(g.startMin) ?? null);
      out.push({ iso: d.iso, startMin: g.startMin, endMin: g.startMin + length, note: after ? `${dayText(d.date, now)}, ${after}` : dayText(d.date, now) });
      if (out.length >= count) return out;
    }
  }
  return out;
}

/** Where Plan my day puts each task: in order, the first free gap today that
 * fits it, from `fromMin`. Tasks that do not fit stay unplaced. */
export function planDay(tasks: { id: string; minutes: number }[], busy: Span[], fromMin: number): { id: string; startMin: number; endMin: number }[] {
  const spans = busy.map((b) => ({ ...b }));
  const out: { id: string; startMin: number; endMin: number }[] = [];
  const from = Math.max(WORKDAY.startMin, nextQuarter(fromMin));
  for (const t of tasks) {
    const length = t.minutes || DEFAULT_TASK_MINUTES;
    const gap = freeGaps(spans, from, WORKDAY.endMin).find((g) => g.endMin - g.startMin >= length);
    if (!gap) continue;
    const slot = { startMin: gap.startMin, endMin: gap.startMin + length };
    out.push({ id: t.id, ...slot });
    spans.push(slot);
    spans.sort((a, b) => a.startMin - b.startMin);
  }
  return out;
}

// ---- Time v1.0 Home (Dreda v1.0 `Home` 59920, phone 68414) ----

export interface DayLoad {
  /** Minutes of meetings inside the working day. */
  meetingMin: number;
  /** Other blocked time (task blocks, busy events). */
  focusMin: number;
  freeMin: number;
  meetings: number;
  /** The longest free gap and where it starts. */
  longest: Span | null;
  /** No free gap of half an hour or more. */
  full: boolean;
  weekend: boolean;
}

const total = (spans: Span[]) => spans.reduce((s, b) => s + b.endMin - b.startMin, 0);

function clip(spans: Span[], from: number, to: number): Span[] {
  return spans.map((s) => ({ startMin: Math.max(from, s.startMin), endMin: Math.min(to, s.endMin) })).filter((s) => s.endMin > s.startMin);
}

/** How full a day is: meetings, other blocks and free time in the working day. */
export function dayLoad(items: { start: Date | null; end: Date | null; allDay: boolean; free?: boolean; meeting?: boolean }[], day: Date): DayLoad {
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const meetingItems = items.filter((i) => i.meeting);
  const busy = clip(busySpans(items, day), WORKDAY.startMin, WORKDAY.endMin);
  const meetingBusy = clip(busySpans(meetingItems, day), WORKDAY.startMin, WORKDAY.endMin);
  const gaps = freeGaps(busy);
  const longest = gaps.reduce<Span | null>((best, g) => (!best || g.endMin - g.startMin > best.endMin - best.startMin ? g : best), null);
  const meetingMin = total(meetingBusy);
  return {
    meetingMin,
    focusMin: Math.max(0, total(busy) - meetingMin),
    freeMin: total(gaps),
    meetings: meetingItems.filter((i) => !i.allDay && (i.start || i.end)).length,
    longest,
    full: !weekend && !gaps.some((g) => g.endMin - g.startMin >= 30),
    weekend,
  };
}

/** "2 h 40 m": the dashboard's short form. */
export function shortDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h ? (m % 60 ? `${h} h ${m % 60} m` : `${h} h`) : `${m} m`;
}

/** "Good morning", "Good afternoon", "Good evening". */
export function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
