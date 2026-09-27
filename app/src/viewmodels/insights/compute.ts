// Insights — everything the screen shows for one range, in one pass:
// summary tiles (with the change on the previous period), chart data with
// a plain-language takeaway each, project risk and the alerts strip.
// Pure; src/shared/insights/useInsights.ts caches it per range.

import { buildAlerts, type InsightAlert } from './alerts';
import { addDays, daysBetween, endOfDay, previousRange, startOfDay, weekdayName } from './dates';
import {
  completionRate,
  currentStreak,
  dayStats,
  estimateAccuracy,
  onTimeRate,
  overdueTasks,
  productiveHours,
  projectStat,
  quadrantMix,
  rangeLoads,
  seriesConsistency,
  sortByRisk,
  topHours,
  type DayLoad,
  type DayStat,
  type EstimateAccuracy,
  type ProjectStat,
  type QuadrantMix,
  type Rate,
  type SeriesConsistency,
} from './metrics';
import type { InsightsSettings } from './settings';
import type { DateRange, InsightProject, InsightTask, RangeKind } from './types';

export interface Tile {
  value: number | null;
  /** Current minus previous (same unit), or null with nothing to compare. */
  change: number | null;
  /** Whether that change is an improvement. */
  better: boolean | null;
}

export interface Chart<T> {
  data: T;
  takeaway: string;
  empty: boolean;
}

export interface InsightsResult {
  range: DateRange;
  tiles: { completion: Tile; onTime: Tile; overdue: Tile; streak: Tile };
  /** Over the range — or the last 7 days when the range is a single day. */
  completionTrend: Chart<DayStat[]>;
  plannedVsDone: Chart<DayStat[]>;
  dailyLoad: Chart<DayLoad[]>;
  priorityMix: Chart<QuadrantMix>;
  productiveHours: Chart<{ counts: number[]; top: number[] }>;
  recurring: Chart<SeriesConsistency[]>;
  estimate: Chart<EstimateAccuracy>;
  projects: ProjectStat[];
  alerts: InsightAlert[];
}

function previousWord(kind: RangeKind): string {
  if (kind === 'today') return 'yesterday';
  if (kind === 'week') return 'last week';
  if (kind === 'month') return 'last month';
  return 'the previous period';
}
function periodWord(kind: RangeKind): string {
  if (kind === 'today') return 'today';
  if (kind === 'week') return 'this week';
  if (kind === 'month') return 'this month';
  return 'in this period';
}

function rateTile(current: Rate, previous: Rate): Tile {
  const change = current.value !== null && previous.value !== null ? current.value - previous.value : null;
  return { value: current.value, change, better: change === null || change === 0 ? null : change > 0 };
}

function hourLabel(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
}
function listWords(items: string[]) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
function hoursText(minutes: number) {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

const QUADRANT_LABEL = { do: 'Do first', schedule: 'Schedule', delegate: 'Delegate', eliminate: 'Eliminate' } as const;

export function computeInsights({
  tasks,
  projects,
  projectTasks,
  range,
  kind,
  settings,
  now,
}: {
  tasks: InsightTask[];
  projects: InsightProject[];
  /** Tasks per project id, a recurring series counted once. */
  projectTasks: Map<string, InsightTask[]>;
  range: DateRange;
  kind: RangeKind;
  settings: InsightsSettings;
  now: Date;
}): InsightsResult {
  const prev = previousRange(range);
  const t = settings.thresholds;

  // ---- Tiles ----
  const completion = completionRate(tasks, range, now);
  const prevCompletion = completionRate(tasks, prev, now);
  const onTime = onTimeRate(tasks, range, now);
  const prevOnTime = onTimeRate(tasks, prev, now);
  const overdueNow = overdueTasks(tasks, now).length;
  // Overdue as it stood at the end of the previous period.
  const prevEnd = prev.to < now ? prev.to : now;
  const overdueBefore = tasks.filter((x) => {
    const due = x.end ?? x.start;
    if (!due || due >= prevEnd) return false;
    if (x.status === 'done') return !!x.completedAt && x.completedAt > prevEnd;
    if (x.status === 'cancelled') return !!x.cancelledAt && x.cancelledAt > prevEnd;
    return true;
  }).length;
  const streak = currentStreak(tasks, now, t.streakPercent);
  const overdueChange = overdueNow - overdueBefore;

  // ---- Completion trend ----
  const days = dayStats(tasks, range, now);
  const prevDays = dayStats(tasks, prev, now);
  const doneNow = days.reduce((s, d) => s + d.done, 0);
  const donePrev = prevDays.reduce((s, d) => s + d.done, 0);
  let trendTakeaway: string;
  if (doneNow === 0 && donePrev === 0) trendTakeaway = 'Complete a few tasks to see your trend.';
  else if (donePrev === 0) trendTakeaway = `You finished ${doneNow} ${doneNow === 1 ? 'task' : 'tasks'} ${periodWord(kind)}.`;
  else {
    const pct = Math.round(((doneNow - donePrev) / donePrev) * 100);
    trendTakeaway =
      pct === 0
        ? `You finished as many tasks as ${previousWord(kind)}.`
        : `You finished ${Math.abs(pct)}% ${pct > 0 ? 'more' : 'fewer'} than ${previousWord(kind)}.`;
  }

  // A single day has no trend to draw — show the week leading up to it.
  const trendDays =
    rangeDays(range) < 2 ? dayStats(tasks, { from: addDays(startOfDay(range.from), -6), to: endOfDay(range.to) }, now) : days;

  // ---- Planned vs done ----
  const planned = days.reduce((s, d) => s + d.planned, 0);
  const cancelled = days.reduce((s, d) => s + d.cancelled, 0);
  const plannedTakeaway = planned
    ? `You finished ${doneNow} of ${planned} planned ${planned === 1 ? 'task' : 'tasks'}${cancelled ? `; ${cancelled} ${cancelled === 1 ? 'was' : 'were'} cancelled` : ''}.`
    : 'Plan a few tasks to compare them with what gets done.';

  // ---- Daily load ----
  const loads = rangeLoads(tasks, range, settings);
  const capacity = settings.capacityHours * 60;
  const heaviest = loads.reduce<DayLoad | null>((a, b) => (!a || b.scheduledMinutes > a.scheduledMinutes ? b : a), null);
  const over = loads.filter((l) => l.scheduledMinutes > capacity);
  let loadTakeaway: string;
  if (!heaviest || heaviest.scheduledMinutes === 0) loadTakeaway = 'Add times to your tasks to see how full your days are.';
  else if (kind === 'today') {
    loadTakeaway = `${hoursText(heaviest.scheduledMinutes)} scheduled today against ${hoursText(capacity)} capacity${heaviest.multitaskMinutes ? `, ${hoursText(heaviest.multitaskMinutes)} of it stacked` : ''}.`;
  } else if (over.length) {
    loadTakeaway = `${over.length} ${over.length === 1 ? 'day goes' : 'days go'} over your ${hoursText(capacity)} capacity — ${weekdayName(heaviest.date)} is heaviest at ${hoursText(heaviest.scheduledMinutes)}.`;
  } else {
    loadTakeaway = `Every day fits your ${hoursText(capacity)} capacity; ${weekdayName(heaviest.date)} is busiest at ${hoursText(heaviest.scheduledMinutes)}.`;
  }

  // ---- Priority mix ----
  const mix = quadrantMix(tasks, range);
  let mixTakeaway: string;
  if (!mix.totalTasks) mixTakeaway = 'Plan tasks to see where your time goes.';
  else if (mix.firefighting !== null && mix.firefighting * 100 > t.firefightingWatchPercent) {
    mixTakeaway = `Do-first work takes ${Math.round(mix.firefighting * 100)}% of your time — that's firefighting.`;
  } else {
    const basis = mix.totalMinutes ? 'hourShare' : 'taskShare';
    const top = [...mix.shares].sort((a, b) => b[basis] - a[basis])[0];
    mixTakeaway =
      top.quadrant === 'schedule'
        ? `Most of your time goes to planned, important work (${Math.round(top[basis] * 100)}%). Nice.`
        : `${QUADRANT_LABEL[top.quadrant]} takes the biggest share: ${Math.round(top[basis] * 100)}%.`;
  }

  // ---- Productive hours ----
  const counts = productiveHours(tasks, range);
  const top = topHours(counts);
  const hoursTakeaway = top.length
    ? `You get most done around ${listWords(top.map(hourLabel))}.`
    : 'Complete a few tasks to find your most productive hours.';

  // ---- Recurring ----
  const series = seriesConsistency(tasks, range, now);
  const measured = series.filter((s) => s.consistency !== null);
  let recurringTakeaway: string;
  if (!series.length) recurringTakeaway = 'Recurring tasks will show here once they are due.';
  else if (!measured.length) recurringTakeaway = 'None of your recurring tasks were due yet.';
  else {
    const best = [...measured].sort((a, b) => (b.consistency ?? 0) - (a.consistency ?? 0))[0];
    recurringTakeaway = `“${best.title}” is your most consistent at ${Math.round((best.consistency ?? 0) * 100)}%.`;
  }

  // ---- Estimate accuracy ----
  const estimate = estimateAccuracy(tasks, range);
  let estimateTakeaway: string;
  if (estimate.ratio === null) estimateTakeaway = 'Finish timed tasks to compare real time with your plans.';
  else if (!estimate.measured) estimateTakeaway = 'Enter the real time when you finish a task to measure your estimates.';
  else if (Math.abs(estimate.ratio - 1) < 0.1) estimateTakeaway = 'Your estimates are spot on.';
  else if (estimate.ratio > 1) estimateTakeaway = `Tasks take ${estimate.ratio.toFixed(1)}x longer than planned.`;
  else estimateTakeaway = `Tasks take ${Math.round((1 - estimate.ratio) * 100)}% less time than planned.`;

  // ---- Projects ----
  const stats = sortByRisk(
    projects
      .filter((p) => p.status === 'Active')
      .map((p) => projectStat(p, projectTasks.get(p.id) ?? [], now, t))
  );

  const hasTasks = days.some((d) => d.planned || d.done || d.cancelled);

  return {
    range,
    tiles: {
      completion: rateTile(completion, prevCompletion),
      onTime: rateTile(onTime, prevOnTime),
      overdue: { value: overdueNow, change: overdueChange, better: overdueChange === 0 ? null : overdueChange < 0 },
      streak: { value: streak, change: null, better: null },
    },
    completionTrend: { data: trendDays, takeaway: trendTakeaway, empty: !trendDays.some((d) => d.rate !== null) },
    plannedVsDone: { data: days, takeaway: plannedTakeaway, empty: !hasTasks },
    dailyLoad: { data: loads, takeaway: loadTakeaway, empty: !loads.some((l) => l.scheduledMinutes > 0) },
    priorityMix: { data: mix, takeaway: mixTakeaway, empty: mix.totalTasks === 0 },
    productiveHours: { data: { counts, top }, takeaway: hoursTakeaway, empty: top.length === 0 },
    recurring: { data: series, takeaway: recurringTakeaway, empty: series.length === 0 },
    estimate: { data: estimate, takeaway: estimateTakeaway, empty: estimate.ratio === null },
    projects: stats,
    alerts: buildAlerts(tasks, stats, range, settings, now),
  };
}

/** How many days a range spans (for axis density). */
export function rangeDays(range: DateRange): number {
  return daysBetween(startOfDay(range.from), startOfDay(range.to)) + 1;
}
