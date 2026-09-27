// Recurring tasks — the rule side (pure, no Firestore). A recurring task is
// a "series": one task doc carrying an iCalendar RRULE (RFC 5545) string,
// e.g. "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE". Its first date is the task's
// own start (DTSTART); every other date it falls on is an "occurrence",
// generated here on the fly for whatever range a screen shows — never
// stored as copies. Per-occurrence changes live on the series as exceptions
// (src/shared/tasks/recurringTasks.ts).
//
// Supported subset (everything the repeat picker and custom screen can
// produce, modelled on Google Calendar):
//   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL=n,
//   BYDAY=MO,WE (weekly) · BYDAY=3TU / -1TU (monthly, nth / last weekday),
//   BYMONTHDAY=18 (monthly), COUNT=n, UNTIL=YYYYMMDD[T235959].
// Expansion runs in the user's local time zone: every occurrence keeps
// DTSTART's wall-clock time (09:00 stays 09:00 across daylight saving).
// Dates that don't exist are skipped, not moved — "monthly on day 31"
// skips 30-day months, "annually on 29 February" only lands in leap years
// — and COUNT counts every generated date, deleted exceptions included,
// same as RRULE itself.

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
/** Monday first — index = (Date.getDay() + 6) % 7. */
export const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceRule {
  freq: Freq;
  interval: number;
  /** WEEKLY: the days of the week (defaults to DTSTART's). */
  byDay?: Weekday[];
  /** MONTHLY: a day of the month, 1 to 31. */
  byMonthDay?: number;
  /** MONTHLY: the nth (1 to 5) or last (-1) given weekday. */
  byNthDay?: { n: number; day: Weekday };
  /** Last possible date, "YYYY-MM-DD", inclusive. */
  until?: string;
  count?: number;
}

const WEEKDAY_NAMES: Record<Weekday, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** "YYYY-MM-DD" in local time — also an occurrence's key on its series. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a "YYYY-MM-DD". */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds());
}

/** Whole calendar days from a to b (DST-safe). */
export function dayDiff(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function weekdayOf(d: Date): Weekday {
  return WEEKDAYS[(d.getDay() + 6) % 7];
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Which of its weekday in the month a date is: 18 April (a Tuesday) → 3. */
export function nthOfMonth(d: Date): number {
  return Math.ceil(d.getDate() / 7);
}

/** Is this the last such weekday of its month? */
export function isLastOfMonth(d: Date): boolean {
  return d.getDate() + 7 > daysInMonth(d.getFullYear(), d.getMonth());
}

// ---------------------------------------------------------------------------
// RRULE string <-> rule

export function parseRRule(value: string): RecurrenceRule | null {
  const parts = new Map<string, string>();
  for (const piece of value.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = piece.split('=');
    if (k && v) parts.set(k.toUpperCase(), v.toUpperCase());
  }
  const freq = parts.get('FREQ') as Freq | undefined;
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  const rule: RecurrenceRule = { freq, interval: Math.max(1, Number(parts.get('INTERVAL') ?? 1) || 1) };
  const byDay = parts.get('BYDAY');
  if (byDay) {
    if (freq === 'MONTHLY') {
      const match = /^(-?\d)(MO|TU|WE|TH|FR|SA|SU)$/.exec(byDay);
      if (match) rule.byNthDay = { n: Number(match[1]), day: match[2] as Weekday };
    } else {
      const days = byDay.split(',').filter((d): d is Weekday => WEEKDAYS.includes(d as Weekday));
      if (days.length) rule.byDay = sortDays(days);
    }
  }
  const byMonthDay = parts.get('BYMONTHDAY');
  if (byMonthDay && freq === 'MONTHLY') rule.byMonthDay = Number(byMonthDay);
  const count = parts.get('COUNT');
  if (count && Number(count) > 0) rule.count = Number(count);
  const until = parts.get('UNTIL');
  const u = until ? /^(\d{4})(\d{2})(\d{2})/.exec(until) : null;
  if (u) rule.until = `${u[1]}-${u[2]}-${u[3]}`;
  return rule;
}

export function formatRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`, `INTERVAL=${rule.interval}`];
  if (rule.freq === 'WEEKLY' && rule.byDay?.length) parts.push(`BYDAY=${sortDays(rule.byDay).join(',')}`);
  if (rule.freq === 'MONTHLY' && rule.byNthDay) parts.push(`BYDAY=${rule.byNthDay.n}${rule.byNthDay.day}`);
  else if (rule.freq === 'MONTHLY' && rule.byMonthDay) parts.push(`BYMONTHDAY=${rule.byMonthDay}`);
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  else if (rule.until) parts.push(`UNTIL=${rule.until.replace(/-/g, '')}T235959`);
  return parts.join(';');
}

/** Same rule, written the same way — for "did the rule change?". */
export function normalizeRRule(value: string | null | undefined): string | null {
  if (!value) return null;
  const rule = parseRRule(value);
  return rule ? formatRRule(rule) : null;
}

function sortDays(days: Weekday[]): Weekday[] {
  return [...new Set(days)].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
}

// ---------------------------------------------------------------------------
// Expansion

/** Hard stop on how many periods one expansion walks (a daily rule over 30
 * years) — far past anything a screen asks for. */
const MAX_PERIODS = 12000;

/**
 * Every date the rule generates from dtstart up to `to` (inclusive), each at
 * dtstart's time of day. `from` only trims the result — the walk always
 * starts at dtstart so COUNT is counted correctly.
 */
export function expandRule(rule: RecurrenceRule, dtstart: Date, to: Date, from?: Date): Date[] {
  const out: Date[] = [];
  const h = dtstart.getHours();
  const min = dtstart.getMinutes();
  const untilEnd = rule.until ? addDays(keyToDate(rule.until), 1).getTime() - 1 : Infinity;
  const stop = Math.min(to.getTime(), untilEnd);
  const interval = Math.max(1, rule.interval);
  let generated = 0;

  for (let k = 0; k < MAX_PERIODS; k++) {
    const { periodStart, dates } = period(rule, dtstart, k * interval, h, min);
    if (periodStart.getTime() > stop) break;
    for (const d of dates) {
      if (d.getTime() < dtstart.getTime()) continue;
      if (d.getTime() > stop) return out;
      generated += 1;
      if (rule.count && generated > rule.count) return out;
      if (!from || d.getTime() >= from.getTime()) out.push(d);
    }
    if (rule.count && generated >= rule.count) return out;
  }
  return out;
}

/** The kth period (k already multiplied by the interval): its first day, and
 * the dates in it the rule picks, in order. */
function period(rule: RecurrenceRule, dtstart: Date, k: number, h: number, min: number) {
  const y = dtstart.getFullYear();
  const m = dtstart.getMonth();
  const at = (year: number, month: number, day: number) => new Date(year, month, day, h, min);

  switch (rule.freq) {
    case 'DAILY': {
      const d = at(y, m, dtstart.getDate() + k);
      return { periodStart: new Date(d.getFullYear(), d.getMonth(), d.getDate()), dates: [d] };
    }
    case 'WEEKLY': {
      const mondayOffset = (dtstart.getDay() + 6) % 7;
      const monday = new Date(y, m, dtstart.getDate() - mondayOffset + k * 7);
      const days = rule.byDay?.length ? sortDays(rule.byDay) : [weekdayOf(dtstart)];
      return {
        periodStart: monday,
        dates: days.map((day) => at(monday.getFullYear(), monday.getMonth(), monday.getDate() + WEEKDAYS.indexOf(day))),
      };
    }
    case 'MONTHLY': {
      const first = new Date(y, m + k, 1);
      const year = first.getFullYear();
      const month = first.getMonth();
      const dim = daysInMonth(year, month);
      if (rule.byNthDay) {
        const { n, day } = rule.byNthDay;
        const target = (WEEKDAYS.indexOf(day) + 1) % 7; // back to getDay() numbering
        let date: number;
        if (n > 0) {
          date = 1 + ((target - first.getDay() + 7) % 7) + (n - 1) * 7;
        } else {
          const lastDay = new Date(year, month, dim).getDay();
          date = dim - ((lastDay - target + 7) % 7);
        }
        return { periodStart: first, dates: date >= 1 && date <= dim ? [at(year, month, date)] : [] };
      }
      const day = rule.byMonthDay ?? dtstart.getDate();
      return { periodStart: first, dates: day <= dim ? [at(year, month, day)] : [] };
    }
    case 'YEARLY': {
      const year = y + k;
      const day = dtstart.getDate();
      return { periodStart: new Date(year, 0, 1), dates: day <= daysInMonth(year, m) ? [at(year, m, day)] : [] };
    }
  }
}

/** The next `n` dates on or after `after`. */
export function nextDates(rule: RecurrenceRule, dtstart: Date, after: Date, n: number): Date[] {
  // Widen the window until there are enough (or the rule has ended).
  let horizonYears = 1;
  let dates: Date[] = [];
  while (horizonYears <= 32) {
    const to = new Date(after.getFullYear() + horizonYears, after.getMonth(), after.getDate());
    dates = expandRule(rule, dtstart, to, after);
    if (dates.length >= n) break;
    horizonYears *= 4;
  }
  return dates.slice(0, n);
}

// ---------------------------------------------------------------------------
// Presets (the repeat picker) — labels follow the task's date

export type RepeatPreset =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'weekdays'
  | 'monthlyNth'
  | 'monthlyLast'
  | 'monthlyDay'
  | 'yearly'
  | 'custom';

export function presetRule(preset: RepeatPreset, date: Date): RecurrenceRule | null {
  const day = weekdayOf(date);
  switch (preset) {
    case 'daily':
      return { freq: 'DAILY', interval: 1 };
    case 'weekly':
      return { freq: 'WEEKLY', interval: 1, byDay: [day] };
    case 'weekdays':
      return { freq: 'WEEKLY', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] };
    case 'monthlyNth':
      return { freq: 'MONTHLY', interval: 1, byNthDay: { n: nthOfMonth(date), day } };
    case 'monthlyLast':
      return { freq: 'MONTHLY', interval: 1, byNthDay: { n: -1, day } };
    case 'monthlyDay':
      return { freq: 'MONTHLY', interval: 1, byMonthDay: date.getDate() };
    case 'yearly':
      return { freq: 'YEARLY', interval: 1 };
    default:
      return null;
  }
}

export function presetOptions(date: Date): { id: RepeatPreset; label: string }[] {
  const day = WEEKDAY_NAMES[weekdayOf(date)];
  const options: { id: RepeatPreset; label: string }[] = [
    { id: 'none', label: 'Does not repeat' },
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: `Weekly on ${day}` },
    { id: 'weekdays', label: 'Every weekday (Monday to Friday)' },
    { id: 'monthlyNth', label: `Monthly on the ${ORDINALS[nthOfMonth(date)]} ${day}` },
  ];
  if (isLastOfMonth(date)) options.push({ id: 'monthlyLast', label: `Monthly on the last ${day}` });
  options.push(
    { id: 'monthlyDay', label: `Monthly on day ${date.getDate()}` },
    { id: 'yearly', label: `Annually on ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}` },
    { id: 'custom', label: 'Custom…' }
  );
  return options;
}

/** Which preset a stored rule is, on this date — 'custom' when none match
 * (any interval above 1, an end, several chosen days…). */
export function presetFor(rule: RecurrenceRule | null, date: Date): RepeatPreset {
  if (!rule) return 'none';
  const target = formatRRule(rule);
  for (const { id } of presetOptions(date)) {
    const candidate = presetRule(id, date);
    if (candidate && formatRRule(candidate) === target) return id;
  }
  return 'custom';
}

/** A preset kept in step with a changed date: "last Tuesday" stops being on
 * offer once the date isn't a last weekday, so it falls back to the nth. */
export function presetForDate(preset: RepeatPreset, date: Date): RepeatPreset {
  if (preset === 'monthlyLast' && !isLastOfMonth(date)) return 'monthlyNth';
  return preset;
}

// ---------------------------------------------------------------------------
// Plain words

function listDays(days: Weekday[]): string {
  const names = sortDays(days).map((d) => WEEKDAY_NAMES[d]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "30 June" (this year) or "30 June 2027". */
export function shortLongDate(d: Date, reference = new Date()): string {
  const base = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  return d.getFullYear() === reference.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "Every 2 weeks on Monday and Wednesday, until 30 June" — sentence case. */
export function describeRule(rule: RecurrenceRule, dtstart: Date): string {
  const every = (unit: string, plural: string) =>
    rule.interval === 1 ? unit : `Every ${rule.interval} ${plural}`;
  let text: string;
  switch (rule.freq) {
    case 'DAILY':
      text = every('Daily', 'days');
      break;
    case 'WEEKLY': {
      const days = rule.byDay?.length ? rule.byDay : [weekdayOf(dtstart)];
      if (rule.interval === 1 && sortDays(days).join() === 'MO,TU,WE,TH,FR') text = 'Every weekday (Monday to Friday)';
      else text = `${every('Weekly', 'weeks')} on ${listDays(days)}`;
      break;
    }
    case 'MONTHLY': {
      let on: string;
      if (rule.byNthDay) {
        const which = rule.byNthDay.n === -1 ? 'last' : ORDINALS[rule.byNthDay.n] ?? `${rule.byNthDay.n}th`;
        on = `the ${which} ${WEEKDAY_NAMES[rule.byNthDay.day]}`;
      } else {
        on = `day ${rule.byMonthDay ?? dtstart.getDate()}`;
      }
      text = `${every('Monthly', 'months')} on ${on}`;
      break;
    }
    case 'YEARLY':
      text = `${every('Annually', 'years')} on ${dtstart.getDate()} ${MONTH_NAMES[dtstart.getMonth()]}`;
      break;
  }
  if (rule.count) text += `, ${rule.count} ${rule.count === 1 ? 'time' : 'times'}`;
  else if (rule.until) text += `, until ${shortLongDate(keyToDate(rule.until), dtstart)}`;
  return text;
}

// ---------------------------------------------------------------------------
// Splitting a series ("this and following")

/**
 * Cuts a rule at an occurrence date: `before` ends the day before it,
 * `after` carries on from it. A COUNT is shared out between the two so the
 * total stays the same. `before` is null when the cut is at the very first
 * occurrence (nothing is left before it).
 */
export function splitRule(
  rule: RecurrenceRule,
  dtstart: Date,
  atKey: string
): { before: RecurrenceRule | null; after: RecurrenceRule } {
  const cut = keyToDate(atKey);
  const earlier = expandRule(rule, dtstart, new Date(cut.getTime() - 1));
  if (earlier.length === 0) return { before: null, after: rule };
  if (rule.count) {
    return {
      before: { ...rule, count: earlier.length, until: undefined },
      after: { ...rule, count: Math.max(1, rule.count - earlier.length) },
    };
  }
  return { before: { ...rule, until: dateKey(addDays(cut, -1)) }, after: rule };
}
