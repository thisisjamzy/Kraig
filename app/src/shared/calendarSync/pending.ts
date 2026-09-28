// "This task's Google copy is out of date" — taskWrites.ts adds
// googleSync.state 'pending' in the same write that creates a pushable task
// or changes its time, title or mode. The next sync (a block change
// triggers one within seconds) sets it to synced or error.

import { isBridgeConfigured } from '../calendarBridge/client';
import type { FirestoreTask } from '../firestore/types';
import { isPushableTask } from './blocks';
import { getSyncStatus } from './status';

type Shape = Parameters<typeof isPushableTask>[0];

/** Would this task be pushed? False whenever sync is off. */
export function isPushableNow(task: Shape): boolean {
  return isBridgeConfigured() && isPushableTask(task, getSyncStatus().includeFree);
}

/** Did a change touch what Google shows (time, title or mode)? */
export function touchesGoogleCopy(
  before: Partial<FirestoreTask> | undefined,
  after: { title?: string; startTime?: { toMillis(): number } | null; dueDate?: { toMillis(): number } | null; allDay?: boolean; timeMode?: string; type?: string; rrule?: string | null }
): boolean {
  if (!before) return true;
  const ms = (t: { toMillis(): number } | null | undefined) => (t ? t.toMillis() : null);
  return (
    (after.title !== undefined && after.title !== before.title) ||
    (after.startTime !== undefined && ms(after.startTime) !== ms(before.startTime)) ||
    (after.dueDate !== undefined && ms(after.dueDate) !== ms(before.dueDate)) ||
    (after.allDay !== undefined && Boolean(after.allDay) !== Boolean(before.allDay)) ||
    (after.timeMode !== undefined && after.timeMode !== before.timeMode) ||
    (after.type !== undefined && after.type !== before.type) ||
    (after.rrule !== undefined && (after.rrule ?? null) !== (before.rrule ?? null))
  );
}
