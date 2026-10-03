// A project as the Projects database shows it, and the sentences its
// pages say about it. Pure, tested in test/timePages.test.ts. No long
// dashes in anything generated here.

import type { FirestoreProject } from '@/src/shared/firestore/types';
import type { MilestoneStat } from './insights/metrics';

export type ProjectHealth = 'At risk' | 'Watch' | 'On track' | 'Done';
export const HEALTH_ORDER: ProjectHealth[] = ['At risk', 'Watch', 'On track', 'Done'];

export interface ProjectRow {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  description: string;
  areaId: string | null;
  areaName: string | null;
  status: FirestoreProject['status'];
  start: Date | null;
  end: Date | null;
  /** 0 to 1. */
  progress: number;
  tasks: number;
  done: number;
  overdue: number;
  health: ProjectHealth;
  reasons: string[];
  forecast: Date | null;
  slackDays: number | null;
  milestones: MilestoneStat[];
  lastActivity: Date | null;
  /** When a task in it was last completed. */
  lastDone: Date | null;
}

/** The callout's reason, when most at-risk projects share one. */
export function atRiskSentence(rows: ProjectRow[]): string | null {
  const risky = rows.filter((r) => r.status === 'Active' && r.health === 'At risk');
  if (!risky.length) return null;
  const stalled = risky.filter((r) => r.reasons.some((x) => x.startsWith('Nothing done lately'))).length;
  const late = risky.filter((r) => r.reasons.some((x) => x.startsWith('Deadline passed') || x.startsWith('Forecast finish'))).length;
  const n = risky.length;
  const lead = n === 1 ? '1 project is at risk' : `${n} projects are at risk`;
  if (stalled * 2 >= n) return `${lead} because nothing has moved lately.`;
  if (late * 2 >= n) return `${lead} because ${n === 1 ? 'it' : 'they'} won't finish by the deadline at this pace.`;
  return `${lead}.`;
}

/**
 * The project page's callout: why its health is what it is, in a sentence.
 * "Nothing done in 9 days; at this pace it won't finish by 10 Oct."
 */
export function healthSentence(row: Pick<ProjectRow, 'health' | 'lastDone' | 'start' | 'end' | 'forecast' | 'slackDays' | 'tasks' | 'done' | 'reasons'>, now = new Date()): string {
  if (row.health === 'Done') return 'Every task is done.';
  if (row.tasks === 0) return 'No tasks yet. Add the first one to start tracking progress.';
  const day = 86_400_000;
  const parts: string[] = [];
  const since = row.lastDone ?? row.start;
  const idle = since ? Math.floor((now.getTime() - since.getTime()) / day) : null;
  if (idle !== null && idle >= 3) parts.push(row.lastDone ? `Nothing done in ${idle} days` : `Nothing done since it started ${idle} days ago`);
  const end = row.end ? row.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
  if (end && row.end! < new Date(now.getFullYear(), now.getMonth(), now.getDate())) parts.push(`the deadline, ${end}, has passed`);
  else if (end && (!row.forecast || row.forecast > row.end!)) parts.push(`at this pace it won't finish by ${end}`);
  else if (end && row.forecast && row.slackDays !== null) parts.push(`at this pace it finishes around ${row.forecast.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${row.slackDays === 0 ? 'right on the deadline' : `${row.slackDays} ${row.slackDays === 1 ? 'day' : 'days'} before the deadline`}`);
  else if (!end && row.forecast) parts.push(`at this pace it finishes around ${row.forecast.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);
  if (!parts.length) return row.reasons[0] ? `${row.reasons[0]}.` : 'On track.';
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
