// Which Google Calendar badge an app task shows (src/widgets/SyncBadge) —
// none when it isn't pushed at all, or is synced with nothing overlapping.

import type { TaskGoogleConflict } from '../firestore/types';
import type { TaskItem } from '../tasks/recurringTasks';
import { defaultSyncWindow, isPushableOccurrence, occurrenceBlockId } from './blocks';

export type TaskSyncBadge =
  | { kind: 'pending' }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; conflicts: TaskGoogleConflict[] };

export function syncBadgeFor(task: TaskItem, { includeFree, now }: { includeFree: boolean; now: Date }): TaskSyncBadge | null {
  if (!isPushableOccurrence(task, includeFree, now)) return null;
  const blockId = task.seriesId && task.occurrenceKey ? occurrenceBlockId(task.seriesId, task.occurrenceKey) : task.id;
  const sync = task.googleSync;
  if (sync?.state === 'error') return { kind: 'error', message: sync.error || "This task couldn't be added to Google Calendar." };
  const conflicts = (sync?.conflicts ?? []).filter((c) => !c.blockId || c.blockId === blockId);
  if (sync?.state !== 'pending' && conflicts.length) return { kind: 'conflict', conflicts };
  if (!sync || sync.state === 'pending') {
    // Only dates a sync actually covers can be "on their way".
    const { to } = defaultSyncWindow(now);
    return task.startTime && task.startTime.toDate() < to ? { kind: 'pending' } : null;
  }
  return null;
}
