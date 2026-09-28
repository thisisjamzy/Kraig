// Turning the bridge's push result into per-task googleSync state — pure,
// tested in test/calendarSync.test.ts.
//
// normalizePushResult turns the bridge's push result (RawPushResult,
// PRD Files/CALENDAR-BRIDGE.md section 2: results / failed / conflicts keyed
// by dredaId, one conflict row per overlapping event, deleted as a list)
// into one normalized PushResult. It stays lenient about shape (ids as
// strings or objects, conflicts grouped or flat) so a bridge update can't
// silently mark every block failed.

import type { BlockOutcome, ConflictingEvent, PushResult } from '../calendarBridge/types';
import type { TaskGoogleConflict } from '../firestore/types';

type Raw = Record<string, unknown>;
const OUTCOMES: BlockOutcome[] = ['created', 'updated', 'unchanged', 'restored'];

function isObject(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}
function idOf(v: unknown): string | null {
  if (typeof v === 'string') return v || null;
  if (!isObject(v)) return null;
  return str(v.id) ?? str(v.blockId) ?? str(v.dredaId);
}
function eventIdOf(v: Raw): string | null {
  return str(v.googleEventId) ?? str(v.eventId);
}
/** A Google time as a string, whether sent flat or as { dateTime | date }. */
function timeOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (isObject(v)) return str(v.dateTime) ?? str(v.date) ?? '';
  return '';
}
function messageOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (isObject(v)) return str(v.message) ?? str(v.code) ?? 'Could not add it to Google Calendar';
  return 'Could not add it to Google Calendar';
}
function toConflictEvent(v: unknown): ConflictingEvent | null {
  if (!isObject(v)) return null;
  const googleEventId = eventIdOf(v) ?? '';
  return { googleEventId, title: str(v.title) ?? str(v.summary) ?? 'Busy', start: timeOf(v.start), end: timeOf(v.end) };
}

/** `sentIds`: the block ids in the order they were sent, to name a failed
 * block the bridge could only identify by its index. */
export function normalizePushResult(raw: unknown, sentIds: string[] = []): PushResult {
  const r: Raw = isObject(raw) ? raw : {};
  const blocks = new Map<string, PushResult['blocks'][number]>();

  const list = Array.isArray(r.results) ? r.results : Array.isArray(r.blocks) ? r.blocks : [];
  for (const entry of list) {
    if (!isObject(entry)) continue;
    const id = idOf(entry);
    const outcome = (str(entry.status) ?? str(entry.outcome) ?? str(entry.result)) as BlockOutcome | null;
    if (!id || !outcome || !OUTCOMES.includes(outcome)) continue;
    blocks.set(id, { id, outcome, googleEventId: eventIdOf(entry) });
  }
  for (const outcome of OUTCOMES) {
    const ids = r[outcome];
    if (!Array.isArray(ids)) continue;
    for (const entry of ids) {
      const id = idOf(entry);
      if (!id) continue;
      blocks.set(id, { id, outcome, googleEventId: isObject(entry) ? eventIdOf(entry) : null });
    }
  }

  const failed: PushResult['failed'] = [];
  for (const entry of Array.isArray(r.failed) ? r.failed : []) {
    const index = isObject(entry) && typeof entry.index === 'number' ? entry.index : -1;
    const id = idOf(entry) ?? sentIds[index] ?? null;
    if (!id) continue;
    failed.push({ id, message: isObject(entry) ? messageOf(entry.error ?? entry.message ?? entry.code) : 'Could not add it to Google Calendar' });
    blocks.delete(id);
  }

  const conflictsById = new Map<string, ConflictingEvent[]>();
  for (const entry of Array.isArray(r.conflicts) ? r.conflicts : []) {
    if (!isObject(entry)) continue;
    const id = idOf(entry);
    if (!id) continue;
    const nested = entry.events ?? entry.googleEvents ?? entry.conflicts ?? entry.with;
    const events = Array.isArray(nested) ? nested.map(toConflictEvent) : [toConflictEvent(entry)];
    const listFor = conflictsById.get(id) ?? [];
    for (const e of events) {
      if (e && !listFor.some((x) => x.googleEventId === e.googleEventId && x.start === e.start)) listFor.push(e);
    }
    conflictsById.set(id, listFor);
  }

  const deleted = typeof r.deleted === 'number' ? r.deleted : Array.isArray(r.deleted) ? r.deleted.length : 0;
  const skipped = (Array.isArray(r.skipped) ? r.skipped : []).map(idOf).filter((id): id is string => Boolean(id));

  return {
    blocks: [...blocks.values()],
    failed,
    conflicts: [...conflictsById.entries()].map(([id, events]) => ({ id, events })),
    deleted,
    truncated: Boolean(r.truncated),
    skipped,
  };
}

export interface TaskSyncRollup {
  state: 'pending' | 'synced' | 'error';
  googleEventIds: Record<string, string>;
  conflicts: TaskGoogleConflict[];
  error: string | null;
}

/**
 * Every pushed task's new googleSync, from its blocks (one, or one per date
 * of a series): error if any date failed, pending while any was skipped
 * (truncated — pushed again right after), otherwise synced. A block the
 * result doesn't mention counts as done (the bridge accepted the push).
 */
export function rollUpPushResults(
  sentBlockIds: string[],
  taskIdByBlock: Map<string, string>,
  result: PushResult
): Map<string, TaskSyncRollup> {
  const outcome = new Map(result.blocks.map((b) => [b.id, b]));
  const failed = new Map(result.failed.map((f) => [f.id, f.message]));
  const skipped = new Set(result.skipped);
  const conflicts = new Map(result.conflicts.map((c) => [c.id, c.events]));
  const byTask = new Map<string, TaskSyncRollup>();

  for (const blockId of sentBlockIds) {
    const taskId = taskIdByBlock.get(blockId);
    if (!taskId) continue;
    const roll = byTask.get(taskId) ?? { state: 'synced', googleEventIds: {}, conflicts: [], error: null };
    byTask.set(taskId, roll);
    if (failed.has(blockId)) {
      roll.state = 'error';
      roll.error = roll.error ?? failed.get(blockId)!;
      continue;
    }
    if (skipped.has(blockId)) {
      if (roll.state !== 'error') roll.state = 'pending';
      continue;
    }
    const eventId = outcome.get(blockId)?.googleEventId;
    if (eventId) roll.googleEventIds[blockId] = eventId;
    for (const event of conflicts.get(blockId) ?? []) {
      roll.conflicts.push({ ...event, blockId });
    }
  }
  return byTask;
}
