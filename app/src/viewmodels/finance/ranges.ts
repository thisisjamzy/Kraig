// Time ranges for Finance Insights: the period a range kind covers, moving
// to the previous/next one, what it's compared against, its label, and the
// chart intervals (granularity adapts to the range's length).

export type RangeKind = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';
export type CompareTo = 'previous' | 'lastYear';
export type Granularity = 'hour' | 'day' | 'week' | 'month' | 'quarter';

export interface Period {
  kind: RangeKind;
  start: Date; // inclusive, 00:00
  end: Date; // inclusive, 23:59:59.999
}

export interface Interval {
  key: string;
  start: Date;
  end: Date;
  label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const DAY_MS = 86_400_000;

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}
export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthStart(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}
export function monthEnd(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0, 23, 59, 59, 999);
}
export function shiftMonthKey(key: string, delta: number) {
  const d = monthStart(key);
  return monthKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}
export function daysInMonth(key: string) {
  return monthEnd(key).getDate();
}
export function monthName(key: string, long = true) {
  const m = Number(key.slice(5)) - 1;
  return long ? MONTHS_LONG[m] : MONTHS[m];
}
/** Every "YYYY-MM" the period touches, in order. */
export function monthsIn(period: { start: Date; end: Date }): string[] {
  const out: string[] = [];
  let key = monthKey(period.start);
  const last = monthKey(period.end);
  while (key <= last) {
    out.push(key);
    key = shiftMonthKey(key, 1);
  }
  return out;
}
/** Fraction of `month` that falls inside the period (by days). */
export function monthShare(month: string, period: { start: Date; end: Date }) {
  const s = Math.max(monthStart(month).getTime(), startOfDay(period.start).getTime());
  const e = Math.min(monthEnd(month).getTime(), endOfDay(period.end).getTime());
  if (e < s) return 0;
  return Math.round((e - s) / DAY_MS) / daysInMonth(month);
}
export function daysBetween(start: Date, end: Date) {
  return Math.round((endOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS);
}

/** Monday-first week containing `d`. */
function weekStart(d: Date) {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() + 6) % 7));
}

/** The period of `kind` containing `anchor` (custom/all take explicit bounds). */
export function periodFor(kind: RangeKind, anchor: Date, bounds?: { start: Date; end: Date }): Period {
  switch (kind) {
    case 'day':
      return { kind, start: startOfDay(anchor), end: endOfDay(anchor) };
    case 'week': {
      const s = weekStart(anchor);
      return { kind, start: s, end: endOfDay(addDays(s, 6)) };
    }
    case 'month':
      return { kind, start: new Date(anchor.getFullYear(), anchor.getMonth(), 1), end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999) };
    case 'quarter': {
      const q = Math.floor(anchor.getMonth() / 3) * 3;
      return { kind, start: new Date(anchor.getFullYear(), q, 1), end: new Date(anchor.getFullYear(), q + 3, 0, 23, 59, 59, 999) };
    }
    case 'year':
      return { kind, start: new Date(anchor.getFullYear(), 0, 1), end: new Date(anchor.getFullYear(), 11, 31, 23, 59, 59, 999) };
    default:
      return { kind, start: startOfDay(bounds!.start), end: endOfDay(bounds!.end) };
  }
}

/** The previous (−1) or next (+1) period of the same kind. */
export function shiftPeriod(p: Period, delta: -1 | 1): Period {
  const s = p.start;
  switch (p.kind) {
    case 'day':
      return periodFor('day', addDays(s, delta));
    case 'week':
      return periodFor('week', addDays(s, 7 * delta));
    case 'month':
      return periodFor('month', new Date(s.getFullYear(), s.getMonth() + delta, 1));
    case 'quarter':
      return periodFor('quarter', new Date(s.getFullYear(), s.getMonth() + 3 * delta, 1));
    case 'year':
      return periodFor('year', new Date(s.getFullYear() + delta, 0, 1));
    default: {
      const len = daysBetween(p.start, p.end);
      return periodFor(p.kind, s, { start: addDays(p.start, len * delta), end: addDays(p.end, len * delta) });
    }
  }
}

/** What the period is compared against. */
export function comparisonPeriod(p: Period, compareTo: CompareTo): Period {
  if (compareTo === 'previous') return shiftPeriod(p, -1);
  const back = (d: Date) => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return { kind: p.kind, start: back(p.start), end: back(p.end) };
}

export function periodLabel(p: Period): string {
  const s = p.start;
  const short = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  switch (p.kind) {
    case 'day':
      return s.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    case 'week':
      return `${short(s)} to ${short(p.end)}`;
    case 'month':
      return `${MONTHS_LONG[s.getMonth()]} ${s.getFullYear()}`;
    case 'quarter':
      return `Q${Math.floor(s.getMonth() / 3) + 1} ${s.getFullYear()}`;
    case 'year':
      return String(s.getFullYear());
    case 'all':
      return `Since ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    default:
      return s.getFullYear() === p.end.getFullYear() ? `${short(s)} to ${short(p.end)}` : `${short(s)} ${s.getFullYear()} to ${short(p.end)} ${p.end.getFullYear()}`;
  }
}

/** Chart granularity for a period (custom/all pick the closest fit). */
export function granularityFor(p: Period): Granularity {
  switch (p.kind) {
    case 'day':
      return 'hour';
    case 'week':
    case 'month':
      return 'day';
    case 'quarter':
      return 'week';
    case 'year':
      return 'month';
    default: {
      const days = daysBetween(p.start, p.end);
      if (days <= 1) return 'hour';
      if (days <= 45) return 'day';
      if (days <= 120) return 'week';
      if (days <= 3 * 366) return 'month';
      return 'quarter';
    }
  }
}

export function intervalsFor(p: Period, g: Granularity = granularityFor(p)): Interval[] {
  const out: Interval[] = [];
  if (g === 'hour') {
    for (let h = 0; h < 24; h++) {
      const start = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate(), h);
      out.push({ key: `h${h}`, start, end: new Date(start.getTime() + 3_599_999), label: `${h}h` });
    }
    return out;
  }
  if (g === 'day') {
    for (let d = startOfDay(p.start); d <= p.end; d = addDays(d, 1)) {
      out.push({ key: d.toDateString(), start: d, end: endOfDay(d), label: String(d.getDate()) });
    }
    return out;
  }
  if (g === 'week') {
    for (let d = weekStart(p.start); d <= p.end; d = addDays(d, 7)) {
      const s = d < p.start ? startOfDay(p.start) : d;
      const e = endOfDay(addDays(d, 6)) > p.end ? p.end : endOfDay(addDays(d, 6));
      out.push({ key: s.toDateString(), start: s, end: e, label: `${s.getDate()} ${MONTHS[s.getMonth()]}` });
    }
    return out;
  }
  if (g === 'month') {
    for (const key of monthsIn(p)) {
      const s = monthStart(key);
      out.push({ key, start: s < p.start ? p.start : s, end: monthEnd(key) > p.end ? p.end : monthEnd(key), label: MONTHS[s.getMonth()] });
    }
    return out;
  }
  // quarter
  let q = new Date(p.start.getFullYear(), Math.floor(p.start.getMonth() / 3) * 3, 1);
  while (q <= p.end) {
    const e = new Date(q.getFullYear(), q.getMonth() + 3, 0, 23, 59, 59, 999);
    out.push({ key: `${q.getFullYear()}Q${q.getMonth() / 3 + 1}`, start: q < p.start ? p.start : q, end: e > p.end ? p.end : e, label: `Q${q.getMonth() / 3 + 1} ${String(q.getFullYear()).slice(2)}` });
    q = new Date(q.getFullYear(), q.getMonth() + 3, 1);
  }
  return out;
}

export function inPeriod(d: Date, p: { start: Date; end: Date }) {
  return d >= p.start && d <= p.end;
}
