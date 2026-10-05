// A task's repeat from the Time template's friendly columns (Repeats,
// Every, On days, Monthly by, Week of month, Ends, End date, Occurrences,
// Skip dates) or its RRULE column, which wins when filled. Gives the rule
// in the app's own model (src/viewmodels/recurrence.ts), its RRULE, the
// dates to skip, plain problems for impossible combinations, and the rule
// in words ("Every week on Tue and Thu, 20 times"). Pure; tested in
// test/importTemplates.test.ts.

import { formatRRule, nthOfMonth, parseRRule, weekdayOf, WEEKDAYS, type RecurrenceRule, type Weekday } from '../../viewmodels/recurrence';
import { cellText, parseDate } from './projectTasks';

export interface RepeatCells {
  repeats?: unknown;
  every?: unknown;
  onDays?: unknown;
  monthlyBy?: unknown;
  weekOfMonth?: unknown;
  ends?: unknown;
  endDate?: unknown;
  occurrences?: unknown;
  skipDates?: unknown;
  rrule?: unknown;
}

export interface ParsedRepeat {
  rule: RecurrenceRule | null;
  rrule: string | null;
  /** Dates left out of the series (yyyy-MM-dd). */
  skip: string[];
  problems: string[];
  /** "Every week on Tue and Thu, 20 times"; '' for a one-off task. */
  text: string;
}

const DAY: Record<string, Weekday> = {
  mon: 'MO', monday: 'MO', mo: 'MO',
  tue: 'TU', tues: 'TU', tuesday: 'TU', tu: 'TU',
  wed: 'WE', wednesday: 'WE', we: 'WE',
  thu: 'TH', thur: 'TH', thurs: 'TH', thursday: 'TH', th: 'TH',
  fri: 'FR', friday: 'FR', fr: 'FR',
  sat: 'SA', saturday: 'SA', sa: 'SA',
  sun: 'SU', sunday: 'SU', su: 'SU',
};
export const DAY_SHORT: Record<Weekday, string> = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' };
const DAY_LONG: Record<Weekday, string> = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };
const WEEK_OF_MONTH: Record<string, number> = { first: 1, '1': 1, second: 2, '2': 2, third: 3, '3': 3, fourth: 4, '4': 4, last: -1, '-1': -1 };
const NTH_WORD: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', [-1]: 'last' };

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const shortDate = (iso: string) => toDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function joinWords(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** "Every week on Tue and Thu, 20 times", "Every month on the last Friday, until 31 Dec 2026". */
export function describeRepeat(rule: RecurrenceRule, date: string | null): string {
  const n = rule.interval;
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[rule.freq];
  let text = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  const weekdays = rule.byDay && rule.byDay.length === 5 && ['MO', 'TU', 'WE', 'TH', 'FR'].every((d) => rule.byDay!.includes(d as Weekday));
  if (rule.freq === 'WEEKLY' && weekdays && n === 1) text = 'Every weekday';
  else if (rule.freq === 'WEEKLY' && rule.byDay?.length) text += ` on ${joinWords(rule.byDay.map((d) => DAY_SHORT[d]))}`;
  if (rule.freq === 'MONTHLY' && rule.byNthDay) text += ` on the ${NTH_WORD[rule.byNthDay.n] ?? `${rule.byNthDay.n}th`} ${DAY_LONG[rule.byNthDay.day]}`;
  else if (rule.freq === 'MONTHLY') text += ` on day ${rule.byMonthDay ?? (date ? toDate(date).getDate() : 1)}`;
  if (rule.count) text += `, ${rule.count} ${rule.count === 1 ? 'time' : 'times'}`;
  else if (rule.until) text += `, until ${shortDate(rule.until)}`;
  return text;
}

/** The repeat a row asks for. `date` is the task's (first) date, yyyy-MM-dd. */
export function parseRepeatCells(cells: RepeatCells, date: string | null, dayFirst = true): ParsedRepeat {
  const problems: string[] = [];
  const skip: string[] = [];
  for (const part of cellText(cells.skipDates).split(/[;\n]/).map((s) => s.trim()).filter(Boolean)) {
    const d = parseDate(part, dayFirst);
    if (d.date) skip.push(d.date);
    else problems.push(`Skip dates: "${part}" is not a date`);
  }

  const done = (rule: RecurrenceRule | null): ParsedRepeat => {
    if (rule && !date) problems.push('A repeating task needs a Date (its first date)');
    if (!rule && skip.length) problems.push('Skip dates only apply to a repeating task');
    return { rule, rrule: rule ? formatRRule(rule) : null, skip, problems, text: rule ? describeRepeat(rule, date) : '' };
  };

  // Advanced: an RRULE overrides the friendly columns.
  const raw = cellText(cells.rrule);
  if (raw) {
    const rule = parseRRule(raw);
    if (!rule) {
      problems.push('The RRULE could not be read (it needs FREQ=DAILY, WEEKLY, MONTHLY or YEARLY)');
      return done(null);
    }
    return done(rule);
  }

  const repeats = cellText(cells.repeats).toLowerCase();
  if (!repeats || /^(no|none|never|once|doesn'?t repeat|does not repeat|-)$/.test(repeats)) return done(null);
  const freq = repeats.startsWith('daily')
    ? 'DAILY'
    : repeats.startsWith('weekday')
      ? 'WEEKDAYS'
      : repeats.startsWith('weekly')
        ? 'WEEKLY'
        : repeats.startsWith('monthly')
          ? 'MONTHLY'
          : repeats.startsWith('yearly') || repeats.startsWith('annual')
            ? 'YEARLY'
            : null;
  if (!freq) {
    problems.push(`Repeats must be Daily, Weekdays, Weekly, Monthly or Yearly, not "${cellText(cells.repeats)}"`);
    return done(null);
  }

  const everyText = cellText(cells.every);
  let interval = 1;
  if (everyText) {
    const n = Number(everyText);
    if (!Number.isInteger(n) || n < 1) problems.push(`Every must be a whole number, 1 or more, not "${everyText}"`);
    else interval = n;
  }

  const first = date ? toDate(date) : null;
  const dayText = cellText(cells.onDays);
  const days: Weekday[] = [];
  for (const word of dayText.split(/[,;/\s]+/).map((w) => w.trim().toLowerCase()).filter(Boolean)) {
    if (word === 'and' || word === '&') continue;
    const d = DAY[word];
    if (d) days.push(d);
    else problems.push(`On days: "${word}" is not a day (use Mon, Tue, Wed, Thu, Fri, Sat or Sun)`);
  }
  const sortedDays = WEEKDAYS.filter((d) => days.includes(d));

  let rule: RecurrenceRule;
  if (freq === 'DAILY') rule = { freq: 'DAILY', interval };
  else if (freq === 'WEEKDAYS') rule = { freq: 'WEEKLY', interval, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] };
  else if (freq === 'WEEKLY') rule = { freq: 'WEEKLY', interval, byDay: sortedDays.length ? sortedDays : first ? [weekdayOf(first)] : undefined };
  else if (freq === 'YEARLY') rule = { freq: 'YEARLY', interval };
  else {
    const by = cellText(cells.monthlyBy).toLowerCase();
    if (by.startsWith('weekday')) {
      const weekText = cellText(cells.weekOfMonth).toLowerCase();
      const n = weekText ? WEEK_OF_MONTH[weekText] : first ? Math.min(nthOfMonth(first), 4) : 1;
      if (weekText && n === undefined) problems.push(`Week of month must be First, Second, Third, Fourth or Last, not "${cellText(cells.weekOfMonth)}"`);
      if (sortedDays.length > 1) problems.push('Monthly by weekday takes one day in On days');
      const day = sortedDays[0] ?? (first ? weekdayOf(first) : 'MO');
      rule = { freq: 'MONTHLY', interval, byNthDay: { n: n ?? 1, day } };
    } else {
      if (by && !by.startsWith('day')) problems.push(`Monthly by must be Day of month or Weekday of month, not "${cellText(cells.monthlyBy)}"`);
      rule = { freq: 'MONTHLY', interval, byMonthDay: first ? first.getDate() : undefined };
    }
  }

  const ends = cellText(cells.ends).toLowerCase();
  if (ends.startsWith('on')) {
    const end = parseDate(cells.endDate, dayFirst);
    if (!end.date) problems.push(end.invalid ? 'End date is not a date' : 'Ends is On date, but End date is empty');
    else if (date && end.date < date) problems.push('End date is before the first date');
    else rule.until = end.date;
  } else if (ends.startsWith('after')) {
    const n = Number(cellText(cells.occurrences));
    if (!cellText(cells.occurrences)) problems.push('Ends is After, but Occurrences is empty');
    else if (!Number.isInteger(n) || n < 1) problems.push(`Occurrences must be a whole number, not "${cellText(cells.occurrences)}"`);
    else rule.count = n;
  } else if (ends && !ends.startsWith('never')) {
    problems.push(`Ends must be Never, On date or After, not "${cellText(cells.ends)}"`);
  }
  return done(rule);
}
