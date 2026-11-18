'use client';

// The data behind Today and the Calendar: one selected date (?date= opens
// on a day), the Tasks database's rows for the months around it (recurring
// tasks expanded), Google Calendar events, project start and end dates and
// planned payments, all as calendar items (viewmodels/calendarItems.ts).
// Opening the page, or moving to another month, syncs with Google for that
// range. Task writes come from the Tasks database (logic/tasksDb).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { query } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { calendarSyncStateRef, plannedPaymentsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { computeUpcomingPayments } from '@/src/shared/firestore/upcomingPayments';
import { useCalendarEvents } from '@/src/shared/hooks/useCalendarEvents';
import { isCalendarSyncEnabled, runCalendarSync } from '@/src/shared/calendarSync/runner';
import type { SyncWindow } from '@/src/shared/calendarSync/blocks';
import { expandTasks } from '@/src/shared/tasks/recurringTasks';
import { useTasksDb } from '@/src/logic/tasksDb/useTasksDb';
import { dayFromIso, isoDay, type CalItem } from '@/src/viewmodels/calendarItems';
import type { TaskRow } from '@/src/viewmodels/taskRow';
import { checkAvailability, type ScheduledTask } from '@/src/viewmodels/scheduling';
import { busySpans, DEFAULT_TASK_MINUTES, freeMinutes, isBlocked, isToPlan, planDay, slotOptions, type SlotOption } from '@/src/viewmodels/todayPlan';
import { labelHue, PRIORITY_RANK } from '@/src/viewmodels/projects';
import { typeLook } from '@/src/viewmodels/taskTypes';
import { schedulingStore, useScheduling } from '@/src/logic/schedulingLinks/store';
import { bookingWhen, type Booking, type SchedLink } from '@/src/viewmodels/scheduling-links';
import type { FirestoreCalendarEvent, FirestoreCalendarSyncState, FirestorePlannedPayment } from '@/src/shared/firestore/types';

const PAYMENT_HORIZON_DAYS = 400;

/** What a calendar shows (the Calendar's filter; Today shows everything). */
export interface CalendarSources {
  tasks: boolean;
  freeTasks: boolean;
  google: boolean;
  projectDates: boolean;
}

export const ALL_SOURCES: CalendarSources = { tasks: true, freeTasks: true, google: true, projectDates: true };

function dateFromSearch(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('date');
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function taskItem(row: TaskRow): CalItem {
  return {
    key: row.id,
    title: row.title,
    kind: row.type === 'Meeting' ? 'meeting' : row.type === 'Event' ? 'event' : 'todo',
    start: row.start,
    end: row.end,
    allDay: row.allDay || (!row.start && !row.end),
    day: row.date ? isoDay(row.date) : '',
    free: !row.allDay && row.timeMode === 'free',
    done: row.done,
    project: row.projectName,
    attendees: [],
    meeting: row.type === 'Meeting',
    taskId: row.id,
    href: null,
    hue: row.done ? 'grey' : row.projectColor ? labelHue(row.projectColor) : typeLook(row.typeName).hue,
  };
}

function googleItem(e: FirestoreCalendarEvent, iso: string): CalItem {
  return {
    key: `google:${e.id}`,
    title: e.title || 'Busy',
    kind: 'google',
    start: e.startAt.toDate(),
    end: e.endAt.toDate(),
    allDay: e.allDay,
    day: iso,
    free: !e.blocksTime,
    done: false,
    project: null,
    attendees: (e.attendees ?? []).filter((a) => a.name || a.email).map((a) => a.name || a.email!),
    meeting: e.kind === 'meeting',
    taskId: null,
    href: `/projects/calendar/events/${encodeURIComponent(e.id)}`,
    hue: 'blue',
  };
}

/** Does a Google event fall on this day? All-day ones cover every day to their (exclusive) end. */
function eventOn(e: FirestoreCalendarEvent, iso: string): boolean {
  const start = e.startAt.toDate();
  if (!e.allDay) return isoDay(start) === iso;
  const dayStart = dayFromIso(iso).getTime();
  return start.getTime() < dayStart + 86_400_000 && e.endAt.toMillis() > dayStart;
}

export function useLogic({ sources = ALL_SOURCES }: { sources?: CalendarSources } = {}) {
  const db = useTasksDb();
  const uid = db.uid;
  const [today] = useState(() => isoDay(new Date()));
  const [selected, setSelected] = useState(() => dateFromSearch() ?? isoDay(new Date()));

  // The selected month and one either side.
  const monthKey = selected.slice(0, 7);
  const range: SyncWindow = useMemo(() => {
    const d = dayFromIso(`${monthKey}-01`);
    return { from: new Date(d.getFullYear(), d.getMonth() - 1, 1), to: new Date(d.getFullYear(), d.getMonth() + 2, 1) };
  }, [monthKey]);

  useEffect(() => {
    if (uid) void runCalendarSync({ reason: 'calendar-open', window: range });
  }, [uid, range]);

  const { data: googleDocs } = useCalendarEvents(range.from.getTime(), range.to.getTime());
  const { data: syncState } = useFirestoreDoc<FirestoreCalendarSyncState>(useMemo(() => (uid ? calendarSyncStateRef(uid) : null), [uid]));

  const { data: paymentDocs } = useFirestoreCollection<FirestorePlannedPayment>(useMemo(() => (uid ? query(plannedPaymentsRef(uid)) : null), [uid]));
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { ctx } = useCurrencyContext();
  const payments = useMemo(
    () => computeUpcomingPayments(paymentDocs.filter((p) => !p.archived), accounts, categories, ctx, PAYMENT_HORIZON_DAYS),
    [paymentDocs, accounts, categories, ctx]
  );

  // Every task in the range, as rows, by day.
  const rows = useMemo(() => {
    const now = new Date();
    return expandTasks(db.taskDocs, range.from, new Date(range.to.getTime() - 1)).map((t) => db.toRow(t, now));
  }, [db, range]);
  const rowsByDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const r of rows) {
      if (!r.date) continue;
      const key = isoDay(r.date);
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    for (const list of map.values()) list.sort((a, b) => (a.start ?? a.end ?? a.date!).getTime() - (b.start ?? b.end ?? b.date!).getTime());
    return map;
  }, [rows]);

  const projectDates = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    const add = (iso: string, item: CalItem) => map.set(iso, [...(map.get(iso) ?? []), item]);
    for (const p of db.projectDocs) {
      if (p.status === 'Archived') continue;
      const start = p.startDate?.toDate();
      const end = p.endDate?.toDate();
      const base = { hue: 'purple' as const, kind: 'project' as const, start: null, end: null, allDay: true, free: false, done: false, project: null, attendees: [], meeting: false, taskId: null, href: `/projects/${p.id}` };
      if (start) add(isoDay(start), { ...base, key: `project:${p.id}:start`, title: `${p.name} starts`, day: isoDay(start) });
      if (end) add(isoDay(end), { ...base, key: `project:${p.id}:end`, title: `${p.name} ends`, day: isoDay(end) });
    }
    for (const pay of payments) {
      add(pay.dueDate, { key: `payment:${pay.id}`, title: pay.title, hue: 'amber', kind: 'payment', start: null, end: null, allDay: true, day: pay.dueDate, free: false, done: false, project: null, attendees: [], meeting: false, taskId: null, href: '/payments' });
    }
    return map;
  }, [db.projectDocs, payments]);

  // Bookings made on scheduling links (kept in the scheduling store until
  // BUILD-KIT section 7.7): requested and confirmed ones are on the grid.
  const scheduling = useScheduling();
  const bookingItems = useCallback(
    (iso: string): CalItem[] =>
      scheduling.bookings
        .filter((b) => b.status !== 'declined' && isoDay(b.at) === iso)
        .map((b) => {
          const link = scheduling.links.find((l) => l.id === b.linkId);
          const minutes = link?.minutes ?? 30;
          return {
            key: `booking:${b.id}`,
            title: `${b.name.split(/\s+/)[0]}, ${(link?.name ?? 'booking').toLowerCase()}`,
            kind: 'meeting' as const,
            start: b.at,
            end: new Date(b.at.getTime() + minutes * 60000),
            allDay: false,
            day: iso,
            free: false,
            done: false,
            project: null,
            attendees: [b.name],
            meeting: true,
            taskId: null,
            href: null,
            hue: link?.hue ?? 'blue',
            bookingId: b.id,
            toConfirm: b.status === 'requested',
          };
        }),
    [scheduling]
  );

  /** Tasks on a day (Pending, Done and Cancelled). */
  const tasksOn = useCallback((iso: string) => rowsByDay.get(iso) ?? [], [rowsByDay]);

  /** Everything a calendar draws on a day, with these sources. */
  const itemsOn = useCallback(
    (iso: string, s: CalendarSources = sources): CalItem[] => [
      ...(s.tasks ? tasksOn(iso).filter((r) => r.status !== 'Cancelled' && (s.freeTasks || r.allDay || r.timeMode !== 'free')).map(taskItem) : []),
      ...(s.google ? googleDocs.filter((e) => eventOn(e, iso)).map((e) => googleItem(e, iso)) : []),
      ...(s.projectDates ? (projectDates.get(iso) ?? []) : []),
      ...(s.google ? bookingItems(iso) : []),
    ],
    [sources, tasksOn, googleDocs, projectDates, bookingItems]
  );

  /** Puts a task at a time on a day (dropped from a list, or moved or
   * resized on the grid), after the availability check: a blocked task
   * can't overlap other blocked time; free tasks can share. */
  const scheduleAt = useCallback(
    async (taskId: string, iso: string, startMin: number, endMin?: number) => {
      const row = rows.find((r) => r.id === taskId) ?? db.actionable.find((r) => r.id === taskId);
      if (!row) throw new Error('That task is outside the dates shown.');
      const length = endMin !== undefined ? endMin - startMin : row.minutes || DEFAULT_TASK_MINUTES;
      const day = dayFromIso(iso);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, startMin);
      const end = new Date(start.getTime() + length * 60000);
      const others: ScheduledTask[] = [
        ...tasksOn(iso)
          .filter((r) => r.status !== 'Cancelled' && !r.allDay)
          .map((r) => ({ id: r.id, title: r.title, start: r.start, end: r.end, mode: r.timeMode, allDay: false, seriesId: r.seriesId ?? undefined })),
        ...googleDocs
          .filter((e) => !e.allDay && e.blocksTime && eventOn(e, iso))
          .map((e) => ({ id: `google:${e.id}`, title: e.title, start: e.startAt.toDate(), end: e.endAt.toDate(), mode: 'blocked' as const, allDay: false, source: 'google' as const })),
      ];
      const check = checkAvailability(start, end, row.timeMode, row.id, others);
      if (check.status === 'conflict') {
        const clash = check.overlappingTasks[0]?.title ?? 'blocked time';
        const slot = check.suggestions[0];
        const at = slot ? ` Try ${slot.start.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}.` : '';
        throw new Error(`That time overlaps ${clash}.${at}`);
      }
      await db.actions.setTimes(row, start, end, false);
    },
    [rows, db.actionable, tasksOn, googleDocs, db.actions]
  );

  // ---- Time v1.0: overdue, to plan, free time (viewmodels/todayPlan.ts) ----

  /** Pending tasks from before today, oldest first. */
  const overdue = useMemo(() => [...db.overdueEarlier].sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0)), [db.overdueEarlier]);
  const overdueIds = useMemo(() => new Set(overdue.map((r) => r.id)), [overdue]);
  /** Pending tasks with no time block, not overdue: dated first, by date and
   * priority, then undated. */
  const toPlan = useMemo(
    () =>
      db.actionable
        .filter((r) => isToPlan(r) && !overdueIds.has(r.id))
        .sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
    [db.actionable, overdueIds]
  );
  /** Busy time on a day: timed items that block it. */
  const busyOn = useCallback((iso: string) => busySpans(itemsOn(iso, ALL_SOURCES), dayFromIso(iso)), [itemsOn]);
  const freeOn = useCallback((iso: string) => freeMinutes(busyOn(iso)), [busyOn]);

  /** Moves tasks to today, same times of day. */
  const moveToToday = useCallback(
    async (list: TaskRow[]) => {
      for (const r of list) await db.actions.setDate(r, dayFromIso(today));
    },
    [db.actions, today]
  );

  /** Plan my day: overdue tasks with no time block, then to-plan tasks due
   * today, go into today's free time from now, in order, each its own
   * length or an hour. Undated tasks stay in the tray. Returns how many
   * were placed. */
  const planMyDay = useCallback(async () => {
    const now = new Date();
    const todayStart = dayFromIso(today);
    const candidates = [...overdue.filter((r) => !isBlocked(r)), ...toPlan.filter((r) => r.date !== null && r.date <= todayStart)];
    const placed = planDay(
      candidates.map((r) => ({ id: r.id, minutes: r.minutes })),
      busyOn(today),
      now.getHours() * 60 + now.getMinutes()
    );
    const byId = new Map(candidates.map((r) => [r.id, r]));
    for (const p of placed) {
      const row = byId.get(p.id)!;
      await db.actions.setTimes(row, new Date(todayStart.getTime() + p.startMin * 60000), new Date(todayStart.getTime() + p.endMin * 60000), false);
    }
    return placed.length;
  }, [overdue, toPlan, busyOn, today, db.actions]);

  /** Adds minutes to the end of a task's block (with the availability check). */
  const extend = useCallback(
    async (taskId: string, minutes: number) => {
      const row = rows.find((r) => r.id === taskId);
      if (!row?.start || !row.end || !row.date) return;
      const iso = isoDay(row.date);
      const from = row.date.getTime();
      await scheduleAt(taskId, iso, Math.round((row.start.getTime() - from) / 60000), Math.round((row.end.getTime() - from) / 60000) + minutes);
    },
    [rows, scheduleAt]
  );

  /** Free slots a task fits, today and the next six days. */
  const slotsFor = useCallback(
    (row: TaskRow, count = 3): SlotOption[] => {
      const now = new Date();
      const length = row.minutes || DEFAULT_TASK_MINUTES;
      const days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        const iso = isoDay(date);
        const items = itemsOn(iso, ALL_SOURCES).filter((it) => !it.allDay && it.start);
        return {
          iso,
          date,
          busy: busySpans(items, date),
          from: i === 0 ? now.getHours() * 60 + now.getMinutes() : 0,
          after: (min: number) => {
            const before = items.filter((it) => it.end && Math.round((it.end.getTime() - date.getTime()) / 60000) === min)[0];
            return before ? `after ${before.title}` : null;
          },
        };
      });
      return slotOptions(length, days, now, count);
    },
    [itemsOn]
  );

  /** A booking and its link, for the booking request. */
  const bookingOf = useCallback(
    (id: string): { booking: Booking; link: SchedLink | null } | null => {
      const booking = scheduling.bookings.find((b) => b.id === id);
      return booking ? { booking, link: scheduling.links.find((l) => l.id === booking.linkId) ?? null } : null;
    },
    [scheduling]
  );

  /** Confirm, decline or ask for a new time: sets the booking's status and
   * opens an email to the booker (sending it from Dreda waits on BUILD-KIT
   * section 7.8). */
  const answerBooking = useCallback(
    (id: string, answer: 'confirm' | 'decline' | 'newTime') => {
      const found = bookingOf(id);
      if (!found) return;
      const { booking, link } = found;
      const what = `${link?.name ?? 'Your booking'}, ${bookingWhen(booking.at)}`;
      if (answer !== 'newTime') schedulingStore.setBooking(id, answer === 'confirm' ? 'confirmed' : 'declined');
      const subject = answer === 'confirm' ? `Confirmed: ${what}` : answer === 'decline' ? `Sorry, I can't make ${what}` : `A new time for ${what}`;
      const body =
        answer === 'confirm'
          ? `Hi ${booking.name.split(/\s+/)[0]},\n\nYou're booked: ${what}.`
          : answer === 'decline'
            ? `Hi ${booking.name.split(/\s+/)[0]},\n\nI can't make ${what}. Sorry about that.`
            : `Hi ${booking.name.split(/\s+/)[0]},\n\nCould we find another time than ${what}?`;
      if (booking.email) window.open(`mailto:${booking.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank', 'noopener');
    },
    [bookingOf]
  );

  const countOn = useCallback((iso: string) => itemsOn(iso, ALL_SOURCES).length, [itemsOn]);
  const hasItems = useCallback((iso: string) => countOn(iso) > 0, [countOn]);

  return {
    db,
    today,
    selected,
    pick: setSelected,
    goToday: () => setSelected(today),
    range,
    rows,
    tasksOn,
    itemsOn,
    countOn,
    hasItems,
    scheduleAt,
    overdue,
    toPlan,
    busyOn,
    freeOn,
    moveToToday,
    planMyDay,
    extend,
    slotsFor,
    bookingOf,
    answerBooking,
    googleCount: googleDocs.length,
    syncEnabled: isCalendarSyncEnabled(),
    calendarName: syncState?.calendarName ?? null,
    loading: db.loading,
  };
}

export type TimeCalendarLogic = ReturnType<typeof useLogic>;
