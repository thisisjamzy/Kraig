// Reading spreadsheet cells for the imports (pure, tested in
// test/importTasks.test.ts): dd/mm/yyyy (or ISO, or Excel's date numbers)
// dates, 24-hour or am/pm times, importance words or urgent/important
// yes-no columns, semicolon-separated subtasks. The Time and Money reviews
// (timeReview.ts, moneyReview.ts) build on these.

import type { Quadrant } from '../firestore/types';

export const MAX_ROWS = 2000;

/** Up to three non-empty sample values of a column. */
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
// Reading values

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  return String(value).trim();
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * A date cell: a Date (SheetJS), an Excel date number, ISO (2026-10-05),
 * or day first (05/10/2026, 5-10-26) unless `dayFirst` is false.
 * `invalid` when there's text that isn't a date.
 */
export function parseDate(value: unknown, dayFirst = true): { date: string | null; invalid: boolean } {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return { date: null, invalid: true };
    return { date: iso(value.getFullYear(), value.getMonth() + 1, value.getDate()), invalid: false };
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const d = new Date(EXCEL_EPOCH + Math.floor(value) * 86_400_000);
    return { date: iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), invalid: false };
  }
  const text = cellText(value);
  if (!text) return { date: null, invalid: false };
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return checked(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return dayFirst ? checked(year, +m[2], +m[1]) : checked(year, +m[1], +m[2]);
  }
  if (/^\d+(\.\d+)?$/.test(text)) return parseDate(Number(text), dayFirst);
  return { date: null, invalid: true };
}

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function checked(y: number, m: number, d: number): { date: string | null; invalid: boolean } {
  const date = new Date(y, m - 1, d);
  if (m < 1 || m > 12 || date.getMonth() !== m - 1 || date.getDate() !== d) return { date: null, invalid: true };
  return { date: iso(y, m, d), invalid: false };
}

/** A time cell as minutes after midnight: 14:30, 2:30 pm, 9am, or a fraction of a day. */
export function parseTime(value: unknown): { minutes: number | null; invalid: boolean } {
  if (value instanceof Date) return { minutes: value.getHours() * 60 + value.getMinutes(), invalid: false };
  if (typeof value === 'number' && value >= 0 && value < 1) return { minutes: Math.round(value * 1440), invalid: false };
  const text = cellText(value).toLowerCase().replace(/\s+/g, '');
  if (!text) return { minutes: null, invalid: false };
  const m = text.match(/^(\d{1,2})(?:[:h.](\d{2}))?(am|pm)?$/);
  if (!m) return { minutes: null, invalid: true };
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59 || (!m[2] && !m[3] && h > 23)) return { minutes: null, invalid: true };
  return { minutes: h * 60 + min, invalid: false };
}

const YES = new Set(['yes', 'y', 'true', '1', 'x', 'oui']);

/** The Eisenhower quadrant: from an Importance word, or Urgent and Important yes-no cells. */
export function parseImportance(importance: unknown, urgent?: unknown, important?: unknown): Quadrant | null {
  const t = cellText(importance).toLowerCase();
  if (t) {
    if (/do first|^do$|urgent.*important|q1/.test(t)) return 'do';
    if (/schedule|plan|q2/.test(t)) return 'schedule';
    if (/delegate|q3/.test(t)) return 'delegate';
    if (/eliminate|delete|drop|q4/.test(t)) return 'eliminate';
  }
  const u = cellText(urgent).toLowerCase();
  const i = cellText(important).toLowerCase();
  if (!u && !i) return null;
  const isU = YES.has(u);
  const isI = YES.has(i);
  return isU && isI ? 'do' : isI ? 'schedule' : isU ? 'delegate' : 'eliminate';
}

export function parseSubtasks(value: unknown): string[] {
  return cellText(value)
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
