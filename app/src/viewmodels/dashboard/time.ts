// The Time dashboard's figures for one period (Remix/Dashboard/
// dashboards-redesign.md, sections 9 and 10), from the app's own schema:
//
//   - Tracked time = finished tasks: their actual minutes, otherwise their
//     scheduled length (start to due), placed where they were scheduled
//     (or ending when they were finished). Google Calendar events not linked
//     to a task count too once they've ended.
//   - Planned time = scheduled tasks not done yet.
//   - Type of work, from your task types: a blocked time slot is deep work
//     (as is a calendar focus-time event); Meeting and Event tasks and other
//     calendar events are meetings; To-dos are to-dos; any other type is
//     other.
//   - Targets: your daily capacity on working days (Monday to Friday);
//     areas carry their own weekly hour target (life balance).
//
// No billable cards: the schema has no billable projects or rates. Pure:
// tested in test/dashboard.test.ts.

import {
  addUnit,
  bucketsBetween,
  historyBuckets,
  inRange,
  MON,
  MONTHS,
  overlapMinutes,
  startOf,
  weekdayMon,
  WEEKDAYS_MON,
  type BucketUnit,
  type DashBucket,
  type DashPeriod,
} from '../../shared/dashboard/period';
import { duration, hours as hoursText, percent } from '../../shared/dashboard/format';
import type { Kpi } from '../../widgets/Charts/ChartCard';
import type { CardBase } from './money';

export type TimeCategory = 'deep' | 'meetings' | 'todos' | 'other';
export const TIME_CATEGORIES: TimeCategory[] = ['deep', 'meetings', 'todos', 'other'];
export const CATEGORY_LABEL: Record<TimeCategory, string> = { deep: 'Deep work', meetings: 'Meetings', todos: 'To-dos', other: 'Other' };
export const CATEGORY_COLOR: Record<TimeCategory, string> = {
  deep: 'var(--c-primary)',
  meetings: 'var(--c-primary-dark)',
  todos: 'var(--c-accent)',
  other: 'var(--c-grey)',
};

export interface TimeEntry {
  id: string;
  title: string;
  start: Date;
  end: Date;
  minutes: number;
  category: TimeCategory;
  projectId: string | null;
  areaId: string | null;
  /** Done (tracked) or still planned. */
  tracked: boolean;
}

/** A task as the dashboard reads it (a recurring task arrives as each of its dates). */
export interface TaskLike {
  id: string;
  title: string;
  type: string;
  /** effectiveTimeMode: 'blocked' slots are deep work. */
  mode: 'blocked' | 'free';
  start: Date | null;
  end: Date | null;
  allDay: boolean;
  done: boolean;
  cancelled: boolean;
  completedAt: Date | null;
  actualMinutes: number | null;
  projectId: string | null;
  areaId: string | null;
}

export interface EventLike {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  focus: boolean;
  /** Linked to a task: the task already counts. */
  linked: boolean;
}

const MAX_MINUTES = 16 * 60;

export function categoryOf(task: Pick<TaskLike, 'mode' | 'type'>): TimeCategory {
  // Meetings first: they are blocked slots too, but not deep work.
  const type = task.type.toLowerCase();
  if (type === 'meeting' || type === 'event') return 'meetings';
  if (task.mode === 'blocked') return 'deep';
  if (type === 'todo' || type === 'to-do' || type === 'to do') return 'todos';
  return 'other';
}

/** Tasks and calendar events as tracked and planned stretches of time. */
export function timeEntries(tasks: TaskLike[], events: EventLike[], now: Date): TimeEntry[] {
  const out: TimeEntry[] = [];
  for (const t of tasks) {
    if (t.cancelled || t.allDay) continue;
    const scheduled = t.start && t.end && t.end > t.start ? (t.end.getTime() - t.start.getTime()) / 60000 : null;
    if (t.done) {
      const minutes = t.actualMinutes ?? scheduled;
      if (!minutes || minutes <= 0 || minutes > MAX_MINUTES) continue;
      const start = t.start ?? (t.completedAt ? new Date(t.completedAt.getTime() - minutes * 60000) : null);
      if (!start) continue;
      out.push({ id: t.id, title: t.title, start, end: new Date(start.getTime() + minutes * 60000), minutes, category: categoryOf(t), projectId: t.projectId, areaId: t.areaId, tracked: true });
    } else if (t.start && scheduled && scheduled <= MAX_MINUTES) {
      out.push({ id: t.id, title: t.title, start: t.start, end: t.end!, minutes: scheduled, category: categoryOf(t), projectId: t.projectId, areaId: t.areaId, tracked: false });
    }
  }
  for (const e of events) {
    if (e.linked || e.allDay || e.end <= e.start) continue;
    const minutes = (e.end.getTime() - e.start.getTime()) / 60000;
    if (minutes > MAX_MINUTES) continue;
    out.push({ id: `event-${e.id}`, title: e.title, start: e.start, end: e.end, minutes, category: e.focus ? 'deep' : 'meetings', projectId: null, areaId: null, tracked: e.end <= now });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Tracked minutes inside a range (entries split across its edges). */
export function trackedIn(entries: TimeEntry[], r: { start: Date; end: Date }, pick?: (e: TimeEntry) => boolean): number {
  let total = 0;
  for (const e of entries) if (e.tracked && (!pick || pick(e))) total += overlapMinutes(e.start, e.end, r.start, r.end);
  return total;
}

/** Working days (Monday to Friday) in [start, end). */
export function workdaysIn(start: Date, end: Date): number {
  let n = 0;
  for (let d = startOf('day', start); d < end; d = addUnit('day', d, 1)) if (weekdayMon(d) < 5) n += 1;
  return n;
}

export interface TimeInput {
  entries: TimeEntry[];
  projects: { id: string; name: string; start: Date | null; end: Date | null; done: number; total: number }[];
  areas: { id: string; name: string; weeklyTargetHours: number | null }[];
  /** Minutes a working day should hold. */
  dailyTarget: number;
  workStart: number;
  workEnd: number;
}

export type TimeCard =
  | (CardBase & { id: 'dayline'; blocks: { start: Date; end: Date; label: string; color: string; planned: boolean }[]; from: number; to: number; now: Date | null })
  | (CardBase & { id: 'hoursEach'; data: { label: string; parts: number[] | null }[]; target: number | null })
  | (CardBase & { id: 'donut'; parts: { label: string; value: number; color: string }[] })
  | (CardBase & { id: 'heat'; columns: string[]; rows: { label: string; cells: (number | null)[] }[] })
  | (CardBase & { id: 'projects'; rows: { label: string; value: number; note?: string }[] })
  | (CardBase & { id: 'plan'; rows: { label: string; actual: number; plan: number }[] })
  | (CardBase & { id: 'trend'; labels: { text: string; future?: boolean }[]; values: (number | null)[]; target: number | null; average: number })
  | (CardBase & { id: 'gantt'; rows: { label: string; start: Date; end: Date; done: number }[]; from: Date; to: Date; today: Date })
  | (CardBase & { id: 'radar'; axes: { label: string; actual: number; target: number }[] })
  | (CardBase & { id: 'hist'; data: { label: string; value: number | null }[] })
  | (CardBase & { id: 'box'; groups: { label: string; values: number[] }[] })
  | (CardBase & { id: 'tree'; parts: { label: string; value: number; color: string }[] })
  | (CardBase & { id: 'cal'; view: 'month' | 'year'; days: { date: Date; value: number | null }[] });

export interface TimeDashboard {
  hero: { label: string; value: string; sub: string; insight: string | null; segments: { label: string; value: number; color: string }[] };
  kpis: Kpi[];
  cards: Partial<Record<TimeCard['id'], TimeCard>>;
}

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const dayLabel = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;

/** Bucket units for "hours each period": days, weeks, weeks, months, quarters. */
function hoursUnit(kind: DashPeriod['kind']): BucketUnit {
  return ({ day: 'hour', week: 'day', month: 'week', quarter: 'week', year: 'month', all: 'quarter' } as const)[kind];
}

export function timeDashboard(input: TimeInput, p: DashPeriod, cardIds: string[]): TimeDashboard {
  const { entries, dailyTarget } = input;
  const range = { start: p.start, end: p.to };
  const want = new Set(cardIds);
  const tracked = trackedIn(entries, range);
  const byCat = Object.fromEntries(TIME_CATEGORIES.map((c) => [c, trackedIn(entries, range, (e) => e.category === c)])) as Record<TimeCategory, number>;
  const targetTo = p.kind === 'all' ? null : workdaysIn(p.start, p.to) * dailyTarget || (p.kind === 'day' ? dailyTarget : null);
  const targetFull = p.kind === 'all' ? null : workdaysIn(p.start, p.end) * dailyTarget || null;
  const periodWord = { day: 'today', week: 'this week', month: `in ${MONTHS[p.start.getMonth()]}`, quarter: 'this quarter', year: `in ${p.start.getFullYear()}`, all: 'in total' }[p.kind];

  const hero = {
    label: `Hours tracked ${periodWord}`,
    value: hoursText(tracked),
    sub: targetFull ? `Of a ${hoursText(targetFull)} target${p.inProgress && targetTo !== null ? `, ${hoursText(targetTo)} of it due by now` : ''}.` : 'Everything you have tracked.',
    insight: targetTo ? (tracked >= targetTo ? 'On target so far.' : `${hoursText(targetTo - tracked)} short of the target to date.`) : null,
    segments: TIME_CATEGORIES.filter((c) => byCat[c] > 0).map((c) => ({ label: CATEGORY_LABEL[c], value: Math.round(byCat[c]), color: CATEGORY_COLOR[c] })),
  };

  const focus = entries.filter((e) => e.tracked && e.category === 'deep' && inRange(e.start, range));
  const longest = focus.reduce((m, e) => Math.max(m, e.minutes), 0);
  const tasksDone = entries.filter((e) => e.tracked && !e.id.startsWith('event-') && inRange(e.start, range)).length;
  const prevTracked = p.compare ? trackedIn(entries, p.compare) : null;
  const prevDeep = p.compare ? trackedIn(entries, p.compare, (e) => e.category === 'deep') : null;
  const prevMeet = p.compare ? trackedIn(entries, p.compare, (e) => e.category === 'meetings') : null;
  const compare = (cur: number, prev: number | null, upGood: boolean | null): Kpi['pill'] => {
    if (prev === null) return null;
    const d = cur - prev;
    if (Math.abs(d) < 1) return { text: 'No change', tone: 'neutral', arrow: null };
    return { text: `${hoursText(Math.abs(d))} vs before`, tone: upGood === null ? 'neutral' : d > 0 === upGood ? 'good' : 'bad', arrow: d > 0 ? 'up' : 'down' };
  };
  const days = Math.max(1, workdaysIn(p.start, p.to));
  const kpis: Kpi[] =
    p.kind === 'all'
      ? [
          { label: 'Hours tracked', value: hoursText(tracked), pill: null },
          { label: 'Deep work', value: hoursText(byCat.deep), pill: null, sub: tracked ? `${percent(byCat.deep / tracked, 0)} of tracked time` : undefined },
          { label: 'Meetings', value: hoursText(byCat.meetings), pill: null },
          { label: 'Tasks done', value: String(tasksDone), pill: null },
          { label: 'Longest focus', value: longest ? duration(longest) : '0 min', pill: null },
          { label: 'Average working day', value: hoursText(tracked / days), pill: null },
        ]
      : [
          { label: p.kind === 'day' ? 'Hours today' : 'Hours tracked', value: hoursText(tracked), pill: compare(tracked, prevTracked, true), bar: targetTo ? tracked / targetTo : null, sub: targetTo ? `${percent(tracked / targetTo, 0)} of the target to date` : undefined },
          { label: 'Deep work', value: hoursText(byCat.deep), pill: compare(byCat.deep, prevDeep, true), sub: tracked ? `${percent(byCat.deep / tracked, 0)} of tracked time` : undefined },
          { label: 'Meetings', value: hoursText(byCat.meetings), pill: compare(byCat.meetings, prevMeet, false) },
          { label: 'Tasks done', value: String(tasksDone), pill: null },
          { label: 'Longest focus', value: longest ? duration(longest) : '0 min', pill: null, sub: focus.length ? `${focus.length} focus ${focus.length === 1 ? 'block' : 'blocks'}` : 'No focus blocks yet' },
          p.kind === 'day'
            ? { label: 'Planned for later', value: hoursText(sum(entries.filter((e) => !e.tracked && e.start >= p.now && inRange(e.start, { start: p.start, end: p.end })), (e) => e.minutes)), pill: null }
            : { label: 'Average working day', value: hoursText(tracked / days), pill: null, sub: `Over ${days} working ${days === 1 ? 'day' : 'days'}` },
        ];

  const cards: TimeDashboard['cards'] = {};

  if (want.has('dayline')) {
    const blocks = entries
      .filter((e) => overlapMinutes(e.start, e.end, p.start, p.end) > 0)
      .map((e) => ({ start: e.start, end: e.end, label: e.title, color: CATEGORY_COLOR[e.category], planned: !e.tracked }));
    const hoursUsed = blocks.flatMap((b) => [b.start.getHours(), b.end.getHours() + (b.end.getMinutes() ? 1 : 0)]);
    cards.dayline = {
      id: 'dayline',
      title: 'Your day so far',
      subtitle: `Tracked blocks from ${String(Math.min(7, input.workStart)).padStart(2, '0')}:00, with what is planned for later`,
      blocks,
      from: Math.min(7, input.workStart, ...hoursUsed),
      to: Math.max(19, input.workEnd, ...hoursUsed.map((h) => Math.min(24, h))),
      now: p.inProgress ? p.now : null,
      insight: tracked ? `You have tracked ${hoursText(tracked)} today, ${hoursText(byCat.deep)} of it deep work.` : null,
      empty: blocks.length ? null : 'Nothing tracked or planned today. Schedule a task to see it here.',
    };
  }

  if (want.has('hoursEach') || want.has('trend')) {
    const unit = hoursUnit(p.kind);
    const buckets = bucketsBetween(unit, p.start, p.end, p.now);
    const targetFor = (b: DashBucket) => workdaysIn(b.start, b.end) * dailyTarget;
    if (want.has('hoursEach')) {
      const data = buckets.map((b) => ({
        label: b.label,
        parts: b.future ? null : TIME_CATEGORIES.map((c) => Math.round(trackedIn(entries, { start: b.start, end: b.current ? p.now : b.end }, (e) => e.category === c))),
      }));
      const target = buckets.length ? targetFor(buckets[Math.min(1, buckets.length - 1)]) || null : null;
      const done = data.filter((d) => d.parts).map((d) => sum(d.parts!, (v) => v));
      const best = done.length ? Math.max(...done) : 0;
      const bestIdx = done.indexOf(best);
      cards.hoursEach = {
        id: 'hoursEach',
        title: `Hours each ${unit === 'day' ? 'day' : unit}`,
        subtitle: 'Split by type of work',
        data,
        target,
        insight: best > 0 ? `${data[bestIdx]?.label} was the busiest, with ${hoursText(best)}.` : null,
        empty: tracked > 0 ? null : 'Nothing tracked in this period. Finish a scheduled task to track its time.',
      };
    }
    if (want.has('trend')) {
      const tUnit: BucketUnit = p.kind === 'year' ? 'month' : 'week';
      const hist = p.kind === 'year' ? bucketsBetween('month', p.start, p.end, p.now) : historyBuckets(p, 'week', 12);
      const values = hist.map((b) => (b.future ? null : Math.round(trackedIn(entries, { start: b.start, end: b.current ? p.now : b.end }))));
      const done = values.filter((v, i): v is number => v !== null && !hist[i].current);
      const average = done.length ? sum(done, (v) => v) / done.length : 0;
      const target = tUnit === 'week' ? dailyTarget * 5 : null;
      cards.trend = {
        id: 'trend',
        title: `Hours per ${tUnit} against target`,
        subtitle: target ? `Weekly target ${hoursText(target)}, average ${hoursText(average)}` : `Average ${hoursText(average)}`,
        labels: hist.map((b) => ({ text: b.label, future: b.future })),
        values,
        target,
        average: Math.round(average),
        insight: target && done.length ? `${done.filter((v) => v >= target).length} of ${done.length} ${tUnit}s reached the target.` : null,
      };
    }
  }

  if (want.has('donut')) {
    cards.donut = {
      id: 'donut',
      title: 'Where the hours went',
      subtitle: `Share of the ${hoursText(tracked)} tracked`,
      parts: TIME_CATEGORIES.map((c) => ({ label: CATEGORY_LABEL[c], value: Math.round(byCat[c]), color: CATEGORY_COLOR[c] })),
      insight: tracked ? `${CATEGORY_LABEL[TIME_CATEGORIES.reduce((a, b) => (byCat[b] > byCat[a] ? b : a))]} took the most time.` : null,
      empty: tracked ? null : 'Nothing tracked in this period yet.',
    };
  }

  if (want.has('heat')) {
    const from = Math.min(7, input.workStart);
    const to = Math.max(19, input.workEnd);
    const hourRows = Array.from({ length: to - from }, (_, i) => from + i);
    const actual = p.kind === 'week';
    const dayBuckets = bucketsBetween('day', p.start, p.end, p.now);
    const rows = hourRows.map((h) => {
      const cells = WEEKDAYS_MON.map((_, wd) => {
        const daysOf = dayBuckets.filter((d) => weekdayMon(d.start) === wd);
        if (actual) {
          const d = daysOf[0];
          if (!d) return 0;
          const slot = { start: new Date(d.start.getFullYear(), d.start.getMonth(), d.start.getDate(), h), end: new Date(d.start.getFullYear(), d.start.getMonth(), d.start.getDate(), h + 1) };
          return slot.start > p.now ? null : Math.round(trackedIn(entries, slot));
        }
        const past = daysOf.filter((d) => !d.future);
        if (!past.length) return 0;
        const total = sum(past, (d) => trackedIn(entries, { start: new Date(d.start.getFullYear(), d.start.getMonth(), d.start.getDate(), h), end: new Date(d.start.getFullYear(), d.start.getMonth(), d.start.getDate(), h + 1) }));
        return Math.round(total / past.length);
      });
      return { label: `${String(h).padStart(2, '0')}:00`, cells };
    });
    let peak = { h: '', wd: '', v: 0 };
    rows.forEach((r) => r.cells.forEach((c, i) => (c ?? 0) > peak.v && (peak = { h: r.label, wd: WEEKDAYS_MON[i], v: c ?? 0 })));
    cards.heat = {
      id: 'heat',
      title: 'When you work',
      subtitle: actual ? 'Minutes tracked in each hour this week' : 'Average minutes tracked in each hour, by day of the week',
      columns: WEEKDAYS_MON,
      rows,
      insight: peak.v ? `Your busiest hour is around ${peak.h} on ${peak.wd}.` : null,
      empty: tracked ? null : 'Nothing tracked in this period yet.',
    };
  }

  if (want.has('projects') || want.has('tree')) {
    const by = new Map<string, number>();
    for (const e of entries) {
      if (!e.tracked) continue;
      const m = overlapMinutes(e.start, e.end, range.start, range.end);
      if (m > 0) by.set(e.projectId ?? '', (by.get(e.projectId ?? '') ?? 0) + m);
    }
    const name = (id: string) => (id ? (input.projects.find((x) => x.id === id)?.name ?? 'A project') : 'No project');
    const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([id, m]) => ({ label: name(id), value: Math.round(m), note: tracked ? percent(m / tracked, 0) : undefined }));
    if (want.has('projects'))
      cards.projects = {
        id: 'projects',
        title: 'Time by project',
        subtitle: 'Hours tracked on each project',
        rows: rows.slice(0, 8),
        insight: rows.length ? `${rows[0].label} took ${rows[0].note ?? hoursText(rows[0].value)} of your time.` : null,
        empty: rows.length ? null : 'Nothing tracked on a project in this period.',
      };
    if (want.has('tree')) {
      const fills = ['var(--c-primary-dark)', 'var(--c-primary)', 'var(--c-primary-mid)', 'var(--c-accent)', 'var(--c-grey)'];
      cards.tree = {
        id: 'tree',
        title: 'Where all your hours went',
        subtitle: 'Every hour tracked, by project',
        parts: rows.map((r, i) => ({ label: r.label, value: r.value, color: fills[i] ?? 'var(--c-grey)' })),
        insight: rows.length ? `${rows[0].label} is where most of your time has gone.` : null,
        empty: rows.length ? null : 'Nothing tracked yet.',
      };
    }
  }

  if (want.has('plan')) {
    const planEnd = p.kind === 'day' ? p.end : p.kind === 'week' ? p.to : p.end;
    const planRange = { start: p.start, end: planEnd };
    const by = new Map<string, { plan: number; actual: number }>();
    for (const e of entries) {
      const m = overlapMinutes(e.start, e.end, planRange.start, planRange.end);
      if (m <= 0) continue;
      const row = by.get(e.projectId ?? '') ?? { plan: 0, actual: 0 };
      row.plan += m;
      if (e.tracked) row.actual += overlapMinutes(e.start, e.end, range.start, range.end);
      by.set(e.projectId ?? '', row);
    }
    const name = (id: string) => (id ? (input.projects.find((x) => x.id === id)?.name ?? 'A project') : 'No project');
    const rows = [...by.entries()].sort((a, b) => b[1].plan - a[1].plan).slice(0, 6).map(([id, r]) => ({ label: name(id), plan: Math.round(r.plan), actual: Math.round(r.actual) }));
    cards.plan = {
      id: 'plan',
      title: 'Planned against actual',
      subtitle: p.kind === 'day' ? "Today's plan, by project" : p.kind === 'week' ? 'The plan to date, by project' : 'The plan for the period, by project',
      rows,
      insight: rows.length ? `${rows.filter((r) => r.actual >= r.plan).length} of ${rows.length} projects got their planned time.` : null,
      empty: rows.length ? null : 'Nothing scheduled in this period. Schedule tasks to plan your time.',
    };
  }

  if (want.has('gantt')) {
    const months = p.kind === 'week' ? 0 : p.kind === 'month' ? 2 : 4;
    const from = p.kind === 'week' ? addUnit('week', startOf('week', p.now), -1) : startOf('month', p.start);
    const to = p.kind === 'week' ? addUnit('week', from, 4) : addUnit('month', from, months);
    const rows = input.projects
      .filter((x) => x.start && x.end && x.end > from && x.start < to)
      .sort((a, b) => a.start!.getTime() - b.start!.getTime())
      .slice(0, 8)
      .map((x) => ({ label: x.name, start: x.start!, end: x.end!, done: x.total ? x.done / x.total : 0 }));
    cards.gantt = {
      id: 'gantt',
      title: 'Project timeline',
      subtitle: `${dayLabel(from)} to ${dayLabel(new Date(to.getTime() - 1))}`,
      rows,
      from,
      to,
      today: p.now,
      insight: rows.length ? `${rows.filter((r) => r.end < p.now && r.done < 1).length || 'No'} ${rows.filter((r) => r.end < p.now && r.done < 1).length === 1 ? 'project is' : 'projects are'} past due and unfinished.` : null,
      empty: rows.length ? null : 'No projects with start and due dates in this window.',
    };
  }

  if (want.has('radar')) {
    const weeks = Math.max(1 / 7, (p.to.getTime() - p.start.getTime()) / (7 * 86_400_000));
    const withTarget = input.areas.filter((a) => (a.weeklyTargetHours ?? 0) > 0);
    const axes = withTarget.map((a) => ({
      label: a.name,
      actual: trackedIn(entries, range, (e) => e.areaId === a.id) / 60,
      target: (a.weeklyTargetHours ?? 0) * weeks,
    }));
    cards.radar = {
      id: 'radar',
      title: 'Life balance',
      subtitle: 'Hours in each area as a share of your weekly targets',
      axes,
      insight: axes.length ? `${axes.filter((x) => x.actual >= x.target).length} of ${axes.length} areas reached their target.` : null,
      empty: axes.length >= 3 ? null : 'Set a weekly hour target on at least three areas to see your balance.',
    };
  }

  if (want.has('hist')) {
    const bins = [
      { label: 'Under 30 min', lo: 0, hi: 30 },
      { label: '30 to 60 min', lo: 30, hi: 60 },
      { label: '1 to 1.5 h', lo: 60, hi: 90 },
      { label: '1.5 to 2 h', lo: 90, hi: 120 },
      { label: '2 to 3 h', lo: 120, hi: 180 },
      { label: '3 h or more', lo: 180, hi: Infinity },
    ];
    const data = bins.map((b) => ({ label: b.label, value: focus.filter((e) => e.minutes >= b.lo && e.minutes < b.hi).length }));
    const avg = focus.length ? sum(focus, (e) => e.minutes) / focus.length : 0;
    cards.hist = {
      id: 'hist',
      title: 'How long you stay focused',
      subtitle: 'Deep work blocks by length',
      data,
      insight: focus.length ? `Your focus blocks last ${duration(avg)} on average.` : null,
      empty: focus.length ? null : 'No deep work blocks yet. Block time for a task to count it.',
    };
  }

  if (want.has('box')) {
    const byYear = new Map<number, number[]>();
    for (let w = startOf('week', p.start); addUnit('week', w, 1) <= p.now; w = addUnit('week', w, 1)) {
      const v = trackedIn(entries, { start: w, end: addUnit('week', w, 1) });
      byYear.set(w.getFullYear(), [...(byYear.get(w.getFullYear()) ?? []), Math.round(v)]);
    }
    const groups = [...byYear.entries()].map(([y, values]) => ({ label: String(y), values }));
    cards.box = {
      id: 'box',
      title: 'Weekly hours by year',
      subtitle: 'Every complete week, summarised for each year',
      groups,
      empty: groups.length ? null : 'Not enough complete weeks yet.',
    };
  }

  if (want.has('cal')) {
    const view = p.kind === 'month' ? 'month' : 'year';
    const start = p.kind === 'all' ? addUnit('week', startOf('week', p.now), -51) : p.start;
    const end = p.kind === 'year' ? p.end : p.kind === 'all' ? addUnit('day', startOf('day', p.now), 1) : p.end;
    const days = bucketsBetween('day', start, end, p.now).map((b) => ({ date: b.start, value: b.future ? null : Math.round(trackedIn(entries, { start: b.start, end: b.end })) }));
    const active = days.filter((d) => (d.value ?? 0) > 0).length;
    cards.cal = {
      id: 'cal',
      view,
      title: 'Every day',
      subtitle: view === 'month' ? 'Hours tracked on each day' : 'Hours tracked on each day, darker is more',
      days,
      insight: active ? `You tracked time on ${active} of ${days.filter((d) => d.value !== null).length} days.` : null,
      empty: active ? null : 'Nothing tracked in this period yet.',
    };
  }

  return { hero, kpis, cards };
}
