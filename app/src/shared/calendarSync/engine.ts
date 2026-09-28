// One Google Calendar sync, start to finish — the steps only, with every
// read, write and bridge call passed in (SyncDeps), so the rules are tested
// without Firestore or the network (test/calendarSync.test.ts). runner.ts
// wires it to the real ones and owns "when" and "one at a time".
//
// Steps:
//   1. Read the pushable tasks FROM THE SERVER. SAFETY RULE: if that read
//      fails or comes from the offline cache, nothing is pushed — sync is
//      called without blocks (pull only). A push is the complete list with
//      deleteMissing, so an incomplete offline list would delete real
//      blocks from Google.
//   2. Build the blocks (blocks.ts) and call sync (push then pull). Over 300
//      blocks, or TOO_MANY_BLOCKS from the bridge: the window is split in
//      half and each half synced on its own.
//   3. Truncated push: one follow-up push of the skipped blocks only
//      (deleteMissing off — it's not the complete list).
//   4. Roll the push result up onto each task's googleSync (results.ts);
//      tasks that can no longer be pushed lose theirs.
//   5. Apply the pull to the stored Google events (reconcile.ts).
//   6. Save the sync state.

import { BridgeError, MAX_BLOCKS } from '../calendarBridge/client';
import type { BridgeBlock, BridgeWindow, GoogleEvent, PingResult, PushResult, SyncResult } from '../calendarBridge/types';
import type { FirestoreTask, TaskGoogleSync } from '../firestore/types';
import { buildBlocks, splitWindow, windowToBridge, type SyncWindow } from './blocks';
import { normalizePushResult, rollUpPushResults, type TaskSyncRollup } from './results';

export type SyncReason = 'login' | 'calendar-open' | 'manual' | 'resume' | 'interval' | 'block-change';

export interface SyncCounts {
  meetings: number;
  events: number;
  blocksPushed: number;
  deleted: number;
  conflicts: number;
}

export interface SyncSettings {
  includeFree: boolean;
  calendarName: string | null;
  calendarTimeZone: string | null;
}

export interface SyncDeps {
  now: () => Date;
  timeZone: () => string;
  loadSettings: () => Promise<SyncSettings>;
  /** From the server only. `fromServer: false` (or a throw) = cache. */
  loadTasks: () => Promise<{ tasks: FirestoreTask[]; fromServer: boolean }>;
  bridgeSync: (window: BridgeWindow, blocks: BridgeBlock[] | undefined) => Promise<SyncResult>;
  bridgePush: (window: BridgeWindow, blocks: BridgeBlock[], opts: { deleteMissing: boolean }) => Promise<unknown>;
  bridgePing: (window: BridgeWindow) => Promise<PingResult>;
  /** taskId → its new googleSync (null = remove it). */
  writeTaskSync: (updates: Map<string, TaskSyncRollup | null>) => Promise<void>;
  /** Upserts and deletes the stored Google events of one complete pull. */
  applyPull: (window: SyncWindow, events: GoogleEvent[], calendarTimeZone: string) => Promise<void>;
  saveState: (patch: {
    calendarName?: string | null;
    calendarTimeZone?: string | null;
    lastCounts: SyncCounts;
  }) => Promise<void>;
}

export interface SyncOutcome {
  pushed: boolean;
  counts: SyncCounts;
}

const MAX_SPLIT_DEPTH = 5;

function overlapping(blocks: BridgeBlock[], window: SyncWindow): BridgeBlock[] {
  // Blocks carry offsets or plain dates; Date.parse reads both (a plain
  // date as UTC midnight — close enough for choosing a half, since a
  // block in both halves is harmless: same id, same result).
  return blocks.filter((b) => {
    const start = Date.parse(b.start);
    const end = Date.parse(b.end);
    return start < window.to.getTime() && end > window.from.getTime();
  });
}

function mergePush(results: PushResult[]): PushResult {
  return {
    blocks: results.flatMap((r) => r.blocks),
    failed: results.flatMap((r) => r.failed),
    conflicts: results.flatMap((r) => r.conflicts),
    deleted: results.reduce((n, r) => n + r.deleted, 0),
    truncated: results.some((r) => r.truncated),
    skipped: [...new Set(results.flatMap((r) => r.skipped))],
  };
}

/** JSON with object keys sorted — Firestore may hand maps back in a
 * different key order than they were written in. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Unchanged since the last sync? Then the task isn't written again. */
function sameSync(current: TaskGoogleSync | undefined, next: TaskSyncRollup): boolean {
  if (!current) return false;
  return (
    current.state === next.state &&
    (current.error ?? null) === next.error &&
    stable(current.googleEventIds ?? {}) === stable(next.googleEventIds) &&
    stable(current.conflicts ?? []) === stable(next.conflicts)
  );
}

export async function executeSync(window: SyncWindow, deps: SyncDeps): Promise<SyncOutcome> {
  const settings = await deps.loadSettings();

  // The calendar's own time zone places all-day events; learn it once.
  let calendarName = settings.calendarName;
  let calendarTimeZone = settings.calendarTimeZone;
  if (!calendarTimeZone) {
    try {
      const info = await deps.bridgePing(windowToBridge(window));
      calendarName = info.calendarName ?? null;
      calendarTimeZone = info.timeZone ?? null;
    } catch (error) {
      // Fatal codes stop here; anything else just means "use ours".
      if (error instanceof BridgeError && ['FORBIDDEN', 'MISCONFIGURED', 'NO_USER'].includes(error.code)) throw error;
    }
  }
  const eventTimeZone = calendarTimeZone ?? deps.timeZone();

  // Step 1 — the safety rule.
  let loaded: { tasks: FirestoreTask[]; fromServer: boolean } | null = null;
  try {
    loaded = await deps.loadTasks();
  } catch {
    loaded = null;
  }
  const canPush = Boolean(loaded && loaded.fromServer);
  const built = canPush
    ? buildBlocks(loaded!.tasks, window, { includeFree: settings.includeFree, timeZone: deps.timeZone(), now: deps.now() })
    : null;

  // Step 2 — sync, splitting the window when it's too much at once.
  const pushResults: PushResult[] = [];
  let meetings = 0;
  let events = 0;
  async function syncWindow(w: SyncWindow, blocks: BridgeBlock[] | undefined, depth: number): Promise<void> {
    const splitHalves = async () => {
      for (const half of splitWindow(w)) await syncWindow(half, blocks ? overlapping(blocks, half) : undefined, depth + 1);
    };
    if (blocks && blocks.length > MAX_BLOCKS && depth < MAX_SPLIT_DEPTH) return splitHalves();
    let result: SyncResult;
    try {
      result = await deps.bridgeSync(windowToBridge(w), blocks);
    } catch (error) {
      if (error instanceof BridgeError && error.code === 'TOO_MANY_BLOCKS' && depth < MAX_SPLIT_DEPTH) return splitHalves();
      throw error;
    }
    if (blocks) pushResults.push(normalizePushResult(result?.push, blocks.map((b) => b.id)));
    const pulled = Array.isArray(result?.pull?.events) ? result.pull.events : [];
    for (const e of pulled) {
      if (e?.kind === 'meeting') meetings++;
      else events++;
    }
    // Only a complete pull may delete stored events.
    if (result?.pull?.complete !== false) await deps.applyPull(w, pulled, eventTimeZone);
  }
  await syncWindow(window, built?.blocks, 0);

  let push = mergePush(pushResults);

  // Step 3 — truncated: push what was skipped, once.
  if (built && push.truncated && push.skipped.length) {
    const skipped = new Set(push.skipped);
    const again = built.blocks.filter((b) => skipped.has(b.id));
    if (again.length) {
      const followUp = normalizePushResult(
        await deps.bridgePush(windowToBridge(window), again, { deleteMissing: false }),
        again.map((b) => b.id)
      );
      push = mergePush([{ ...push, skipped: [], truncated: false }, followUp]);
    }
  }

  // Step 4 — each task's googleSync.
  if (built && loaded) {
    const rollups = rollUpPushResults(
      built.blocks.map((b) => b.id),
      built.taskIdByBlock,
      push
    );
    const updates = new Map<string, TaskSyncRollup | null>();
    for (const task of loaded.tasks) {
      const next = rollups.get(task.id);
      if (next) {
        if (!sameSync(task.googleSync, next)) updates.set(task.id, next);
      } else if (task.googleSync && !built.pushableTaskIds.has(task.id)) {
        updates.set(task.id, null);
      }
    }
    if (updates.size) await deps.writeTaskSync(updates);
  }

  const counts: SyncCounts = {
    meetings,
    events,
    blocksPushed: built ? built.blocks.length : 0,
    deleted: push.deleted,
    conflicts: push.conflicts.reduce((n, c) => n + c.events.length, 0),
  };
  await deps.saveState({
    ...(calendarName !== settings.calendarName ? { calendarName } : {}),
    ...(calendarTimeZone !== settings.calendarTimeZone ? { calendarTimeZone } : {}),
    lastCounts: counts,
  });
  return { pushed: Boolean(built), counts };
}
