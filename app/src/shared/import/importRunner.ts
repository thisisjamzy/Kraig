// The task import's runner (owner, 24 Nov 2026). Pure: plan, chunks, stop,
// retry and roll back, with every Firestore call passed in (RunnerIO), so it
// is tested without Firestore (test/importRunner.test.ts).
//
//   1. Plan first. One item per ticked task, in file order, its id chosen
//      up front. Each new area, folder or project gets its id up front too
//      and is written with the first task that needs it (a new area with
//      its default folder). The plan counts every write before Start.
//   2. The log (importLog.ts) is written before the first task.
//   3. Chunks of 20 tasks, one batch each. Before a chunk its items are
//      marked "writing"; the chunk's batch carries the tasks, the places
//      they bring and the log's "imported" mark, so the log never says less
//      than what is in. A failed chunk marks its tasks failed and the run
//      carries on; a place that failed with it goes with the next task that
//      needs it.
//   4. Stop is checked before each chunk: a committed batch can't be
//      cancelled, so the chunk under way finishes.
//   5. Roll back removes only this import's tasks (by id from the log, and
//      only those that still carry this importId), 20 at a time, newest
//      first; then each new place, if nothing else is in it.

import { itemOps, logCreateOps, pageCount, placeStatusData, statusOp, type ImportPlan, type ItemStatus, type PlaceKind, type PlaceSpec, type PlaceStatus, type PlanCounts, type PlanItem, type WriteOp } from './importLog';
import type { Node, PlannedTask } from './taskList';

export const CHUNK = 20;

// ---------------------------------------------------------------------------
// 1. The plan

export interface PlanDocs {
  area(a: { id: string; name: string; colorIndex: number }): Record<string, unknown>;
  /** A new area's default folder ("General"). */
  defaultFolder(f: { id: string; areaId: string; areaColorIndex: number }): Record<string, unknown>;
  folder(f: { id: string; name: string; areaId: string; areaColorIndex: number }): Record<string, unknown>;
  project(p: { id: string; name: string; areaId: string; folderId: string; colorIndex: number }): Record<string, unknown>;
  task(t: PlannedTask, where: { projectId: string; areaId: string; bucketId: string }): Record<string, unknown>;
}

export interface BuildPlanInput {
  uid: string;
  importId: string;
  fileName: string;
  /** The ticked tasks, in file order; each with an area, folder and project. */
  tasks: PlannedTask[];
  nodes: { areas: Node[]; folders: Node[]; projects: Node[] };
  /** Existing projects' own area and folder: a task mirrors its project's. */
  existingProjects: Record<string, { areaId: string | null; bucketId: string | null }>;
  /** Existing areas' and folders' ids are in the nodes; a new id each call. */
  newId: () => string;
  /** The id of an area's default folder. */
  defaultFolderId: (areaId: string) => string;
  /** Existing areas' colour index, to colour new folders in them. */
  areaColorIndex?: Record<string, number>;
  docs: PlanDocs;
}

const taskPath = (uid: string, id: string) => `users/${uid}/tasks/${id}`;
const areaPath = (uid: string, id: string) => `users/${uid}/areas/${id}`;
const folderPath = (uid: string, id: string) => `users/${uid}/buckets/${id}`;
const projectPath = (uid: string, id: string) => `users/${uid}/projects/${id}`;

export function buildImportPlan(input: BuildPlanInput): ImportPlan {
  const { uid, importId, fileName, tasks, nodes, existingProjects, newId, defaultFolderId, docs } = input;
  const byKey = new Map<string, Node>([...nodes.areas, ...nodes.folders, ...nodes.projects].map((n) => [n.key, n]));
  const ids = new Map<string, string>();
  const places: Record<string, PlaceSpec & { status: PlaceStatus }> = {};
  const colorOf = new Map<string, number>(Object.entries(input.areaColorIndex ?? {}));
  let newAreas = 0;
  let newProjects = 0;

  /** The id of a node, creating its place spec the first time a new one is seen. */
  function idOf(key: string, kind: PlaceKind): string {
    const known = ids.get(key);
    if (known) return known;
    const node = byKey.get(key);
    if (!node) throw new Error(`Unknown place ${key}`);
    if (node.existingId) {
      ids.set(key, node.existingId);
      return node.existingId;
    }
    if (kind === 'area') {
      const id = newId();
      ids.set(key, id);
      const colorIndex = newAreas++ + 1;
      colorOf.set(id, colorIndex);
      const def = defaultFolderId(id);
      places[id] = {
        id,
        kind,
        name: node.name,
        areaId: null,
        folderId: null,
        defaultFolderId: def,
        status: 'waiting',
        ops: [
          { type: 'set', path: areaPath(uid, id), data: docs.area({ id, name: node.name, colorIndex }) },
          { type: 'set', path: folderPath(uid, def), data: docs.defaultFolder({ id: def, areaId: id, areaColorIndex: colorIndex }) },
        ],
      };
      return id;
    }
    if (kind === 'folder') {
      const areaId = idOf(node.parentKey!, 'area');
      // A new area's "General" is the default folder that comes with it.
      if (node.isDefault) {
        const id = defaultFolderId(areaId);
        ids.set(key, id);
        return id;
      }
      const id = newId();
      ids.set(key, id);
      places[id] = { id, kind, name: node.name, areaId, folderId: null, status: 'waiting', ops: [{ type: 'set', path: folderPath(uid, id), data: docs.folder({ id, name: node.name, areaId, areaColorIndex: colorOf.get(areaId) ?? 0 }) }] };
      return id;
    }
    const folderNode = byKey.get(node.parentKey!)!;
    const folderId = idOf(folderNode.key, 'folder');
    const areaId = idOf(folderNode.parentKey!, 'area');
    const id = newId();
    ids.set(key, id);
    places[id] = { id, kind, name: node.name, areaId, folderId, status: 'waiting', ops: [{ type: 'set', path: projectPath(uid, id), data: docs.project({ id, name: node.name, areaId, folderId, colorIndex: newProjects++ }) }] };
    return id;
  }

  const items: PlanItem[] = [];
  const claimed = new Set<string>();
  for (const t of tasks) {
    if (!t.areaKey || !t.folderKey || !t.projectKey) throw new Error(`Row ${t.rowNumber} has no area, folder or project`);
    const areaId = idOf(t.areaKey, 'area');
    const folderId = idOf(t.folderKey, 'folder');
    const projectId = idOf(t.projectKey, 'project');
    const existing = existingProjects[projectId];
    // A task mirrors its project's own area and folder.
    const where = { projectId, areaId: existing?.areaId ?? areaId, bucketId: existing?.bucketId ?? folderId };
    const needs = [areaId, folderId, projectId].filter((id) => places[id]);
    const creates = needs.filter((id) => !claimed.has(id));
    creates.forEach((id) => claimed.add(id));
    const names = [byKey.get(t.areaKey)!.name, byKey.get(t.folderKey)!.name, byKey.get(t.projectKey)!.name];
    const id = newId();
    items.push({ id, order: items.length, label: t.title, where: names.join(' / '), sourceRow: t.rowNumber, projectId, needs, creates, data: docs.task(t, where), status: 'waiting', error: null, created: [] });
  }

  const plan: ImportPlan = { uid, importId, fileName, items, places, counts: { tasks: 0, newAreas: 0, newFolders: 0, newProjects: 0, writes: 0, chunks: 0, parts: { tasks: 0, places: 0, log: 0 } } };
  plan.counts = countPlan(plan);
  return plan;
}

/**
 * Every write a run with no failures performs, worked out by building the
 * same operations the run sends:
 *   tasks   one per task;
 *   places  a new area two (the area and its default folder), a new folder
 *           one, a new project one;
 *   log     the log and its pages before the start, per chunk the "writing"
 *           mark and the "imported" mark (in the chunk's batch), and the
 *           final status.
 */
export function countPlan(plan: ImportPlan): PlanCounts {
  const places = Object.values(plan.places);
  const chunks = Math.ceil(plan.items.length / CHUNK);
  let log = logCreateOps(plan, null).length + 1;
  let placeWrites = 0;
  const created = new Set<string>();
  for (let i = 0; i < plan.items.length; i += CHUNK) {
    const chunk = plan.items.slice(i, i + CHUNK);
    const built = chunkOps(plan, chunk, created);
    built.placeIds.forEach((id) => created.add(id));
    placeWrites += built.placeWrites;
    log += itemOps(plan, chunk.map((item) => ({ item, status: 'writing' as ItemStatus }))).length + built.logWrites;
  }
  return {
    tasks: plan.items.length,
    newAreas: places.filter((p) => p.kind === 'area').length,
    newFolders: places.filter((p) => p.kind === 'folder').length,
    newProjects: places.filter((p) => p.kind === 'project').length,
    writes: plan.items.length + placeWrites + log,
    chunks,
    parts: { tasks: plan.items.length, places: placeWrites, log },
  };
}

/** One chunk's batch: each task with the new places it is first to need, and the log's mark. */
export function chunkOps(plan: ImportPlan, chunk: PlanItem[], alreadyCreated: Set<string>) {
  const ops: WriteOp[] = [];
  const placeIds: string[] = [];
  const createdBy = new Map<string, string[]>();
  let placeWrites = 0;
  const inChunk = new Set<string>();
  for (const item of chunk) {
    const mine: string[] = [];
    for (const id of item.needs) {
      if (alreadyCreated.has(id) || inChunk.has(id)) continue;
      const place = plan.places[id];
      if (!place || place.status === 'created') continue;
      inChunk.add(id);
      mine.push(id);
      placeIds.push(id);
      ops.push(...place.ops);
      placeWrites += place.ops.length;
    }
    createdBy.set(item.id, mine);
    ops.push({ type: 'set', path: taskPath(plan.uid, item.id), data: item.data });
  }
  const marks = itemOps(
    plan,
    chunk.map((item) => ({ item, status: 'imported' as ItemStatus, created: createdBy.get(item.id) ?? [] }))
  );
  return { ops: [...ops, ...marks], placeIds, createdBy, placeWrites, logWrites: marks.length };
}

// ---------------------------------------------------------------------------
// 2 to 4. Running

export interface RunnerIO {
  /** One batch, committed atomically. */
  commit(ops: WriteOp[]): Promise<void>;
  /** For the server's time on the log; anything in tests. */
  now(): unknown;
}

export interface RunState {
  items: PlanItem[];
  /** The items of the chunk being written. */
  current: string[];
  imported: number;
  failed: number;
  waiting: number;
}

export interface RunHooks {
  shouldStop(): boolean;
  onChunkStart?(state: RunState): void;
  onChunk?(state: RunState, chunkMs: number): void;
}

function stateOf(plan: ImportPlan, current: string[] = []): RunState {
  const items = plan.items.map((i) => ({ ...i }));
  return {
    items,
    current,
    imported: items.filter((i) => i.status === 'imported').length,
    failed: items.filter((i) => i.status === 'failed').length,
    waiting: items.filter((i) => i.status === 'waiting' || i.status === 'writing').length,
  };
}

/** Plain words for a write that failed. */
export function failureText(caught: unknown): string {
  const code = (caught as { code?: string } | null)?.code ?? '';
  if (code.includes('permission')) return 'Dreda was not allowed to save this. Try signing in again.';
  if (code.includes('unavailable') || code.includes('deadline')) return 'The connection dropped while saving.';
  if (code.includes('resource-exhausted')) return 'Too many saves at once. Try again in a minute.';
  return 'This could not be saved.';
}

/**
 * Runs the import, or the items given (Retry failed, Resume). A fresh run
 * writes the log first. Mutates the plan's items and places as it goes and
 * returns how it ended.
 */
export async function runImport(plan: ImportPlan, io: RunnerIO, hooks: RunHooks, options: { only?: string[]; fresh?: boolean } = {}): Promise<'completed' | 'stopped'> {
  if (options.fresh) await io.commit(logCreateOps(plan, io.now()));
  else await io.commit([statusOp(plan, 'running')]);
  const only = options.only ? new Set(options.only) : null;
  const todo = plan.items.filter((i) => (only ? only.has(i.id) : i.status === 'waiting' || i.status === 'failed'));
  const created = new Set(Object.values(plan.places).filter((p) => p.status === 'created').map((p) => p.id));
  let stopped = false;
  for (let i = 0; i < todo.length; i += CHUNK) {
    if (hooks.shouldStop()) {
      stopped = true;
      break;
    }
    const chunk = todo.slice(i, i + CHUNK);
    const started = Date.now();
    for (const item of chunk) {
      item.status = 'writing';
      item.error = null;
    }
    hooks.onChunkStart?.(stateOf(plan, chunk.map((c) => c.id)));
    await io.commit(itemOps(plan, chunk.map((item) => ({ item, status: 'writing' as ItemStatus }))));
    const built = chunkOps(plan, chunk, created);
    try {
      await io.commit(built.ops);
      for (const item of chunk) {
        item.status = 'imported';
        item.created = built.createdBy.get(item.id) ?? [];
      }
      for (const id of built.placeIds) {
        created.add(id);
        plan.places[id].status = 'created';
      }
    } catch (caught) {
      const reason = failureText(caught);
      for (const item of chunk) {
        item.status = 'failed';
        item.error = reason;
      }
      // The log says so, so a later look at it isn't fooled by "writing".
      await io.commit(itemOps(plan, chunk.map((item) => ({ item, status: 'failed' as ItemStatus, error: reason })))).catch(() => undefined);
    }
    hooks.onChunk?.(stateOf(plan), Date.now() - started);
  }
  const status = stopped ? 'stopped' : 'completed';
  await io.commit([statusOp(plan, status)]);
  return status;
}

// ---------------------------------------------------------------------------
// 5. Rolling back

export interface RollbackIO extends RunnerIO {
  /** The ids of tasks that still carry this importId. */
  tasksWithImportId(): Promise<Set<string>>;
  /** Nothing outside this import is in the place any more. */
  isEmpty(place: PlaceSpec): Promise<boolean>;
  /** Deletes the place (an area with its default folder); archives it if deleting is refused. */
  removePlace(place: PlaceSpec): Promise<void>;
}

export interface RollbackState {
  items: PlanItem[];
  current: string[];
  removed: number;
  total: number;
}

export async function rollbackImport(
  plan: ImportPlan,
  io: RollbackIO,
  hooks: { onChunkStart?(s: RollbackState): void; onChunk?(s: RollbackState): void } = {}
): Promise<{ status: 'rolled_back' | 'stopped'; kept: { kind: PlaceKind; name: string }[] }> {
  await io.commit([statusOp(plan, 'rolling_back')]);
  const live = await io.tasksWithImportId();
  // Only tasks in the log and still carrying this import's id.
  const targets = plan.items.filter((i) => (i.status === 'imported' || i.status === 'writing' || i.status === 'failed') && live.has(i.id));
  // Anything else in the log that is not in Dreda is already gone.
  for (const i of plan.items) if ((i.status === 'imported' || i.status === 'writing') && !live.has(i.id)) i.status = 'removed';
  const total = targets.length;
  let removed = 0;
  let failed = false;
  const snapshot = (current: string[] = []): RollbackState => ({ items: plan.items.map((i) => ({ ...i })), current, removed, total });
  // Newest chunk first.
  const chunks: PlanItem[][] = [];
  for (let i = 0; i < targets.length; i += CHUNK) chunks.push(targets.slice(i, i + CHUNK));
  for (const chunk of chunks.reverse()) {
    hooks.onChunkStart?.(snapshot(chunk.map((c) => c.id)));
    const ops: WriteOp[] = chunk.map((item) => ({ type: 'delete', path: taskPath(plan.uid, item.id) }));
    if (!plan.legacy) ops.push(...itemOps(plan, chunk.map((item) => ({ item, status: 'removed' as ItemStatus }))));
    try {
      await io.commit(ops);
      for (const item of chunk) {
        item.status = 'removed';
        item.error = null;
      }
      removed += chunk.length;
    } catch (caught) {
      failed = true;
      for (const item of chunk) item.error = `Not removed. ${failureText(caught)}`;
    }
    hooks.onChunk?.(snapshot());
  }
  if (failed) {
    await io.commit([statusOp(plan, 'stopped')]);
    return { status: 'stopped', kept: [] };
  }
  // Then the places, innermost first, each only if nothing else is in it.
  const order: PlaceKind[] = ['project', 'folder', 'area'];
  const kept: { kind: PlaceKind; name: string }[] = [];
  const changed: { id: string; status: PlaceStatus }[] = [];
  for (const kind of order) {
    for (const place of Object.values(plan.places)) {
      if (place.kind !== kind || place.status !== 'created') continue;
      if (await io.isEmpty(place)) {
        await io.removePlace(place);
        place.status = 'removed';
      } else {
        place.status = 'kept';
        kept.push({ kind, name: place.name });
      }
      changed.push({ id: place.id, status: place.status });
    }
  }
  await io.commit([statusOp(plan, 'rolled_back', { undoneAt: io.now(), ...(plan.legacy ? {} : placeStatusData(changed)) })]);
  return { status: 'rolled_back', kept };
}

// ---------------------------------------------------------------------------
// After a crash or a closed tab

/** Items left "writing": in if their task exists, else back to waiting. */
export async function settleWriting(plan: ImportPlan, exists: (taskId: string) => Promise<boolean>): Promise<void> {
  for (const item of plan.items) {
    if (item.status !== 'writing') continue;
    if (await exists(item.id)) {
      item.status = 'imported';
      // Its places were in the same batch.
      item.created = item.created.length ? item.created : item.creates;
      for (const id of item.created) if (plan.places[id]) plan.places[id].status = 'created';
    } else item.status = 'waiting';
  }
}

export function tally(items: PlanItem[]) {
  return {
    imported: items.filter((i) => i.status === 'imported').length,
    failed: items.filter((i) => i.status === 'failed').length,
    waiting: items.filter((i) => i.status === 'waiting' || i.status === 'writing').length,
    removed: items.filter((i) => i.status === 'removed').length,
  };
}

export { pageCount };
