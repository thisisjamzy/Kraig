// Planning settings (Dreda v1.0 `Planning settings` 65750, phone 70572):
// each task type's time block (days, start and end), its average length,
// a daily cap and whether Plan my day places it; deep work limits; and the
// scheduling rules. Pure, tested in test/timePages.test.ts.

import { dayWords } from './scheduling-links';

export interface TypeSetting {
  type: string;
  /** Monday first. */
  days: number[];
  from: string;
  to: string;
  average: number;
  /** null: no cap ("See limits" for deep work). */
  perDay: number | null;
  auto: boolean;
  /** "With calls": the block it shares. */
  sharesWith?: string | null;
}

export interface DeepWorkLimits {
  minMinutes: number;
  maxMinutes: number;
  longestMinutes: number;
  breakMinutes: number;
  protect: boolean;
}

export interface SchedulingRules {
  placeInBlock: boolean;
  moveWhenFull: boolean;
  askBeforeTomorrow: boolean;
  keepFreeBeforeMeetings: boolean;
}

export interface PlanningSettings {
  types: TypeSetting[];
  deep: DeepWorkLimits;
  rules: SchedulingRules;
}

const WEEKDAYS = [0, 1, 2, 3, 4];

export const DEFAULT_PLANNING: PlanningSettings = {
  types: [
    { type: 'Email', days: WEEKDAYS, from: '07:00', to: '08:00', average: 10, perDay: 6, auto: true },
    { type: 'Call', days: WEEKDAYS, from: '14:00', to: '15:00', average: 10, perDay: 6, auto: true },
    { type: 'Follow-up', days: WEEKDAYS, from: '14:00', to: '15:00', average: 5, perDay: 8, auto: true, sharesWith: 'calls' },
    { type: 'Walk-in', days: [1, 3], from: '16:00', to: '17:30', average: 20, perDay: 3, auto: true },
    { type: 'Deep work', days: WEEKDAYS, from: '09:00', to: '12:00', average: 90, perDay: null, auto: true },
    { type: 'Planning', days: [0, 1, 2, 3, 4, 5, 6], from: '08:30', to: '08:45', average: 15, perDay: 1, auto: false },
  ],
  deep: { minMinutes: 120, maxMinutes: 240, longestMinutes: 120, breakMinutes: 15, protect: true },
  rules: { placeInBlock: true, moveWhenFull: true, askBeforeTomorrow: false, keepFreeBeforeMeetings: true },
};

function clock(t: string) {
  const [h, m] = t.split(':');
  return `${Number(h)}:${m}`;
}

/** "Weekdays", "Daily", "Tue and Thu". */
export function daysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Daily';
  if (sorted.join() === WEEKDAYS.join()) return 'Weekdays';
  return dayWords(sorted).replace(' only', '');
}

/** "Weekdays, 7:00 to 8:00"; "With calls, 14:00 to 15:00". */
export function blockWords(t: TypeSetting): string {
  return `${t.sharesWith ? `With ${t.sharesWith}` : daysLabel(t.days)}, ${clock(t.from)} to ${clock(t.to)}`;
}

/** "Up to 6", "See limits", "1". */
export function perDayWords(t: TypeSetting): string {
  if (t.perDay === null) return 'See limits';
  return t.perDay === 1 ? '1' : `Up to ${t.perDay}`;
}

/** "2 h", "15 min", "1 h 30 min". */
export function minutesWords(m: number): string {
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
