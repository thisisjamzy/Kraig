// Insights metrics — every formula on the Insights screen, as pure
// functions over InsightTask/InsightProject (types.ts). All take the range
// and "now" explicitly so they're testable and cacheable.
//
// Conventions:
//   - A task's due moment is its end (or its start when it has no end).
//   - "Due in range" = due inside the range; a pending task only counts once
//     its due moment has passed (a task due later today isn't "not done"
//     yet). Cancelled tasks are left out of rates unless stated.
//   - Hours come from timed tasks only (all-day ones have no hours).

import type { Quadrant } from '../../shared/firestore/types';
import { DAY_MS, addDays, atTime, daysBetween, dayKey, eachDay, endOfDay, startOfDay } from './dates';
import type { DateRange, InsightMilestone, InsightProject, InsightTask } from './types';
import type { InsightsSettings } from './settings';

export interface Rate {
  numerator: number;
  denominator: number;
  /** 0 to 1, or null when there's nothing to measure. */
  value: number | null;
}

function rate(numerator: number, denominator: number): Rate {
  return { numerator, denominator, value: denominator > 0 ? numerator / denominator : null };
}

export function dueAt(task: InsightTask): Date | null {
  return task.end ?? task.start;
}

function within(d: Date | null, range: DateRange): d is Date {
  return d !== null && d >= range.from && d <= range.to;
}

/** Estimated minutes: end − start, for a timed task. */
export function estimateMinutes(task: InsightTask): number | null {
  if (task.allDay || !task.start || !task.end) return null;
  const minutes = (task.end.getTime() - task.start.getTime()) / 60000;
  return minutes > 0 ? minutes : null;
}

// ---------------------------------------------------------------------------
// Productivity

/** Tasks due in the range (pending ones once their due moment passed). */
export function dueTasks(tasks: InsightTask[], range: DateRange, now: Date): InsightTask[] {
  return tasks.filter((t) => {
    const due = dueAt(t);
    if (!within(due, range)) return false;
    return t.status !== 'pending' || due <= now;
  });
}

/** done / (done + pending that were due), cancelled excluded. */
export function completionRate(tasks: InsightTask[], range: DateRange, now: Date): Rate {
  const due = dueTasks(tasks, range, now).filter((t) => t.status !== 'cancelled');
  return rate(due.filter((t) => t.status === 'done').length, due.length);
}

/** Done on or before their end / done. */
export function onTimeRate(tasks: InsightTask[], range: DateRange, now: Date): Rate {
  const done = dueTasks(tasks, range, now).filter((t) => t.status === 'done');
  const onTime = done.filter((t) => {
    const due = dueAt(t);
    return !t.completedAt || !due || t.completedAt.getTime() <= (t.allDay ? endOfDay(due).getTime() : due.getTime());
  });
  return rate(onTime.length, done.length);
}

/** Pending tasks whose end has passed. */
export function overdueTasks(tasks: InsightTask[], now: Date): InsightTask[] {
  return tasks.filter((t) => {
    const due = dueAt(t);
    return t.status === 'pending' && due !== null && due < now;
  });
}

/** Cancelled / all due in range. */
export function cancellationRate(tasks: InsightTask[], range: DateRange, now: Date): Rate {
  const due = dueTasks(tasks, range, now);
  return rate(due.filter((t) => t.status === 'cancelled').length, due.length);
}

/** Rescheduled (later) at least once / all due in range. */
export function rescheduleRate(tasks: InsightTask[], range: DateRange, now: Date): Rate {
  const due = dueTasks(tasks, range, now);
  return rate(due.filter((t) => t.rescheduled).length, due.length);
}

export interface DayStat {
  key: string;
  date: Date;
  /** Everything scheduled for the day, cancelled excluded. */
  planned: number;
  done: number;
  cancelled: number;
  /** Done / (done + pending that were due) — null for a day with nothing due yet. */
  rate: number | null;
}

export function dayStats(tasks: InsightTask[], range: DateRange, now: Date): DayStat[] {
  const byDay = new Map<string, InsightTask[]>();
  for (const t of tasks) {
    const due = dueAt(t);
    if (!within(due, range)) continue;
    const key = dayKey(due);
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }
  return eachDay(range).map((date) => {
    const key = dayKey(date);
    const list = byDay.get(key) ?? [];
    const live = list.filter((t) => t.status !== 'cancelled');
    const done = live.filter((t) => t.status === 'done').length;
    const dueSoFar = live.filter((t) => t.status === 'done' || (dueAt(t) as Date) <= now).length;
    return {
      key,
      date,
      planned: live.length,
      done,
      cancelled: list.length - live.length,
      rate: dueSoFar > 0 ? done / dueSoFar : null,
    };
  });
}

/**
 * Consecutive days (back from today) with at least `percent`% of that day's
 * tasks done. Days with nothing scheduled are skipped rather than breaking
 * it; today only counts once it's reached the bar (it can't break it yet).
 */
export function currentStreak(tasks: InsightTask[], now: Date, percent = 80, lookbackDays = 366): number {
  const live = tasks.filter((t) => t.status !== 'cancelled');
  const byDay = new Map<string, InsightTask[]>();
  for (const t of live) {
    const due = dueAt(t);
    if (!due) continue;
    const key = dayKey(due);
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }
  let streak = 0;
  for (let i = 0; i < lookbackDays; i++) {
    const day = addDays(startOfDay(now), -i);
    const list = byDay.get(dayKey(day)) ?? [];
    if (list.length === 0) continue;
    const ratio = list.filter((t) => t.status === 'done').length / list.length;
    if (ratio * 100 >= percent) streak += 1;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Time

interface Interval {
  start: number;
  end: number;
}

function union(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

function totalMinutes(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0) / 60000;
}

/** Minutes covered by two or more of the intervals at once. */
function overlapMinutes(intervals: Interval[]): number {
  const events: [number, number][] = [];
  for (const i of intervals) {
    if (i.end <= i.start) continue;
    events.push([i.start, 1], [i.end, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let depth = 0;
  let last = 0;
  let total = 0;
  for (const [at, delta] of events) {
    if (depth >= 2) total += at - last;
    depth += delta;
    last = at;
  }
  return total / 60000;
}

export interface TimelineWindow {
  id: string;
  title: string;
  start: Date;
  end: Date;
  mode: 'blocked' | 'free';
}

export interface DayLoad {
  key: string;
  date: Date;
  /** Union of every timed window — overlapping free tasks count once. */
  scheduledMinutes: number;
  /** Hours in blocked tasks. */
  blockedMinutes: number;
  /** Scheduled hours not covered by a blocked task. */
  freeMinutes: number;
  /** Hours where two or more free tasks overlap. */
  multitaskMinutes: number;
  doFirstCount: number;
  /** Longest gap inside working hours (only meaningful with work in them). */
  longestBreakMinutes: number;
  workMinutes: number;
  windows: TimelineWindow[];
  /** Stacked free windows (for the day timeline). */
  stacked: { start: Date; end: Date }[];
}

export function dayLoad(tasks: InsightTask[], day: Date, settings: Pick<InsightsSettings, 'workStart' | 'workEnd'>): DayLoad {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + DAY_MS;
  const live = tasks.filter((t) => t.status !== 'cancelled');
  const windows: TimelineWindow[] = [];
  for (const t of live) {
    if (t.allDay || !t.start || !t.end) continue;
    const start = Math.max(t.start.getTime(), dayStart);
    const end = Math.min(t.end.getTime(), dayEnd);
    if (end <= start) continue;
    windows.push({ id: t.id, title: t.title, start: new Date(start), end: new Date(end), mode: t.mode });
  }
  const toInterval = (w: TimelineWindow) => ({ start: w.start.getTime(), end: w.end.getTime() });
  const all = union(windows.map(toInterval));
  const blocked = union(windows.filter((w) => w.mode === 'blocked').map(toInterval));
  const freeIntervals = windows.filter((w) => w.mode === 'free').map(toInterval);
  const scheduledMinutes = totalMinutes(all);
  const blockedMinutes = totalMinutes(blocked);

  // Stacked free windows, for the timeline strip.
  const events: [number, number][] = [];
  for (const i of freeIntervals) events.push([i.start, 1], [i.end, -1]);
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const stacked: { start: Date; end: Date }[] = [];
  let depth = 0;
  let openAt = 0;
  for (const [at, delta] of events) {
    const before = depth;
    depth += delta;
    if (before < 2 && depth >= 2) openAt = at;
    if (before >= 2 && depth < 2 && at > openAt) stacked.push({ start: new Date(openAt), end: new Date(at) });
  }

  // Breaks inside working hours.
  const workStart = atTime(day, settings.workStart).getTime();
  const workEnd = atTime(day, settings.workEnd).getTime();
  const inWork = union(
    all.map((i) => ({ start: Math.max(i.start, workStart), end: Math.min(i.end, workEnd) })).filter((i) => i.end > i.start)
  );
  let longestBreak = 0;
  let cursor = workStart;
  for (const i of inWork) {
    longestBreak = Math.max(longestBreak, i.start - cursor);
    cursor = Math.max(cursor, i.end);
  }
  longestBreak = Math.max(longestBreak, workEnd - cursor);

  const doFirstCount = live.filter((t) => {
    const due = dueAt(t);
    return t.quadrant === 'do' && due !== null && due.getTime() >= dayStart && due.getTime() < dayEnd;
  }).length;

  return {
    key: dayKey(day),
    date: startOfDay(day),
    scheduledMinutes,
    blockedMinutes,
    freeMinutes: Math.max(0, scheduledMinutes - blockedMinutes),
    multitaskMinutes: overlapMinutes(freeIntervals),
    doFirstCount,
    longestBreakMinutes: Math.max(0, longestBreak / 60000),
    workMinutes: totalMinutes(inWork),
    windows: windows.sort((a, b) => a.start.getTime() - b.start.getTime()),
    stacked,
  };
}

export function rangeLoads(
  tasks: InsightTask[],
  range: DateRange,
  settings: Pick<InsightsSettings, 'workStart' | 'workEnd'>
): DayLoad[] {
  return eachDay(range).map((day) => dayLoad(tasks, day, settings));
}

export interface EstimateAccuracy {
  /** Σ actual / Σ estimated — 1.3 means tasks take 1.3x longer. */
  ratio: number | null;
  actualMinutes: number;
  estimatedMinutes: number;
  /** How many of those tasks had a real "actual time" entered. */
  measured: number;
  count: number;
}

export function estimateAccuracy(tasks: InsightTask[], range: DateRange): EstimateAccuracy {
  let actual = 0;
  let estimated = 0;
  let measured = 0;
  let count = 0;
  for (const t of tasks) {
    if (t.status !== 'done' || !within(t.completedAt, range)) continue;
    const estimate = estimateMinutes(t);
    if (!estimate) continue;
    count += 1;
    estimated += estimate;
    actual += t.actualMinutes ?? estimate;
    if (t.actualMinutes) measured += 1;
  }
  return { ratio: estimated > 0 ? actual / estimated : null, actualMinutes: actual, estimatedMinutes: estimated, measured, count };
}

/** Completed tasks by hour of completion (0 to 23). */
export function productiveHours(tasks: InsightTask[], range: DateRange): number[] {
  const counts = Array.from({ length: 24 }, () => 0);
  for (const t of tasks) {
    if (t.status === 'done' && within(t.completedAt, range)) counts[t.completedAt.getHours()] += 1;
  }
  return counts;
}

/** The busiest hours, most first (ties: earlier first). */
export function topHours(counts: number[], n = 3): number[] {
  return counts
    .map((count, hour) => ({ count, hour }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || a.hour - b.hour)
    .slice(0, n)
    .map((h) => h.hour);
}

// ---------------------------------------------------------------------------
// Prioritisation

export const QUADRANT_ORDER: Quadrant[] = ['do', 'schedule', 'delegate', 'eliminate'];

export interface QuadrantShare {
  quadrant: Quadrant;
  tasks: number;
  minutes: number;
  taskShare: number;
  hourShare: number;
}

export interface QuadrantMix {
  shares: QuadrantShare[];
  totalTasks: number;
  totalMinutes: number;
  /** Do-first hours / all scheduled hours. */
  firefighting: number | null;
  eliminateHourShare: number | null;
}

/** Everything planned in the range (done, pending — not cancelled). */
export function quadrantMix(tasks: InsightTask[], range: DateRange): QuadrantMix {
  const planned = tasks.filter((t) => t.status !== 'cancelled' && within(dueAt(t), range));
  const totalMinutes = planned.reduce((sum, t) => sum + (estimateMinutes(t) ?? 0), 0);
  const shares = QUADRANT_ORDER.map((quadrant) => {
    const list = planned.filter((t) => t.quadrant === quadrant);
    const minutes = list.reduce((sum, t) => sum + (estimateMinutes(t) ?? 0), 0);
    return {
      quadrant,
      tasks: list.length,
      minutes,
      taskShare: planned.length ? list.length / planned.length : 0,
      hourShare: totalMinutes ? minutes / totalMinutes : 0,
    };
  });
  return {
    shares,
    totalTasks: planned.length,
    totalMinutes,
    firefighting: totalMinutes ? shares[0].minutes / totalMinutes : null,
    eliminateHourShare: totalMinutes ? shares[3].minutes / totalMinutes : null,
  };
}

// ---------------------------------------------------------------------------
// Recurring tasks

export type HeatCell = 'done' | 'missed' | 'none' | 'upcoming';

export interface SeriesConsistency {
  seriesId: string;
  title: string;
  done: number;
  due: number;
  /** done / due, or null with nothing due yet. */
  consistency: number | null;
  /** Consecutive done dates back from the latest one due. */
  streak: number;
  /** One cell per day of the range. */
  cells: { key: string; date: Date; state: HeatCell }[];
}

export function seriesConsistency(tasks: InsightTask[], range: DateRange, now: Date): SeriesConsistency[] {
  const bySeries = new Map<string, InsightTask[]>();
  for (const t of tasks) {
    if (!t.seriesId) continue;
    bySeries.set(t.seriesId, [...(bySeries.get(t.seriesId) ?? []), t]);
  }
  const days = eachDay(range);
  const out: SeriesConsistency[] = [];
  for (const [seriesId, all] of bySeries) {
    const inRange = all.filter((t) => within(dueAt(t), range) && t.status !== 'cancelled');
    if (inRange.length === 0) continue;
    const dueSoFar = inRange.filter((t) => t.status === 'done' || (dueAt(t) as Date) <= now);
    const done = dueSoFar.filter((t) => t.status === 'done').length;
    const byDay = new Map<string, InsightTask[]>();
    for (const t of inRange) {
      const key = dayKey(dueAt(t) as Date);
      byDay.set(key, [...(byDay.get(key) ?? []), t]);
    }
    const cells = days.map((date) => {
      const key = dayKey(date);
      const list = byDay.get(key) ?? [];
      let state: HeatCell = 'none';
      if (list.length) {
        if (list.every((t) => t.status === 'done')) state = 'done';
        else if (list.some((t) => t.status !== 'done' && (dueAt(t) as Date) <= now)) state = 'missed';
        else state = 'upcoming';
      }
      return { key, date, state };
    });
    // Streak across all known dates (not just the range), latest first.
    const history = all
      .filter((t) => t.status !== 'cancelled' && (t.status === 'done' || (dueAt(t) as Date) <= now))
      .sort((a, b) => (dueAt(b) as Date).getTime() - (dueAt(a) as Date).getTime());
    let streak = 0;
    for (const t of history) {
      if (t.status !== 'done') break;
      streak += 1;
    }
    out.push({
      seriesId,
      title: inRange[0].title,
      done,
      due: dueSoFar.length,
      consistency: dueSoFar.length ? done / dueSoFar.length : null,
      streak,
      cells,
    });
  }
  return out.sort((a, b) => (a.consistency ?? 2) - (b.consistency ?? 2));
}

// ---------------------------------------------------------------------------
// Projects

export type MilestoneState = 'done' | 'on track' | 'at risk' | 'missed';
export type ProjectRisk = 'done' | 'on track' | 'watch' | 'at risk' | 'overdue';

export interface MilestoneStat {
  milestone: InsightMilestone;
  state: MilestoneState;
  linked: number;
  linkedDone: number;
  forecast: Date | null;
}

export interface ProjectStat {
  project: InsightProject;
  total: number;
  done: number;
  remaining: number;
  /** done / (total − cancelled), 0 to 1. */
  progress: number;
  /** Tasks done per day over the last 14 days (or since the start, if younger). */
  velocity: number;
  previousVelocity: number | null;
  /** today + remaining / velocity; null when nothing is getting done. */
  forecast: Date | null;
  /** deadline − forecast, in days (negative = late). */
  slackDays: number | null;
  overdue: number;
  milestones: MilestoneStat[];
  risk: ProjectRisk;
  /** Why, in a few words — the card's detail line and alerts. */
  reasons: string[];
}

const VELOCITY_DAYS = 14;

function velocityOver(tasks: InsightTask[], from: Date, to: Date): number {
  const days = Math.max(1, daysBetween(from, to));
  const done = tasks.filter((t) => t.status === 'done' && t.completedAt && t.completedAt > from && t.completedAt <= to).length;
  return done / days;
}

export function projectStat(
  project: InsightProject,
  projectTasks: InsightTask[],
  now: Date,
  thresholds: { slackWatchDays: number; velocityDropPercent: number; milestoneRiskDays: number }
): ProjectStat {
  const live = projectTasks.filter((t) => t.status !== 'cancelled');
  const total = live.length;
  const done = live.filter((t) => t.status === 'done').length;
  const remaining = total - done;
  const today = startOfDay(now);

  // Velocity: the last 14 days — or since the project started, when younger.
  const started = project.startDate ?? project.createdAt;
  const age = started ? Math.max(1, daysBetween(started, now)) : VELOCITY_DAYS;
  const window = Math.min(VELOCITY_DAYS, age);
  const velocity = velocityOver(live, addDays(now, -window), now);
  const previousVelocity = age >= VELOCITY_DAYS * 2 ? velocityOver(live, addDays(now, -VELOCITY_DAYS * 2), addDays(now, -VELOCITY_DAYS)) : null;

  const forecastFor = (left: number): Date | null =>
    left === 0 ? today : velocity > 0 ? addDays(today, Math.ceil(left / velocity)) : null;
  const forecast = forecastFor(remaining);
  const deadline = project.deadline ? startOfDay(project.deadline) : null;
  const slackDays = deadline && forecast ? daysBetween(forecast, deadline) : null;

  const byId = new Map(projectTasks.map((t) => [t.id, t]));
  const milestones: MilestoneStat[] = project.milestones.map((milestone) => {
    const linked = milestone.taskIds.map((id) => byId.get(id)).filter((t): t is InsightTask => Boolean(t) && t!.status !== 'cancelled');
    const linkedDone = linked.filter((t) => t.status === 'done').length;
    const left = linked.length - linkedDone;
    const due = startOfDay(milestone.due);
    const mForecast = forecastFor(left);
    let state: MilestoneState;
    if (milestone.status === 'done' || (linked.length > 0 && left === 0)) state = 'done';
    else if (due < today) state = 'missed';
    else if (left > 0 && (!mForecast || mForecast > due)) state = 'at risk';
    else state = 'on track';
    return { milestone, state, linked: linked.length, linkedDone, forecast: mForecast };
  });

  const overdue = overdueTasks(live, now).length;
  const reasons: string[] = [];
  let risk: ProjectRisk;
  if (project.status === 'Completed' || (total > 0 && remaining === 0)) {
    risk = 'done';
  } else if (deadline && deadline < today && remaining > 0) {
    risk = 'overdue';
    reasons.push(`Deadline passed ${daysBetween(deadline, today)} ${daysBetween(deadline, today) === 1 ? 'day' : 'days'} ago`);
  } else {
    const late = deadline !== null && (forecast === null ? remaining > 0 : forecast > deadline);
    const missed = milestones.filter((m) => m.state === 'missed');
    const soonAtRisk = milestones.filter(
      (m) => m.state === 'at risk' && daysBetween(today, m.milestone.due) <= thresholds.milestoneRiskDays
    );
    if (late) reasons.push(forecast ? `Forecast finish is ${-(slackDays ?? 0)} days after the deadline` : 'Nothing done lately, so no finish date in sight');
    for (const m of missed) reasons.push(`Milestone “${m.milestone.name}” was missed`);
    for (const m of soonAtRisk) reasons.push(`Milestone “${m.milestone.name}” is at risk`);
    if (reasons.length) {
      risk = 'at risk';
    } else {
      const tight = slackDays !== null && slackDays >= 0 && slackDays <= thresholds.slackWatchDays;
      const slowing =
        previousVelocity !== null &&
        previousVelocity > 0 &&
        velocity < previousVelocity * (1 - thresholds.velocityDropPercent / 100);
      if (tight) reasons.push(`Only ${slackDays} ${slackDays === 1 ? 'day' : 'days'} of slack`);
      if (slowing) reasons.push(`Pace down ${Math.round((1 - velocity / previousVelocity!) * 100)}% on the previous 2 weeks`);
      risk = reasons.length ? 'watch' : 'on track';
    }
  }

  return {
    project,
    total,
    done,
    remaining,
    progress: total ? done / total : 0,
    velocity,
    previousVelocity,
    forecast,
    slackDays,
    overdue,
    milestones,
    risk,
    reasons,
  };
}

const RISK_ORDER: Record<ProjectRisk, number> = { overdue: 0, 'at risk': 1, watch: 2, 'on track': 3, done: 4 };

export function sortByRisk(stats: ProjectStat[]): ProjectStat[] {
  return [...stats].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.project.name.localeCompare(b.project.name));
}

export interface BurndownPoint {
  key: string;
  date: Date;
  /** Remaining tasks that day (past and today only). */
  remaining: number | null;
  ideal: number | null;
  forecast: number | null;
}

/**
 * Remaining tasks per day from the project's start to today, the ideal
 * line from start (all tasks) to the deadline (none), and the forecast line
 * from today to the forecast finish.
 */
export function burndown(stat: ProjectStat, tasks: InsightTask[], now: Date): BurndownPoint[] {
  const today = startOfDay(now);
  const created = tasks.map((t) => t.createdAt).filter((d): d is Date => Boolean(d));
  const start = startOfDay(
    stat.project.startDate ??
      stat.project.createdAt ??
      (created.length ? new Date(Math.min(...created.map((d) => d.getTime()))) : addDays(today, -14))
  );
  const endCandidates = [today, stat.project.deadline, stat.forecast].filter((d): d is Date => Boolean(d));
  const end = startOfDay(new Date(Math.max(...endCandidates.map((d) => d.getTime()))));
  const deadline = stat.project.deadline ? startOfDay(stat.project.deadline) : null;
  const idealSpan = deadline ? Math.max(1, daysBetween(start, deadline)) : null;
  const forecastSpan = stat.forecast ? Math.max(1, daysBetween(today, stat.forecast)) : null;

  const points: BurndownPoint[] = [];
  const cap = 400;
  for (let d = start, i = 0; d <= end && i < cap; d = addDays(d, 1), i++) {
    const dayEnd = endOfDay(d);
    let remaining: number | null = null;
    if (d <= today) {
      remaining = tasks.filter((t) => {
        const createdAt = t.createdAt ?? start;
        if (createdAt > dayEnd) return false;
        if (t.status === 'done' && t.completedAt && t.completedAt <= dayEnd) return false;
        if (t.status === 'cancelled' && (!t.cancelledAt || t.cancelledAt <= dayEnd)) return false;
        return true;
      }).length;
    }
    const sinceStart = daysBetween(start, d);
    const ideal = idealSpan !== null && deadline && d <= deadline ? Math.max(0, stat.total * (1 - sinceStart / idealSpan)) : null;
    const sinceToday = daysBetween(today, d);
    const forecast =
      forecastSpan !== null && stat.forecast && d >= today && d <= stat.forecast
        ? Math.max(0, stat.remaining * (1 - sinceToday / forecastSpan))
        : null;
    points.push({ key: dayKey(d), date: d, remaining, ideal, forecast });
  }
  return points;
}
