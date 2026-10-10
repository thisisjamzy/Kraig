// When a basket or item applies: its cadence, and every occurrence date it
// has in a month. A basket has a cadence (Monthly by default; Weekly,
// Daily, Quarterly, Yearly, Custom as an RRULE, or One-off) and each item
// inherits it unless it sets its own `recurrence`. The month's planned
// amount is the item's amount times its occurrences in that month (a weekly
// 10,000 in a month with four Mondays is 40,000, "4 weeks × 10,000").
//
// Dates are stepped on the calendar (setDate / month arithmetic), never by
// adding milliseconds, so a daylight-saving change can't drop or double a
// day. Pure: no Firestore, no React. Tested in test/basketKinds.test.ts.

import type { BasketCadence, Frequency } from '../firestore/types';

export type { BasketCadence };

export const BASKET_CADENCES: BasketCadence[] = ['Monthly', 'Weekly', 'Daily', 'Quarterly', 'Yearly', 'Custom', 'Once'];

export const CADENCE_LABEL: Record<BasketCadence, string> = {
  Monthly: 'Monthly',
  Weekly: 'Weekly',
  Daily: 'Daily',
  Quarterly: 'Quarterly',
  Yearly: 'Yearly',
  Custom: 'Custom',
  Once: 'One-off',
};

/** What an occurrence is called: "4 weeks × 10,000". */
const UNIT: Record<Frequency, [string, string]> = {
  Once: ['time', 'times'],
  Daily: ['day', 'days'],
  Weekly: ['week', 'weeks'],
  Monthly: ['month', 'months'],
  Quarterly: ['quarter', 'quarters'],
  Yearly: ['year', 'years'],
};

/** A schedule, ready to expand into dates. */
export interface CadenceSpec {
  frequency: Frequency;
  interval: number;
  /** The first occurrence (an item's due date, or the basket's first month). */
  anchor: Date;
  endDate?: Date | null;
  /** Custom cadences: an RRULE (FREQ, INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, COUNT, UNTIL). */
  rule?: string | null;
}

const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysIn = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();
const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/** A date `n` days after `d`, on the calendar. */
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Whole days from a to b (both at midnight), safe across DST. */
function dayDiff(a: Date, b: Date) {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

// ---- RRULE (the subset a household needs) ----

const WEEKDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export interface ParsedRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay: { day: number; nth: number | null }[];
  byMonthDay: number[];
  byMonth: number[];
  count: number | null;
  until: Date | null;
}

/** Parses "FREQ=WEEKLY;BYDAY=MO,FR" (an optional "RRULE:" prefix is fine). Null when it can't be read. */
export function parseRRule(rule: string | null | undefined): ParsedRule | null {
  if (!rule) return null;
  const parts = new Map<string, string>();
  for (const piece of rule.replace(/^RRULE:/i, '').split(';')) {
    const [key, value] = piece.split('=');
    if (key && value) parts.set(key.trim().toUpperCase(), value.trim().toUpperCase());
  }
  const freq = parts.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;
  const byDay = (parts.get('BYDAY') ?? '')
    .split(',')
    .filter(Boolean)
    .map((token) => {
      const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token);
      return match ? { day: WEEKDAY[match[2]], nth: match[1] ? Number(match[1]) : null } : null;
    })
    .filter((d): d is { day: number; nth: number | null } => d !== null);
  const numbers = (key: string) =>
    (parts.get(key) ?? '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n !== 0);
  const untilRaw = parts.get('UNTIL');
  const until = untilRaw && /^\d{8}/.test(untilRaw) ? new Date(Number(untilRaw.slice(0, 4)), Number(untilRaw.slice(4, 6)) - 1, Number(untilRaw.slice(6, 8))) : null;
  return {
    freq,
    interval: Math.max(1, Number(parts.get('INTERVAL')) || 1),
    byDay,
    byMonthDay: numbers('BYMONTHDAY'),
    byMonth: numbers('BYMONTH'),
    count: Number(parts.get('COUNT')) || null,
    until,
  };
}

/** The frequency a rule is closest to, for the stored `recurrence.frequency`. */
export function frequencyOfRule(rule: string | null | undefined): Frequency {
  const parsed = parseRRule(rule);
  if (!parsed) return 'Monthly';
  return parsed.freq === 'DAILY' ? 'Daily' : parsed.freq === 'WEEKLY' ? 'Weekly' : parsed.freq === 'YEARLY' ? 'Yearly' : 'Monthly';
}

/** Does `date` match a rule's BY* filters? */
function matchesRule(rule: ParsedRule, date: Date): boolean {
  if (rule.byMonth.length && !rule.byMonth.includes(date.getMonth() + 1)) return false;
  if (rule.byMonthDay.length) {
    const last = daysIn(date.getFullYear(), date.getMonth());
    const ok = rule.byMonthDay.some((n) => (n > 0 ? n === date.getDate() : last + n + 1 === date.getDate()));
    if (!ok) return false;
  }
  if (rule.byDay.length) {
    const ok = rule.byDay.some(({ day, nth }) => {
      if (day !== date.getDay()) return false;
      if (nth === null || rule.freq === 'WEEKLY' || rule.freq === 'DAILY') return true;
      const index = Math.floor((date.getDate() - 1) / 7) + 1;
      const fromEnd = Math.floor((daysIn(date.getFullYear(), date.getMonth()) - date.getDate()) / 7) + 1;
      return nth > 0 ? index === nth : fromEnd === -nth;
    });
    if (!ok) return false;
  }
  return true;
}

/** Is `date`'s period (day, week, month or year) one the rule's INTERVAL lands on? */
function inIntervalPeriod(rule: ParsedRule, anchor: Date, date: Date): boolean {
  if (rule.interval === 1) return true;
  if (rule.freq === 'DAILY') return dayDiff(anchor, date) % rule.interval === 0;
  if (rule.freq === 'WEEKLY') {
    // Weeks start on Monday, counted from the anchor's week.
    const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
    return Math.round(dayDiff(weekStart(anchor), weekStart(date)) / 7) % rule.interval === 0;
  }
  if (rule.freq === 'MONTHLY') return (monthIndex(date) - monthIndex(anchor)) % rule.interval === 0;
  return (date.getFullYear() - anchor.getFullYear()) % rule.interval === 0;
}

/** Without BY* filters a rule repeats on the anchor's own day (weekday, day of month, date of year). */
function withDefaults(rule: ParsedRule, anchor: Date): ParsedRule {
  if (rule.byDay.length || rule.byMonthDay.length) return rule;
  if (rule.freq === 'WEEKLY') return { ...rule, byDay: [{ day: anchor.getDay(), nth: null }] };
  if (rule.freq === 'MONTHLY') return { ...rule, byMonthDay: [anchor.getDate()] };
  if (rule.freq === 'YEARLY') return { ...rule, byMonthDay: [anchor.getDate()], byMonth: rule.byMonth.length ? rule.byMonth : [anchor.getMonth() + 1] };
  return rule;
}

function ruleDatesInMonth(raw: ParsedRule, anchorIn: Date, year: number, month0: number, endDate: Date | null): Date[] {
  const anchor = dayOnly(anchorIn);
  const rule = withDefaults(raw, anchor);
  const last = new Date(year, month0, daysIn(year, month0));
  const until = [rule.until, endDate].filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const out: Date[] = [];
  // COUNT needs every occurrence since the anchor; otherwise only this month.
  let cursor = rule.count ? anchor : new Date(Math.max(anchor.getTime(), new Date(year, month0, 1).getTime()));
  let seen = 0;
  for (let guard = 0; cursor <= last && guard < 40_000; guard++, cursor = addDays(cursor, 1)) {
    if (until && cursor > until) break;
    if (!matchesRule(rule, cursor) || !inIntervalPeriod(rule, anchor, cursor)) continue;
    seen += 1;
    if (rule.count && seen > rule.count) break;
    if (cursor.getFullYear() === year && cursor.getMonth() === month0) out.push(cursor);
  }
  return out;
}

/**
 * Every date a schedule lands on in (year, month), month 1-based. Monthly,
 * Quarterly and Yearly clamp a late anchor day (the 31st) to the month's
 * last day; they count while the month starts on or before `endDate`, the
 * way recurring items always have. Daily and Weekly stop at `endDate`.
 */
export function occurrenceDates(spec: CadenceSpec, year: number, month: number): Date[] {
  const month0 = month - 1;
  const anchor = dayOnly(spec.anchor);
  const target = year * 12 + month0;
  if (target < monthIndex(anchor)) return [];
  const end = spec.endDate ? dayOnly(spec.endDate) : null;
  if (spec.rule) {
    const parsed = parseRRule(spec.rule);
    if (parsed) return ruleDatesInMonth(parsed, anchor, year, month0, end);
  }
  const interval = Math.max(1, Math.round(spec.interval) || 1);
  const monthStart = new Date(year, month0, 1);
  const clampDay = () => new Date(year, month0, Math.min(anchor.getDate(), daysIn(year, month0)));
  switch (spec.frequency) {
    case 'Once':
      return target === monthIndex(anchor) ? [anchor] : [];
    case 'Monthly':
    case 'Quarterly':
    case 'Yearly': {
      const step = interval * (spec.frequency === 'Monthly' ? 1 : spec.frequency === 'Quarterly' ? 3 : 12);
      if ((target - monthIndex(anchor)) % step !== 0) return [];
      if (end && monthStart > end) return [];
      return [clampDay()];
    }
    case 'Weekly':
    case 'Daily': {
      const step = spec.frequency === 'Weekly' ? interval * 7 : interval;
      const last = new Date(year, month0, daysIn(year, month0));
      // Jump to the first step on or after the month's first day.
      const offset = Math.max(0, dayDiff(anchor, monthStart));
      let cursor = addDays(anchor, Math.ceil(offset / step) * step);
      const out: Date[] = [];
      for (; cursor <= last; cursor = addDays(cursor, step)) {
        if (end && cursor > end) break;
        out.push(cursor);
      }
      return out;
    }
    default:
      return [];
  }
}

// ---- Inheritance: a basket's cadence, an item's own ----

export interface CadenceBasket {
  cadence?: BasketCadence | null;
  cadenceRule?: string | null;
  startMonth?: string | null;
}

export interface CadenceItem {
  dueDate: { toDate(): Date } | null;
  recurrence?: { frequency: Frequency; interval: number; endDate?: { toDate(): Date } | null; rule?: string | null } | null;
  createdAt?: { toDate(): Date } | null;
}

/**
 * The cadence a basket stands for. A stored cadence wins; older baskets
 * read as Monthly when they repeat and One-off when they don't (display
 * only: items inherit only a stored cadence, see itemSchedule).
 */
export function basketCadenceOf(bucket: CadenceBasket & { repeats?: 'monthly' | 'once' | null; kind?: 'Fixed' | 'Variable' | null }): BasketCadence {
  if (bucket.cadence) return bucket.cadence;
  const repeats = bucket.repeats ?? (bucket.kind === 'Fixed' ? 'monthly' : 'once');
  return repeats === 'monthly' ? 'Monthly' : 'Once';
}

function cadenceFrequency(cadence: BasketCadence, rule: string | null | undefined): Frequency {
  if (cadence === 'Custom') return frequencyOfRule(rule);
  return cadence;
}

/**
 * The schedule an item runs on: its own recurrence when it sets one,
 * otherwise its basket's stored cadence, otherwise a one-off on its due
 * date (the rule before baskets had a cadence). The anchor is the due date,
 * or for an item without one that inherits a cadence (an allowance) the
 * basket's first month, else the month the item was created. Null: the
 * item isn't scheduled in any month.
 */
export function itemSchedule(item: CadenceItem, bucket?: CadenceBasket | null): CadenceSpec | null {
  const own = item.recurrence ?? null;
  const inherited = !own && bucket?.cadence ? bucket.cadence : null;
  let anchor = item.dueDate?.toDate() ?? null;
  if (!anchor && inherited) {
    if (bucket?.startMonth && /^\d{4}-\d{2}$/.test(bucket.startMonth)) {
      const [y, m] = bucket.startMonth.split('-').map(Number);
      anchor = new Date(y, m - 1, 1);
    } else if (item.createdAt) {
      const created = item.createdAt.toDate();
      anchor = new Date(created.getFullYear(), created.getMonth(), 1);
    }
  }
  if (!anchor) return null;
  if (own) {
    return { frequency: own.frequency, interval: own.interval ?? 1, anchor, endDate: own.endDate?.toDate() ?? null, rule: own.rule ?? null };
  }
  if (inherited) {
    return { frequency: cadenceFrequency(inherited, bucket?.cadenceRule), interval: 1, anchor, rule: inherited === 'Custom' ? (bucket?.cadenceRule ?? null) : null };
  }
  return { frequency: 'Once', interval: 1, anchor };
}

/** Whether an item repeats at all under its schedule. */
export function isRecurring(spec: CadenceSpec | null): boolean {
  return Boolean(spec && (spec.rule || spec.frequency !== 'Once'));
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * How a month's figure was built: "4 weeks × 10,000", "31 days × 1,000".
 * Null when there's nothing to explain (one occurrence).
 */
export function occurrenceBuild(count: number, frequency: Frequency, unitAmount: number): string | null {
  if (count <= 1) return null;
  const unit = UNIT[frequency] ?? UNIT.Once;
  return `${count} ${unit[1]} × ${fmt(unitAmount)}`;
}

/** "Every week", "Every 2 months", "One-off", "Custom". */
export function scheduleLabel(spec: CadenceSpec | null): string {
  if (!spec) return 'Not scheduled';
  if (spec.rule) return 'Custom';
  if (spec.frequency === 'Once') return 'One-off';
  const unit = UNIT[spec.frequency];
  return spec.interval > 1 ? `Every ${spec.interval} ${unit[1]}` : `Every ${unit[0]}`;
}
