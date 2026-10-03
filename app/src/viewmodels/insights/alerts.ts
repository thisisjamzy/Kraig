// Insights alerts — the strip at the top of the screen, most severe first.
// Red = at risk, amber = watch, green = on track (only as "all clear").
// Every threshold comes from InsightsSettings (editable in Settings).

import { addDays, dayKey, relativeDayName, shortDate, startOfDay } from './dates';
import {
  currentStreak,
  dayLoad,
  dueAt,
  overdueTasks,
  quadrantMix,
  rescheduleRate,
  seriesConsistency,
  type ProjectStat,
} from './metrics';
import type { InsightsSettings } from './settings';
import type { DateRange, InsightTask } from './types';

export type Severity = 'red' | 'amber' | 'green';
export type AlertKind = 'day' | 'overdue' | 'project' | 'milestone' | 'habit' | 'clear';

export interface InsightAlert {
  id: string;
  severity: Severity;
  kind: AlertKind;
  headline: string;
  detail: string;
  /** Where tapping it goes. */
  href: string;
}

function hours(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

/** Overloaded days, today and the next 7. */
export function dayAlerts(tasks: InsightTask[], settings: InsightsSettings, now: Date): InsightAlert[] {
  const t = settings.thresholds;
  const capacity = settings.capacityHours * 60;
  const out: InsightAlert[] = [];
  for (let i = 0; i <= 7; i++) {
    const day = addDays(startOfDay(now), i);
    const load = dayLoad(tasks, day, settings);
    const name = relativeDayName(day, now);
    const lower = name.charAt(0).toLowerCase() + name.slice(1);
    const red: string[] = [];
    const amber: string[] = [];
    if (load.scheduledMinutes > capacity) {
      red.push(`${name} is overloaded: ${hours(load.scheduledMinutes)} scheduled against ${hours(capacity)} capacity`);
    }
    if (load.doFirstCount > t.doFirstRedCount) red.push(`${name} has ${load.doFirstCount} Do first tasks`);
    if (load.multitaskMinutes > t.stackedFreeRedHours * 60) {
      red.push(`${name} stacks ${hours(load.multitaskMinutes)} of free tasks on top of each other`);
    }
    if (!red.length && load.scheduledMinutes >= capacity * (t.loadWatchPercent / 100)) {
      amber.push(`${name} is nearly full: ${hours(load.scheduledMinutes)} of ${hours(capacity)}`);
    }
    if (load.workMinutes > 0 && load.longestBreakMinutes < t.minBreakMinutes) {
      amber.push(`No break longer than ${t.minBreakMinutes} min ${lower === 'today' || lower === 'tomorrow' ? lower : `on ${name}`}`);
    }
    const lines = red.length ? red : amber;
    if (!lines.length) continue;
    out.push({
      id: `day-${load.key}`,
      severity: red.length ? 'red' : 'amber',
      kind: 'day',
      headline: lines[0],
      detail: lines.length > 1 ? lines.slice(1).join(' · ') : `${hours(load.scheduledMinutes)} scheduled · ${load.doFirstCount} Do first`,
      href: `/projects/calendar?date=${load.key}`,
    });
  }
  return out;
}

export function overdueAlert(tasks: InsightTask[], settings: InsightsSettings, now: Date): InsightAlert | null {
  const overdue = overdueTasks(tasks, now);
  if (!overdue.length) return null;
  const doFirst = overdue.filter((t) => t.quadrant === 'do');
  const red = overdue.length > settings.thresholds.overdueRedCount || doFirst.length > 0;
  const oldest = overdue.reduce((a, b) => ((dueAt(a) as Date) < (dueAt(b) as Date) ? a : b));
  return {
    id: 'overdue',
    severity: red ? 'red' : 'amber',
    kind: 'overdue',
    headline: `${overdue.length} overdue ${overdue.length === 1 ? 'task' : 'tasks'}`,
    detail: doFirst.length
      ? `${doFirst.length} ${doFirst.length === 1 ? 'is' : 'are'} in Do first · oldest “${oldest.title}”`
      : `Oldest: “${oldest.title}”, due ${shortDate(dueAt(oldest) as Date)}`,
    href: '/projects/focus?view=overdue',
  };
}

export function projectAlerts(stats: ProjectStat[]): InsightAlert[] {
  const out: InsightAlert[] = [];
  for (const stat of stats) {
    const { project } = stat;
    const href = `/projects/insights/${project.id}`;
    if (stat.risk === 'overdue') {
      out.push({ id: `project-${project.id}`, severity: 'red', kind: 'project', headline: `“${project.name}” is past its deadline`, detail: `${stat.remaining} tasks left · ${stat.reasons[0] ?? ''}`, href });
    } else if (stat.risk === 'at risk') {
      const missed = stat.milestones.find((m) => m.state === 'missed');
      out.push({
        id: `project-${project.id}`,
        severity: 'red',
        kind: missed ? 'milestone' : 'project',
        headline: missed
          ? `Milestone “${missed.milestone.name}” missed`
          : stat.forecast && project.deadline
            ? `“${project.name}” won't finish on time`
            : `“${project.name}” is at risk`,
        detail: stat.forecast && project.deadline
          ? `Forecast ${shortDate(stat.forecast)} · deadline ${shortDate(project.deadline)}`
          : stat.reasons.join(' · '),
        href,
      });
    } else if (stat.risk === 'watch') {
      out.push({ id: `project-${project.id}`, severity: 'amber', kind: 'project', headline: `Keep an eye on “${project.name}”`, detail: stat.reasons.join(' · '), href });
    }
  }
  return out;
}

export function habitAlerts(tasks: InsightTask[], range: DateRange, settings: InsightsSettings, now: Date): InsightAlert[] {
  const t = settings.thresholds;
  const out: InsightAlert[] = [];
  for (const series of seriesConsistency(tasks, range, now)) {
    if (series.due >= 3 && series.consistency !== null && series.consistency * 100 < t.consistencyWatchPercent) {
      out.push({
        id: `habit-${series.seriesId}`,
        severity: 'amber',
        kind: 'habit',
        headline: `“${series.title}” is slipping`,
        detail: `Done ${series.done} of ${series.due} times (${Math.round(series.consistency * 100)}%)`,
        href: `/tasks/${series.seriesId}/edit`,
      });
    }
  }
  // A streak broken yesterday (it was at least 2 days long).
  const yesterday = addDays(startOfDay(now), -1);
  const before = currentStreak(tasks, addDays(yesterday, -1), t.streakPercent);
  const now2 = currentStreak(tasks, now, t.streakPercent);
  const yesterdayTasks = tasks.filter((x) => x.status !== 'cancelled' && dueAt(x) && dayKey(dueAt(x) as Date) === dayKey(yesterday));
  const yesterdayRatio = yesterdayTasks.length ? yesterdayTasks.filter((x) => x.status === 'done').length / yesterdayTasks.length : 1;
  if (before >= 2 && yesterdayRatio * 100 < t.streakPercent && now2 === 0) {
    out.push({
      id: 'streak',
      severity: 'amber',
      kind: 'habit',
      headline: `Your ${before}-day streak ended yesterday`,
      detail: `Finish ${t.streakPercent}% of today's tasks to start a new one`,
      href: '/tasks?filter=today',
    });
  }
  const reschedule = rescheduleRate(tasks, range, now);
  if (reschedule.denominator >= 5 && reschedule.value !== null && reschedule.value * 100 > t.rescheduleWatchPercent) {
    out.push({
      id: 'reschedule',
      severity: 'amber',
      kind: 'habit',
      headline: `${Math.round(reschedule.value * 100)}% of tasks were pushed later`,
      detail: 'Plan fewer tasks per day, or give them more time',
      href: '/tasks?filter=all',
    });
  }
  const mix = quadrantMix(tasks, range);
  if (mix.firefighting !== null && mix.firefighting * 100 > t.firefightingWatchPercent) {
    out.push({
      id: 'firefighting',
      severity: 'amber',
      kind: 'habit',
      headline: `Do first work is ${Math.round(mix.firefighting * 100)}% of your scheduled time`,
      detail: 'Schedule important work before it becomes urgent',
      href: '/projects/focus',
    });
  }
  if (mix.eliminateHourShare !== null && mix.eliminateHourShare * 100 > t.eliminateWatchPercent) {
    out.push({
      id: 'eliminate',
      severity: 'amber',
      kind: 'habit',
      headline: `“Eliminate” tasks take ${Math.round(mix.eliminateHourShare * 100)}% of your time`,
      detail: 'Drop or shorten what is neither urgent nor important',
      href: '/projects/focus',
    });
  }
  return out;
}

const SEVERITY_ORDER: Record<Severity, number> = { red: 0, amber: 1, green: 2 };

export function buildAlerts(
  tasks: InsightTask[],
  projectStats: ProjectStat[],
  range: DateRange,
  settings: InsightsSettings,
  now: Date
): InsightAlert[] {
  const alerts = [
    ...dayAlerts(tasks, settings, now),
    ...[overdueAlert(tasks, settings, now)].filter((a): a is InsightAlert => a !== null),
    ...projectAlerts(projectStats),
    ...habitAlerts(tasks, range, settings, now),
  ];
  if (!alerts.length) {
    return [
      {
        id: 'clear',
        severity: 'green',
        kind: 'clear',
        headline: "All clear, you're on track",
        detail: 'No overloaded days, overdue tasks or late projects',
        href: '/projects',
      },
    ];
  }
  return alerts
    .map((alert, index) => ({ alert, index }))
    .sort((a, b) => SEVERITY_ORDER[a.alert.severity] - SEVERITY_ORDER[b.alert.severity] || a.index - b.index)
    .map(({ alert }) => alert);
}
