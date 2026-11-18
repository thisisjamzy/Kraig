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
import { INSIGHTS_DEFAULTS } from '../app/src/viewmodels/insights/settings';
import { addDays, rangeFor, startOfDay } from '../app/src/viewmodels/insights/dates';
import type { InsightAlert } from '../app/src/viewmodels/insights/alerts';
import type { ProjectStat } from '../app/src/viewmodels/insights/metrics';
import type { InsightTask } from '../app/src/viewmodels/insights/types';
import { atRiskSentence, healthSentence, type ProjectRow } from '../app/src/viewmodels/projectRow';
import { busySpans, dayLoad, dayText, durationText, freeGaps, freeMinutes, isToPlan, lateText, planDay, slotOptions, statusText, weekNumber, WORKDAY } from '../app/src/viewmodels/todayPlan';
import { typeLook } from '../app/src/viewmodels/taskTypes';
import { bookedMinutes, organise, stageOf, weekBounds } from '../app/src/viewmodels/organise';
import { daySlots, dayWords, inviteLinks, rangesClash, whenWords, type SchedLink } from '../app/src/viewmodels/scheduling-links';
import { blockWords, DEFAULT_PLANNING, perDayWords } from '../app/src/viewmodels/planning-settings';
import { contactHref, initialsOf, lastTouchWords, waitingOnYouRows, type Person } from '../app/src/viewmodels/people';
import type { FirestoreArea, FirestoreSection } from '../app/src/shared/firestore/types';

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
  assert.deepEqual(hourRange([], false), { first: 6, last: 22 });
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

// ---- Time v1.0: Today, Tasks and Calendar (viewmodels/todayPlan.ts, taskTypes.ts) ----


test('lengths, lateness and days read the way the v1.0 frames write them', () => {
  assert.equal(durationText(15), '15 min');
  assert.equal(durationText(60), '1 h');
  assert.equal(durationText(90), '1 h 30 min');
  assert.equal(lateText(at(9, 0, 2), now), 'Yesterday');
  assert.equal(lateText(at(9, 0, 1), now), '2 days late');
  assert.equal(lateText(at(8), now), null);
  assert.equal(dayText(at(12), now), 'Today');
  assert.equal(dayText(at(12, 0, 4), now), 'Tomorrow');
  assert.equal(dayText(at(12, 0, 7), now), 'Wed 7 Oct');
  assert.equal(weekNumber(new Date(2026, 10, 17)), 47);
  for (const s of [durationText(90), lateText(at(9, 0, 1), now)!, dayText(at(12, 0, 7), now)]) assert.doesNotMatch(s, LONG_DASH);
});

test('free time is the working day less the blocks that take time', () => {
  const busy = busySpans(
    [
      { start: at(9), end: at(11), allDay: false },
      { start: at(10, 30), end: at(12), allDay: false },
      { start: at(13), end: at(14), allDay: false },
      { start: at(15), end: at(16), allDay: false, free: true },
      { start: at(0), end: at(23, 59), allDay: true },
    ],
    at(0)
  );
  assert.deepEqual(busy, [
    { startMin: 540, endMin: 720 },
    { startMin: 780, endMin: 840 },
  ]);
  assert.equal(freeMinutes(busy), WORKDAY.endMin - WORKDAY.startMin - 240);
  assert.deepEqual(freeGaps(busy, 600), [
    { startMin: 720, endMin: 780 },
    { startMin: 840, endMin: WORKDAY.endMin },
  ]);
});

test('Plan my day fills free gaps in order and skips what does not fit', () => {
  const busy = [{ startMin: 540, endMin: 720 }];
  const placed = planDay(
    [
      { id: 'a', minutes: 30 },
      { id: 'b', minutes: 0 },
      { id: 'c', minutes: 600 },
    ],
    busy,
    8 * 60 + 5
  );
  assert.deepEqual(placed, [
    { id: 'a', startMin: 495, endMin: 525 },
    { id: 'b', startMin: 720, endMin: 780 },
  ]);
});

test('block time offers the first fit in each gap, today first', () => {
  const days = [
    { iso: '2026-10-03', date: at(0), busy: [{ startMin: 600, endMin: 1020 }], from: 10 * 60, after: () => 'after your errands' },
    { iso: '2026-10-04', date: at(0, 0, 4), busy: [{ startMin: 720, endMin: 780 }], from: 0 },
  ];
  const slots = slotOptions(90, days, now);
  assert.deepEqual(
    slots.map((s) => [s.iso, s.startMin, s.endMin, s.note]),
    [
      ['2026-10-03', 1020, 1110, 'Today, after your errands'],
      ['2026-10-04', WORKDAY.startMin, WORKDAY.startMin + 90, 'Tomorrow, first thing'],
      ['2026-10-04', 780, 870, 'Tomorrow'],
    ]
  );
});

test('to plan means pending with no time block; status words', () => {
  assert.equal(isToPlan({ status: 'Pending', allDay: true, start: at(0), end: at(23, 59) }), true);
  assert.equal(isToPlan({ status: 'Pending', allDay: false, start: null, end: null }), true);
  assert.equal(isToPlan({ status: 'Pending', allDay: false, start: at(9), end: at(10) }), false);
  assert.equal(isToPlan({ status: 'Done', allDay: true, start: null, end: null }), false);
  const base = { status: 'Pending' as const, allDay: false, start: at(9), end: at(11) };
  assert.equal(statusText({ ...base, rawStatus: 'Pending' }, now), 'In progress');
  assert.equal(statusText({ ...base, rawStatus: 'Pending', start: at(11), end: at(12) }, now), 'To do');
  assert.equal(statusText({ ...base, rawStatus: 'Stuck' }, now), 'Waiting');
  assert.equal(statusText({ ...base, status: 'Done', rawStatus: 'Done' }, now), 'Done');
});

test('task types read their v1.0 hue whatever the spelling', () => {
  assert.equal(typeLook('ToDo').label, 'To-do');
  assert.equal(typeLook('Deep work').hue, 'purple');
  assert.equal(typeLook('DeepWork').hue, 'purple');
  assert.equal(typeLook('Follow-up').hue, 'amber');
  assert.equal(typeLook('Call').hue, 'green');
  assert.deepEqual(typeLook('Gardening'), { label: 'Gardening', hue: 'grey', icon: 'custom' });
});

// ---- Time v1.0: Organise (viewmodels/organise.ts) ----

test('time blocked counts timed, blocked tasks inside the week', () => {
  const { from, to } = weekBounds(now);
  assert.equal(from.getDay(), 1);
  assert.equal(to.getTime() - from.getTime(), 7 * 86_400_000);
  assert.equal(bookedMinutes(doc(), from, to), 240);
  assert.equal(bookedMinutes(doc({ timeMode: 'free' }), from, to), 0);
  assert.equal(bookedMinutes(doc({ allDay: true }), from, to), 0);
  assert.equal(bookedMinutes(doc({ startTime: ts(at(8, 0, 20)), dueDate: ts(at(9, 0, 20)) }), from, to), 0);
});

test('a project reads Planned, In progress, At risk or Done', () => {
  const later = new Date(2026, 11, 1);
  assert.equal(stageOf({ status: 'Active', health: 'On track', done: 0, start: later }, now), 'Planned');
  assert.equal(stageOf({ status: 'Active', health: 'On track', done: 2, start: null }, now), 'In progress');
  assert.equal(stageOf({ status: 'Active', health: 'At risk', done: 2, start: null }, now), 'At risk');
  assert.equal(stageOf({ status: 'Completed', health: 'On track', done: 2, start: null }, now), 'Done');
});

test('areas sum their folders, and a project with no folder sits in the default one', () => {
  const area = { id: 'a1', name: 'Work', emoji: null, color: '#7b7ef3', description: 'Paid work', archived: false, weeklyHoursTarget: 30 } as FirestoreArea;
  const sections = [
    { id: 's1', name: 'Dreda app', emoji: null, color: '#3a81f8', description: '', areaId: 'a1', archived: false },
    { id: 'default-a1', name: 'General', emoji: null, color: '', description: '', areaId: 'a1', archived: false, isDefault: true },
  ] as FirestoreSection[];
  const rows = [project({ id: 'p1', name: 'Dreda', color: '#3a81f8', areaId: 'a1', areaName: 'Work', folderId: 's1' }), project({ id: 'p2', name: 'Loose', areaId: 'a1', areaName: 'Work', folderId: null })];
  const tasks = [
    doc({ id: 't1', projectId: 'p1' }),
    doc({ id: 't2', projectId: 'p1', done: true, status: 'Done' }),
    doc({ id: 't3', projectId: 'p2', startTime: ts(at(8, 0, 1)), dueDate: ts(at(9, 0, 1)) }),
  ];
  const o = organise({ areas: [area], sections, rows, priorities: new Map([['p1', 'High']]), tasks, week: tasks, now });
  const [a] = o.areas;
  assert.equal(a.projects.length, 2);
  assert.deepEqual(a.folders.map((f) => f.name), ['Dreda app', 'General']);
  assert.equal(a.open, 2);
  assert.equal(a.overdue, 1);
  assert.equal(a.total, 3);
  assert.equal(a.weeklyHours, 30);
  const dreda = o.projects.find((p) => p.id === 'p1')!;
  assert.equal(dreda.folderName, 'Dreda app');
  assert.equal(dreda.hue, 'blue');
  assert.equal(dreda.priorityText, 'High priority');
  assert.equal(dreda.nextUp?.id, 't1');
  assert.equal(o.projects.find((p) => p.id === 'p2')!.folderName, null);
  assert.deepEqual(o.nextUp({ folderId: 's1' }).map((n) => n.id), ['t1']);
});

// ---- Time v1.0: People, Scheduling, Planning ----

test('scheduling links say their hours the way the frames do', () => {
  assert.equal(dayWords([0, 1, 2, 3, 4]), 'Mon to Fri');
  assert.equal(dayWords([1, 3]), 'Tue and Thu');
  assert.equal(dayWords([4]), 'Fri only');
  const r = { from: '10:00', to: '16:00' };
  const link = { cadence: 'repeating', until: null, hours: [[r], [r], [r], [r], [r], [], []] } as unknown as SchedLink;
  assert.equal(whenWords(link), 'Every week, Mon to Fri, 10:00 to 16:00');
  const two = { ...link, hours: [[r], [{ from: '10:00', to: '12:00' }, { from: '14:00', to: '17:00' }], [], [], [], [], []] } as SchedLink;
  assert.equal(whenWords(two), 'Every week, Mon and Tue, hours vary by day');
  assert.equal(rangesClash([{ from: '09:00', to: '12:00' }, { from: '11:00', to: '13:00' }]), true);
  assert.equal(rangesClash([{ from: '09:00', to: '12:00' }, { from: '12:00', to: '13:00' }]), false);
});

test('planning settings read as the frames', () => {
  const [email, , follow, walk, deep, planning] = DEFAULT_PLANNING.types;
  assert.equal(blockWords(email), 'Weekdays, 7:00 to 8:00');
  assert.equal(blockWords(follow), 'With calls, 14:00 to 15:00');
  assert.equal(blockWords(walk), 'Tue and Thu, 16:00 to 17:30');
  assert.equal(blockWords(planning), 'Daily, 8:30 to 8:45');
  assert.equal(perDayWords(email), 'Up to 6');
  assert.equal(perDayWords(deep), 'See limits');
  assert.equal(perDayWords(planning), '1');
});

test('people: waiting rows, last in touch, initials and where a message opens', () => {
  const person = { id: 'p', name: 'Dr Fon Ngwa', role: '', category: '', priority: 'normal', email: 'f@example.com', phone: '', place: '', preferredChannel: 'email', notes: '', avatarId: 'm1', archived: false, lastSpoke: at(9, 0, 1), history: [], youWaitFor: [], waitingOnYou: [{ id: 'w', title: 'Reply', where: '', why: 'Reply', due: at(9, 0, 1) }] } as Person;
  assert.equal(initialsOf(person.name), 'FN');
  assert.equal(lastTouchWords(person.lastSpoke, now), 'last in touch Thursday');
  assert.equal(waitingOnYouRows([person], now)[0].late, 2);
  assert.equal(contactHref(person, 'Hi'), 'mailto:f@example.com?subject=Hi');
});

test('the booker sees half-hour times that fit, free of other bookings and the gap', () => {
  const link = { id: 'l', active: true, until: null, minutes: 30, gapMinutes: 15, perDay: 3, hours: [[{ from: '10:00', to: '12:00' }], [], [], [], [], [], []] } as unknown as SchedLink;
  const monday = new Date(2026, 9, 5);
  const times = (bookings: Parameters<typeof daySlots>[2]) => daySlots(link, monday, bookings, now).map((d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
  assert.deepEqual(times([]), ['10:00', '10:30', '11:00', '11:30']);
  const booked = [{ id: 'b', linkId: 'l', name: 'A', email: '', note: '', at: new Date(2026, 9, 5, 10, 30), status: 'requested' as const }];
  assert.deepEqual(times(booked), ['11:30']);
  assert.deepEqual(daySlots(link, new Date(2026, 9, 6), [], now), []);
  assert.deepEqual(daySlots({ ...link, active: false }, monday, [], now), []);
  const invite = inviteLinks({ title: 'Intro call', start: new Date(Date.UTC(2026, 10, 19, 14)), end: new Date(Date.UTC(2026, 10, 19, 14, 30)), details: 'Hi', location: 'Video call' });
  assert.match(invite.google, /dates=20261119T140000Z%2F20261119T143000Z/);
  assert.match(invite.ics, /DTSTART:20261119T140000Z/);
});

test('Home reads a day as meetings, other blocks and free time, and calls a full day', () => {
  const day = at(0, 0, 5);
  const m = (h1: number, h2: number) => ({ start: at(h1, 0, 5), end: at(h2, 0, 5), allDay: false, meeting: true });
  const light = dayLoad([m(9, 10), { start: at(13, 0, 5), end: at(15, 0, 5), allDay: false }], day);
  assert.equal(light.meetingMin, 60);
  assert.equal(light.focusMin, 120);
  assert.equal(light.freeMin, WORKDAY.endMin - WORKDAY.startMin - 180);
  assert.equal(light.meetings, 1);
  assert.equal(light.full, false);
  const full = dayLoad([m(6, 10), m(10, 14), m(14, 18), m(18, 22)], day);
  assert.equal(full.full, true);
  assert.equal(full.meetings, 4);
});
