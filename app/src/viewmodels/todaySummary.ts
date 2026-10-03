// Today's figures and its one-or-two-sentence callout. Pure, tested in
// test/timePages.test.ts. No long dashes in anything generated here.

import { blockedMinutes, hoursText, type TaskRow } from './taskRow';

export interface DayFigures {
  pending: number;
  done: number;
  cancelled: number;
  /** Not cancelled. */
  total: number;
  blockedMinutes: number;
  /** When the first blocked time starts. */
  firstBlocked: Date | null;
  meetings: number;
}

export function dayFigures(rows: TaskRow[], googleMeetings = 0): DayFigures {
  const live = rows.filter((r) => r.status !== 'Cancelled');
  const blocked = live.filter((r) => !r.allDay && r.timeMode === 'blocked' && r.start && r.minutes > 0).sort((a, b) => a.start!.getTime() - b.start!.getTime());
  return {
    pending: rows.filter((r) => r.status === 'Pending').length,
    done: rows.filter((r) => r.status === 'Done').length,
    cancelled: rows.filter((r) => r.status === 'Cancelled').length,
    total: live.length,
    blockedMinutes: blockedMinutes(rows),
    firstBlocked: blocked[0]?.start ?? null,
    meetings: live.filter((r) => r.type === 'Meeting').length + googleMeetings,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "4 hours" / "1 hour" / "1.5 hours" / "45 minutes" */
export function hoursPhrase(minutes: number): string {
  if (minutes < 60) return plural(minutes, 'minute');
  const h = minutes / 60;
  const text = Number.isInteger(h) ? String(h) : h.toFixed(1);
  return `${text} ${h === 1 ? 'hour' : 'hours'}`;
}

export function clockText(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
}

/**
 * "1 task today, 4 hours blocked from 8:00. 21 tasks are overdue from earlier days."
 * On another day: "2 tasks on Monday 5 October, 3 hours blocked from 9:00."
 */
export function daySentence({ figures, isToday, dayLabel, overdue }: { figures: DayFigures; isToday: boolean; dayLabel: string; overdue: number }): string {
  const when = isToday ? 'today' : `on ${dayLabel}`;
  let first: string;
  if (figures.total === 0) first = `Nothing planned ${when}.`;
  else if (figures.blockedMinutes > 0 && figures.firstBlocked)
    first = `${plural(figures.total, 'task')} ${when}, ${hoursPhrase(figures.blockedMinutes)} blocked from ${clockText(figures.firstBlocked)}.`;
  else first = `${plural(figures.total, 'task')} ${when}, none of it blocked time.`;
  if (figures.total > 0 && figures.pending === 0) first = `All ${plural(figures.total, 'task')} ${when} are handled.`;
  const second = overdue > 0 ? ` ${overdue === 1 ? '1 task is' : `${overdue} tasks are`} overdue from earlier days.` : '';
  return first + second;
}

/** "0 of 1 done · 4h blocked · 21 overdue" (the phone's one-line progress). */
export function progressLine(figures: DayFigures, overdue: number): string {
  return `${figures.done} of ${figures.total} done · ${hoursText(figures.blockedMinutes)} blocked · ${overdue} overdue`;
}
