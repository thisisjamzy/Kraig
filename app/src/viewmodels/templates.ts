// Transaction templates (owner, 23 Nov 2026): grouping, ordering and when a
// repeating template is due. Pure; tested in test/templates.test.ts.
//
// A repeating template never records on its own: on its days it shows as
// due (Payments, and a "Due today" notification when `remind` is on) with
// Record and Skip. Skipping records nothing.

import type { TemplateRepeat } from '@/src/shared/firestore/types';

export interface TemplateLike {
  id: string;
  name: string;
  repeat?: TemplateRepeat;
  repeatDay?: number | null;
  remind?: boolean;
  archived?: boolean;
  /** A Date, or a Firestore Timestamp as stored. */
  lastUsedAt?: Date | { toDate(): Date } | null;
  lastSkippedOn?: string | null;
}

const usedAt = (t: TemplateLike): Date | null => (t.lastUsedAt ? (t.lastUsedAt instanceof Date ? t.lastUsedAt : t.lastUsedAt.toDate()) : null);

export const REPEAT_GROUPS: { repeat: TemplateRepeat; label: string }[] = [
  { repeat: 'daily', label: 'Daily' },
  { repeat: 'weekly', label: 'Weekly' },
  { repeat: 'monthly', label: 'Monthly' },
  { repeat: 'none', label: 'No repeat' },
];

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Live templates grouped Daily, Weekly, Monthly, No repeat; empty groups left out. */
export function groupByRepeat<T extends TemplateLike>(templates: T[]): { repeat: TemplateRepeat; label: string; templates: T[] }[] {
  const live = templates.filter((t) => !t.archived);
  return REPEAT_GROUPS.map((g) => ({ ...g, templates: live.filter((t) => (t.repeat ?? 'none') === g.repeat).sort((a, b) => a.name.localeCompare(b.name)) })).filter(
    (g) => g.templates.length > 0
  );
}

/** Live templates, most recently used first, then by name. */
export function recentFirst<T extends TemplateLike>(templates: T[]): T[] {
  return templates
    .filter((t) => !t.archived)
    .sort((a, b) => (usedAt(b)?.getTime() ?? 0) - (usedAt(a)?.getTime() ?? 0) || a.name.localeCompare(b.name));
}

/** Search by name once the list is long (more than eight). */
export function searchTemplates<T extends { name: string }>(templates: T[], text: string): T[] {
  const q = text.trim().toLowerCase();
  return q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
}

/** Whether a template repeats on this day (in the device's calendar). */
export function fallsOn(t: TemplateLike, day: Date): boolean {
  switch (t.repeat ?? 'none') {
    case 'daily':
      return true;
    case 'weekly':
      return ((day.getDay() + 6) % 7) + 1 === (t.repeatDay ?? 1);
    case 'monthly': {
      const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
      return day.getDate() === Math.min(t.repeatDay ?? 1, last);
    }
    default:
      return false;
  }
}

/** Due on this day: it falls on it, and it was neither recorded nor skipped that day. */
export function isDueOn(t: TemplateLike, day: Date): boolean {
  if (t.archived || !fallsOn(t, day)) return false;
  const key = dayKey(day);
  if (t.lastSkippedOn === key) return false;
  const used = usedAt(t);
  if (used && dayKey(used) === key) return false;
  return true;
}

/** "Every day", "Every Monday", "Every month on the 5th", or "". */
export function repeatText(t: Pick<TemplateLike, 'repeat' | 'repeatDay'>): string {
  switch (t.repeat ?? 'none') {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return `Every ${WEEKDAYS[((t.repeatDay ?? 1) - 1 + 7) % 7]}`;
    case 'monthly': {
      const d = t.repeatDay ?? 1;
      const suffix = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th';
      return `Every month on the ${d}${suffix}`;
    }
    default:
      return '';
  }
}
