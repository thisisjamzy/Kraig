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
      const base = { kind: 'project' as const, start: null, end: null, allDay: true, free: false, done: false, project: null, attendees: [], meeting: false, taskId: null, href: `/projects/${p.id}` };
      if (start) add(isoDay(start), { ...base, key: `project:${p.id}:start`, title: `${p.name} starts`, day: isoDay(start) });
      if (end) add(isoDay(end), { ...base, key: `project:${p.id}:end`, title: `${p.name} ends`, day: isoDay(end) });
    }
    for (const pay of payments) {
      add(pay.dueDate, { key: `payment:${pay.id}`, title: pay.title, kind: 'payment', start: null, end: null, allDay: true, day: pay.dueDate, free: false, done: false, project: null, attendees: [], meeting: false, taskId: null, href: '/payments' });
    }
    return map;
  }, [db.projectDocs, payments]);

  /** Tasks on a day (Pending, Done and Cancelled). */
  const tasksOn = useCallback((iso: string) => rowsByDay.get(iso) ?? [], [rowsByDay]);

  /** Everything a calendar draws on a day, with these sources. */
  const itemsOn = useCallback(
    (iso: string, s: CalendarSources = sources): CalItem[] => [
      ...(s.tasks ? tasksOn(iso).filter((r) => r.status !== 'Cancelled' && (s.freeTasks || r.allDay || r.timeMode !== 'free')).map(taskItem) : []),
      ...(s.google ? googleDocs.filter((e) => eventOn(e, iso)).map((e) => googleItem(e, iso)) : []),
      ...(s.projectDates ? (projectDates.get(iso) ?? []) : []),
    ],
    [sources, tasksOn, googleDocs, projectDates]
  );

  /** Puts a task at a time on a day (dropped from a list, or moved or
   * resized on the grid), after the availability check: a blocked task
   * can't overlap other blocked time; free tasks can share. */
  const scheduleAt = useCallback(
    async (taskId: string, iso: string, startMin: number, endMin?: number) => {
      const row = rows.find((r) => r.id === taskId);
      if (!row) throw new Error('That task is outside the dates shown.');
      const length = endMin !== undefined ? endMin - startMin : row.minutes || 60;
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
    [rows, tasksOn, googleDocs, db.actions]
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
    googleCount: googleDocs.length,
    syncEnabled: isCalendarSyncEnabled(),
    calendarName: syncState?.calendarName ?? null,
    loading: db.loading,
  };
}

export type TimeCalendarLogic = ReturnType<typeof useLogic>;
