// Which tasks go to Google Calendar as Busy blocks, and in what shape —
// pure, so it's tested directly (test/calendarSync.test.ts).
//
// Pushed: timed tasks whose (effective) time mode is blocked — they're what
// stops a scheduling link from offering those times. Free tasks only with
// the "Also mark free tasks as busy on Google" setting. Never: date-only
// todos (allDay), archived (deleted) tasks, cancelled tasks, and tasks that
// are done and already over.
//
// Recurring tasks are sent as one block per date in the window, id
// taskId__yyyyMMdd from the date the rule generated (so a date moved in the
// app keeps its Google copy), deleted and per-date edits respected through
// the recurring model itself (src/shared/tasks/recurringTasks.ts).
//
// Times: task start/end are stored as real instants (Timestamps) and
// recurrences expand in the device's own time zone, so each block is
// formatted in the user's IANA zone (Intl) with its offset
// ("2026-09-28T09:00:00+01:00"), and that zone is sent alongside.

import type { FirestoreTask } from '../firestore/types';
import type { BridgeBlock } from '../calendarBridge/types';
import { expandTasks, type TaskItem } from '../tasks/recurringTasks';
import { effectiveTimeMode } from '../../viewmodels/scheduling';

const DAY_MS = 86_400_000;
export const DEFAULT_PAST_DAYS = 7;
export const DEFAULT_FUTURE_DAYS = 60;
export const MAX_WINDOW_DAYS = 180;

export interface SyncWindow {
  from: Date;
  to: Date;
}

/** The device's IANA time zone ("Europe/London"). */
export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ---- Time zone arithmetic (Intl only, no date library in this repo) ----

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(date: Date, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Minutes the zone is ahead of UTC at that instant (+60 for BST). */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const w = wallClock(date, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const instant = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - instant) / 60000);
}

function pad(n: number, width = 2) {
  return String(Math.abs(n)).padStart(width, '0');
}

/** "2026-09-28T09:00:00+01:00" — the instant as wall-clock time in the zone. */
export function formatIsoWithOffset(date: Date, timeZone: string): string {
  const w = wallClock(date, timeZone);
  const offset = zoneOffsetMinutes(date, timeZone);
  const sign = offset < 0 ? '-' : '+';
  return (
    `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  );
}

/** "YYYY-MM-DD" of the instant in the zone. */
export function zonedDateKey(date: Date, timeZone: string): string {
  const w = wallClock(date, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The instant of 00:00 on that date in the zone (an all-day Google event's
 * start in the calendar's own time zone). */
export function zonedMidnight(key: string, timeZone: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d);
  // Two passes settle the offset even on a day the clocks change.
  let guess = wallAsUtc - zoneOffsetMinutes(new Date(wallAsUtc), timeZone) * 60000;
  guess = wallAsUtc - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess);
}

// ---- The sync window ----

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Start of today minus 7 days to start of today plus 60 days, local time. */
export function defaultSyncWindow(now = new Date()): SyncWindow {
  const today = startOfLocalDay(now);
  return {
    from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - DEFAULT_PAST_DAYS),
    to: new Date(today.getFullYear(), today.getMonth(), today.getDate() + DEFAULT_FUTURE_DAYS),
  };
}

/** A screen's visible range widened to at least the default window. If the
 * union would pass 180 days (browsing far from today), the visible range
 * alone is used, stretched forward to the default window's length. Never
 * longer than 180 days. */
export function widenWindow(visible: SyncWindow | null | undefined, now = new Date()): SyncWindow {
  const base = defaultSyncWindow(now);
  if (!visible) return base;
  const union = {
    from: new Date(Math.min(base.from.getTime(), visible.from.getTime())),
    to: new Date(Math.max(base.to.getTime(), visible.to.getTime())),
  };
  if (union.to.getTime() - union.from.getTime() <= MAX_WINDOW_DAYS * DAY_MS) return union;
  const length = base.to.getTime() - base.from.getTime();
  const to = Math.min(
    Math.max(visible.to.getTime(), visible.from.getTime() + length),
    visible.from.getTime() + MAX_WINDOW_DAYS * DAY_MS
  );
  return { from: visible.from, to: new Date(to) };
}

export function windowToBridge(window: SyncWindow) {
  return { timeMin: window.from.toISOString(), timeMax: window.to.toISOString() };
}

export function splitWindow(window: SyncWindow): [SyncWindow, SyncWindow] {
  const mid = new Date(Math.round((window.from.getTime() + window.to.getTime()) / 2));
  return [
    { from: window.from, to: mid },
    { from: mid, to: window.to },
  ];
}

// ---- Which tasks are pushed ----

export interface PushOptions {
  /** "Also mark free tasks as busy on Google". */
  includeFree: boolean;
  timeZone: string;
  now?: Date;
}

type TaskShape = Pick<FirestoreTask, 'startTime' | 'dueDate'> &
  Partial<Pick<FirestoreTask, 'allDay' | 'timeMode' | 'type' | 'archived' | 'rrule'>>;

/** Could this task (or series) ever be pushed? Timed, not deleted, and
 * blocked (or free, with the setting on). Per-date state (cancelled,
 * done and over) is checked on each occurrence by isPushableOccurrence. */
export function isPushableTask(task: TaskShape, includeFree: boolean): boolean {
  if (task.archived) return false;
  if (!task.startTime || !task.dueDate || task.allDay) return false;
  return includeFree || effectiveTimeMode(task) === 'blocked';
}

/** One task or one date of a series, at `now`. */
export function isPushableOccurrence(task: TaskItem, includeFree: boolean, now: Date): boolean {
  if (!isPushableTask(task, includeFree)) return false;
  if (task.status === 'Cancelled') return false;
  const end = task.dueDate!.toDate();
  if (end <= task.startTime!.toDate()) return false;
  if ((task.done || task.status === 'Done') && end.getTime() <= now.getTime()) return false;
  return true;
}

/** The block id of one date of a series: taskId__yyyyMMdd. */
export function occurrenceBlockId(seriesId: string, occurrenceKey: string): string {
  return `${seriesId}__${occurrenceKey.replace(/-/g, '')}`;
}

export interface BuiltBlocks {
  blocks: BridgeBlock[];
  /** Block id → the task doc it came from (the series for a recurring one). */
  taskIdByBlock: Map<string, string>;
  /** Every task that could be pushed at all (whether or not a date falls
   * in this window) — the rest have no business carrying googleSync. A
   * series counts while it's timed, whatever its mode. */
  pushableTaskIds: Set<string>;
}

/** One task (or date of a series) as the block the bridge takes. */
export function toBridgeBlock(item: TaskItem, id: string, timeZone: string): BridgeBlock {
  const start = item.startTime!.toDate();
  const end = item.dueDate!.toDate();
  const allDay = Boolean(item.allDay);
  const block: BridgeBlock = allDay
    ? {
        id,
        title: item.title,
        start: zonedDateKey(start, timeZone),
        // Exclusive: a one-day block on the 28th ends on the 29th.
        end: addDaysToKey(zonedDateKey(end, timeZone), 1),
        allDay: true,
        timeZone,
      }
    : {
        id,
        title: item.title,
        start: formatIsoWithOffset(start, timeZone),
        end: formatIsoWithOffset(end, timeZone),
        allDay: false,
        timeZone,
      };
  if (item.notes) block.description = item.notes;
  return block;
}

/** Every block that overlaps the window, recurring tasks expanded. */
export function buildBlocks(tasks: FirestoreTask[], window: SyncWindow, options: PushOptions): BuiltBlocks {
  const now = options.now ?? new Date();
  // A series is expanded whatever its mode: one of its dates may have been
  // switched to blocked on its own (isPushableOccurrence decides per date).
  const candidates = tasks.filter((t) =>
    t.rrule ? isPushableTask(t, true) : isPushableTask(t, options.includeFree)
  );
  const pushableTaskIds = new Set(candidates.map((t) => t.id));
  // A day earlier than the window, so a block that starts before it but
  // runs into it is still sent (the bridge would otherwise delete it).
  const items = expandTasks(candidates, new Date(window.from.getTime() - DAY_MS), window.to);
  const blocks: BridgeBlock[] = [];
  const taskIdByBlock = new Map<string, string>();
  for (const item of items) {
    if (!isPushableOccurrence(item, options.includeFree, now)) continue;
    const start = item.startTime!.toMillis();
    const end = item.dueDate!.toMillis();
    if (!(start < window.to.getTime() && end > window.from.getTime())) continue;
    const taskId = item.seriesId ?? item.id;
    const id = item.seriesId && item.occurrenceKey ? occurrenceBlockId(item.seriesId, item.occurrenceKey) : item.id;
    blocks.push(toBridgeBlock(item, id, options.timeZone));
    taskIdByBlock.set(id, taskId);
  }
  blocks.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  return { blocks, taskIdByBlock, pushableTaskIds };
}

/** A fingerprint of what would be pushed — when it changes, a pushable task
 * was created, moved, resized, retitled, deleted or switched mode. */
export function blocksSignature(blocks: BridgeBlock[]): string {
  return blocks
    .map((b) => `${b.id}|${b.start}|${b.end}|${b.title}|${b.allDay ? 1 : 0}`)
    .sort()
    .join('\n');
}
