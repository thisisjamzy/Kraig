// The task import (owner, 23 Nov 2026): one task list, one template.
//
// The file is a list of tasks, one per row, on one sheet. Every row says
// where it belongs (Area, Folder, Project) and the import creates whatever
// is missing above it. Everything here is pure, so it is tested without
// Firestore (test/importTaskList.test.ts):
//   - the twelve columns, matched by exact header (English or French) only;
//   - dates, done once: Excel serials and text read straight to yyyy-mm-dd,
//     day or month first decided per column from its own values, no Date
//     object between the cell and the final write, and the instant built
//     in the household's time zone;
//   - times, priority, status, repeats, subtasks and tags;
//   - names compared after normalizeName, only within their parent, with
//     "Did you mean" for near matches;
//   - the plan: areas, folders, projects and tasks to create, problems,
//     duplicates and the summary sentence.
// src/logic/importData/useTaskImport.ts reads the file and what exists,
// checks time conflicts and writes.

import { formatRRule, WEEKDAYS, type RecurrenceRule, type Weekday } from '../../viewmodels/recurrence';
import type { Priority, Quadrant, TaskStatus } from '../firestore/types';

export const MAX_ROWS = 2000;
export const DEFAULT_TIME_ZONE = 'Africa/Douala';
/** Close enough to an existing name to ask "Did you mean". */
export const NEAR = 0.85;

// ---------------------------------------------------------------------------
// Columns

export type TaskListField = 'area' | 'folder' | 'project' | 'task' | 'due' | 'start' | 'end' | 'priority' | 'status' | 'repeats' | 'notes' | 'subtasks' | 'tags';

export const TASK_LIST_FIELDS: { key: TaskListField; label: string; accepts: string }[] = [
  { key: 'area', label: 'Area', accepts: 'Any name. Created if new. Needed when Folder or Project is filled.' },
  { key: 'folder', label: 'Folder', accepts: 'Any name, created inside the Area if new. Blank: the area’s General folder.' },
  { key: 'project', label: 'Project', accepts: 'Any name, created inside the Folder if new. Blank: a project named after the folder (General tasks in the General folder).' },
  { key: 'task', label: 'Task', accepts: 'The task’s title. Required.' },
  { key: 'due', label: 'Due date', accepts: '05/12/2026, 2026-12-05, 5 Dec 2026, 5 décembre 2026, December 5, 2026. A time after the date fills Start time.' },
  { key: 'start', label: 'Start time', accepts: '14:30, 2:30 pm, 9am, 9h30' },
  { key: 'end', label: 'End time', accepts: '14:30, 2:30 pm, 9am, 9h30' },
  { key: 'priority', label: 'Priority', accepts: 'High, Medium, Low; or Do first, Schedule, Delegate, Eliminate' },
  { key: 'status', label: 'Status', accepts: 'To do, Doing, Stuck, In review, Done, Cancelled (French accepted)' },
  { key: 'repeats', label: 'Repeats', accepts: 'Daily, weekdays, weekly on Monday, every 2 weeks, monthly, yearly' },
  { key: 'notes', label: 'Notes', accepts: 'Free text' },
  { key: 'subtasks', label: 'Subtasks', accepts: 'Separated by semicolons or new lines' },
  { key: 'tags', label: 'Tags', accepts: 'Separated by commas or semicolons' },
];

/** The template's own headers, in order. */
export const TEMPLATE_HEADERS = TASK_LIST_FIELDS.map((f) => f.label);

// Exact header names only (after normalizeName): the template's English
// and French headers and a few plain alternatives. No prefix or suffix
// guessing, so "Due to" or "From area" never lands in a field unseen.
const HEADER_NAMES: Record<TaskListField, string[]> = {
  area: ['area', 'domaine'],
  folder: ['folder', 'dossier'],
  project: ['project', 'projet'],
  task: ['task', 'tache', 'title', 'titre'],
  due: ['due date', 'due', 'date', 'echeance', 'date d echeance'],
  start: ['start time', 'start', 'heure de debut', 'debut'],
  end: ['end time', 'end', 'heure de fin', 'fin'],
  priority: ['priority', 'priorite'],
  status: ['status', 'statut'],
  repeats: ['repeats', 'repeat', 'repetition', 'recurrence'],
  notes: ['notes', 'note', 'description'],
  subtasks: ['subtasks', 'sub tasks', 'sous taches'],
  tags: ['tags', 'tag', 'etiquettes'],
};

export type ColumnMapping = Record<string, TaskListField | 'ignore'>;

/** Each column's field by exact name; a remembered choice for that header wins. A field is used once. */
export function mapColumns(headers: string[], remembered: Record<string, string> = {}): ColumnMapping {
  const out: ColumnMapping = {};
  const used = new Set<string>();
  for (const h of headers) {
    const saved = remembered[normalizeName(h)];
    if (saved && (saved === 'ignore' || (!used.has(saved) && saved in HEADER_NAMES))) {
      out[h] = saved as TaskListField | 'ignore';
      if (saved !== 'ignore') used.add(saved);
    }
  }
  for (const h of headers) {
    if (out[h]) continue;
    const key = normalizeName(h);
    const hit = (Object.keys(HEADER_NAMES) as TaskListField[]).find((f) => !used.has(f) && HEADER_NAMES[f].includes(key));
    out[h] = hit ?? 'ignore';
    if (hit) used.add(hit);
  }
  return out;
}

/** The headers are the template's (English or French): the columns step is skipped. */
export function matchesTemplate(headers: string[]): boolean {
  const named = headers.filter((h) => normalizeName(h));
  if (!named.length) return false;
  const map = mapColumns(named);
  return named.every((h) => map[h] !== 'ignore') && Object.values(map).includes('task');
}

/** The mapping in a form worth remembering (by normalised header). */
export function rememberable(mapping: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mapping).map(([h, f]) => [normalizeName(h), f]));
}

/** Up to three non-empty sample values of a column, as the file shows them. */
export function samples(rows: Record<string, unknown>[], column: string): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const v = cellText(row[column]);
    if (v) out.push(v);
    if (out.length === 3) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cells

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** A cell as text. A Date is never printed through UTC: its own calendar day. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  return String(value).trim();
}

// ---------------------------------------------------------------------------
// Dates

const EXCEL_EPOCH_DAYS = Math.floor(Date.UTC(1899, 11, 30) / 86_400_000);

/** An Excel date serial as yyyy-mm-dd (and its time of day, from the fraction). No time zone involved. */
export function excelSerial(serial: number): { date: string; minutes: number | null } {
  const days = Math.floor(serial);
  const d = new Date((EXCEL_EPOCH_DAYS + days) * 86_400_000);
  const fraction = serial - days;
  const minutes = fraction > 1e-9 ? Math.round(fraction * 1440) % 1440 : null;
  return { date: iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), minutes };
}

const MONTH_WORDS: Record<string, number> = {
  jan: 1, january: 1, janvier: 1, janv: 1,
  feb: 2, february: 2, fevrier: 2, fev: 2, fevr: 2,
  mar: 3, march: 3, mars: 3,
  apr: 4, april: 4, avril: 4, avr: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juin: 6,
  jul: 7, july: 7, juillet: 7, juil: 7,
  aug: 8, august: 8, aout: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, decembre: 12,
};
const WEEKDAY_WORD = /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lun|mer|jeu|ven|sam|dim|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\.?,?\s+/;

/** Accents off, lower case, single spaces: for reading month names. */
const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export type DateOrder = 'dmy' | 'mdy';

/** What a cell says about the order of its numbers (only all-number dates like 05/12/2026 have one). */
export function orderEvidence(value: unknown): 'dmy' | 'mdy' | 'ambiguous' | null {
  if (typeof value === 'number') return null;
  const m = plain(cellText(value)).match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-]\d{2,4})?(?:[ t].*)?$/);
  if (!m) return null;
  const a = +m[1];
  const b = +m[2];
  if (a > 12 && b <= 12) return 'dmy';
  if (b > 12 && a <= 12) return 'mdy';
  return 'ambiguous';
}

export interface ColumnOrder {
  order: DateOrder;
  /** Every all-number value could be read either way: the setting decided. */
  ambiguous: boolean;
  /** Some values are only day first and others only month first. */
  conflict: boolean;
  /** An ambiguous value, for the sentence in the check step. */
  example: string | null;
}

/**
 * Day or month first for one column, from its own values: a first number
 * above 12 means day first, a second above 12 month first. Mixed is a
 * conflict (the rows that disagree are problems); all ambiguous uses the
 * household's setting (day first unless set).
 */
export function detectOrder(values: unknown[], fallback: DateOrder = 'dmy'): ColumnOrder {
  let dmy = 0;
  let mdy = 0;
  let example: string | null = null;
  for (const v of values) {
    const e = orderEvidence(v);
    if (e === 'dmy') dmy++;
    else if (e === 'mdy') mdy++;
    else if (e === 'ambiguous' && !example) example = cellText(v);
  }
  if (dmy && mdy) return { order: dmy >= mdy ? 'dmy' : 'mdy', ambiguous: false, conflict: true, example };
  if (dmy) return { order: 'dmy', ambiguous: false, conflict: false, example };
  if (mdy) return { order: 'mdy', ambiguous: false, conflict: false, example };
  return { order: fallback, ambiguous: example !== null, conflict: false, example };
}

/** "05/12/2026 is read as 5 December 2026." */
export function readAs(example: string, order: DateOrder): string {
  const r = parseDateCell(example, order, { y: 2000, m: 1, d: 1 });
  if (!r.date) return '';
  const [y, m, d] = r.date.split('-').map(Number);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${example} is read as ${d} ${MONTHS[m - 1]} ${y}.`;
}

export interface DateCell {
  /** yyyy-mm-dd, or null when blank or unreadable. */
  date: string | null;
  /** A time written after the date in the same cell, in minutes. */
  minutes: number | null;
  invalid: boolean;
  /** The cell disagrees with its column's order (it only reads the other way). */
  disagrees?: boolean;
}

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The next occurrence of a day and month from today (today counts). */
function nextYear(m: number, d: number, today: { y: number; m: number; d: number }): number {
  return m > today.m || (m === today.m && d >= today.d) ? today.y : today.y + 1;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + +y : +y);

/**
 * One date cell to yyyy-mm-dd: an Excel serial; ISO (with or without a
 * time); 05/12/2026, 5-12-26, 5.12.2026 in the column's order; month names
 * in English or French (5 Dec 2026, December 5, 2026, 5 décembre 2026);
 * any of them followed by a time. No year: the next occurrence from today.
 */
export function parseDateCell(value: unknown, order: DateOrder, today: { y: number; m: number; d: number }): DateCell {
  if (value === null || value === undefined || value === '') return { date: null, minutes: null, invalid: false };
  if (typeof value === 'number') {
    if (value > 0 && value < 1) return { date: null, minutes: null, invalid: true };
    if (value < 1 || value > 2_958_465) return { date: null, minutes: null, invalid: true };
    const s = excelSerial(value);
    return { date: s.date, minutes: s.minutes, invalid: false };
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return { date: null, minutes: null, invalid: true };
    return { date: iso(value.getFullYear(), value.getMonth() + 1, value.getDate()), minutes: null, invalid: false };
  }
  let text = plain(cellText(value));
  if (!text) return { date: null, minutes: null, invalid: false };
  if (/^\d+(\.\d+)?$/.test(text) && +text > 20000) return parseDateCell(+text, order, today);
  text = text.replace(WEEKDAY_WORD, '');

  const finish = (y: number | null, m: number, d: number, rest: string, disagrees = false): DateCell => {
    const year = y ?? nextYear(m, d, today);
    if (!valid(year, m, d)) return { date: null, minutes: null, invalid: true };
    let minutes: number | null = null;
    const r = rest.replace(/^(t|at|a|à|,)\s*/, '').trim();
    if (r) {
      const t = parseTime(r);
      if (t.invalid) return { date: null, minutes: null, invalid: true };
      minutes = t.minutes;
    }
    return { date: iso(year, m, d), minutes, invalid: false, disagrees };
  };

  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t](.*))?$/);
  if (m) return finish(+m[1], +m[2], +m[3], m[4] ?? '');

  m = text.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2}|\d{4}))?(?:\s+(.*))?$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = m[3] ? fullYear(m[3]) : null;
    const e = orderEvidence(text);
    const disagrees = (e === 'dmy' && order === 'mdy') || (e === 'mdy' && order === 'dmy');
    // A value that can only be read one way is read that way, and flagged when it disagrees with its column.
    const useOrder = e === 'dmy' || e === 'mdy' ? e : order;
    return useOrder === 'dmy' ? finish(y, b, a, m[4] ?? '', disagrees) : finish(y, a, b, m[4] ?? '', disagrees);
  }

  // 5 Dec 2026, 5 décembre 2026, 5th of December
  m = text.match(/^(\d{1,2})(?:st|nd|rd|th|er)?\s+(?:of\s+)?([a-z]+)\.?,?(?:\s+(\d{4}))?(?:\s*,?\s+(.*))?$/);
  if (m && MONTH_WORDS[m[2]]) return finish(m[3] ? +m[3] : null, MONTH_WORDS[m[2]], +m[1], m[4] ?? '');

  // December 5, 2026
  m = text.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?(?:\s*,?\s+(.*))?$/);
  if (m && MONTH_WORDS[m[1]]) return finish(m[3] ? +m[3] : null, MONTH_WORDS[m[1]], +m[2], m[4] ?? '');

  return { date: null, minutes: null, invalid: true };
}

/** A time cell as minutes after midnight: 14:30, 2:30 pm, 9am, 9h30, 9h, or a fraction of a day. */
export function parseTime(value: unknown): { minutes: number | null; invalid: boolean } {
  if (typeof value === 'number') {
    if (value >= 0 && value < 1) return { minutes: Math.round(value * 1440) % 1440, invalid: false };
    return { minutes: null, invalid: true };
  }
  const text = plain(cellText(value)).replace(/\s+/g, '').replace(/\./g, ':');
  if (!text) return { minutes: null, invalid: false };
  const m = text.match(/^(\d{1,2})(?:[:h](\d{2})?)?(?::\d{2})?(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return { minutes: null, invalid: true };
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3]?.replace(/\./g, '');
  if (ap && (h < 1 || h > 12)) return { minutes: null, invalid: true };
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return { minutes: null, invalid: true };
  return { minutes: h * 60 + min, invalid: false };
}

// ---------------------------------------------------------------------------
// Time zones: the instant a local date and time stand for

const offsetFormat = new Map<string, Intl.DateTimeFormat>();

/** The zone's offset from UTC at an instant, in minutes. */
function zoneOffset(at: number, timeZone: string): number {
  let f = offsetFormat.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    offsetFormat.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - at) / 60_000);
}

/** The instant of a calendar date and time in a time zone, built from its parts (never through toISOString). */
export function zonedInstant(date: string, minutes: number, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let at = wall - zoneOffset(wall, timeZone) * 60_000;
  // Once more, for a day the clocks change.
  at = wall - zoneOffset(at, timeZone) * 60_000;
  return new Date(at);
}

/** The calendar day an instant falls on in a time zone. */
export function zonedDay(at: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(at).map((x) => [x.type, x.value])
  );
  return iso(+p.year, +p.month, +p.day);
}

// ---------------------------------------------------------------------------
// Other values

/** Priority and the Eisenhower quadrant: High, Medium, Low; Do first, Schedule, Delegate, Eliminate (English or French). */
export function parsePriority(value: unknown): { priority: Priority | null; quadrant: Quadrant | null; invalid: boolean } {
  const t = plain(cellText(value));
  if (!t) return { priority: null, quadrant: null, invalid: false };
  if (/^(do first|do|faire en premier|faire d abord|q1)$/.test(t)) return { priority: 'High', quadrant: 'do', invalid: false };
  if (/^(schedule|planifier|plan|q2)$/.test(t)) return { priority: 'Medium', quadrant: 'schedule', invalid: false };
  if (/^(delegate|deleguer|q3)$/.test(t)) return { priority: 'Medium', quadrant: 'delegate', invalid: false };
  if (/^(eliminate|eliminer|drop|q4)$/.test(t)) return { priority: 'Low', quadrant: 'eliminate', invalid: false };
  if (/^(urgent|urgente)$/.test(t)) return { priority: 'Urgent', quadrant: null, invalid: false };
  if (/^(high|haute|elevee|haut)$/.test(t)) return { priority: 'High', quadrant: null, invalid: false };
  if (/^(medium|moyenne|normal|normale)$/.test(t)) return { priority: 'Medium', quadrant: null, invalid: false };
  if (/^(low|basse|faible|bas)$/.test(t)) return { priority: 'Low', quadrant: null, invalid: false };
  return { priority: null, quadrant: null, invalid: true };
}

/** To do, Doing, Stuck, In review, Done, Cancelled (French accepted). Doing has no status of its own: it stays To do. */
export function parseStatus(value: unknown): { status: TaskStatus | null; invalid: boolean } {
  const t = plain(cellText(value));
  if (!t) return { status: null, invalid: false };
  if (/^(to do|todo|a faire|pending|not started|doing|in progress|en cours)$/.test(t)) return { status: 'Pending', invalid: false };
  if (/^(stuck|blocked|bloque|bloquee)$/.test(t)) return { status: 'Stuck', invalid: false };
  if (/^(in review|review|en revue|a relire|a valider)$/.test(t)) return { status: 'In Review', invalid: false };
  if (/^(done|complete|completed|finished|fait|faite|termine|terminee)$/.test(t)) return { status: 'Done', invalid: false };
  if (/^(cancelled|canceled|annule|annulee)$/.test(t)) return { status: 'Cancelled', invalid: false };
  return { status: null, invalid: true };
}

const DAY_WORDS: Record<string, Weekday> = {
  monday: 'MO', mon: 'MO', lundi: 'MO', tuesday: 'TU', tue: 'TU', tues: 'TU', mardi: 'TU', wednesday: 'WE', wed: 'WE', mercredi: 'WE',
  thursday: 'TH', thu: 'TH', thurs: 'TH', jeudi: 'TH', friday: 'FR', fri: 'FR', vendredi: 'FR', saturday: 'SA', sat: 'SA', samedi: 'SA',
  sunday: 'SU', sun: 'SU', dimanche: 'SU',
};

/** "daily", "weekly on Monday and Thursday", "every 2 weeks", "monthly", "yearly" as an RRULE; `invalid` for anything else. */
export function parseRepeats(value: unknown): { rrule: string | null; invalid: boolean } {
  const t = plain(cellText(value));
  if (!t || /^(no|none|never|once|-|non|jamais)$/.test(t)) return { rrule: null, invalid: false };
  const every = t.match(/every\s+(\d+)\s+(day|week|month|year)s?/);
  let rule: RecurrenceRule | null = null;
  if (every) rule = { freq: (({ day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }) as const)[every[2] as 'day'], interval: +every[1] };
  else if (/daily|every day|quotidien|tous les jours/.test(t)) rule = { freq: 'DAILY', interval: 1 };
  else if (/weekdays|every weekday|jours ouvres/.test(t)) rule = { freq: 'WEEKLY', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] };
  else if (/weekly|every week|each week|hebdomadaire|chaque semaine/.test(t)) rule = { freq: 'WEEKLY', interval: 1 };
  else if (/monthly|every month|mensuel|chaque mois/.test(t)) rule = { freq: 'MONTHLY', interval: 1 };
  else if (/yearly|annually|every year|annuel|chaque annee/.test(t)) rule = { freq: 'YEARLY', interval: 1 };
  if (!rule) return { rrule: null, invalid: true };
  if (rule.freq === 'WEEKLY') {
    const days = [...new Set(t.split(/[^a-z]+/).map((w) => DAY_WORDS[w]).filter(Boolean))] as Weekday[];
    if (days.length) rule = { ...rule, byDay: WEEKDAYS.filter((d) => days.includes(d)) };
  }
  return { rrule: formatRRule(rule), invalid: false };
}

export function parseSubtasks(value: unknown): string[] {
  return cellText(value)
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseTags(value: unknown): string[] {
  return [
    ...new Set(
      cellText(value)
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
}

// ---------------------------------------------------------------------------
// Names

/** Lower case, no accents or punctuation, single spaces. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The name without numbers ("Budget 2025" and "Budget 2026" match). */
export function withoutNumbers(name: string): string {
  return normalizeName(name).replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 1 = the same, 0 = nothing in common (Levenshtein on the normalised names). */
export function similarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x.length && !y.length) return 1;
  const prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (x[i - 1] === y[j - 1] ? 0 : 1));
      last = temp;
    }
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

/** Close to, but not the same as, an existing name. */
export function isNear(a: string, b: string): boolean {
  if (normalizeName(a) === normalizeName(b)) return false;
  if (similarity(a, b) >= NEAR) return true;
  const na = withoutNumbers(a);
  return na.length > 0 && na === withoutNumbers(b);
}

// ---------------------------------------------------------------------------
// The plan

export const DEFAULT_FOLDER = 'General';
export const DEFAULT_PROJECT = 'General tasks';

export interface ExistingLists {
  areas: { id: string; name: string }[];
  /** Sections. The area's default folder has isDefault. */
  folders: { id: string; name: string; areaId: string; isDefault: boolean }[];
  projects: { id: string; name: string; areaId: string | null; bucketId: string | null }[];
  /** For duplicates: the project, the normalised title, the due day. */
  tasks: { projectId: string | null; title: string; due: string | null }[];
}

/** Where an import opened from fills Area (and Folder and Project) for rows that leave them blank. */
export interface ImportContext {
  area?: { id: string; name: string } | null;
  folder?: { id: string; name: string; isDefault: boolean } | null;
  project?: { id: string; name: string } | null;
}

export interface PlanOptions {
  mapping: ColumnMapping;
  /** Per date column: the order decided (detectOrder), possibly switched by the user. */
  orders: Record<string, DateOrder>;
  today: { y: number; m: number; d: number };
  /** "Did you mean": choice key to 'existing' or 'new'. Unanswered: still to decide. */
  nameChoices: Record<string, 'existing' | 'new'>;
  /** Duplicate rows switched back on, by row index. */
  includeDuplicates: Set<number>;
  /** Cells fixed in place in the check step: row index to field to text. */
  edits: Record<number, Partial<Record<TaskListField, string>>>;
  context?: ImportContext;
}

/** A place in the tree: one that exists, or one the import creates. */
export interface Node {
  key: string;
  name: string;
  existingId: string | null;
  parentKey: string | null;
  isDefault?: boolean;
}

export interface PlannedTask {
  /** 0-based index into the rows; the sheet row is index + 2. */
  index: number;
  rowNumber: number;
  title: string;
  areaKey: string | null;
  folderKey: string | null;
  projectKey: string | null;
  due: string | null;
  start: number | null;
  end: number | null;
  priority: Priority | null;
  quadrant: Quadrant | null;
  status: TaskStatus | null;
  rrule: string | null;
  notes: string;
  subtasks: string[];
  tags: string[];
  problems: string[];
  duplicate: 'existing' | 'file' | null;
  /** Written, unless it has a problem or is a duplicate left off. */
  include: boolean;
  /** Fields filled from where the import was opened. */
  fromContext: boolean;
}

export interface NameQuestion {
  key: string;
  kind: 'area' | 'folder' | 'project';
  name: string;
  existing: { id: string; name: string };
  /** Under which area or folder, in words. */
  parentName: string | null;
  answer: 'existing' | 'new' | null;
}

export interface TaskListPlan {
  areas: Node[];
  folders: Node[];
  projects: Node[];
  tasks: PlannedTask[];
  questions: NameQuestion[];
  counts: { newAreas: number; newFolders: number; newProjects: number; tasks: number; problems: number; duplicates: number; inbox: number };
  /** The import can run: nothing left to decide and something to write. */
  ready: boolean;
}

const k = (s: string) => normalizeName(s);

export function planTaskList(rows: Record<string, unknown>[], existing: ExistingLists, options: PlanOptions): TaskListPlan {
  const { mapping, orders, today, nameChoices, includeDuplicates, edits, context } = options;
  const col = (field: TaskListField) => Object.keys(mapping).find((h) => mapping[h] === field) ?? null;
  const cols = Object.fromEntries((TASK_LIST_FIELDS.map((f) => f.key) as TaskListField[]).map((f) => [f, col(f)])) as Record<TaskListField, string | null>;
  const value = (i: number, field: TaskListField): unknown => {
    const edited = edits[i]?.[field];
    if (edited !== undefined) return edited;
    const c = cols[field];
    return c ? rows[i][c] : undefined;
  };
  const text = (i: number, field: TaskListField) => cellText(value(i, field));

  const areas = new Map<string, Node>();
  const folders = new Map<string, Node>();
  const projects = new Map<string, Node>();
  const questions = new Map<string, NameQuestion>();

  /** A name under a parent: the existing one (exact), the near one if the user chose it, or new. */
  function resolve<T extends { id: string; name: string }>(
    kind: 'area' | 'folder' | 'project',
    name: string,
    parentKey: string | null,
    parentName: string | null,
    siblings: T[]
  ): { existingId: string | null; name: string; key: string } {
    const exact = siblings.find((s) => k(s.name) === k(name));
    if (exact) return { existingId: exact.id, name: exact.name, key: `${parentKey ?? ''}/${kind}:${exact.id}` };
    const near = siblings.find((s) => isNear(name, s.name));
    if (near) {
      const qKey = `${kind}|${parentKey ?? ''}|${k(name)}`;
      const answer = nameChoices[qKey] ?? null;
      questions.set(qKey, { key: qKey, kind, name, existing: { id: near.id, name: near.name }, parentName, answer });
      if (answer === 'existing') return { existingId: near.id, name: near.name, key: `${parentKey ?? ''}/${kind}:${near.id}` };
    }
    return { existingId: null, name: name.trim(), key: `${parentKey ?? ''}/${kind}:new:${k(name)}` };
  }

  const tasks: PlannedTask[] = [];
  const seen = new Set<string>();
  const existingTasks = new Set(existing.tasks.map((t) => `${t.projectId ?? ''}|${k(t.title)}|${t.due ?? ''}`));

  for (let i = 0; i < rows.length; i++) {
    const problems: string[] = [];
    let areaName = text(i, 'area');
    let folderName = text(i, 'folder');
    let projectName = text(i, 'project');
    const title = text(i, 'task');
    // A wholly empty row is not a task.
    if (!title && !areaName && !folderName && !projectName && !text(i, 'due') && !text(i, 'notes')) continue;
    let fromContext = false;
    if (context?.area && !areaName) {
      areaName = context.area.name;
      fromContext = true;
      if (context.folder && !folderName) folderName = context.folder.isDefault ? '' : context.folder.name;
      if (context.project && !projectName && !text(i, 'folder')) projectName = context.project.name;
    }
    if (!title) problems.push('The task has no title.');

    let areaKey: string | null = null;
    let folderKey: string | null = null;
    let projectKey: string | null = null;
    if (!areaName && (folderName || projectName)) {
      problems.push('Which area is this in?');
    } else if (areaName) {
      const a = resolve('area', areaName, null, null, existing.areas);
      areaKey = a.key;
      if (!areas.has(a.key)) areas.set(a.key, { key: a.key, name: a.name, existingId: a.existingId, parentKey: null });
      // Folder: the named one inside this area, or the area's default ("General").
      const inArea = a.existingId ? existing.folders.filter((f) => f.areaId === a.existingId) : [];
      if (folderName) {
        const f = resolve('folder', folderName, a.key, a.name, inArea);
        folderKey = f.key;
        if (!folders.has(f.key)) folders.set(f.key, { key: f.key, name: f.name, existingId: f.existingId, parentKey: a.key });
      } else {
        const def = inArea.find((f) => f.isDefault);
        folderKey = def ? `${a.key}/folder:${def.id}` : `${a.key}/folder:default`;
        if (!folders.has(folderKey)) folders.set(folderKey, { key: folderKey, name: def?.name ?? DEFAULT_FOLDER, existingId: def?.id ?? null, parentKey: a.key, isDefault: true });
      }
      // Project: the named one in this folder; blank, one named after the folder (General tasks in the default folder).
      const folder = folders.get(folderKey)!;
      const pName = projectName || (folder.isDefault ? DEFAULT_PROJECT : folder.name);
      const inFolder = folder.existingId ? existing.projects.filter((p) => p.bucketId === folder.existingId || (folder.isDefault && p.bucketId === null && p.areaId === a.existingId)) : [];
      const p = resolve('project', pName, folderKey, folder.name, inFolder);
      projectKey = p.key;
      if (!projects.has(p.key)) projects.set(p.key, { key: p.key, name: p.name, existingId: p.existingId, parentKey: folderKey });
    }

    // Dates and times.
    const dueCol = cols.due;
    const dueCell = parseDateCell(value(i, 'due'), (dueCol && orders[dueCol]) || 'dmy', today);
    if (dueCell.invalid) problems.push(`"${text(i, 'due')}" is not a date Dreda can read.`);
    else if (dueCell.disagrees) problems.push(`"${text(i, 'due')}" reads the other way round from the rest of its column. Check the day and month.`);
    const startCell = parseTime(value(i, 'start'));
    const endCell = parseTime(value(i, 'end'));
    if (startCell.invalid) problems.push(`"${text(i, 'start')}" is not a time.`);
    if (endCell.invalid) problems.push(`"${text(i, 'end')}" is not a time.`);
    const start = startCell.minutes ?? dueCell.minutes;
    const end = endCell.minutes;
    if ((start !== null || end !== null) && !dueCell.date && !dueCell.invalid) problems.push('A time needs a due date.');
    if (start !== null && end !== null && end <= start) problems.push('The end time is before the start time.');

    const pr = parsePriority(value(i, 'priority'));
    if (pr.invalid) problems.push(`"${text(i, 'priority')}" is not a priority (High, Medium, Low, or Do first, Schedule, Delegate, Eliminate).`);
    const st = parseStatus(value(i, 'status'));
    if (st.invalid) problems.push(`"${text(i, 'status')}" is not a status.`);
    const rp = parseRepeats(value(i, 'repeats'));
    if (rp.invalid) problems.push(`"${text(i, 'repeats')}" is not a repeat Dreda knows.`);
    if (rp.rrule && !dueCell.date) problems.push('A repeating task needs a due date to start from.');

    // Duplicates: same project, same title, same due day; in Dreda or earlier in the file.
    const project = projectKey ? projects.get(projectKey)! : null;
    const dupKey = `${projectKey ?? ''}|${k(title)}|${dueCell.date ?? ''}`;
    let duplicate: PlannedTask['duplicate'] = null;
    if (title) {
      if (project?.existingId && existingTasks.has(`${project.existingId}|${k(title)}|${dueCell.date ?? ''}`)) duplicate = 'existing';
      else if (!projectKey && existingTasks.has(`|${k(title)}|${dueCell.date ?? ''}`)) duplicate = 'existing';
      else if (seen.has(dupKey)) duplicate = 'file';
      seen.add(dupKey);
    }

    tasks.push({
      index: i,
      rowNumber: i + 2,
      title,
      areaKey,
      folderKey,
      projectKey,
      due: dueCell.date,
      start,
      end,
      priority: pr.priority,
      quadrant: pr.quadrant,
      status: st.status,
      rrule: rp.rrule,
      notes: text(i, 'notes'),
      subtasks: parseSubtasks(value(i, 'subtasks')),
      tags: parseTags(value(i, 'tags')),
      problems,
      duplicate,
      include: problems.length === 0 && (!duplicate || includeDuplicates.has(i)),
      fromContext,
    });
  }

  // Only what an included task needs is created.
  const used = { areas: new Set<string>(), folders: new Set<string>(), projects: new Set<string>() };
  for (const t of tasks) {
    if (!t.include) continue;
    if (t.areaKey) used.areas.add(t.areaKey);
    if (t.folderKey) used.folders.add(t.folderKey);
    if (t.projectKey) used.projects.add(t.projectKey);
  }
  const keep = (map: Map<string, Node>, set: Set<string>) => [...map.values()].filter((n) => set.has(n.key));
  const areaList = keep(areas, used.areas);
  const folderList = keep(folders, used.folders);
  const projectList = keep(projects, used.projects);
  const questionList = [...questions.values()];
  const included = tasks.filter((t) => t.include);
  const counts = {
    newAreas: areaList.filter((n) => !n.existingId).length,
    // A new area's General folder comes with the area; it isn't counted as a folder of its own.
    newFolders: folderList.filter((n) => !n.existingId && !n.isDefault).length,
    newProjects: projectList.filter((n) => !n.existingId).length,
    tasks: included.length,
    problems: tasks.filter((t) => t.problems.length).length,
    duplicates: tasks.filter((t) => t.duplicate && !t.include && !t.problems.length).length,
    inbox: included.filter((t) => !t.projectKey).length,
  };
  return {
    areas: areaList,
    folders: folderList,
    projects: projectList,
    tasks,
    questions: questionList,
    counts,
    ready: included.length > 0 && questionList.every((q) => q.answer !== null),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "This will add 1 area, 2 folders, 3 projects and 24 tasks. 2 rows need a look." */
export function planSentence(plan: TaskListPlan): string {
  const c = plan.counts;
  const parts = [
    c.newAreas ? plural(c.newAreas, 'area') : null,
    c.newFolders ? plural(c.newFolders, 'folder') : null,
    c.newProjects ? plural(c.newProjects, 'project') : null,
    plural(c.tasks, 'task'),
  ].filter(Boolean) as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  const look = c.problems + plan.questions.filter((q) => !q.answer).length;
  const tail = [
    look ? `${plural(look, 'row needs', 'rows need')} a look.` : null,
    c.duplicates ? `${plural(c.duplicates, 'duplicate')} left out.` : null,
  ].filter(Boolean);
  return [`This will add ${list}.`, ...tail].join(' ');
}
