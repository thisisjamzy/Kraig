'use client';

// A month grid over a day schedule — tasks (placed on an hour timeline by
// their start/end), and projects/payments as all-day items — the Google
// Calendar bridge and the dedicated calendarEvents collection PRD
// Files/PRD-PROJECTS.md section 16 specs are later build steps; this reads
// directly off tasks/projects, which is everything a household's own
// schedule actually needs for now. "Add Event" opens the new task form.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { useSections } from '@/src/shared/firestore/queries';
import { projectsRef, areasRef, plannedPaymentsRef } from '@/src/shared/firestore/refs';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { computeUpcomingPayments } from '@/src/shared/firestore/upcomingPayments';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreProject, FirestoreArea, FirestorePlannedPayment } from '@/src/shared/firestore/types';
import { effectiveTimeMode } from '@/src/viewmodels/scheduling';
import { expandTasks } from '@/src/shared/tasks/recurringTasks';
import { layoutDay } from '@/src/viewmodels/dayLayout';

// Payments are "upcoming from today," not tied to the month being browsed
// (see upcomingPayments.ts's own header — same forward-looking model the
// Payments Calendar screen already uses) — a wide horizon so browsing a few
// months ahead still surfaces them, rather than recomputing per month.
const PAYMENT_HORIZON_DAYS = 400;

// Pixels per hour on the schedule timeline — a 15-minute card is 28px
// (one line), an hour 112px (the full card).
export const HOUR_HEIGHT = 112;
// Cards shorter than this still get this much room, so a 5-minute task is
// tappable — and it's what overlap grouping sees too, so no two cards ever
// cover each other.
const MIN_CARD_MINUTES = 15;
// A legacy task with only a due time: an hour's slot ending at it.
const DUE_ONLY_MINUTES = 60;

export interface MonthCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** Monday-first weeks covering the whole month, padded with the previous
 * and next month's days. */
export function buildMonthGrid(monthCursor: Date): MonthCell[] {
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // days before the 1st back to Monday
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { iso: isoDate(d), day: d.getDate(), inMonth: d.getMonth() === first.getMonth() };
  });
}

export interface ScheduleTask {
  id: string;
  startTime: Date | null;
  dueDate: Date | null;
}

/** The selected day's timeline: every task placed by its start and sized
 * by its real duration (at least MIN_CARD_MINUTES; a legacy task with only
 * a due time gets a DUE_ONLY_MINUTES slot ending at it), overlapping ones
 * grouped into side-by-side columns (viewmodels/dayLayout.ts). The visible
 * hour range always covers 08.00 onward and stretches to fit the day.
 * Pure, so it can be tested and previewed. */
export function buildSchedule<T extends ScheduleTask>(taskItems: T[], selectedDate: string) {
  const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const timed = taskItems.map((task) => {
    const start = task.startTime ?? new Date((task.dueDate as Date).getTime() - DUE_ONLY_MINUTES * 60000);
    const end = task.dueDate && task.dueDate > start ? task.dueDate : new Date(start.getTime() + DUE_ONLY_MINUTES * 60000);
    const startMin = minutes(start);
    // A task running past midnight is drawn to the end of this day.
    const endMin = isoDate(end) === selectedDate ? minutes(end) : 24 * 60;
    return { ...task, startMin, endMin: Math.min(24 * 60, Math.max(endMin, startMin + MIN_CARD_MINUTES)) };
  });
  const firstHour = Math.min(8, ...timed.map((t) => Math.floor(t.startMin / 60)));
  const lastHour = Math.min(24, Math.max(firstHour + 7, ...timed.map((t) => Math.ceil(t.endMin / 60))));
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);
  const layout = layoutDay(timed, firstHour, HOUR_HEIGHT);
  const items = timed.map((item) => ({ ...item, ...layout.byId.get(item.id)!, minutes: item.endMin - item.startMin }));
  return { hours, firstHour, items, groups: layout.groups, height: (lastHour - firstHour) * HOUR_HEIGHT };
}

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateFromSearch(): Date | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('date');
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const today = useMemo(() => new Date(), []);
  // ?date=YYYY-MM-DD opens on that day (Insights' day alerts link here).
  const [initialDay] = useState(dateFromSearch);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = initialDay ?? today;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => isoDate(initialDay ?? today));

  const { data: taskDocs, loading: tasksLoading } = useAllTasks();
  // Recurring tasks as their dates, for the month on screen and one either
  // side (the grid's padding days and the web week view stay covered).
  const tasks = useMemo(
    () =>
      expandTasks(
        taskDocs,
        new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
        new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 2, 0, 23, 59, 59, 999)
      ),
    [taskDocs, monthCursor]
  );
  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(projectsQuery);
  const projects = projectDocs.filter((p) => p.status !== 'Archived');
  const projectName = useMemo(() => new Map(projectDocs.map((p) => [p.id, p.name])), [projectDocs]);

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid)) : null), [uid]);
  const { data: areaDocs } = useFirestoreCollection<FirestoreArea>(areasQuery);
  const areaName = useMemo(() => new Map(areaDocs.map((a) => [a.id, a.name])), [areaDocs]);

  const { data: bucketDocs } = useSections();
  const bucketName = useMemo(() => new Map(bucketDocs.map((b) => [b.id, b.name])), [bucketDocs]);

  const paymentsQuery = useMemo(() => (uid ? query(plannedPaymentsRef(uid)) : null), [uid]);
  const { data: paymentDocs, loading: paymentsLoading } = useFirestoreCollection<FirestorePlannedPayment>(paymentsQuery);
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();
  const payments = useMemo(
    () =>
      computeUpcomingPayments(
        paymentDocs.filter((p) => !p.archived),
        accounts,
        categories,
        ctx,
        PAYMENT_HORIZON_DAYS
      ),
    [paymentDocs, accounts, categories, ctx]
  );

  const daysWithItems = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      const anchor = t.startTime ?? t.dueDate;
      if (anchor) set.add(isoDate(anchor.toDate()));
    }
    for (const p of projects) {
      if (p.startDate) set.add(isoDate(p.startDate.toDate()));
      if (p.endDate) set.add(isoDate(p.endDate.toDate()));
    }
    for (const payment of payments) {
      set.add(payment.dueDate);
    }
    return set;
  }, [tasks, projects, payments]);

  // Pulled out of the `agenda` useMemo below so the same computation can
  // also serve the web week-grid (ProjectsCalendarScreen.web.module.css's
  // JS counterpart), which needs this for 7 days at once, not just
  // `selectedDate` — all off the same already-loaded tasks/projects/
  // payments arrays, no extra Firestore reads either way.
  function buildAgendaForDate(dateIso: string) {
    const now = new Date();
    const taskItems = tasks
      .filter((t) => {
        if (t.status === 'Cancelled') return false;
        const anchor = t.startTime ?? t.dueDate;
        return anchor !== null && anchor !== undefined && isoDate(anchor.toDate()) === dateIso;
      })
      .map((t) => ({
        kind: 'task' as const,
        id: t.id,
        title: t.title,
        emoji: t.emoji ?? null,
        type: t.type ?? 'ToDo',
        priority: t.priority ?? DEFAULT_PRIORITY,
        startTime: t.startTime ? t.startTime.toDate() : null,
        allDay: Boolean(t.allDay),
        timeMode: effectiveTimeMode(t),
        recurring: Boolean(t.seriesId),
        dueDate: t.dueDate ? t.dueDate.toDate() : null,
        done: t.done,
        description: t.notes ?? '',
        overdue: !t.done && ((t.dueDate ?? t.startTime)?.toDate() ?? now) < now,
        status: t.status,
        projectName: t.projectId ? projectName.get(t.projectId) ?? null : null,
        bucketName: t.bucketId ? bucketName.get(t.bucketId) ?? null : null,
        areaName: t.areaId ? areaName.get(t.areaId) ?? null : null,
      }))
      .sort(
        (a, b) => ((a.startTime ?? a.dueDate)?.getTime() ?? 0) - ((b.startTime ?? b.dueDate)?.getTime() ?? 0)
      );
    const projectItems = projects
      .filter(
        (p) =>
          (p.startDate && isoDate(p.startDate.toDate()) === dateIso) ||
          (p.endDate && isoDate(p.endDate.toDate()) === dateIso)
      )
      .map((p) => {
        // A project's end date is its milestone (screen1's "Milestone: ..."
        // agenda row) — its start date is a plainer "starts" entry. The
        // label says what the milestone actually is (project name shown
        // above it, this describes what's happening to it), not just the
        // word "Milestone" on its own.
        const isMilestone = !(p.startDate && isoDate(p.startDate.toDate()) === dateIso);
        return {
          kind: 'project' as const,
          id: p.id,
          title: p.name,
          emoji: p.emoji ?? null,
          label: isMilestone ? 'Project ends' : 'Project starts',
          isMilestone,
        };
      });
    const paymentItems = payments.filter((payment) => payment.dueDate === dateIso);
    return { taskItems, projectItems, paymentItems };
  }

  const agenda = useMemo(
    () => buildAgendaForDate(selectedDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, projects, payments, selectedDate, projectName, bucketName, areaName]
  );

  // The selected day's timeline (buildSchedule above) — recomputed only
  // when the day or its activities change.
  // Date-only tasks (FirestoreTask.allDay) sit with the day's all-day items,
  // not on the hour timeline.
  const allDayTasks = useMemo(() => agenda.taskItems.filter((task) => task.allDay), [agenda]);
  const schedule = useMemo(
    () => buildSchedule(agenda.taskItems.filter((task) => !task.allDay), selectedDate),
    [agenda, selectedDate]
  );

  const monthGrid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  function shiftMonth(delta: number) {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }
  // Tapping a padding day (last/next month) also moves the grid there.
  function pickDate(iso: string) {
    setSelectedDate(iso);
    const d = new Date(`${iso}T00:00:00`);
    if (d.getMonth() !== monthCursor.getMonth() || d.getFullYear() !== monthCursor.getFullYear()) {
      setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }
  function jumpToToday() {
    setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(isoDate(today));
  }

  // "Add Event" — the new task form, on the selected day, as an Event.
  function openAddEvent() {
    router.push(`/tasks/new?date=${selectedDate}&type=Event`);
  }


  // For HeroUI Calendar's onFocusChange (arrow-key/nav-button navigation) —
  // accepts whatever month react-aria's own focus state landed on directly.
  function goToMonth(date: Date) {
    setMonthCursor(new Date(date.getFullYear(), date.getMonth(), 1));
  }
  function selectDay(dateIso: string) {
    setSelectedDate(dateIso);
  }
  function openProject(projectId: string) {
    router.push(`/projects/${projectId}`);
  }
  function openPayment() {
    router.push('/payments');
  }

  return {
    monthCursor,
    goToMonth,
    daysWithItems,
    selectedDate,
    selectDay,
    agenda,
    allDayTasks,
    schedule,
    monthGrid,
    shiftMonth,
    pickDate,
    jumpToToday,
    openAddEvent,
    // Only consumed by the web week-grid (ProjectsCalendarScreen.tsx's
    // isWeb branch) — the mobile single-day agenda above is unaffected.
    agendaForDate: buildAgendaForDate,
    todayIso: isoDate(today),
    openProject,
    openPayment,
    loading: tasksLoading || projectsLoading || paymentsLoading || accountsLoading || categoriesLoading || ctxLoading,
  };
}
