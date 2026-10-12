// The time plan's engine (Remix/Priorities/priorities-forecasting-brief.md,
// sections 6 and 7). Recurring meetings are the LOCKED layer: they take
// their hours first and can't be moved. Tasks that already have a time are
// booked where they are. The user sets working hours per day and spreads
// the other tasks over what is left (auto-plan, menus or dragging), in
// half-hour steps. A scenario stores only the changed day hours and the
// task allocations. Nothing here touches the calendar. Pure; tested in
// test/planner.test.ts.

import { isoOf, weekdayOf, type Day } from './days';
import type { PlanPriority } from './money';

export interface PlanTask {
  id: string;
  name: string;
  projectId: string | null;
  project: string;
  color: string;
  /** Hours. */
  estimate: number;
  /** False when the task has no estimate of its own (one hour is assumed). */
  estimated?: boolean;
  due: Day | null;
  priority: PlanPriority;
}

export interface PlanMeeting {
  id: string;
  name: string;
  day: Day;
  /** "08:30". */
  time: string;
  hours: number;
}

/** A task that already has a time: planned where it is, not movable here. */
export interface BookedBlock {
  id: string;
  name: string;
  project: string;
  color: string;
  day: Day;
  time: string;
  hours: number;
}

export interface TimeInput {
  today: Day;
  /** Days the inputs cover (at least the longest horizon). */
  days: number;
  /** Monday to Sunday: working hours when a day hasn't been changed. */
  defaultHours: number[];
  meetings: PlanMeeting[];
  booked: BookedBlock[];
  tasks: PlanTask[];
}

export interface Allocation {
  /** taskId:day. */
  id: string;
  taskId: string;
  day: Day;
  hours: number;
}

export type TimeHorizon = 7 | 14;

export interface TimeScenario {
  horizon: TimeHorizon;
  /** "2026-10-12" → hours, where changed. */
  capacity: Record<string, number>;
  allocations: Allocation[];
  /** Changed by the user at least once (until then the page shows an auto-plan). */
  touched?: boolean;
}

export const emptyTimeScenario = (horizon: TimeHorizon = 7): TimeScenario => ({ horizon, capacity: {}, allocations: [] });

const PRIORITY_ORDER: PlanPriority[] = ['Must', 'Should', 'Could'];
const half = (h: number) => Math.floor(h * 2 + 1e-9) / 2;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const daysOf = (input: TimeInput, s: TimeScenario): Day[] => Array.from({ length: s.horizon }, (_, i) => input.today + i);

export const capacityOn = (input: TimeInput, s: TimeScenario, day: Day) => s.capacity[isoOf(day)] ?? input.defaultHours[weekdayOf(day)] ?? 0;
export const meetingsOn = (input: TimeInput, day: Day) => input.meetings.filter((m) => m.day === day);
export const meetingHours = (input: TimeInput, day: Day) => sum(meetingsOn(input, day).map((m) => m.hours));
export const bookedHours = (input: TimeInput, day: Day) => sum(input.booked.filter((b) => b.day === day).map((b) => b.hours));
const allocated = (s: TimeScenario, day: Day, ignore?: string) => sum(s.allocations.filter((a) => a.day === day && a.id !== ignore).map((a) => a.hours));

/** Hours left on a day after meetings, booked tasks and planned chunks (negative: over). */
export function freeOn(input: TimeInput, s: TimeScenario, day: Day, ignore?: string): number {
  return capacityOn(input, s, day) - meetingHours(input, day) - bookedHours(input, day) - allocated(s, day, ignore);
}

/** Hours planned for a task, on or before a day when given. */
export function plannedFor(s: TimeScenario, taskId: string, onOrBefore: Day | null = null): number {
  return sum(s.allocations.filter((a) => a.taskId === taskId && (onOrBefore === null || a.day <= onOrBefore)).map((a) => a.hours));
}

function addHoursTo(allocations: Allocation[], taskId: string, day: Day, hours: number): Allocation[] {
  const id = `${taskId}:${day}`;
  const existing = allocations.find((a) => a.id === id);
  if (existing) return allocations.map((a) => (a.id === id ? { ...a, hours: a.hours + hours } : a));
  return [...allocations, { id, taskId, day, hours }];
}

/** Deadline first, then priority. Fills free hours from today up to each deadline in half hours. Never after a deadline. */
export function autoPlan(input: TimeInput, s: TimeScenario, keep = false): TimeScenario {
  const days = daysOf(input, s);
  const lastDay = days[days.length - 1];
  let next: TimeScenario = { ...s, allocations: keep ? s.allocations.filter((a) => a.day >= input.today) : [] };
  const tasks = [...input.tasks].sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
  for (const t of tasks) {
    let rest = t.estimate - plannedFor(next, t.id);
    const last = t.due === null ? lastDay : Math.min(Math.max(t.due, input.today), lastDay);
    for (let d = input.today; d <= last && rest > 0.01; d++) {
      const take = Math.min(half(freeOn(input, next, d)), rest);
      if (take <= 0) continue;
      next = { ...next, allocations: addHoursTo(next.allocations, t.id, d, take) };
      rest -= take;
    }
  }
  return next;
}

export interface Shortfall {
  task: PlanTask;
  short: number;
  /** The latest weekday on or before the deadline with under 11 h: where to add the hours (null: none). */
  day: Day | null;
}

export function shortfalls(input: TimeInput, s: TimeScenario): Shortfall[] {
  const end = input.today + s.horizon;
  const out: Shortfall[] = [];
  for (const t of input.tasks) {
    if (t.due === null || t.due >= end) continue;
    const short = t.estimate - plannedFor(s, t.id, t.due);
    if (short <= 0.01) continue;
    let day: Day | null = null;
    for (let d = Math.max(t.due, input.today); d >= input.today; d--) {
      if (weekdayOf(d) < 5 && capacityOn(input, s, d) < 11) {
        day = d;
        break;
      }
    }
    out.push({ task: t, short, day });
  }
  return out;
}

// ---- Changes ----

const clampHours = (h: number) => Math.max(0, Math.min(14, h));

export function setCapacity(input: TimeInput, s: TimeScenario, day: Day, hours: number): TimeScenario {
  const h = clampHours(hours);
  const capacity = { ...s.capacity };
  if (h === (input.defaultHours[weekdayOf(day)] ?? 0)) delete capacity[isoOf(day)];
  else capacity[isoOf(day)] = h;
  return { ...s, capacity };
}

/** "Add the hours": raise that day by the shortfall, then plan the rest again. */
export function addTheHours(input: TimeInput, s: TimeScenario, f: Shortfall): TimeScenario {
  if (f.day === null) return s;
  return autoPlan(input, setCapacity(input, s, f.day, capacityOn(input, s, f.day) + f.short), true);
}

/** A task from "To plan" onto a day: what's left of it, up to the day's free hours (at least an hour). */
export function planTaskOn(input: TimeInput, s: TimeScenario, taskId: string, day: Day): { scenario: TimeScenario; over: number } {
  const t = input.tasks.find((x) => x.id === taskId);
  if (!t) return { scenario: s, over: 0 };
  const rest = t.estimate - plannedFor(s, taskId);
  if (rest <= 0.01) return { scenario: s, over: 0 };
  const free = half(freeOn(input, s, day));
  const take = Math.min(rest, Math.max(free, 1));
  return { scenario: { ...s, allocations: addHoursTo(s.allocations, taskId, day, take) }, over: Math.max(0, take - free) };
}

export function moveChunk(s: TimeScenario, allocId: string, day: Day): TimeScenario {
  const a = s.allocations.find((x) => x.id === allocId);
  if (!a || a.day === day) return s;
  const rest = s.allocations.filter((x) => x.id !== allocId);
  return { ...s, allocations: addHoursTo(rest, a.taskId, day, a.hours) };
}

export const removeChunk = (s: TimeScenario, allocId: string): TimeScenario => ({ ...s, allocations: s.allocations.filter((a) => a.id !== allocId) });

export function changeChunk(s: TimeScenario, allocId: string, delta: number): TimeScenario {
  const allocations = s.allocations.map((a) => (a.id === allocId ? { ...a, hours: Math.max(0, a.hours + delta) } : a)).filter((a) => a.hours > 0);
  return { ...s, allocations };
}

// ---- Everything the page shows ----

export interface DayLoad {
  day: Day;
  capacity: number;
  meetings: number;
  /** Booked and planned task hours by project, in task order. */
  parts: { project: string; color: string; hours: number }[];
  total: number;
  free: number;
}

export interface DeadlineRow {
  task: PlanTask;
  plannedInTime: number;
  status: { tone: 'good' | 'bad' | 'neutral'; text: string };
}

export function timePlan(input: TimeInput, s: TimeScenario) {
  const days = daysOf(input, s);
  const end = days[days.length - 1];
  const inRange = (d: Day) => d >= input.today && d <= end;
  const capacity = sum(days.map((d) => capacityOn(input, s, d)));
  const meetings = sum(days.map((d) => meetingHours(input, d)));
  const booked = sum(days.map((d) => bookedHours(input, d)));
  const planned = sum(s.allocations.filter((a) => inRange(a.day)).map((a) => a.hours)) + booked;
  const free = capacity - meetings - planned;
  const toPlan = input.tasks.map((t) => ({ task: t, rest: t.estimate - plannedFor(s, t.id) })).filter((x) => x.rest > 0.01);
  const risks = shortfalls(input, s);
  const over = days.filter((d) => freeOn(input, s, d) < -0.01).map((d) => ({ day: d, by: -freeOn(input, s, d) }));

  const taskById = new Map(input.tasks.map((t) => [t.id, t]));
  const load: DayLoad[] = days.map((d) => {
    const parts = new Map<string, { project: string; color: string; hours: number }>();
    const add = (project: string, color: string, hours: number) => {
      const row = parts.get(project) ?? { project, color, hours: 0 };
      row.hours += hours;
      parts.set(project, row);
    };
    for (const b of input.booked) if (b.day === d) add(b.project, b.color, b.hours);
    for (const a of s.allocations) {
      const t = taskById.get(a.taskId);
      if (a.day === d && t) add(t.project, t.color, a.hours);
    }
    const m = meetingHours(input, d);
    const list = [...parts.values()];
    return { day: d, capacity: capacityOn(input, s, d), meetings: m, parts: list, total: m + sum(list.map((p) => p.hours)), free: freeOn(input, s, d) };
  });

  const dueHours = sum(input.tasks.filter((t) => t.due !== null && t.due <= end).map((t) => t.estimate)) + booked;
  const laterHours = sum(input.tasks.map((t) => t.estimate)) + booked - dueHours;
  const spare = capacity - meetings - dueHours;

  const byProject = new Map<string, { project: string; color: string; hours: number }>();
  for (const dl of load) for (const p of dl.parts) {
    const row = byProject.get(p.project) ?? { ...p, hours: 0 };
    row.hours += p.hours;
    byProject.set(p.project, row);
  }

  const deadlines: DeadlineRow[] = input.tasks.map((t) => {
    const inTime = plannedFor(s, t.id, t.due);
    const short = t.estimate - inTime;
    const ok = short <= 0.01;
    const h = (x: number) => `${Math.round(x * 10) / 10} h`;
    const status: DeadlineRow['status'] =
      t.due === null
        ? ok ? { tone: 'good', text: 'Planned' } : { tone: 'neutral', text: `${h(short)} to plan` }
        : t.due > end
          ? ok ? { tone: 'good', text: 'On track' } : { tone: 'neutral', text: `Due later: ${h(short)} to plan` }
          : ok ? { tone: 'good', text: 'On track' } : { tone: 'bad', text: `Short ${h(short)}` };
    return { task: t, plannedInTime: inTime, status };
  });

  return {
    days,
    end,
    kpis: { capacity, meetings, planned, free, notPlanned: sum(toPlan.map((x) => x.rest)), notPlannedCount: toPlan.length, risks: risks.length },
    toPlan,
    risks,
    over,
    load,
    waterfall: { capacity, meetings, forTasks: capacity - meetings, due: dueHours, spare, later: laterHours },
    byProject: [...byProject.values()].sort((a, b) => b.hours - a.hours),
    deadlines,
  };
}

export type TimePlanView = ReturnType<typeof timePlan>;
