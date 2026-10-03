// The Time module's Notion pages: the Tasks database's rows, Today's
// summary, the calendar layout rules, Insights' language and its "Needs
// attention" grouping, and the project page's sentences.
// Run: npx tsx --test test/timePages.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import type { FirestoreTask } from '../app/src/shared/firestore/types';
import { blockedMinutes, hoursText, timeText, toTaskRow, type TaskRow } from '../app/src/viewmodels/taskRow';
import { dayFigures, daySentence, progressLine } from '../app/src/viewmodels/todaySummary';
import { allDayLines, hourRange, placeDay, spanOn, weekRangeLabel, type CalItem } from '../app/src/viewmodels/calendarItems';
import { computeInsights } from '../app/src/viewmodels/insights/compute';
import { attentionLines } from '../app/src/viewmodels/insights/attention';
import { INSIGHTS_DEFAULTS } from '../app/src/viewmodels/insights/settings';
import { addDays, rangeFor, startOfDay } from '../app/src/viewmodels/insights/dates';
import type { InsightAlert } from '../app/src/viewmodels/insights/alerts';
import type { ProjectStat } from '../app/src/viewmodels/insights/metrics';
import type { InsightTask } from '../app/src/viewmodels/insights/types';
import { atRiskSentence, healthSentence, type ProjectRow } from '../app/src/viewmodels/projectRow';

const LONG_DASH = /[–—]/;

// Saturday 3 October 2026, 10:00.
const now = new Date(2026, 9, 3, 10, 0);
const at = (h: number, m = 0, day = 3) => new Date(2026, 9, day, h, m);
const ts = (d: Date) => Timestamp.fromDate(d);

function doc(extra: Partial<FirestoreTask> = {}): FirestoreTask {
  return {
    id: 't1',
    title: 'Write report',
    emoji: null,
    type: 'ToDo',
    priority: 'High',
    projectId: 'p1',
    areaId: null,
    bucketId: null,
    parentTaskId: null,
    done: false,
    status: 'Pending',
    startTime: ts(at(8)),
    dueDate: ts(at(12)),
    timeMode: 'blocked',
    originalDueDate: null,
    rescheduleCount: 0,
    completedAt: null,
    calendarEventId: null,
    dependsOnTaskId: null,
    estimatedCost: null,
    linkedTransactionId: null,
    notes: '',
    tags: [],
    archived: false,
    createdBy: 'u',
    ...extra,
  } as FirestoreTask;
}

const ctx = {
  projects: new Map([['p1', { name: 'Setup New Library', color: '#337ea9', areaId: 'a1' }]]),
  areas: new Map([['a1', { name: 'Work' }]]),
  now,
};

// ---- Tasks database rows ----

test('a task row carries its project, area, importance, duration and time', () => {
  const row = toTaskRow(doc(), ctx);
  assert.equal(row.projectName, 'Setup New Library');
  assert.equal(row.areaName, 'Work');
  assert.equal(row.importance, 'do'); // important and due within 2 days
  assert.equal(row.minutes, 240);
  assert.equal(row.status, 'Pending');
  assert.equal(row.overdue, false);
  assert.equal(timeText(row), '8:00 to 12:00');
  assert.equal(hoursText(blockedMinutes([row])), '4h');
});

test('Stuck and In Review read as Pending; past and not done is overdue', () => {
  const row = toTaskRow(doc({ status: 'Stuck', startTime: ts(at(8, 0, 1)), dueDate: ts(at(9, 0, 1)) }), ctx);
  assert.equal(row.status, 'Pending');
  assert.equal(row.overdue, true);
  const done = toTaskRow(doc({ status: 'Done', done: true, startTime: ts(at(8, 0, 1)), dueDate: ts(at(9, 0, 1)) }), ctx);
  assert.equal(done.overdue, false);
  assert.equal(done.done, true);
});

test('a stored quadrant wins over the derived one', () => {
  assert.equal(toTaskRow(doc({ quadrant: 'eliminate' }), ctx).importance, 'eliminate');
});

// ---- Today ----

function row(extra: Partial<TaskRow>): TaskRow {
  return { ...toTaskRow(doc(), ctx), ...extra };
}

test("Today's callout: tasks, blocked hours from the first block, overdue from earlier days", () => {
  const figures = dayFigures([row({})]);
  assert.equal(figures.blockedMinutes, 240);
  const text = daySentence({ figures, isToday: true, dayLabel: 'Saturday, 3 October', overdue: 21 });
  assert.equal(text, '1 task today, 4 hours blocked from 8:00. 21 tasks are overdue from earlier days.');
  assert.doesNotMatch(text, LONG_DASH);
});

test('the progress line never says a dash and fits one line', () => {
  const figures = dayFigures([row({}), row({ id: 't2', status: 'Done', done: true }), row({ id: 't3', status: 'Cancelled' })]);
  assert.equal(figures.total, 2);
  assert.equal(figures.cancelled, 1);
  assert.equal(progressLine(figures, 21), '1 of 2 done · 8h blocked · 21 overdue');
});

test('an empty day says so, without a dash', () => {
  const text = daySentence({ figures: dayFigures([]), isToday: false, dayLabel: 'Monday, 5 October', overdue: 0 });
  assert.equal(text, 'Nothing planned on Monday, 5 October.');
});

// ---- Calendar layout ----

function item(key: string, start: Date | null, end: Date | null, allDay = false): CalItem {
  return { key, title: key, kind: 'todo', start, end, allDay, day: '2026-10-03', free: false, done: false, project: null, attendees: [], meeting: false, taskId: key, href: null };
}

test('hours run 07:00 to 20:00, stretch to fit items, or show the full day', () => {
  assert.deepEqual(hourRange([], false), { first: 7, last: 20 });
  assert.deepEqual(hourRange([{ startMin: 5 * 60, endMin: 6 * 60 }, { startMin: 21 * 60, endMin: 22 * 60 + 30 }], false), { first: 5, last: 23 });
  assert.deepEqual(hourRange([], true), { first: 0, last: 24 });
});

test('a 4-hour task is drawn 4 hours tall from its start', () => {
  const { placed } = placeDay([item('a', at(8), at(12))], '2026-10-03', 7, 56);
  assert.equal(placed[0].top, 56);
  assert.equal(placed[0].height, 4 * 56);
});

test('overlapping items share columns; a task past midnight is clipped to the day', () => {
  const { placed, groups } = placeDay([item('a', at(9), at(10)), item('b', at(9, 30), at(11))], '2026-10-03', 7, 56);
  assert.equal(groups.length, 1);
  assert.deepEqual(placed.map((p) => p.column).sort(), [0, 1]);
  assert.deepEqual(spanOn(item('c', at(23), new Date(2026, 9, 4, 1)), '2026-10-03'), { startMin: 23 * 60, endMin: 24 * 60 });
});

test('the all-day row shows 2 a day, then "+N more", and opens in place', () => {
  assert.deepEqual(allDayLines([1, 2, 3, 4], false), { shown: [1, 2], more: 2 });
  assert.deepEqual(allDayLines([1, 2, 3, 4], true), { shown: [1, 2, 3, 4], more: 0 });
});

test('the week range label', () => {
  assert.equal(weekRangeLabel('2026-10-03'), '28 Sept to 4 Oct 2026'.replace('Sept', new Date(2026, 8, 28).toLocaleDateString('en-GB', { month: 'short' })));
});

// ---- Insights language ----

let n = 0;
function insightTask(extra: Partial<InsightTask> = {}): InsightTask {
  n += 1;
  const day = startOfDay(now);
  return {
    id: `i${n}`,
    seriesId: null,
    title: `Task ${n}`,
    projectId: null,
    status: 'pending',
    start: new Date(day.getTime() + 9 * 3600000),
    end: new Date(day.getTime() + 10 * 3600000),
    allDay: false,
    mode: 'blocked',
    quadrant: 'schedule',
    createdAt: addDays(day, -10),
    completedAt: null,
    cancelledAt: null,
    rescheduled: false,
    actualMinutes: null,
    ...extra,
  };
}

test('Today compares with the 7-day average, never "fewer than yesterday"', () => {
  const yesterday = addDays(startOfDay(now), -1);
  const tasks = [
    // Three finished yesterday, nothing yet today.
    ...[1, 2, 3].map(() =>
      insightTask({ status: 'done', start: new Date(yesterday.getTime() + 9 * 3600000), end: new Date(yesterday.getTime() + 10 * 3600000), completedAt: new Date(yesterday.getTime() + 11 * 3600000) })
    ),
    insightTask(),
  ];
  const result = computeInsights({ tasks, projects: [], projectTasks: new Map(), range: rangeFor('today', now), kind: 'today', settings: INSIGHTS_DEFAULTS, now });
  assert.doesNotMatch(result.completionTrend.takeaway, /yesterday/);
  assert.equal(result.completionTrend.takeaway, 'Nothing completed yet today. Your 7-day average is 0.4 tasks a day.');
  assert.equal(result.compareWith, 'the 7-day average');
});

test('time shares say what they are based on', () => {
  const day = startOfDay(now);
  const tasks = [insightTask({ quadrant: 'do', start: new Date(day.getTime() + 8 * 3600000), end: new Date(day.getTime() + 12 * 3600000) })];
  const result = computeInsights({ tasks, projects: [], projectTasks: new Map(), range: rangeFor('today', now), kind: 'today', settings: INSIGHTS_DEFAULTS, now });
  assert.equal(result.priorityMix.takeaway, "All 4 scheduled hours today are Do first work, so there's no time for planned work.");
  for (const chart of [result.completionTrend, result.plannedVsDone, result.dailyLoad, result.priorityMix, result.productiveHours, result.recurring, result.estimate]) {
    assert.doesNotMatch(chart.takeaway, LONG_DASH);
  }
  for (const alert of result.alerts) assert.doesNotMatch(`${alert.headline} ${alert.detail}`, LONG_DASH);
});

test('"Needs attention" groups alerts into one line each, most severe first', () => {
  const stat = (id: string, risk: ProjectStat['risk'], reasons: string[], slackDays: number | null = null) =>
    ({ project: { id, name: `Project ${id}` }, risk, reasons, slackDays }) as unknown as ProjectStat;
  const alerts: InsightAlert[] = [
    { id: 'firefighting', severity: 'amber', kind: 'habit', headline: 'Do first work is 100% of your scheduled time', detail: '', href: '/projects/focus' },
  ];
  const projects = [
    ...Array.from({ length: 7 }, (_, i) => stat(`r${i}`, 'at risk', ['Nothing done lately, so no finish date in sight'])),
    stat('lib', 'watch', [], 1),
  ];
  const lines = attentionLines(alerts, projects, { total: 21, doFirst: 19 });
  assert.deepEqual(
    lines.map((l) => l.text),
    ['21 overdue tasks, 19 in Do first', '7 projects at risk: nothing done lately', 'Project lib has 1 day of slack', 'Do first work is 100% of your scheduled time']
  );
  assert.equal(lines[1].items.length, 7);
  for (const l of lines) assert.doesNotMatch(l.text, LONG_DASH);
});

test('all clear gives no lines', () => {
  const clear: InsightAlert[] = [{ id: 'clear', severity: 'green', kind: 'clear', headline: "All clear, you're on track", detail: '', href: '/projects' }];
  assert.deepEqual(attentionLines(clear, [], { total: 0, doFirst: 0 }), []);
});

// ---- Projects ----

function project(extra: Partial<ProjectRow>): ProjectRow {
  return {
    id: 'p',
    name: 'Setup New Library',
    emoji: null,
    color: '#337ea9',
    description: '',
    areaId: null,
    areaName: null,
    status: 'Active',
    start: new Date(2026, 8, 1),
    end: new Date(2026, 9, 10),
    progress: 0.25,
    tasks: 4,
    done: 1,
    overdue: 1,
    health: 'At risk',
    reasons: ['Nothing done lately, so no finish date in sight'],
    forecast: null,
    slackDays: null,
    milestones: [],
    lastActivity: null,
    lastDone: new Date(2026, 8, 24, 9),
    ...extra,
  };
}

test("the project page's health sentence", () => {
  const text = healthSentence(project({}), now);
  assert.equal(text, "Nothing done in 9 days; at this pace it won't finish by 10 Oct.");
  assert.doesNotMatch(text, LONG_DASH);
  assert.equal(healthSentence(project({ health: 'Done' }), now), 'Every task is done.');
});

test("the Projects callout names the shared reason", () => {
  const rows = Array.from({ length: 7 }, (_, i) => project({ id: `p${i}` }));
  assert.equal(atRiskSentence(rows), '7 projects are at risk because nothing has moved lately.');
  assert.equal(atRiskSentence([project({ health: 'On track' })]), null);
});
