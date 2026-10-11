// The dashboards' periods (Money and Time): Day, Week, Month, Quarter, Year
// and All time, always to date. A period knows its range, the part that has
// happened (`to`), the same point in the previous period to compare with,
// and how to cut itself (or a history around it) into buckets. Buckets that
// haven't happened yet are marked `future`, so charts draw them as empty
// dashed slots, never as zero. Weeks start on Monday. Pure: tested in
// test/dashboard.test.ts.

export type DashKind = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';
export type BucketUnit = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export const DASH_KINDS: DashKind[] = ['day', 'week', 'month', 'quarter', 'year', 'all'];
export const KIND_LABEL: Record<DashKind, string> = { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year', all: 'All time' };

export interface DashBucket {
  key: string;
  /** Short label for an axis: "Mon", "Sep", "Q3", "09:00", "28 Sep". */
  label: string;
  /** Longer label for tooltips and insights: "week of 28 Sep". */
  long: string;
  start: Date;
  /** Exclusive. */
  end: Date;
  /** Hasn't started yet. */
  future: boolean;
  /** Contains `now`. */
  current: boolean;
}

export interface DashPeriod {
  kind: DashKind;
  start: Date;
  /** Exclusive end of the whole period. */
  end: Date;
  now: Date;
  /** The part that has happened: min(end, now). */
  to: Date;
  inProgress: boolean;
  /** The same point in the previous period (null for All time). */
  compare: { start: Date; end: Date } | null;
  /** "September 2026", "28 Sep to 4 Oct", "Q3 2026", "2026", "Today", "All time". */
  label: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

export function startOf(unit: BucketUnit, d: Date): Date {
  switch (unit) {
    case 'hour':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    case 'week': {
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
    }
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case 'quarter':
      return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    case 'year':
      return new Date(d.getFullYear(), 0, 1);
  }
}

export function addUnit(unit: BucketUnit, d: Date, n: number): Date {
  switch (unit) {
    case 'hour':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + n);
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    case 'week':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n);
    case 'month':
      return new Date(d.getFullYear(), d.getMonth() + n, 1);
    case 'quarter':
      return new Date(d.getFullYear(), d.getMonth() + 3 * n, 1);
    case 'year':
      return new Date(d.getFullYear() + n, 0, 1);
  }
}

const dayMonth = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;

function bucketLabels(unit: BucketUnit, start: Date): { label: string; long: string; key: string } {
  switch (unit) {
    case 'hour':
      return { label: `${pad(start.getHours())}:00`, long: `${pad(start.getHours())}:00`, key: `${start.toISOString()}` };
    case 'day':
      return { label: DAYS[start.getDay()], long: `${DAYS[start.getDay()]} ${dayMonth(start)}`, key: `d${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` };
    case 'week':
      return { label: dayMonth(start), long: `week of ${dayMonth(start)}`, key: `w${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` };
    case 'month':
      return { label: MON[start.getMonth()], long: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`, key: `m${start.getFullYear()}-${pad(start.getMonth() + 1)}` };
    case 'quarter': {
      const q = Math.floor(start.getMonth() / 3) + 1;
      return { label: `Q${q} ${String(start.getFullYear()).slice(2)}`, long: `Q${q} ${start.getFullYear()}`, key: `q${start.getFullYear()}-${q}` };
    }
    case 'year':
      return { label: String(start.getFullYear()), long: String(start.getFullYear()), key: `y${start.getFullYear()}` };
  }
}

/** Buckets of `unit` from `start` up to (not including) `end`, marked future/current against `now`. */
export function bucketsBetween(unit: BucketUnit, start: Date, end: Date, now: Date): DashBucket[] {
  const out: DashBucket[] = [];
  let cursor = startOf(unit, start);
  // Guard against runaway loops on bad input.
  for (let i = 0; cursor < end && i < 400; i++) {
    const next = addUnit(unit, cursor, 1);
    out.push({ ...bucketLabels(unit, cursor), start: cursor, end: next, future: cursor > now, current: cursor <= now && now < next });
    cursor = next;
  }
  return out;
}

function unitOf(kind: Exclude<DashKind, 'all'>): BucketUnit {
  return kind;
}

/** The period of `kind` containing `anchor`, to date. `first` is the earliest record (All time). */
export function buildPeriod(kind: DashKind, anchor: Date, now: Date, first: Date | null = null): DashPeriod {
  if (kind === 'all') {
    const start = startOf('month', first && first < now ? first : addUnit('month', now, -11));
    const end = addUnit('day', startOf('day', now), 1);
    return { kind, start, end, now, to: now, inProgress: true, compare: null, label: 'All time' };
  }
  const unit = unitOf(kind);
  const start = startOf(unit, anchor);
  const end = addUnit(unit, start, 1);
  const inProgress = start <= now && now < end;
  const to = inProgress ? now : end;
  const prevStart = addUnit(unit, start, -1);
  // A period in progress compares with the same point in the previous one;
  // a finished one with the whole previous period.
  const compare = { start: prevStart, end: inProgress ? new Date(prevStart.getTime() + (now.getTime() - start.getTime())) : start };
  return { kind, start, end, now, to, inProgress, compare, label: periodLabel(kind, start, end, now) };
}

export function periodLabel(kind: DashKind, start: Date, end: Date, now: Date): string {
  const last = new Date(end.getTime() - 1);
  switch (kind) {
    case 'day':
      return startOf('day', now).getTime() === start.getTime() ? `Today, ${dayMonth(start)}` : `${DAYS[start.getDay()]} ${dayMonth(start)}`;
    case 'week':
      return `${dayMonth(start)} to ${dayMonth(last)}`;
    case 'month':
      return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
    case 'quarter':
      return `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`;
    case 'year':
      return String(start.getFullYear());
    case 'all':
      return 'All time';
  }
}

/** The next or previous period's anchor; null when there is none (All time, or past now). */
export function stepAnchor(p: DashPeriod, delta: -1 | 1): Date | null {
  if (p.kind === 'all') return null;
  const next = addUnit(unitOf(p.kind), p.start, delta);
  return next > p.now ? null : next;
}

/** How far back the specific-period list reaches when there is no first record. */
const CHOICE_LIMIT: Record<Exclude<DashKind, 'all'>, number> = { day: 90, week: 104, month: 60, quarter: 20, year: 10 };

/**
 * The specific periods to pick from, newest first: the current one back to
 * the one holding the first record (capped). Older days and weeks name their
 * year. `value` is the start as a date parameter.
 */
export function periodChoices(kind: DashKind, now: Date, first: Date | null): { value: string; label: string }[] {
  if (kind === 'all') return [];
  const unit = unitOf(kind);
  const earliest = first ? startOf(unit, first) : null;
  const out: { value: string; label: string }[] = [];
  let start = startOf(unit, now);
  for (let i = 0; i < CHOICE_LIMIT[kind]; i++) {
    if (earliest && start < earliest) break;
    const end = addUnit(unit, start, 1);
    const label = periodLabel(kind, start, end, now);
    const needsYear = (kind === 'day' || kind === 'week') && start.getFullYear() !== now.getFullYear();
    out.push({ value: dateParam(start), label: needsYear ? `${label} ${start.getFullYear()}` : label });
    start = addUnit(unit, start, -1);
  }
  return out;
}

/** The unit trend charts use for a period (the brief's table). Quarters are months for money, weeks for time. */
export function trendUnit(kind: DashKind, dashboard: 'money' | 'time'): BucketUnit {
  switch (kind) {
    case 'day':
      return 'hour';
    case 'week':
      return 'day';
    case 'month':
      return 'week';
    case 'quarter':
      return dashboard === 'money' ? 'month' : 'week';
    case 'year':
      return 'month';
    case 'all':
      return 'quarter';
  }
}

/** The period's own buckets at its trend unit. A day keeps only `hours` (e.g. 6 to 22). */
export function periodBuckets(p: DashPeriod, dashboard: 'money' | 'time', hours?: [number, number]): DashBucket[] {
  const unit = trendUnit(p.kind, dashboard);
  const all = bucketsBetween(unit, p.start, p.end, p.now);
  if (unit !== 'hour' || !hours) return all;
  return all.filter((b) => b.start.getHours() >= hours[0] && b.start.getHours() < hours[1]);
}

/** `count` buckets of `unit` ending with the one that holds the period's last moment. */
export function historyBuckets(p: DashPeriod, unit: BucketUnit, count: number): DashBucket[] {
  const lastStart = startOf(unit, new Date(Math.min(p.end.getTime() - 1, Math.max(p.start.getTime(), p.to.getTime() - 1))));
  return bucketsBetween(unit, addUnit(unit, lastStart, -(count - 1)), addUnit(unit, lastStart, 1), p.now);
}

/** The page's title and one-line subtitle for a period. */
export function periodWords(p: DashPeriod, dashboard: 'money' | 'time'): { title: string; subtitle: string } {
  const what = dashboard === 'money' ? 'Your money' : 'Your time';
  const compareWord = { day: 'your average day', week: 'the same point last week', month: 'the same point last month', quarter: 'the same point last quarter', year: 'the same point last year', all: '' }[p.kind];
  const titles: Record<DashKind, string> = {
    day: `${what} today`,
    week: `${what} this week`,
    month: `${what} in ${MONTHS[p.start.getMonth()]}`,
    quarter: `${what} this quarter`,
    year: `${what} in ${p.start.getFullYear()}`,
    all: `${what}, all time`,
  };
  const title = p.inProgress || p.kind === 'all' ? titles[p.kind] : `${what}, ${p.label}`;
  const subtitle =
    p.kind === 'all'
      ? 'Everything since your first record.'
      : p.inProgress
        ? `${p.label}, so far. Comparisons are with ${compareWord}.`
        : `${p.label}. Comparisons are with the period before.`;
  return { title, subtitle };
}

/** `yyyy-mm-dd` for the address bar, and back. */
export function dateParam(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDateParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const out = new Date(y, m - 1, d);
  return Number.isNaN(out.getTime()) ? null : out;
}

export function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const s = Math.max(aStart.getTime(), bStart.getTime());
  const e = Math.min(aEnd.getTime(), bEnd.getTime());
  return e > s ? (e - s) / 60000 : 0;
}

export const inRange = (d: Date, r: { start: Date; end: Date }) => d >= r.start && d < r.end;
export const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** 0 = Monday. */
export const weekdayMon = (d: Date) => (d.getDay() + 6) % 7;
export { MONTHS, MON };
