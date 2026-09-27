// Insights analytics (app/src/viewmodels/insights) — the brief's seven test
// cases, plus the time and project rules around them.
// Run: npx tsx --test test/insights.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { InsightProject, InsightTask } from '../app/src/viewmodels/insights/types';
import {
  completionRate,
  currentStreak,
  dayLoad,
  onTimeRate,
  overdueTasks,
  projectStat,
  seriesConsistency,
  burndown,
} from '../app/src/viewmodels/insights/metrics';
import { buildAlerts, dayAlerts } from '../app/src/viewmodels/insights/alerts';
import { computeInsights } from '../app/src/viewmodels/insights/compute';
import { INSIGHTS_DEFAULTS, DEFAULT_THRESHOLDS } from '../app/src/viewmodels/insights/settings';
import { addDays, rangeFor, startOfDay } from '../app/src/viewmodels/insights/dates';

// Wednesday 30 September 2026, 17:00.
const now = new Date(2026, 8, 30, 17, 0);
const today = startOfDay(now);
const at = (day: Date, h: number, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);

let n = 0;
function task(extra: Partial<InsightTask> = {}): InsightTask {
  n += 1;
  return {
    id: `t${n}`,
    seriesId: null,
    title: `Task ${n}`,
    projectId: null,
    status: 'pending',
    start: at(today, 9),
    end: at(today, 10),
    allDay: false,
    mode: 'free',
    quadrant: 'schedule',
    createdAt: addDays(today, -3),
    completedAt: null,
    cancelledAt: null,
    rescheduled: false,
    actualMinutes: null,
    ...extra,
  };
}
const done = (extra: Partial<InsightTask> = {}) => task({ status: 'done', completedAt: at(today, 11), ...extra });

test('1. 10 tasks due today, 7 done, 1 cancelled, 2 pending: completion 7/9', () => {
  const tasks = [
    ...Array.from({ length: 7 }, () => done()),
    task({ status: 'cancelled', cancelledAt: at(today, 8) }),
    task(),
    task(),
  ];
  const r = completionRate(tasks, rangeFor('today', now), now);
  assert.equal(r.numerator, 7);
  assert.equal(r.denominator, 9);
  assert.equal(Math.round(r.value! * 100), 78);
});

test('2. free tasks 09:00 to 11:00 and 10:00 to 12:00: 3h scheduled, 1h multitask', () => {
  const load = dayLoad(
    [task({ start: at(today, 9), end: at(today, 11) }), task({ start: at(today, 10), end: at(today, 12) })],
    today,
    INSIGHTS_DEFAULTS
  );
  assert.equal(load.scheduledMinutes / 60, 3);
  assert.equal(load.multitaskMinutes / 60, 1);
  assert.equal(load.stacked.length, 1);
});

test('3. capacity 8h with 9h scheduled: red overload alert', () => {
  const tomorrow = addDays(today, 1);
  const tasks = [
    task({ start: at(tomorrow, 8), end: at(tomorrow, 12), mode: 'blocked' }),
    task({ start: at(tomorrow, 13), end: at(tomorrow, 18), mode: 'blocked' }),
  ];
  const alerts = dayAlerts(tasks, INSIGHTS_DEFAULTS, now);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'red');
  assert.equal(alerts[0].headline, 'Tomorrow is overloaded: 9h scheduled against 8h capacity');
});

const project = (extra: Partial<InsightProject> = {}): InsightProject => ({
  id: 'p1',
  name: 'Website',
  color: '#3965fa',
  status: 'Active',
  startDate: addDays(today, -10),
  deadline: addDays(today, 7),
  createdAt: addDays(today, -10),
  milestones: [],
  ...extra,
});

test('4. 20 tasks, 10 done at 1/day, deadline in 7 days: forecast +10, slack -3, red', () => {
  const tasks = [
    ...Array.from({ length: 10 }, (_, i) => done({ projectId: 'p1', completedAt: at(addDays(today, -i), 12), createdAt: addDays(today, -10) })),
    ...Array.from({ length: 10 }, () => task({ projectId: 'p1', start: at(addDays(today, 5), 9), end: at(addDays(today, 5), 10), createdAt: addDays(today, -10) })),
  ];
  const stat = projectStat(project(), tasks, now, DEFAULT_THRESHOLDS);
  assert.equal(stat.velocity, 1);
  assert.equal(stat.forecast!.getTime(), addDays(today, 10).getTime());
  assert.equal(stat.slackDays, -3);
  assert.equal(stat.risk, 'at risk');
  const alerts = buildAlerts([], [stat], rangeFor('week', now), INSIGHTS_DEFAULTS, now);
  assert.equal(alerts[0].severity, 'red');
  assert.equal(alerts[0].headline, "“Website” won't finish on time");
  // Burndown: today's remaining is 10, the forecast line reaches 0.
  const points = burndown(stat, tasks, now);
  assert.equal(points.find((p) => p.date.getTime() === today.getTime())!.remaining, 10);
  assert.equal(points[points.length - 1].forecast, 0);
});

test('5. milestone due yesterday and not done: missed, red alert', () => {
  const t1 = task({ projectId: 'p1', start: at(addDays(today, -2), 9), end: at(addDays(today, -2), 10) });
  const t2 = done({ projectId: 'p1' });
  const p = project({
    deadline: addDays(today, 60),
    milestones: [{ id: 'm1', name: 'Beta', due: addDays(today, -1), taskIds: [t1.id], status: 'pending' }],
  });
  const stat = projectStat(p, [t1, t2], now, DEFAULT_THRESHOLDS);
  assert.equal(stat.milestones[0].state, 'missed');
  const alerts = buildAlerts([], [stat], rangeFor('week', now), INSIGHTS_DEFAULTS, now);
  assert.equal(alerts[0].severity, 'red');
  assert.equal(alerts[0].headline, 'Milestone “Beta” missed');
});

test('6. daily recurring task done 5 of 7 days: consistency 71%', () => {
  const week = { from: addDays(today, -6), to: at(today, 23, 59) };
  const occurrences = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, -6 + i);
    const isDone = i !== 2 && i !== 4;
    return task({
      id: `s1@${i}`,
      seriesId: 's1',
      title: 'Morning run',
      start: at(day, 7),
      end: at(day, 8),
      status: isDone ? 'done' : 'pending',
      completedAt: isDone ? at(day, 8) : null,
    });
  });
  const [series] = seriesConsistency(occurrences, week, now);
  assert.equal(series.done, 5);
  assert.equal(series.due, 7);
  assert.equal(Math.round(series.consistency! * 100), 71);
  assert.equal(series.streak, 2);
  assert.deepEqual(
    series.cells.map((c) => c.state),
    ['done', 'done', 'missed', 'done', 'missed', 'done', 'done']
  );
});

test('7. no tasks in range: every chart empty, alerts all clear', () => {
  const result = computeInsights({
    tasks: [],
    projects: [],
    projectTasks: new Map(),
    range: rangeFor('week', now),
    kind: 'week',
    settings: INSIGHTS_DEFAULTS,
    now,
  });
  for (const chart of [
    result.completionTrend,
    result.plannedVsDone,
    result.dailyLoad,
    result.priorityMix,
    result.productiveHours,
    result.recurring,
    result.estimate,
  ]) {
    assert.equal(chart.empty, true);
    assert.ok(chart.takeaway.length > 0);
  }
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].severity, 'green');
  assert.equal(result.alerts[0].headline, "All clear, you're on track");
});

test('on-time rate, overdue and streak', () => {
  const yesterday = addDays(today, -1);
  const tasks = [
    done({ end: at(today, 10), completedAt: at(today, 9, 30) }),
    done({ end: at(today, 10), completedAt: at(today, 12) }),
    task({ start: at(yesterday, 9), end: at(yesterday, 10), quadrant: 'do' }),
    done({ start: at(yesterday, 11), end: at(yesterday, 12), completedAt: at(yesterday, 12) }),
    done({ start: at(addDays(today, -2), 9), end: at(addDays(today, -2), 10), completedAt: at(addDays(today, -2), 10) }),
  ];
  assert.equal(onTimeRate(tasks, rangeFor('today', now), now).value, 0.5);
  assert.equal(overdueTasks(tasks, now).length, 1);
  // Today 100%, yesterday 50% (below 80%) → streak of 1.
  assert.equal(currentStreak(tasks, now, 80), 1);
  const overdue = buildAlerts(tasks, [], rangeFor('today', now), INSIGHTS_DEFAULTS, now).find((a) => a.id === 'overdue')!;
  // One overdue, but it's do-first → red.
  assert.equal(overdue.severity, 'red');
});

test('amber when a day is nearly full or has no real break', () => {
  const tomorrow = addDays(today, 1);
  // 7h of 8h (87.5%), back to back from 08:00 to 15:00, then 15:30 to 18:00 would be free.
  const tasks = [task({ start: at(tomorrow, 8), end: at(tomorrow, 15), mode: 'blocked' })];
  const [alert] = dayAlerts(tasks, INSIGHTS_DEFAULTS, now);
  assert.equal(alert.severity, 'amber');
  assert.equal(alert.headline, 'Tomorrow is nearly full: 7h of 8h');
});
