'use client';

// The time plan (/projects/plan): the next two weeks of the user's tasks and
// calendar as the plan's input, the picked scenario's day hours and task
// allocations (src/logic/planner/useScenarios.ts), and the plan
// (src/viewmodels/planner/time.ts).
//   Locked layer: repeating Meeting and Event tasks, and repeating Google
//   events. One-off meetings and tasks that already have a time (blocked
//   tasks) are booked where they are.
//   To plan: open tasks without a time of their own (free tasks), due in
//   the two weeks or overdue, or with an estimate; the estimate is the
//   task's estimateHours (one hour when it has none); the deadline is the
//   due date (overdue: today).
// "Send to calendar" creates a blocked task per planned chunk at the first
// free time that day; "Save capacity" stores the changed hours per weekday.
// Both are confirmed first; nothing else writes.

import { useCallback, useMemo } from 'react';
import { query, setDoc } from 'firebase/firestore';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { useCalendarEvents } from '@/src/shared/hooks/useCalendarEvents';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { insightsSettingsRef, projectsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { expandTasks, isRecurring } from '@/src/shared/tasks/recurringTasks';
import { createTask } from '@/src/shared/firestore/taskWrites';
import { effectiveTimeMode } from '@/src/viewmodels/scheduling';
import { resolveSettings } from '@/src/viewmodels/insights/settings';
import { showToast } from '@/src/widgets/Toast/Toast';
import { useScenarios } from '@/src/logic/planner/useScenarios';
import { dateOf, dayOf, isoOf, weekdayOf, type Day } from '@/src/viewmodels/planner/days';
import {
  addTheHours,
  autoPlan,
  capacityOn,
  changeChunk,
  emptyTimeScenario,
  meetingsOn,
  moveChunk,
  planTaskOn,
  removeChunk,
  setCapacity,
  timePlan,
  type BookedBlock,
  type PlanMeeting,
  type PlanTask,
  type Shortfall,
  type TimeHorizon,
  type TimeInput,
  type TimeScenario,
} from '@/src/viewmodels/planner/time';
import type { FirestoreInsightsSettings, FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';
import { styleGuide } from '@/src/styles/tokens/styleGuide';

const DAYS = 14;
/** Brand colours, one per project in order (the style guide has no others). */
const PALETTE = ['var(--c-primary)', 'var(--c-primary-dark)', 'var(--c-accent)', 'var(--c-primary-mid)', '#9ca3af', '#6b7280'];
const MEETING_TYPES = new Set(['Meeting', 'Event']);

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const hoursBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 3_600_000);

export function useTimePlan() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const tasks = useAllTasks();
  const projects = useFirestoreCollection<FirestoreProject>(useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]));
  const settingsRef = useMemo(() => (uid ? insightsSettingsRef(uid) : null), [uid]);
  const settingsDoc = useFirestoreDoc<FirestoreInsightsSettings>(settingsRef);
  const settings = useMemo(() => resolveSettings(settingsDoc.data), [settingsDoc.data]);
  const today = dayOf(new Date());
  const from = useMemo(() => dateOf(today), [today]);
  const to = useMemo(() => dateOf(today + DAYS), [today]);
  const events = useCalendarEvents(from.getTime(), to.getTime());
  const store = useScenarios(today);
  const stored = store.current.time;
  const scenario: TimeScenario = useMemo(() => ({ ...emptyTimeScenario(), ...stored }), [stored]);
  const touched = Boolean(stored?.allocations?.length || stored?.touched);

  const input: TimeInput = useMemo(() => {
    const projectName = new Map(projects.data.map((p) => [p.id, p.name]));
    const colorOf = new Map<string, string>();
    const color = (project: string) => {
      if (!colorOf.has(project)) colorOf.set(project, PALETTE[colorOf.size % PALETTE.length]);
      return colorOf.get(project)!;
    };
    const inRange = (d: Day) => d >= today && d < today + DAYS;
    const meetings: PlanMeeting[] = [];
    const booked: BookedBlock[] = [];
    const plannable: PlanTask[] = [];
    const open = (t: FirestoreTask) => !t.archived && !t.done && t.status !== 'Done' && t.status !== 'Cancelled';

    for (const t of expandTasks(tasks.data.filter(open), from, to)) {
      if (!open(t)) continue;
      const start = t.startTime?.toDate() ?? null;
      const end = t.dueDate?.toDate() ?? null;
      const project = t.projectId ? (projectName.get(t.projectId) ?? 'Project') : 'No project';
      const timed = start && end && !t.allDay && effectiveTimeMode(t) === 'blocked';
      if (MEETING_TYPES.has(t.type ?? '') && timed) {
        const d = dayOf(start!);
        if (!inRange(d)) continue;
        const block = { id: t.id, name: t.title, day: d, time: hhmm(start!), hours: hoursBetween(start!, end!) };
        if (t.seriesId) meetings.push(block);
        else booked.push({ ...block, project: 'One-off meetings', color: styleGuide.brand.primaryLight });
        continue;
      }
      if (timed) {
        const d = dayOf(start!);
        if (inRange(d)) booked.push({ id: t.id, name: t.title, day: d, time: hhmm(start!), hours: hoursBetween(start!, end!), project, color: color(project) });
        continue;
      }
      if (isRecurring(t) || t.seriesId) continue;
      const due = end ? Math.max(dayOf(end), today) : null;
      const hasEstimate = typeof t.estimateHours === 'number' && t.estimateHours > 0;
      if (due === null ? !hasEstimate : due >= today + DAYS) continue;
      plannable.push({
        id: t.id,
        name: t.title,
        projectId: t.projectId ?? null,
        project,
        color: color(project),
        estimate: hasEstimate ? t.estimateHours! : 1,
        estimated: hasEstimate,
        due,
        priority: t.priority === 'Urgent' || t.priority === 'High' ? 'Must' : t.priority === 'Low' ? 'Could' : 'Should',
      });
    }
    for (const e of events.data) {
      if (e.allDay || e.linkedTaskId || !e.blocksTime) continue;
      const start = e.startAt.toDate();
      const d = dayOf(start);
      if (!inRange(d)) continue;
      const block = { id: e.id, name: e.title, day: d, time: hhmm(start), hours: hoursBetween(start, e.endAt.toDate()) };
      if (e.recurringEventId) meetings.push(block);
      else booked.push({ ...block, project: 'One-off meetings', color: styleGuide.brand.primaryLight });
    }
    const cap = settings.capacityHours;
    const saved = settingsDoc.data?.weekdayHours;
    const defaultHours = saved && saved.length === 7 ? saved : [cap, cap, cap, cap, cap, 0, 0];
    return { today, days: DAYS, defaultHours, meetings: meetings.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)), booked, tasks: plannable };
  }, [tasks.data, projects.data, events.data, settings, settingsDoc.data, today, from, to]);

  // A plan with no allocations yet starts auto-planned (not saved until changed).
  const effective = useMemo(() => (touched ? scenario : autoPlan(input, scenario)), [touched, scenario, input]);
  const view = useMemo(() => timePlan(input, effective), [input, effective]);

  const save = useCallback((time: TimeScenario) => store.update({ time: { ...time, touched: true } }), [store]);

  const actions = {
    setHorizon: (horizon: TimeHorizon) => save({ ...effective, horizon }),
    autoPlan: () => {
      save(autoPlan(input, effective));
      showToast('Tasks spread by deadline');
    },
    clear: () => save({ ...effective, allocations: [] }),
    resetHours: () => save({ ...effective, capacity: {} }),
    setCapacity: (day: Day, hours: number) => save(setCapacity(input, effective, day, hours)),
    addTheHours: (f: Shortfall) => {
      if (f.day === null) return;
      save(addTheHours(input, effective, f));
      showToast(`Added ${Math.round(f.short * 10) / 10} h on ${isoOf(f.day) === isoOf(today) ? 'today' : dateOf(f.day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`);
    },
    planTaskOn: (taskId: string, day: Day) => {
      const r = planTaskOn(input, effective, taskId, day);
      save(r.scenario);
      if (r.over > 0) showToast(`That day is now over your hours by ${Math.round(r.over * 10) / 10} h`);
    },
    moveChunk: (allocId: string, day: Day) => save(moveChunk(effective, allocId, day)),
    removeChunk: (allocId: string) => save(removeChunk(effective, allocId)),
    changeChunk: (allocId: string, delta: number) => save(changeChunk(effective, allocId, delta)),
  };

  // ---- From plan to reality ----
  const workStart = settings.workStart ?? '08:00';
  /** Each planned chunk at the first free time that day, after meetings and booked tasks. */
  const calendarBlocks = useMemo(() => {
    const taskById = new Map(input.tasks.map((t) => [t.id, t]));
    const raw = new Map(tasks.data.map((t) => [t.id, t]));
    const out: { taskId: string; title: string; start: Date; end: Date; projectId: string | null; areaId: string | null; bucketId: string | null }[] = [];
    for (const d of view.days) {
      const busy = [...meetingsOn(input, d), ...input.booked.filter((b) => b.day === d)]
        .map((b) => {
          const [h, m] = b.time.split(':').map(Number);
          return { from: h * 60 + m, to: h * 60 + m + b.hours * 60 };
        })
        .sort((a, b) => a.from - b.from);
      const [sh, sm] = workStart.split(':').map(Number);
      let cursor = sh * 60 + (sm || 0);
      for (const a of effective.allocations.filter((x) => x.day === d)) {
        const t = taskById.get(a.taskId);
        if (!t) continue;
        const length = a.hours * 60;
        for (const b of busy) if (cursor < b.to && cursor + length > b.from) cursor = Math.max(cursor, b.to);
        const start = dateOf(d);
        start.setMinutes(cursor);
        const end = new Date(start.getTime() + length * 60_000);
        const r = raw.get(t.id);
        out.push({ taskId: t.id, title: t.name, start, end, projectId: r?.projectId ?? null, areaId: r?.areaId ?? null, bucketId: r?.bucketId ?? null });
        busy.push({ from: cursor, to: cursor + length });
        busy.sort((x, y) => x.from - y.from);
        cursor += length;
      }
    }
    return out;
  }, [view.days, input, effective.allocations, tasks.data, workStart]);

  const sendToCalendar = useCallback(async () => {
    if (!uid) return;
    let done = 0;
    for (const b of calendarBlocks) {
      try {
        await createTask(uid, {
          title: b.title,
          emoji: null,
          type: 'ToDo',
          priority: 'Medium',
          projectId: b.projectId,
          areaId: b.areaId,
          bucketId: b.bucketId,
          startTime: b.start,
          dueDate: b.end,
          timeMode: 'blocked',
          notes: 'Planned in the time plan.',
          createdBy: uid,
        });
        done += 1;
      } catch {
        // Reported below.
      }
    }
    showToast(done === calendarBlocks.length ? `${done} block${done === 1 ? '' : 's'} added to your calendar` : `${done} of ${calendarBlocks.length} blocks added. Try again for the rest.`);
  }, [uid, calendarBlocks]);

  /** The changed days, as hours per weekday (the last change wins). */
  const capacityChanges = useMemo(() => {
    const out = new Map<number, number>();
    for (const d of view.days) if (isoOf(d) in effective.capacity) out.set(weekdayOf(d), capacityOn(input, effective, d));
    return [...out.entries()].sort(([a], [b]) => a - b);
  }, [view.days, effective, input]);

  const saveCapacity = useCallback(async () => {
    if (!settingsRef) return;
    const next = [...input.defaultHours];
    for (const [wd, h] of capacityChanges) next[wd] = h;
    await setDoc(settingsRef, { weekdayHours: next }, { merge: true });
    save({ ...effective, capacity: {} });
    showToast('Working hours saved');
  }, [settingsRef, input.defaultHours, capacityChanges, effective, save]);

  return {
    loading: tasks.loading || projects.loading || settingsDoc.loading || store.loading,
    input,
    scenario: effective,
    view,
    store,
    actions,
    calendarBlocks,
    sendToCalendar,
    capacityChanges,
    saveCapacity,
  };
}

export type TimePlanLogic = ReturnType<typeof useTimePlan>;
